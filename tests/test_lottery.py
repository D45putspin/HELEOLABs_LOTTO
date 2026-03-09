from hathorlib import NCDepositAction, NCWithdrawalAction, HATHOR_TOKEN_UID
from tests.utils import BlueprintTestCase
from contract.lottery import LotteryContract, InsufficientFunds, Unauthorized, LotteryClosed

class TestLottery(BlueprintTestCase):
    def setUp(self):
        super().setUp()
        self.contract = LotteryContract()
        self.run_method(self.contract, 'initialize')
        
    def test_create_lottery(self):
        user_address = self.get_address(0)
        lottery_id = self.run_method(self.contract, 'create_lottery', 'My Lottery', 100, 10, origin=user_address)
        self.assertEqual(lottery_id, 0)
        
        lottery = self.contract.get_lottery(0)
        self.assertEqual(lottery['description'], 'My Lottery')
        self.assertEqual(lottery['price'], 100)
        self.assertEqual(lottery['creator'], user_address)
        
    def test_buy_ticket(self):
        user_address = self.get_address(0)
        buyer_address = self.get_address(1)
        
        self.run_method(self.contract, 'create_lottery', 'Test', 100, 10, origin=user_address)
        
        # Insufficient funds
        try:
             # Pass deposit in kwargs which utils will convert to actions
            self.run_method(self.contract, 'buy_ticket', 0, origin=buyer_address, deposit=50)
            self.fail("Should have raised")
        except InsufficientFunds:
            pass
            
        # Success
        self.run_method(self.contract, 'buy_ticket', 0, origin=buyer_address, deposit=100)
        lottery = self.contract.get_lottery(0)
        self.assertEqual(len(lottery['participants']), 1)
        
    def test_draw_winner(self):
        creator = self.get_address(0)
        p1 = self.get_address(1)
        
        self.run_method(self.contract, 'create_lottery', 'Win', 100, 10, origin=creator)
        self.run_method(self.contract, 'buy_ticket', 0, origin=p1, deposit=100)
        self.run_method(self.contract, 'draw_winner', 0, origin=creator)
        
        lottery = self.contract.get_lottery(0)
        self.assertEqual(lottery['state'], 'CLOSED')
        self.assertEqual(lottery['winner'], p1)
        self.assertEqual(lottery['payouts']['creator'], 10) # 10%
        
        
    def test_draw_winner_timeout(self):
        creator = self.get_address(0)
        p1 = self.get_address(1)
        rando = self.get_address(2)
        
        # Create at t=1000
        self.run_method(self.contract, 'create_lottery', 'Timeout', 100, 10, origin=creator, timestamp=1000)
        self.run_method(self.contract, 'buy_ticket', 0, origin=p1, deposit=100, timestamp=1005)
        
        # Rando tries to close immediately -> Fails
        try:
            self.run_method(self.contract, 'draw_winner', 0, origin=rando, timestamp=2000)
            self.fail("Should have failed")
        except Unauthorized:
            pass
            
        # Rando tries after 30 days (2592000s) + 1000s = 2593000
        # Let's go to 3,000,000 to be safe
        self.run_method(self.contract, 'draw_winner', 0, origin=rando, timestamp=3000000)
        
        lottery = self.contract.get_lottery(0)
        self.assertEqual(lottery['state'], 'CLOSED')
        self.assertEqual(lottery['winner'], p1)
        
    def test_claim_reward(self):
        creator = self.get_address(0)
        p1 = self.get_address(1)
        
        self.run_method(self.contract, 'create_lottery', 'Claim', 100, 10, origin=creator)
        self.run_method(self.contract, 'buy_ticket', 0, origin=p1, deposit=100)
        self.run_method(self.contract, 'draw_winner', 0, origin=creator)
        
        # Creator claims 10% = 10
        self.run_method(self.contract, 'claim_reward', 0, origin=creator, withdraw=10)
        
        lottery = self.contract.get_lottery(0)
        self.assertEqual(lottery['payouts']['creator'], 0)
