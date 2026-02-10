import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
  },
  define: {
    // Polyfill for Anchor/web3.js in browser
    'process.env': {},
  },
  resolve: {
    alias: {
      // Polyfills needed by @solana/web3.js and @coral-xyz/anchor in browser
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
    include: ['buffer', '@solana/web3.js', '@coral-xyz/anchor'],
  },
})
