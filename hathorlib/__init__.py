from typing import Any, Callable, TypeVar

# Types
Address = str
Timestamp = int
HATHOR_TOKEN_UID = "00"

class Context:
    def __init__(self, tx=None, actions=None):
        self.tx = tx
        self.block = type('Block', (), {'timestamp': 0})()
        if tx:
            self.block.timestamp = tx.timestamp
        self.actions = actions or {}
        
    def get_caller_address(self) -> str:
        return self.tx.get_origin_address() if self.tx else "mock_caller"

    def get_deposit(self):
        # Backward comp for my previous tests, though example uses get_single_action
        return 0

    def get_single_action(self, token_uid):
        return self.actions.get(token_uid)
        
    @property
    def syscall(self):
        return self # Mock syscall

    def emit_event(self, data: bytes):
        pass

class Blueprint:
    pass

class NCFail(Exception):
    pass

class NCDepositAction:
    def __init__(self, amount):
        self.amount = amount

class NCWithdrawalAction:
    def __init__(self, amount):
        self.amount = amount

# Decorators
T = TypeVar("T")

def export(cls: T) -> T:
    return cls

def public(fn=None, *, allow_deposit=False, allow_withdrawal=False):
    def decorator(f):
        f._is_public = True
        f._allow_deposit = allow_deposit
        f._allow_withdrawal = allow_withdrawal
        return f
    if fn:
        return decorator(fn)
    return decorator

def view(fn):
    fn._is_view = True
    return fn
