const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3001;
const HATHOR_NODE = process.env.HATHOR_NODE || 'https://node.localnet.hathor.works';

// Enable CORS for all origins (development only)
app.use(cors());

// Proxy all requests to Hathor node
app.use('/v1a', createProxyMiddleware({
    target: HATHOR_NODE,
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        console.log(`[Proxy] ${req.method} ${req.path} -> ${HATHOR_NODE}${req.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        // Remove duplicate CORS headers from Hathor node
        delete proxyRes.headers['access-control-allow-origin'];
        console.log(`[Proxy] Response: ${proxyRes.statusCode}`);
    }
}));

app.listen(PORT, () => {
    console.log(`🚀 CORS Proxy running on http://localhost:${PORT}`);
    console.log(`📡 Forwarding to: ${HATHOR_NODE}`);
    console.log(`\n💡 Update your .env to: VITE_HATHOR_NODE_URL=http://localhost:${PORT}/v1a/`);
});
