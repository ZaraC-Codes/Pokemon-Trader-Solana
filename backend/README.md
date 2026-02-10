# Revenue Processor — Pokemon Trader Solana

Off-chain backend service that automates the revenue cycle:

1. **Withdraw** SolBalls revenue from the on-chain game program
2. **Swap** SolBalls to USDC via Jupiter Metis API
3. **Split** USDC into treasury (3%) / NFT pool (96%) / SOL reserve (1%)
4. **Purchase** NFT packs from Collector Crypt Gacha API when the pool is funded
5. **Deposit** received NFTs into the on-chain NftVault

## Prerequisites

- Node.js 18+
- A Solana keypair that is the game program's **authority**
- SolBalls token account on that wallet
- USDC token account on that wallet
- Gacha API key from Collector Crypt Discord

## Setup

```bash
cd backend
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your values
```

### Wallet Setup

The backend wallet must be the same authority that initialized the game program. It needs:

- SOL for transaction fees (~0.01 SOL buffer)
- A SolBalls ATA (created automatically on first revenue withdrawal)
- A USDC ATA (for receiving swap output)

## Running

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

The service starts an Express server and a cron scheduler:

- **Cron** runs every 5 minutes (configurable via `CRON_INTERVAL_MS`)
- **First run** triggers 5 seconds after startup

## Admin Endpoints

All admin endpoints require `X-ADMIN-KEY` header.

### GET /health

Health check (no auth required).

```bash
curl http://localhost:3001/health
```

### GET /status

Returns current balances and timestamps.

```bash
curl -H "X-ADMIN-KEY: your_key" http://localhost:3001/status
```

Response:

```json
{
  "gameSolballsBalance": 150.5,
  "backendUsdcBalance": 48.2,
  "backendSolBalance": 0.05,
  "vaultNftCount": 12,
  "vaultMaxSize": 20,
  "lastSwapTime": "2026-02-10T12:00:00.000Z",
  "lastGachaTime": "2026-02-10T12:05:00.000Z",
  "lastDepositTime": "2026-02-10T12:05:30.000Z",
  "isProcessing": false,
  "backendWallet": "..."
}
```

### POST /trigger-swap

Manually run the SolBalls -> USDC swap + split pipeline.

```bash
curl -X POST -H "X-ADMIN-KEY: your_key" http://localhost:3001/trigger-swap
```

### POST /trigger-gacha

Manually run the Gacha purchase + NFT deposit pipeline.

```bash
curl -X POST -H "X-ADMIN-KEY: your_key" http://localhost:3001/trigger-gacha
```

## Tests

```bash
npm test
```

## Architecture

```
Game PDA (SolBalls)
       |
       | withdraw_revenue
       v
Backend Wallet (SolBalls)
       |
       | Jupiter swap
       v
Backend Wallet (USDC)
       |
       |--- 3% ---> Treasury Wallet (USDC)
       |--- 1% ---> Jupiter swap -> Backend Wallet (SOL reserve)
       |--- 96% --> Backend Wallet (USDC, NFT pool)
                        |
                        | when pool >= $50
                        v
                   Gacha API -> NFT minted to Backend Wallet
                        |
                        | deposit_nft instruction
                        v
                   On-chain NftVault PDA
```

## Deployment

### Node.js (PM2)

```bash
npm run build
pm2 start dist/index.js --name revenue-processor
```

### Docker

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ dist/
COPY target/idl/pokeball_game.json target/idl/
CMD ["node", "dist/index.js"]
```

### Cloudflare Workers (future)

The service can be ported to Workers by:
- Replacing Express with `export default { fetch, scheduled }` handlers
- Using Workers KV or D1 for state if needed
- Moving the cron to `[triggers] crons` in `wrangler.toml`
