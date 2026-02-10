# QA Test Plan: Solana Devnet

Last updated: 2026-02-10

## Prerequisites

Before testing, ensure:

1. **Phantom wallet** installed and switched to **Devnet** (Settings > Developer Settings > Change Network > Devnet)
2. **Environment variables** set in `.env`:
   ```
   VITE_POKEBALL_GAME_PROGRAM_ID=B93VJQKD5UW8qfNsLrQ4ZQvTG6AG7PZsR6o2WeBiboBZ
   VITE_SOLANA_NETWORK=devnet
   VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
   VITE_SOLBALLS_MINT=DCZFYnvkeXhkpx8CkXECNs3nFMUZG2iXSBxA7ozHKiPL
   ```
3. **Anchor program initialized** on devnet (run `npx tsx scripts/solana/initialize.ts`)
4. **At least 1 Pokemon spawned** (run `npx tsx scripts/solana/spawn-pokemon.ts --slot 0`)
5. **At least 1 NFT deposited** into vault (run `npx tsx scripts/solana/deposit-nft.ts --mint <MINT>`)
6. **Frontend running** (`npm run dev` at http://localhost:5173)

## Scenario A: New Player, No Assets

### A1. Initial Load (No Wallet)
1. Open http://localhost:5173 in a fresh browser tab
2. **Expected**:
   - Game world renders with pixel art tiles and Pokemon sprites
   - Wallet not connected — "Connect Wallet" button visible in top-right
   - Help modal auto-shows on first visit
   - No console errors related to Solana/Anchor
   - Music plays (if audio context is unlocked)

### A2. Connect Wallet
1. Click "Connect Wallet" button
2. Select Phantom from the wallet modal
3. Approve the connection in Phantom
4. **Expected**:
   - Wallet address appears in the UI (truncated)
   - PokeBall shop HUD appears showing "0 SolBalls" balance
   - Inventory button works — shows all balls at 0

### A3. Airdrop SOL (External)
1. Open Phantom, go to Settings > Developer Settings
2. Request SOL airdrop (or use `solana airdrop 2` in CLI)
3. **Expected**: SOL balance updates in Phantom

### A4. Swap SOL for SolBalls (Jupiter)
1. Click "SWAP FOR SOLBALLS" button in the PokeBall shop
2. **Expected**:
   - Jupiter swap modal opens with dark theme
   - Output token is locked to SolBalls (can't change)
   - Input defaults to SOL
3. Enter a small amount (e.g., 0.1 SOL)
4. Click "Swap" and approve in Phantom
5. **Expected**:
   - Swap executes successfully
   - SolBalls balance updates in the shop
   - **Note**: On devnet, Jupiter may not find a route if no SolBalls liquidity pool exists. This is expected — document the result.

### A5. Buy PokeBalls
1. In the PokeBall Shop, set quantity to 5 for "Poke Ball"
2. Click "BUY"
3. **Expected**:
   - Loading overlay: "Please approve the transaction in your wallet..."
   - Phantom popup for transaction approval
   - After confirmation: success message with ball type and quantity
   - Inventory updates immediately (no 10-second wait)
   - SolBalls balance decreases
   - Toast notification: "Purchased 5x Poke Ball!"
4. Open Inventory — verify 5 Poke Balls shown

### A6. Throw a Ball at Pokemon
1. Walk close to a spawned Pokemon on the map
2. Click on the Pokemon
3. **Expected**:
   - Catch Attempt modal opens
   - Shows "Pokemon #[ID]", "Attempts remaining: 3"
   - Lists owned ball types with "Throw" buttons
   - Ball types with 0 count are hidden
4. Click "Throw" on Poke Ball
5. **Expected**:
   - Status: "Sending transaction..."
   - Phantom approval popup
   - Status: "Waiting for confirmation..."
   - Modal closes after success
   - Visual throw animation plays in game
   - Result arrives via WebSocket event:
     - **Caught**: Win modal with NFT details (or "vault empty" message)
     - **Missed**: Failure modal with "X attempts remaining"
   - Toast notification for result

### A7. Refresh Page
1. Press F5 to reload
2. **Expected**:
   - Inventory persists (read from on-chain PDA)
   - Ball counts match what was purchased minus throws
   - Pokemon spawn positions reload from chain
   - Transaction history is empty (session-based WebSocket events)

---

## Scenario B: Error Cases

### B1. Buy Balls with 0 SolBalls
1. Ensure wallet has 0 SolBalls balance
2. Try to buy 1 Poke Ball
3. **Expected**:
   - "BUY" button disabled or shows "Insufficient balance"
   - If somehow submitted: error message "Insufficient SolBalls balance"
   - No transaction sent to chain

### B2. Throw with No Balls
1. Ensure all ball counts are 0
2. Click on a Pokemon
3. **Expected**:
   - Modal shows "You don't have any PokeBalls!" with prompt to visit shop
   - No throw buttons available

### B3. Disconnect Wallet Mid-Session
1. Connect wallet and buy some balls
2. Disconnect wallet via Phantom
3. **Expected**:
   - Shop shows "Connect Wallet" state
   - Throw buttons disabled
   - Inventory shows 0
   - No crashes or console errors

### B4. Reject Transaction in Wallet
1. Try to buy balls, click BUY
2. When Phantom popup appears, click "Reject"
3. **Expected**:
   - Error message: "Transaction cancelled"
   - Can dismiss error and try again
   - No state corruption

### B5. Pokemon Already Caught/Despawned
1. Try to throw at a Pokemon that was just caught by another player
2. **Expected**:
   - Error: "This Pokemon is no longer here. Try another one!"
   - Ball is NOT consumed (transaction fails on-chain)

### B6. Max Attempts Exhausted
1. Throw 3 times at the same Pokemon (all misses)
2. Try to throw a 4th time
3. **Expected**:
   - Modal shows "Attempts remaining: 0"
   - Throw buttons disabled
   - Error: "No attempts remaining for this Pokemon."
   - Pokemon despawns from map (via event)

---

## Scenario C: Admin / Backend Sanity

### C1. Check Backend Health
```bash
curl http://localhost:3001/health
```
**Expected**: `200 OK` with `{ "status": "ok" }`

### C2. Check Backend Status
```bash
curl -H "X-ADMIN-KEY: <your-key>" http://localhost:3001/status
```
**Expected**: JSON with:
- `gameSolBallsBalance`: Current SolBalls in game account
- `vaultNftCount`: Number of NFTs in vault
- `treasuryBalance`: Treasury USDC balance
- `lastProcessedAt`: Timestamp of last revenue processing
- `isProcessing`: Boolean

### C3. Check On-Chain State
```bash
npx tsx scripts/solana/check-state.ts
```
**Expected**: Prints GameConfig, PokemonSlots, NftVault state without errors

### C4. Admin Dev Tools (Frontend)
1. Add `?dev=1` to URL or set `localStorage.pokeballTrader_devMode = 'true'`
2. Press F2 to open Admin Dev Tools panel
3. **Expected**:
   - Shows GameConfig data (authority, ball prices, catch rates)
   - Shows PokemonSlots (active spawns with IDs and positions)
   - Shows NftVault (deposited NFT mints)
   - All data reads from on-chain Anchor accounts

---

## Scenario D: Jupiter Swap Widget Edge Cases

### D1. No SOL for Gas
1. Ensure wallet has 0 SOL
2. Open Jupiter swap widget
3. Try to swap
4. **Expected**: Jupiter shows insufficient SOL error. User must airdrop SOL first.

### D2. Jupiter CDN Not Loaded
1. Block `terminal.jup.ag` in browser dev tools (Network tab)
2. Open swap widget
3. **Expected**: "Loading Jupiter swap widget..." with hint about network connection. Retries for up to 5 seconds.

### D3. Invalid SolBalls Mint
1. Set `VITE_SOLBALLS_MINT=invalid` in .env
2. Open swap widget
3. **Expected**: "SolBalls mint not configured" warning (or Jupiter fails to resolve output token)

---

## Gotchas / Known Issues

1. **Devnet SolBalls liquidity**: Jupiter requires a liquidity pool on Raydium/Meteora. If no pool exists on devnet, Jupiter swaps will fail with "No route found". This is expected and not a frontend bug.

2. **VRF fulfillment delay**: After throwing a ball, the catch result requires ORAO VRF fulfillment (sub-second) then `consume_randomness` to be called. If no one calls `consume_randomness`, the result won't appear. In production, a cranker or the backend should call this.

3. **WebSocket events are session-based**: Transaction history resets on page refresh. This is by design — historical events require an indexer (not yet implemented).

4. **10-second inventory polling**: After a purchase, inventory auto-refetches immediately. But for other state changes (e.g., throw consuming a ball), the next update comes within 10 seconds.

5. **ORAO VRF cost**: Each throw costs ~0.001 SOL for the VRF request fee, in addition to the standard ~0.000005 SOL transaction fee. Ensure test wallets have at least 0.1 SOL.

6. **NFT vault must not be empty**: If the vault has 0 NFTs and a player catches a Pokemon, they get a "caught but no NFT available" message. Deposit NFTs first.
