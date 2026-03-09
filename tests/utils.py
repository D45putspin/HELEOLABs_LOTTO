import unittest
from hathorlib.base_transaction import Transaction
from hathorlib import Context, NCDepositAction, NCWithdrawalAction, HATHOR_TOKEN_UID

class BlueprintTestCase(unittest.TestCase):
    def get_address(self, index):
        return f"address{index}"
        
    def run_method(self, contract, method_name, *args, **kwargs):
        origin = kwargs.get('origin', 'address0')
        deposit = kwargs.get('deposit', 0)
        withdraw = kwargs.get('withdraw', 0)
        timestamp = kwargs.get('timestamp', 1000)
        
        tx = Transaction(origin_address=origin, timestamp=timestamp)
        
        actions = {}
        if deposit > 0:
            actions[HATHOR_TOKEN_UID] = NCDepositAction(deposit)
        if withdraw > 0:
            actions[HATHOR_TOKEN_UID] = NCWithdrawalAction(withdraw)
            
        ctx = Context(tx=tx, actions=actions)
        
        method = getattr(contract, method_name)
        # Check signature for ctx
        import inspect
        sig = inspect.signature(method)
        if 'ctx' in sig.parameters:
            return method(ctx, *args)
        else:
            return method(*args)
