# CORS Proxy for Hathor Localnet

Simple Express proxy server to work around CORS issues with the Hathor localnet node.

## Setup

```bash
cd proxy
npm install
```

## Run

```bash
npm start
```

The proxy will run on `http://localhost:3001` by default.

## Configuration

Update your `frontend/.env` to use the proxy:

```bash
VITE_HATHOR_NODE_URL=http://localhost:3001/v1a/
```

## Environment Variables

- `PORT` - Port to run the proxy on (default: 3001)
- `HATHOR_NODE` - Hathor node URL to proxy to (default: https://node.localnet.hathor.works)
