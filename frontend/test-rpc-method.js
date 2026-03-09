
import { sendNanoContractTxRpcRequest } from '@hathor/hathor-rpc-handler';

const rpcRequest = sendNanoContractTxRpcRequest(
    'buy_ticket',
    'blueprintId',
    [],
    [],
    true,
    'ncId'
);

console.log('Method:', rpcRequest.method);
