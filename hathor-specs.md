# Hathor Integration Guide for pXiel

This document serves as a comprehensive guide for AI agents and developers working on the Hathor blockchain integration for the pXiel collaborative pixel canvas.

## 1. Key Files & Directory Structure

| File/Directory | Description |
| :--- | :--- |
| `contract/pxiel.py` | **Main Contract**. The Nano Contract source code implementing the pixel board logic. |
| `tests/test_pxiel.py` | **Unit Tests**. Official Hathor Blueprint tests using the Nano Contract VM. |
| `deploy_contract.sh` | **Local Deployment**. Script to register blueprint and create a contract on a local Hathor network. |
| `deploy_testnet_contract.sh` | **Testnet Deployment**. Script to create a contract instance on the Hathor Testnet (requires existing blueprint). |
| `contract/` | Directory containing all contract source files. |
| `tests/` | Directory containing tests and the `run_tests.sh` runner. |

## 2. Contract Architecture (`contract/pxiel.py`)

The `Pxiel` contract handles the state of the canvas, fee collection, and owner management.

### **State Design**
- **`pixels`** (`dict[str, str]`): Stores pixel colors using "x,y" keys (e.g., "10,24": "#FF0000").
- **`pixel_keys`** (`list[str]`): An ordered list of keys for pagination support.
- **`fees_collected`** (`int`): Total HTR collected from painting.
- **`paint_count`** (`int`): Total number of individual paint operations.
- **`owner`** (`Address`): The address that deployed the contract and can withdraw fees.

### **Public Methods (Write)**
These methods require a transaction and potentially a deposit.

- **`initialize(ctx, size, fee_htr)`**:
    - Called once upon creation.
    - Sets canvas size and per-pixel fee (in HTR cents).

- **`paint(ctx, x, y, color)`**:
    - Paints a single pixel.
    - **Requires Deposit**: `HATHOR_TOKEN_UID` amount >= `fee_htr`.
    - **Validation**: Checks bounds and color format (`#RRGGBB`).
    - Emits a "Paint" event.

- **`paint_batch(ctx, xs, ys, colors)`**:
    - Paints multiple pixels effectively in one transaction.
    - **Requires Deposit**: `HATHOR_TOKEN_UID` amount >= `fee_htr * count`.
    - **Limits**: Max batch size is 32 (defined by `MAX_BATCH_SIZE`).

- **`withdraw_fees(ctx)`**:
    - Allows the `owner` to withdraw accumulated fees.
    - **Requires Action**: `NCWithdrawalAction`.

### **View Methods (Read)**
These methods are read-only and return data from the contract state.

- **`get_pixel_info(x, y)`**: Returns `(color, painter_address, timestamp)` for a specific pixel.
- **`get_pixels_page(offset, limit)`**: Returns a paginated list of painted pixels `[[key, color], ...]`. Max limit 1000.
- **`get_stats()`**: Returns `(paint_count, fees_collected)`.
- **`get_owner()`**: Returns owner address.

## 3. Deployment Workflows

### **A. Local Development**
Use `deploy_contract.sh` to spin up a fresh instance on your local network.

1.  Ensure local Hathor full node and wallet-headless are running.
2.  Run:
    ```bash
    ./deploy_contract.sh
    ```
    - This script **registers a new blueprint** from `contract/pxiel.py`.
    - Accesses the wallet API (default `localhost:8000`).
    - Creates a contract instance.
    - Paints a test pixel (0,0) to verify functionality.

### **B. Testnet Deployment**
Use `deploy_testnet_contract.sh` for the official testnet.

1.  Set **`EXISTING_BLUEPRINT_ID`** or **`NEXT_PUBLIC_BLUEPRINT_ID`** in your environment.
    - On testnet, you typically reuse a verified blueprint ID rather than registering a new one every time to save PoW time.
2.  Run:
    ```bash
    ./deploy_testnet_contract.sh
    ```
    - Connects to the wallet defined in `.env`.
    - Creates a new contract instance pointing to the existing blueprint.
    - **Note**: Mining on testnet takes longer (~30s per block).

## 4. Testing

Tests are written using `pytest` and `hathor-tests`. They run against an in-memory Nano Contract VM, which is faster and more reliable for logic verification than a real network.

### **Running Tests**
Execute the test runner script:
```bash
./tests/run_tests.sh
```
Or manually:
```bash
python3 -m pytest tests/test_pxiel.py -v
```

### **Test Coverage**
Ensure any changes to logic (e.g., fee calculations, new restrictions) are covered by new tests in `tests/test_pxiel.py`.
- **Initialization**: Verify state variables are set correctly.
- **Success Paths**: Test `paint` and `paint_batch` with correct fees.
- **Failure Paths**: Test bounds checks, invalid colors, and insufficient fees (`FeeRequired` exception).
- **Withdrawal**: Verify only the owner can withdraw.

## 5. Protocol Interaction Nuances

- **Events**: The contract emits raw events via `self.syscall.emit_event`. The frontend or indexer must listen for these if they need real-time updates without polling.
- **Concurrency**: Nano contracts are sequential. If two users paint the same pixel in the same block, the order depends on transaction ordering in the block.
- **Pagination**: The `get_pixels_page` method is crucial for efficiently loading the canvas state without fetching the entire history.

---
*Generated by Antigravity for pXiel Documentation.*
