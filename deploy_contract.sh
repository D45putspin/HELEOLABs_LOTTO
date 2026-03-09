#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
WALLET_API=${WALLET_API:-https://wallet.localnet.hathor.works}
# Stable wallet ID to avoid re-syncing every time
WALLET_ID=${WALLET_ID:-lottery-deploy-stable-v1}
# Pre-funded genesis seed for the remote localnet
WALLET_SEED=${WALLET_SEED:-"avocado spot town typical traffic vault danger century property shallow divorce festival spend attack anchor afford rotate green audit adjust fade wagon depart level"}
MAX_WALLET_RETRIES=${MAX_WALLET_RETRIES:-60} # Increase timeout for remote sync
POLL_INTERVAL_SEC=${POLL_INTERVAL_SEC:-3}
BLUEPRINT_MINING_RETRIES=${BLUEPRINT_MINING_RETRIES:-120}
CONTRACT_MINING_RETRIES=${CONTRACT_MINING_RETRIES:-120}

# Lottery initialization parameters (can be overridden via env vars)
LOTTERY_DESCRIPTION=${LOTTERY_DESCRIPTION:-"Community Jackpot #1"}
LOTTERY_TICKET_PRICE=${LOTTERY_TICKET_PRICE:-1000}  # 10 HTR in cents
LOTTERY_COMMISSION=${LOTTERY_COMMISSION:-5}          # 5%

print_json() {
  local payload="$1"
  if printf '%s\n' "$payload" | jq . >/dev/null 2>&1; then
    printf '%s\n' "$payload" | jq
  else
    printf '%s\n' "$payload"
  fi
}

json_field() {
  local payload="$1"
  local filter="$2"
  local value
  if ! value=$(printf '%s\n' "$payload" | jq -r "$filter" 2>/dev/null); then
    echo -e "${RED}❌ Invalid response (not JSON)${NC}"
    printf '%s\n' "$payload"
    return 1
  fi
  printf '%s\n' "$value"
}

start_wallet() {
  echo "🚀 Starting wallet ${WALLET_ID}..."
  curl -s -X POST "$WALLET_API/start" \
    -H "Content-Type: application/json" \
    -d "{\"wallet-id\": \"$WALLET_ID\", \"seed\": $(
      jq -Rs . <<< "$WALLET_SEED"
    )}" >/dev/null || true
}

wait_for_wallet_ready() {
  echo "⏳ Waiting for wallet to be ready..."
  for i in $(seq 1 "$MAX_WALLET_RETRIES"); do
    local status=$(curl -s -H "X-Wallet-Id: $WALLET_ID" "$WALLET_API/wallet/status")
    local code
    code=$(json_field "$status" '.statusCode') || exit 1
    if [ "$code" = "3" ]; then
      echo -e "${GREEN}✅ Wallet is ready${NC}"
      return 0
    fi
    sleep 2
  done
  echo -e "${RED}❌ Wallet did not become ready in time${NC}"
  curl -s -H "X-Wallet-Id: $WALLET_ID" "$WALLET_API/wallet/status" | jq 2>/dev/null || curl -s -H "X-Wallet-Id: $WALLET_ID" "$WALLET_API/wallet/status"
  exit 1
}

fetch_wallet_address() {
  echo "📮 Getting wallet address..."
  local address_resp
  address_resp=$(curl -s -H "X-Wallet-Id: $WALLET_ID" "$WALLET_API/wallet/address")
  WALLET_ADDRESS=$(json_field "$address_resp" '.address // .addresses[0] // empty') || exit 1
  if [ -z "$WALLET_ADDRESS" ]; then
    echo -e "${RED}❌ Could not get wallet address${NC}"
    print_json "$address_resp"
    exit 1
  fi
  echo -e "${GREEN}✅ Using address: $WALLET_ADDRESS${NC}"
}

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           HATHOR LOTTERY CONTRACT DEPLOYMENT              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

echo "🔍 Checking prerequisites..."

# Local miner check is no longer needed for the remote environment
echo -e "${GREEN}✅ Using remote Hathor localnet${NC}"

start_wallet
wait_for_wallet_ready
fetch_wallet_address

# ============================================
# BLUEPRINT REGISTRATION
# ============================================

if [ -n "$EXISTING_BLUEPRINT_ID" ]; then
  BLUEPRINT_ID="$EXISTING_BLUEPRINT_ID"
  echo -e "${YELLOW}⏩ Using existing blueprint ID: $BLUEPRINT_ID${NC}"
else
  echo ""
  # Correctly load blueprint code preserving newlines
  BLUEPRINT_CODE=$(cat contract/lottery.py)

  # Use Python for 100% reliable JSON encoding of multiline code
  python3 -c "import json, sys; print(json.dumps({'code': open('contract/lottery.py').read(), 'address': sys.argv[1]}))" "$WALLET_ADDRESS" > blueprint_payload.json
  
  BLUEPRINT_RESP=$(curl -s -X POST \
    -H "X-Wallet-Id: $WALLET_ID" \
    -H "Content-Type: application/json" \
    --data-binary @blueprint_payload.json \
    "$WALLET_API/wallet/nano-contracts/create-on-chain-blueprint")

  # rm -f blueprint_payload.json # Keep for debugging if needed

  echo "Debug - Blueprint Response:"
  print_json "$BLUEPRINT_RESP"

  BLUEPRINT_ID=$(json_field "$BLUEPRINT_RESP" '.hash') || exit 1

  if [ -z "$BLUEPRINT_ID" ] || [ "$BLUEPRINT_ID" = "null" ]; then
    echo -e "${RED}❌ Error registering blueprint${NC}"
    print_json "$BLUEPRINT_RESP"
    exit 1
  fi

  echo -e "${GREEN}✅ Blueprint registered with ID: $BLUEPRINT_ID${NC}"
  echo ""
  echo "⏳ Waiting for blueprint to be mined..."

  for i in $(seq 1 "$BLUEPRINT_MINING_RETRIES"); do
    BLUEPRINT_TX_INFO=$(curl -s "$WALLET_API/wallet/transaction?id=$BLUEPRINT_ID" -H "X-Wallet-Id: $WALLET_ID")
    FIRST_BLOCK=$(json_field "$BLUEPRINT_TX_INFO" '.first_block') || exit 1
    IS_VOIDED=$(json_field "$BLUEPRINT_TX_INFO" '.is_voided // false') || exit 1

    if [ "$IS_VOIDED" = "true" ]; then
      echo ""
      echo -e "${RED}❌ Blueprint was voided${NC}"
      print_json "$BLUEPRINT_TX_INFO"
      exit 1
    fi
    if [ "$FIRST_BLOCK" != "null" ] && [ -n "$FIRST_BLOCK" ]; then
      echo -e "${GREEN}✅ Blueprint mined in block: $FIRST_BLOCK${NC}"
      break
    fi

    if [ $((i % 10)) -eq 0 ]; then
      echo ""
      echo "Transaction status (attempt $i):"
      printf '%s\n' "$BLUEPRINT_TX_INFO" | jq -c '{height, first_block, is_voided}' 2>/dev/null || printf '%s\n' "$BLUEPRINT_TX_INFO"
    fi
    printf "."
    sleep "$POLL_INTERVAL_SEC"
  done

  if [ "$FIRST_BLOCK" = "null" ] || [ -z "$FIRST_BLOCK" ]; then
    echo ""
    BLUEPRINT_TIMEOUT=$((BLUEPRINT_MINING_RETRIES * POLL_INTERVAL_SEC))
    echo -e "${RED}❌ Timeout: blueprint not mined after ${BLUEPRINT_TIMEOUT}s${NC}"
    exit 1
  fi

  echo ""
  sleep 5
fi

# ============================================
# CONTRACT CREATION
# ============================================

echo ""
echo "🏗️ Creating lottery contract..."
echo "   Description: $LOTTERY_DESCRIPTION"
echo "   Ticket Price: $LOTTERY_TICKET_PRICE cents ($(echo "scale=2; $LOTTERY_TICKET_PRICE / 100" | bc) HTR)"
echo "   Commission: $LOTTERY_COMMISSION%"
echo ""

# Create the lottery contract with initialize method (with args)
CREATE_CONTRACT_PAYLOAD=$(jq -n \
  --arg blueprint_id "$BLUEPRINT_ID" \
  --arg address "$WALLET_ADDRESS" \
  --arg description "$LOTTERY_DESCRIPTION" \
  --argjson price "$LOTTERY_TICKET_PRICE" \
  --argjson commission "$LOTTERY_COMMISSION" \
  '{
    blueprint_id: $blueprint_id,
    address: $address,
    data: {
      actions: [{
        type: "deposit",
        token: "00",
        amount: 1000
      }],
      args: [$description, $price, $commission]
    }
  }')

echo "Debug - Create Contract Payload:"
print_json "$CREATE_CONTRACT_PAYLOAD"

RESP=$(echo "$CREATE_CONTRACT_PAYLOAD" | curl -s -X POST \
  -H "X-Wallet-Id: $WALLET_ID" \
  -H "Content-Type: application/json" \
  -d @- \
  "$WALLET_API/wallet/nano-contracts/create")

echo "Debug - Create Contract Response:"
print_json "$RESP"

CONTRACT_ID=$(json_field "$RESP" '.hash') || exit 1

if [ -z "$CONTRACT_ID" ] || [ "$CONTRACT_ID" = "null" ]; then
  echo -e "${RED}❌ Error creating contract${NC}"
  echo "$RESP"
  exit 1
fi

echo -e "${GREEN}✅ Contract created: $CONTRACT_ID${NC}"

echo ""
echo "⏳ Waiting for contract to be mined..."

for i in $(seq 1 "$CONTRACT_MINING_RETRIES"); do
  CONTRACT_TX=$(curl -s "$WALLET_API/wallet/transaction?id=$CONTRACT_ID" -H "X-Wallet-Id: $WALLET_ID")
  CONTRACT_BLOCK=$(json_field "$CONTRACT_TX" '.first_block') || exit 1
  CONTRACT_VOIDED=$(json_field "$CONTRACT_TX" '.is_voided // false') || exit 1

  if [ "$CONTRACT_VOIDED" = "true" ]; then
    echo ""
    echo -e "${RED}❌ Contract was voided${NC}"
    print_json "$CONTRACT_TX"
    exit 1
  fi
  
  if [ "$CONTRACT_BLOCK" != "null" ] && [ -n "$CONTRACT_BLOCK" ]; then
    echo -e "${GREEN}✅ Contract mined in block: $CONTRACT_BLOCK${NC}"
    break
  fi
  if [ $((i % 10)) -eq 0 ]; then
    echo ""
    echo "Transaction status (attempt $i):"
    printf '%s\n' "$CONTRACT_TX" | jq -c '{height, first_block, is_voided}' 2>/dev/null || printf '%s\n' "$CONTRACT_TX"
  fi
  printf "."
  sleep "$POLL_INTERVAL_SEC"
done

if [ "$CONTRACT_BLOCK" = "null" ] || [ -z "$CONTRACT_BLOCK" ]; then
  echo ""
  CONTRACT_TIMEOUT=$((CONTRACT_MINING_RETRIES * POLL_INTERVAL_SEC))
  echo -e "${RED}❌ Timeout: contract not mined after ${CONTRACT_TIMEOUT}s${NC}"
  exit 1
fi

echo ""
sleep 5

# ============================================
# VERIFY CONTRACT STATE
# ============================================

echo "🔍 Verifying initial contract state..."
INITIAL_STATE=$(curl -s -G \
  -H "X-Wallet-Id: $WALLET_ID" \
  --data-urlencode "id=$CONTRACT_ID" \
  --data-urlencode "fields[]=description" \
  --data-urlencode "fields[]=price" \
  --data-urlencode "fields[]=commission" \
  --data-urlencode "fields[]=pot" \
  --data-urlencode "fields[]=state" \
  --data-urlencode "fields[]=creator" \
  "$WALLET_API/wallet/nano-contracts/state")

echo "Initial state:"
print_json "$INITIAL_STATE"

# ============================================
# TEST BUY TICKET
# ============================================

echo ""
echo "🎟️ Testing buy_ticket method (buying 1 ticket)..."

BUY_PAYLOAD=$(jq -n \
  --arg nc_id "$CONTRACT_ID" \
  --arg address "$WALLET_ADDRESS" \
  --argjson amount "$LOTTERY_TICKET_PRICE" \
  '{
    nc_id: $nc_id,
    method: "buy_ticket",
    address: $address,
    data: {
      actions: [{
        type: "deposit",
        token: "00",
        amount: $amount
      }],
      args: []
    }
  }')

echo "Debug - Buy Ticket Payload:"
print_json "$BUY_PAYLOAD"

BUY_RESP=$(echo "$BUY_PAYLOAD" | curl -s -X POST \
  -H "X-Wallet-Id: $WALLET_ID" \
  -H "Content-Type: application/json" \
  -d @- \
  "$WALLET_API/wallet/nano-contracts/execute")

echo "Debug - Buy Ticket Response:"
print_json "$BUY_RESP"

BUY_TX=$(json_field "$BUY_RESP" '.hash') || exit 1

if [ -z "$BUY_TX" ] || [ "$BUY_TX" = "null" ]; then
  echo -e "${RED}❌ Error buying ticket${NC}"
  ERROR=$(json_field "$BUY_RESP" '.error // .message // "Unknown error"') || exit 1
  echo -e "${RED}Error: $ERROR${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Buy ticket transaction created: $BUY_TX${NC}"
echo ""
echo "⏳ Waiting for transaction to be mined..."

for i in $(seq 1 80); do
  BUY_TX_INFO=$(curl -s "$WALLET_API/wallet/transaction?id=$BUY_TX" -H "X-Wallet-Id: $WALLET_ID")
  BUY_BLOCK=$(json_field "$BUY_TX_INFO" '.first_block') || exit 1
  IS_VOIDED=$(json_field "$BUY_TX_INFO" '.is_voided // false') || exit 1
  
  if [ "$IS_VOIDED" = "true" ]; then
    echo ""
    echo -e "${RED}❌ Transaction was voided${NC}"
    print_json "$BUY_TX_INFO"
    exit 1
  fi
  
  if [ "$BUY_BLOCK" != "null" ] && [ -n "$BUY_BLOCK" ]; then
    echo -e "${GREEN}✅ Transaction mined in block: $BUY_BLOCK${NC}"
    break
  fi
  
  if [ $((i % 10)) -eq 0 ]; then
    echo ""
    echo "Transaction status (attempt $i):"
    printf '%s\n' "$BUY_TX_INFO" | jq -c '{height, first_block, is_voided}' 2>/dev/null || printf '%s\n' "$BUY_TX_INFO"
  fi
  
  printf "."
  sleep 3
done

if [ "$BUY_BLOCK" = "null" ] || [ -z "$BUY_BLOCK" ]; then
  echo ""
  echo -e "${RED}❌ Timeout: transaction not mined after 4 minutes${NC}"
  exit 1
fi

echo ""
sleep 3

# ============================================
# FINAL STATE CHECK
# ============================================

echo "👀 Checking final contract state..."

FINAL_STATE=$(curl -s -G \
  -H "X-Wallet-Id: $WALLET_ID" \
  --data-urlencode "id=$CONTRACT_ID" \
  --data-urlencode "fields[]=description" \
  --data-urlencode "fields[]=price" \
  --data-urlencode "fields[]=pot" \
  --data-urlencode "fields[]=state" \
  --data-urlencode "fields[]=participants" \
  "$WALLET_API/wallet/nano-contracts/state")

print_json "$FINAL_STATE"

# Verify participants increased
PARTICIPANTS=$(json_field "$FINAL_STATE" '.fields.participants.value | length // 0') || exit 1
POT=$(json_field "$FINAL_STATE" '.fields.pot.value // 0') || exit 1

echo ""
if [ "$PARTICIPANTS" -gt 0 ]; then
  echo -e "${GREEN}🎉 Success! Ticket purchased successfully${NC}"
  echo "   Total participants: $PARTICIPANTS"
  echo "   Current pot: $POT cents ($(echo "scale=2; $POT / 100" | bc) HTR)"
else
  echo -e "${YELLOW}⚠️  Contract mined but participants = 0${NC}"
  echo "   There may be an issue with the buy_ticket method"
fi

# ============================================
# SUMMARY
# ============================================

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    DEPLOYMENT SUMMARY                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "   Blueprint ID: $BLUEPRINT_ID"
echo "   Contract ID:  $CONTRACT_ID"
echo "   Buy Ticket TX: $BUY_TX"
echo ""
echo "   Add these to your frontend/.env:"
echo ""
echo "   VITE_LOTTERY_BLUEPRINT_ID=$BLUEPRINT_ID"
echo "   VITE_LOTTERY_CONTRACTS=$CONTRACT_ID"
echo ""
echo -e "${GREEN}🚀 Lottery contract is ready!${NC}"
