import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // IMPORTANT: Port 5173 is the canonical dev port for this project.
    // The RPC proxy is configured here, and the frontend uses /api/rpc relative URLs.
    // Changing ports without updating apechainConfig.ts breaks on-chain reads and gas estimation,
    // which can cause MetaMask to show absurdly high gas fees because the app falls back to
    // wallet-side estimation without proper simulation.
    port: 5173,
    strictPort: true, // Fail if port 5173 is in use instead of picking another port
    cors: true, // Enable CORS for the dev server
    proxy: {
      // Proxy for Alchemy RPC to avoid CORS issues
      '/api/rpc': {
        target: 'https://apechain-mainnet.g.alchemy.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/rpc/, '/v2/U6nPHGu_q380fQMfQRGcX'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Ensure proper headers for RPC requests
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Accept', 'application/json');
            // Forward origin header if present
            if (req.headers.origin) {
              proxyReq.setHeader('Origin', req.headers.origin);
            }
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // Add valid CORS headers to response
            // Use the request origin if available, otherwise use wildcard
            const origin = req.headers.origin || '*';
            
            // Set CORS headers with valid values
            proxyRes.headers['Access-Control-Allow-Origin'] = origin;
            proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
            proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept';
            proxyRes.headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Type';
            proxyRes.headers['Access-Control-Max-Age'] = '86400'; // 24 hours for preflight cache
            
            // Ensure content-type is set correctly for JSON responses
            if (!proxyRes.headers['content-type'] && proxyRes.statusCode === 200) {
              proxyRes.headers['content-type'] = 'application/json';
            }
          });
          proxy.on('error', (err, req, res) => {
            // Handle proxy errors with proper CORS headers
            if (res && !res.headersSent) {
              const origin = req.headers?.origin || '*';
              res.writeHead(500, {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
                'Content-Type': 'application/json',
              });
              res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
            }
          });
        },
      },
    },
  },
})
