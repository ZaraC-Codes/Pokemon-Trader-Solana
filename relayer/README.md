# Pokeball Game Relayer

Cloudflare Workers-based relayer for gasless PokeBall throws in Pokemon Trader v1.8.0.

## Overview

This relayer accepts signed EIP-712 messages from players and submits `throwBallFor()` transactions on their behalf. Players only need to sign a message - no gas required on their end.

## Prerequisites

1. **Cloudflare Account** - Sign up at https://cloudflare.com
2. **Wrangler CLI** - `npm install -g wrangler`
3. **Relayer Wallet** - A wallet with APE for gas fees

## Setup

### 1. Install Dependencies

```bash
cd relayer
npm install
```

### 2. Login to Cloudflare

```bash
wrangler login
```

### 3. Configure Relayer Private Key

Store your relayer wallet's private key as a secret:

```bash
wrangler secret put RELAYER_PRIVATE_KEY
# Enter your private key when prompted (with 0x prefix)
```

**IMPORTANT**: The relayer wallet must be authorized on the contract:
```javascript
// Run this as the contract owner
await pokeballGame.setRelayerAddress("0xYourRelayerWalletAddress");
```

### 4. Deploy

```bash
npm run deploy
```

This will deploy to Cloudflare Workers and give you a URL like:
`https://pokeball-relayer.<your-subdomain>.workers.dev`

### 5. Configure Frontend

Update your `.env` file:
```env
VITE_GASLESS_DEV_MODE=false
VITE_RELAYER_API_URL=https://pokeball-relayer.<your-subdomain>.workers.dev
```

## Local Development

```bash
npm run dev
```

This starts a local dev server at `http://localhost:8787`.

## API Reference

### POST /

Submit a gasless throw request.

**Request Body:**
```json
{
  "player": "0x1234...",
  "pokemonSlot": 0,
  "ballType": 1,
  "nonce": "0",
  "signature": "0xabcd..."
}
```

**Success Response:**
```json
{
  "success": true,
  "txHash": "0x..."
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | Missing required fields |
| `INVALID_ADDRESS` | Player address format invalid |
| `INVALID_SIGNATURE` | Signature format invalid |
| `INVALID_SLOT` | Pokemon slot must be 0-19 |
| `INVALID_BALL_TYPE` | Ball type must be 0-3 |
| `INVALID_NONCE` | Nonce format invalid |
| `NONCE_MISMATCH` | Provided nonce doesn't match contract state |
| `INSUFFICIENT_BALLS` | Player has no balls of this type |
| `POKEMON_NOT_ACTIVE` | No Pokemon in that slot |
| `NO_ATTEMPTS` | Pokemon has no attempts remaining |
| `LOW_RESERVE` | Contract APE reserve too low |
| `UNAUTHORIZED` | Relayer not authorized on contract |
| `TX_REVERTED` | Transaction reverted on-chain |
| `INTERNAL_ERROR` | Unexpected error |

## Monitoring

View live logs:
```bash
npm run tail
```

## Security Notes

1. **Never commit your private key** - Use `wrangler secret put`
2. **Fund sparingly** - Keep only enough APE for expected usage
3. **Monitor usage** - Watch for abuse patterns
4. **Rate limiting** - Consider adding rate limiting for production

## Estimated Costs

- **Gas per throw**: ~150,000 gas units
- **At 0.25 gwei**: ~0.0000375 APE per throw
- **Cloudflare Workers**: Free tier includes 100,000 requests/day

## Troubleshooting

### "Relayer not authorized"
Run `setRelayerAddress()` on the contract with your relayer wallet address.

### "Contract APE reserve too low"
The PokeballGame contract needs APE in its reserve for Entropy fees.
Run `npx hardhat checkReserves --network apechain` to check status.

### Transaction stuck pending
Check the relayer wallet has enough APE for gas. View logs with `npm run tail`.
