class TxOutput:
    def __init__(self, value, script):
        self.value = value
        self.script = script

class Transaction:
    def __init__(self, hash_bytes=b'\x00'*32, timestamp=0, origin_address="address1"):
        self.hash = hash_bytes
        self.timestamp = timestamp
        self.origin = origin_address
        
    def get_origin_address(self):
        return self.origin
