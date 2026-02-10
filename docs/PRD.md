# Product Requirements Document: Pokemon Trader – Pokeball Catch Game

**Product:** Pokemon Trader
**Version:** v1 (PokeballGame v1.9.0 / SlabNFTManager v2.4.0)
**Network:** ApeChain Mainnet (Chain ID: 33139)
**Status:** Live — [pokemon-trader-gamma.vercel.app](https://pokemon-trader-gamma.vercel.app)
**Last updated:** 2026-01-28

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [User Personas](#3-user-personas)
4. [Core User Flows](#4-core-user-flows)
5. [Functional Requirements](#5-functional-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Platform & Device Support](#7-platform--device-support)
8. [Open Questions / Future Work](#8-open-questions--future-work)
9. [Appendix: Contract Addresses & Constants](#appendix-contract-addresses--constants)

---

## 1. Product Overview

Pokemon Trader is a 2D pixel-art Web3 game on ApeChain. Players explore a tile-based overworld, buy Poke Balls with APE or USDC.e, throw them at wild Pokemon, and win real **Slab NFT Pokemon Cards** as prizes.

The game wraps a gachapon mechanic (buy chance, receive random reward) inside a simple catch-game loop. All randomness is verifiable on-chain via Pyth Entropy. The NFT prize pool is self-sustaining: player spending funds automatic purchases of new Slab NFTs from the SlabMachine contract.

### Release Scope (v1)

This PRD describes the **v1 release** as deployed: PokeballGame v1.9.0 and SlabNFTManager v2.4.0. Features listed here are live on ApeChain Mainnet. Items under [Open Questions / Future Work](#8-open-questions--future-work) are explicitly **out of scope** for v1.

### Target Users

| Segment | Description |
|---------|-------------|
| **ApeChain-native users** | Existing ApeChain / APE holders and NFT collectors already familiar with the ecosystem. |
| **Cross-chain newcomers** | Users on Ethereum, Arbitrum, Base, or other EVM chains who bridge into ApeChain to try the game. |
| **Mobile-first players** | Users accessing the game through wallet in-app browsers (Glyph, WalletConnect-compatible). |

### How It Works (Summary)

```
Player buys balls (APE or USDC.e)
    → Revenue split: 96% NFT pool, 3% treasury, 1% APE reserves
    → NFT pool auto-purchases Slab cards when ≥ $51 USDC.e
Player walks to a Pokemon and throws a ball (gasless)
    → Pyth Entropy determines catch success
    → On success: random NFT selected from pool, transferred to player
    → On failure: Pokemon tracks attempt count; relocates after 3 misses
```

---

## 2. Goals & Non-Goals

### Primary Goals

1. **Simple, fun gachapon mechanic** — Buy balls, throw at Pokemon, win NFT cards. The entire loop should be understandable in under a minute.
2. **Verifiable randomness** — Every catch outcome and NFT selection is determined by Pyth Entropy, auditable on-chain. No server-side RNG.
3. **Frictionless funding** — Players can bridge, swap, or buy APE/USDC.e from 95+ chains via ThirdWeb Universal Bridge without leaving the game.
4. **Gasless throw UX** — Throwing a ball requires only a signature, not a gas-paying wallet transaction. The relayer covers gas and Entropy fees from platform reserves.
5. **Self-sustaining NFT pool** — Player revenue automatically purchases new Slab NFTs. No manual operator intervention required to refill prizes.

### Non-Goals

- **Not a full MMORPG.** There is no combat system, leveling, or complex game progression. The game world is an exploration wrapper around the catch mechanic.
- **Not custodial.** The game never takes custody of user wallets, private keys, or assets. All signing happens client-side.
- **Not a trading platform.** OTC marketplace listings exist as in-game icons but peer-to-peer trading is handled by the separate OTC Marketplace contract, not by this product.
- **Not cross-chain native.** The game runs exclusively on ApeChain. Cross-chain support is limited to funding (bridging assets in).

---

## 3. User Personas

### Persona 1: ApeChain-Native Collector

> "I hold APE and collect Slab cards. I want a fun way to win new ones."

- Already has APE in their wallet on ApeChain.
- Uses MetaMask on desktop or Glyph on mobile.
- Understands gas, approvals, and NFTs.
- Motivated by: collection completion, fun gameplay, potential card rarity.

### Persona 2: Cross-Chain Newcomer

> "I heard about this game on Twitter. I have ETH on mainnet and want to try it."

- Has ETH or tokens on Ethereum, Arbitrum, Base, etc.
- Needs to bridge into ApeChain before playing.
- May not have ApeChain configured in their wallet.
- Motivated by: novelty, NFT rewards, low-friction onboarding.

### Persona 3: Mobile-First Player

> "I'm on my phone and want to play during my commute."

- Opens the game URL inside Glyph's in-app browser or another WalletConnect-compatible wallet browser.
- No access to a desktop browser during play.
- Expects tap-friendly UI, readable on small screens.
- Motivated by: quick sessions, touch controls, mobile accessibility.

---

## 4. Core User Flows

### 4.1 Onboarding & Wallet Connection

**Trigger:** User navigates to the game URL.

**Steps:**

1. Game loads and displays the pixel-art overworld. A "CONNECT WALLET" button appears in the top-right corner.
2. User clicks the button. RainbowKit modal opens with wallet options:
   - **ApeChain Wallets** group (top): Glyph, dGen1 (experimental).
   - **Popular Wallets** group: MetaMask, Rainbow, WalletConnect, Coinbase, Ledger, etc.
3. User selects a wallet and approves the connection.
4. If the user is on the wrong network, a "WRONG NETWORK" warning appears with a one-click switch to ApeChain.
5. Once connected, the HUD appears: ball inventory, SHOP button, help button, and wallet address/balance.

**First-visit behavior:** A Help modal auto-opens after 1 second, explaining how to play. It does not reappear on subsequent visits (tracked via `localStorage`).

**Mobile requirement:** On mobile devices, the game must be opened inside the wallet's built-in browser (e.g., Glyph's in-app browser). Regular mobile browsers (Safari, Chrome) cannot inject a wallet provider and are not supported. If no injected provider is detected, the UI should display a clear message directing the user to open the game in a wallet browser.

### 4.2 Funding (Bridge / Swap / Buy)

**Trigger:** User clicks "Get APE" or "Get USDC.e" in the shop, or needs funds to purchase balls.

**Steps:**

1. FundingWidget modal opens with ThirdWeb Universal Bridge.
2. **Destination is locked** to ApeChain + the selected token (APE or USDC.e); the user can only choose the source chain and token.
3. User selects their source chain (Ethereum, Arbitrum, Base, Optimism, Polygon, etc.) and source token (ETH, USDC, etc.).
4. ThirdWeb calculates the best route and displays a quote.
5. User approves the transaction in their existing wallet (the game reuses the connected RainbowKit wallet via ThirdWeb adapter).
6. Bridge/swap executes. User receives APE or USDC.e on ApeChain.

**Constraints:**
- The wagmi config includes source chains (mainnet, arbitrum, base, optimism, polygon) to allow wallet switching during bridging.
- ThirdWeb's ApeChain definition must include an explicit `rpc` field for bridge completion monitoring.

### 4.3 Buying Balls

**Trigger:** User clicks "SHOP" in the HUD.

**Steps:**

1. PokeBallShop modal opens. Displays 4 ball types:

   | Ball | Price | Catch Rate | Max per Tx |
   |------|-------|------------|------------|
   | Poke Ball | $1.00 | 2% | 49 |
   | Great Ball | $10.00 | 20% | 4 |
   | Ultra Ball | $25.00 | 50% | 1 |
   | Master Ball | $49.90 | 99% | 1 |

2. User selects a ball type and enters quantity.
3. User chooses payment token via toggle:
   - **APE:** No approval needed. Direct native payment via `msg.value`.
   - **USDC.e:** Requires one-time ERC-20 approval. An "APPROVE" button appears if not yet approved; after approval, a "BUY" button becomes active.
4. Frontend validates the $49.90 per-transaction cap. If exceeded, the button shows "Over Cap" in red.
5. User clicks BUY. Wallet prompts for confirmation.
6. On success: ball inventory updates in real-time. If the purchase triggers the NFT auto-purchase threshold ($51 USDC.e in SlabNFTManager), a cyan "NFT Auto-Purchase Triggered!" badge appears.

**What happens on-chain:**
- APE is auto-swapped to USDC.e via Camelot DEX inside the contract.
- Revenue is split: 96% to SlabNFTManager (NFT pool), 3% to treasury, 0.5% to PokeballGame APE reserve, 0.5% to SlabNFTManager APE reserve.
- SlabNFTManager checks if USDC.e balance ≥ $51 and auto-purchases NFTs in a loop until inventory hits 20 or funds are depleted.

### 4.4 Throwing Balls (Gasless)

**Trigger:** User walks near a wild Pokemon and clicks/taps it.

**Steps:**

1. Player moves within catch range (96 pixels) of a Pokemon using keyboard (WASD/arrows) or tap-to-move.
2. Player clicks/taps the Pokemon. If out of range, a "Move closer to the Pokemon!" toast appears.
3. If in range, the CatchAttemptModal opens showing:
   - Pokemon ID and attempts remaining (color-coded: green/yellow/red).
   - Available ball types (only those the player owns).
   - Each ball's name, price, and catch rate.
4. Player clicks "Throw" on their chosen ball type.
5. **Gasless flow (production):**
   - Frontend fetches the player's current nonce from the contract.
   - Frontend builds a message hash and requests the player to sign it via `personal_sign` (wallet popup for **signature only — no gas confirmation**).
   - Signed message is POSTed to the relayer (`https://pokeball-relayer.pokeballgame.workers.dev`).
   - Relayer validates and calls `throwBallFor()` on-chain, paying gas and Entropy fee from platform reserves.
6. Modal closes immediately after signature. A ball-throw animation plays on the overworld.
7. Pyth Entropy callback determines the result (typically 1-2 blocks).
8. Result arrives via contract event:
   - **`CaughtPokemon`** → CatchWinModal opens with confetti, NFT card display, and links.
   - **`FailedCatch`** → CatchResultModal shows "The Pokemon broke free!" with attempts remaining.

**State machine:** `idle → throwing → awaiting_result → success/failure → idle`

The CatchMechanicsManager resets to idle when the contract event arrives, preventing stuck states.

### 4.5 Winning NFTs

**Trigger:** Pyth Entropy callback determines a successful catch.

**On-chain behavior:**

1. PokeballGame's `_handleThrowCallback()` evaluates `randomNumber % 100 < catchRate`.
2. On success, calls `SlabNFTManager.awardNFTToWinnerWithRandomness(player, randomNumber)`.
3. SlabNFTManager selects a random index: `(randomNumber >> 128) % inventorySize`.
4. The NFT at that index is transferred to the player via O(1) swap-and-pop removal.
5. Events emitted: `CaughtPokemon(catcher, pokemonId, nftTokenId)` and `NFTAwardedWithRandomness(winner, tokenId, selectedIndex, inventorySize, remainingInventory)`.

**Frontend behavior:**

1. App.tsx listens for `CaughtPokemon` events filtered to the current user.
2. If `nftTokenId > 0`: CatchWinModal opens with:
   - NFT card image fetched from IPFS metadata.
   - Card name, attributes (rarity, edition, card number).
   - Links to Apescan and Magic Eden.
   - Confetti animation.
3. If `nftTokenId === 0` (inventory was empty at catch time): Warning toast displayed. The NFT recovery worker will track the NFT within ~60 seconds.

**Where NFTs appear:**
- In-game win modal (immediately).
- In-game inventory terminal (after page refresh).
- External marketplaces: Magic Eden, OpenSea.
- Block explorer: Apescan.

### 4.6 Transaction History & Stats

**Trigger:** User clicks the ball inventory panel in the HUD.

**Steps:**

1. TransactionHistory modal opens, showing a reverse-chronological list of:
   - Ball purchases (quantity, tier, token used, cost).
   - Throw attempts (Pokemon targeted, ball type).
   - Catch results (success with NFT ID link, or failure with attempts remaining).
2. Color-coded by type: purchase (green), throw (yellow), caught (cyan), failed (red).
3. Stats bar at top: total purchases, throws, catches, escapes, and catch rate.
4. Spending summary bar: total USD spent, APE used, USDC.e used — helps verify NFT pool contribution.
5. "Load More" pagination for older transactions.
6. Stats persist to localStorage and survive page refreshes.

**Data source:** Historical events fetched from Caldera public RPC (no block range limits). Real-time updates via manual `eth_getLogs` polling every 2 seconds.

### 4.7 Admin / Operator Flows

**Access:** Dev mode only (URL param `?dev=1` or localStorage flag). Owner wallet required for write operations.

**OperatorDashboard** (F2 toggle):
- APE reserve balances for both contracts with health indicators (green/yellow/red).
- USDC.e pool balance and auto-purchase eligibility.
- Accumulated treasury fees.
- Copy-to-clipboard CLI commands for Hardhat tasks.

**AdminDevTools** (F2 toggle):
- Contract state: USDC.e balance, inventory count, pending VRF requests.
- Find and recover untracked NFTs (for SlabMachine `transferFrom` issue).
- Clear stuck pending request counters.

**Maintenance scripts (run via Hardhat CLI):**

| Script | Purpose |
|--------|---------|
| `scripts/verify_revenue_flow.cjs` | Verify 3%/97% fee/revenue split on-chain |
| `scripts/withdraw_test_funds.cjs` | Withdraw fees/revenue to treasury |
| `scripts/repositionPokemonV9.cjs` | Reposition all Pokemon (center-heavy layout) |
| `scripts/update_ape_price.cjs` | Update on-chain APE/USD price from CoinGecko (run hourly) |
| `scripts/fund_ape_reserves.cjs` | Fund APE reserves for both contracts |

**Automated services:**

| Service | URL | Schedule |
|---------|-----|----------|
| Gasless relayer | `https://pokeball-relayer.pokeballgame.workers.dev` | On-demand |
| NFT recovery worker | `https://nft-recovery-worker.pokeballgame.workers.dev` | Every 1 minute (cron) |

---

## 5. Functional Requirements

### 5.1 Wallet & Network

| ID | Requirement | Priority |
|----|-------------|----------|
| W-1 | Support MetaMask and other EIP-1193 desktop wallets via RainbowKit. | Must |
| W-2 | Support Glyph and WalletConnect-compatible mobile wallets via in-app browser. | Must |
| W-3 | Display "WRONG NETWORK" with one-click switch if user is on a non-ApeChain network. | Must |
| W-4 | Standalone mobile browsers not supported; show a clear message if no injected provider is found. | Must |
| W-5 | dGen1/ethOS support is experimental and limited to the system wallet browser; some contract calls may fail. | Experimental |

### 5.2 Payments & Pricing

| ID | Requirement | Priority |
|----|-------------|----------|
| P-1 | Accept APE (native) and USDC.e (ERC-20) as payment for ball purchases. | Must |
| P-2 | APE is auto-swapped to USDC.e inside the contract via Camelot DEX. Players see USD-denominated prices. | Must |
| P-3 | Per-transaction cap of $49.90 enforced in frontend and contract (`MAX_PURCHASE_USD`). | Must |
| P-4 | USDC.e requires one-time ERC-20 approval before purchase; APE requires no approval. | Must |
| P-5 | On-chain APE price (`apePriceUSD`, 8 decimals) must be updated periodically via `update_ape_price.cjs`. | Must |
| P-6 | Shop displays current APE exchange rate and calculates costs dynamically. | Must |

### 5.3 Randomness & Fairness

| ID | Requirement | Priority |
|----|-------------|----------|
| R-1 | All catch outcomes determined by Pyth Entropy on-chain randomness. | Must |
| R-2 | NFT selection uses a separate portion of the same random number (`randomNumber >> 128`), not deterministic array order. | Must |
| R-3 | Platform pays Entropy fees (~0.073 APE per throw) from APE reserves. Players pay zero gas for throws. | Must |
| R-4 | Catch rates per ball type: Poke 2%, Great 20%, Ultra 50%, Master 99%. | Must |

### 5.4 Gasless Throws

| ID | Requirement | Priority |
|----|-------------|----------|
| G-1 | Production throws use gasless meta-transactions: player signs EIP-191 message, relayer calls `throwBallFor()`. | Must |
| G-2 | Relayer hosted on Cloudflare Workers with 30-second request timeout. | Must |
| G-3 | Contract verifies player signature and nonce to prevent replay attacks. | Must |
| G-4 | Dev mode fallback: direct `throwBall()` with player-paid Entropy fee (for testing without relayer). | Should |
| G-5 | UI must gracefully surface relayer errors (timeout, validation failure, network issues) via toast notifications with actionable messages. | Must |

### 5.5 NFT Pool & Auto-Purchase

| ID | Requirement | Priority |
|----|-------------|----------|
| N-1 | SlabNFTManager holds up to 20 NFTs in its inventory pool. | Must |
| N-2 | When USDC.e balance ≥ $51, automatically purchase NFTs from SlabMachine in a loop until inventory is full or funds depleted. | Must |
| N-3 | Revenue split: 96% NFT pool, 3% treasury, 0.5% PokeballGame APE reserve, 0.5% SlabNFTManager APE reserve. | Must |
| N-4 | NFT recovery worker runs every minute to track NFTs received via `transferFrom()` (SlabMachine does not use `safeTransferFrom`). | Must |
| N-5 | If a player catches a Pokemon but the inventory is empty (`nftTokenId === 0`), show a warning toast instead of a broken win modal. | Must |

### 5.6 Game Mechanics

| ID | Requirement | Priority |
|----|-------------|----------|
| GM-1 | Up to 20 wild Pokemon active on the map at any time. | Must |
| GM-2 | Each Pokemon allows up to 3 throw attempts before relocating. | Must |
| GM-3 | Players must be within 96 pixels to initiate a catch. Out-of-range clicks show a "Move closer" toast (debounced). | Must |
| GM-4 | Spawn management (owner only): reposition Pokemon, despawn Pokemon, configure max active count. | Must |
| GM-5 | Bike rental available for 2x movement speed boost. | Should |
| GM-6 | Keyboard input (WASD/arrows) and tap-to-move on touch devices. Keyboard overrides touch. | Must |
| GM-7 | Tapping a Pokemon on touch devices triggers the catch flow, not tap-to-move. | Must |

### 5.7 UI/UX

| ID | Requirement | Priority |
|----|-------------|----------|
| U-1 | All interactive elements have minimum 44px touch targets. | Must |
| U-2 | Large modals (Shop, Help, Funding, History, CatchAttempt, CatchWin) are scrollable on small screens via standardized CSS classes. | Must |
| U-3 | Help modal auto-opens on first visit (1-second delay), with a "?" button for manual access. | Should |
| U-4 | Ball inventory panel in HUD is clickable to open Transaction History. | Should |
| U-5 | Chiptune SFX for throw, impact, catch success, and catch failure. Independent volume control from music. | Should |
| U-6 | Confetti animation on successful catch in the win modal. | Should |
| U-7 | Pixel-art aesthetic: monospace fonts, dark theme, pixelated image rendering. | Must |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| ID | Requirement |
|----|-------------|
| NF-1 | 60 fps target on modern desktop browsers and midrange mobile devices. |
| NF-2 | 20 Pokemon sprites + grass effects (~60 draw calls) must render smoothly. Phaser 3 WebGL batches these efficiently. |
| NF-3 | Contract reads batched via Multicall3 to minimize RPC round-trips. |
| NF-4 | React Query configured with reduced retries (2), exponential backoff, and 30-second stale time to avoid RPC spam. |

### 6.2 Reliability

| ID | Requirement |
|----|-------------|
| NF-5 | Graceful handling of RPC failures: retries with backoff, no `net::ERR_INSUFFICIENT_RESOURCES` errors. |
| NF-6 | Event polling uses manual `eth_getLogs` (not `eth_newFilter`) because ApeChain RPC does not support filters. |
| NF-7 | Historical event queries use Caldera public RPC (no block range limits) instead of Alchemy (10-block free tier limit). |
| NF-8 | ThirdWeb widget wrapped in error boundary with retry fallback. |
| NF-9 | Gas estimation runs before sending transactions to wallet. If estimation fails, the transaction is blocked and a clear error is shown. |

### 6.3 Security

| ID | Requirement |
|----|-------------|
| NF-10 | No private key storage. All signing happens in the user's wallet. |
| NF-11 | Gasless relayer restricted to `throwBallFor()` calls only. Relayer wallet authorized via `setRelayerAddress()` on contract. |
| NF-12 | Nonce tracking in the contract prevents replay attacks on gasless throws. |
| NF-13 | UUPS proxy upgrades restricted to owner wallet via `_authorizeUpgrade()`. |
| NF-14 | Per-transaction cap ($49.90) enforced at both frontend and contract level. |

### 6.4 Observability

| ID | Requirement |
|----|-------------|
| NF-15 | Console logging with prefixed tags: `[useGetPokemonSpawns]`, `[GameCanvas]`, `[PokemonSpawnManager]`, `[useGaslessThrow]`, etc. |
| NF-16 | On-screen debug panel for dGen1 showing provider state, transaction steps, and errors (since console is inaccessible on ethOS). |
| NF-17 | PokemonSpawnManager debug mode (F3): visual slot labels, range circles, debug beacons, and stats overlay. |
| NF-18 | OperatorDashboard shows contract health (APE reserves, USDC.e pool, inventory count) with color-coded indicators. |
| NF-19 | Analytics & Observability: structured console logging with prefixed tags throughout the frontend, on-screen debug panel for devices without console access (dGen1), and health-check endpoints on Cloudflare Workers for uptime monitoring. |

---

## 7. Platform & Device Support

### Browsers

| Browser | Support Level |
|---------|--------------|
| Chrome / Chromium | Primary (recommended) |
| Safari (macOS & iOS) | Supported |
| Firefox | Supported |
| Edge | Supported |

### Wallets

| Wallet | Platform | Support Level |
|--------|----------|--------------|
| MetaMask | Desktop browser extension | Primary |
| Glyph | Mobile in-app browser | Primary (recommended for mobile) |
| Rainbow, Coinbase, WalletConnect | Desktop / mobile | Supported via RainbowKit |
| Ledger, Trezor | Via WalletConnect | Supported |
| dGen1 / EthereumPhone | ethOS system wallet browser | Experimental — some transactions may fail |

### Devices & Screen Sizes

| Device | Support Level | Notes |
|--------|--------------|-------|
| Desktop (Windows, macOS, Linux) | Full support | 1024px+ recommended |
| Mobile (iOS, Android) | Full support | Via wallet in-app browser only. 320px+ viewports. |
| Tablet | Full support | |
| dGen1 / EthereumPhone | Experimental | ethOS system wallet browser only. 240px–360px compact UI. |

---

## 8. Open Questions / Future Work

| Area | Description |
|------|-------------|
| **dGen1 reliability** | Pending clarification from the ethOS team on browser transaction API behavior. Once resolved, full support for ERC-4337 Account Abstraction transactions can be validated. |
| **Deeper dGen1 integration** | Once the ethOS browser transaction API is stable, pursue deeper integration including reliable ERC-20 approvals, Account Abstraction batched transactions, and removal of the "experimental" designation. |
| **Session / permit-style signing** | Explore session keys or permit-style signing to reduce repeated wallet popups while maintaining non-custodial security. Currently, each gasless throw requires a separate `personal_sign` wallet interaction. |
| **Additional game content** | More maps, NPCs, quest lines, and interactive buildings. The current overworld is a single tile-based map with Pokemon spawns, a bike shop, and a trading outpost. |
| **Analytics and progression** | Player progression systems (catch count achievements, leaderboards), on-chain analytics dashboard, and engagement metrics. |
| **APE price oracle** | Replace the hourly CoinGecko-based price update script with a real-time on-chain oracle (e.g., Pyth price feeds) for more accurate APE/USD pricing. |
| **Multi-pool support** | Support multiple NFT collections or themed prize pools (e.g., seasonal cards, limited editions) beyond the current single Slab collection. |
| **Improved mobile UX** | Virtual D-Pad as alternative to tap-to-move (infrastructure exists, needs polish). Haptic feedback for catch events on supported devices. |

---

## Appendix: Contract Addresses & Constants

### Deployed Contracts (ApeChain Mainnet)

| Contract | Address |
|----------|---------|
| PokeballGame (Proxy) | [`0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f`](https://apescan.io/address/0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f) |
| SlabNFTManager (Proxy) | [`0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71`](https://apescan.io/address/0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71) |
| Slab NFT (ERC-721) | [`0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7`](https://apescan.io/token/0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7) |
| SlabMachine | `0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466` |
| Pyth Entropy | `0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320` |
| USDC.e | `0xF1815bd50389c46847f0Bda824eC8da914045D14` |
| Camelot Router (DEX) | `0xC69Dc28924930583024E067b2B3d773018F4EB52` |

### Key Constants

| Constant | Value |
|----------|-------|
| Max active Pokemon | 20 |
| Max throw attempts per Pokemon | 3 |
| Catch range | 96 pixels |
| Max purchase per transaction | $49.90 USD |
| NFT auto-purchase threshold | $51 USDC.e |
| Max NFT inventory | 20 |
| Entropy fee per throw | ~0.073 APE |
| APE price format | 8 decimals (e.g., $0.19 = `19000000`) |

### Revenue Split

| Destination | Percentage | Purpose |
|-------------|-----------|---------|
| NFT pool (SlabNFTManager) | 96% | Funds automatic Slab NFT purchases |
| Treasury | 3% | Platform fees |
| PokeballGame APE reserve | 0.5% | Funds Pyth Entropy fees for throws |
| SlabNFTManager APE reserve | 0.5% | Funds SlabMachine pull gas |

### Production Services

| Service | URL |
|---------|-----|
| Frontend | [pokemon-trader-gamma.vercel.app](https://pokemon-trader-gamma.vercel.app) |
| Gasless relayer | `https://pokeball-relayer.pokeballgame.workers.dev` |
| NFT recovery worker | `https://nft-recovery-worker.pokeballgame.workers.dev` |

---

*For full technical implementation details, contract ABIs, hook documentation, and troubleshooting guides, see [`CLAUDE.md`](../CLAUDE.md) and [`README.md`](../README.md).*
