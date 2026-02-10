# CLAUDE.md - Pokemon Trader (Solana)

## Project Overview

Pokemon Trader is a 2D pixel art game being ported from ApeChain (EVM) to Solana. Users explore a Pokemon-style game world, catch wild Pokemon using PokeBalls, and win NFTs. The Solana version uses an Anchor program, ORAO VRF for randomness, Collector Crypt Gacha API for NFT acquisition, Jupiter for token swaps, and SolBalls as the payment token.

- **Version**: 0.1.0
- **Status**: Solana program deployed to devnet, revenue processor backend implemented, frontend ported to Solana (builds successfully)
- **Network**: Solana Devnet (mainnet-beta planned)
- **Program ID**: `B93VJQKD5UW8qfNsLrQ4ZQvTG6AG7PZsR6o2WeBiboBZ`
- **Architecture Doc**: `docs/SOLANA_ARCHITECTURE.md` (v1.1)

## Tech Stack

### On-Chain Program
- **Anchor 0.32.1** - Solana program framework (Rust)
- **orao-solana-vrf 0.7.0** - Verifiable randomness (CPI)
- **anchor-spl 0.32.1** - SPL Token & Associated Token helpers
- **Solana CLI 3.0.15** (Agave) - Deployment & management

### Frontend (ported to Solana)
- **React 18.2.0** - UI framework
- **TypeScript 5.2.2** - Type-safe JavaScript
- **Phaser.js 3.80.1** - 2D game engine
- **Vite 6.4.1** - Build tool and dev server
- **@solana/wallet-adapter** - Wallet connection (Phantom, Solflare, Coinbase + auto-detect)
- **@coral-xyz/anchor** - TypeScript client for Anchor programs
- **Jupiter Terminal v3** - CDN-loaded swap widget (SolBalls acquisition)

### Backend Services (`backend/`)
- **Revenue Processor** - Node.js/Express service: monitors SolBalls revenue, swaps to USDC via Jupiter, splits revenue, triggers Gacha purchases, deposits NFTs into vault
- **Collector Crypt Gacha API** - REST API for NFT pack purchases
- **@coral-xyz/anchor** + **@solana/web3.js** + **@solana/spl-token** - On-chain interactions
- **Express 4** - Admin HTTP endpoints
- **Vitest** - Unit tests

## Quick Start

```bash
# Frontend
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build

# Backend (Revenue Processor)
cd backend
npm install          # Install dependencies
cp .env.example .env # Configure environment
npm run dev          # Start dev server (http://localhost:3001)
npm test             # Run unit tests

# Solana Program (requires WSL on Windows)
# Build (two-step due to platform-tools v1.53 requirement)
anchor build --no-idl -- --tools-version v1.53   # Compile SBF binary
anchor idl build -o target/idl/pokeball_game.json  # Generate IDL

# Deploy to devnet
solana program deploy target/deploy/pokeball_game.so --program-id target/deploy/pokeball_game-keypair.json

# Admin Scripts
npx ts-node scripts/solana/initialize.ts --treasury <PUBKEY> --solballs-mint <PUBKEY> --usdc-mint <PUBKEY>
npx ts-node scripts/solana/spawn-pokemon.ts --slot 0
npx ts-node scripts/solana/deposit-nft.ts --mint <NFT_MINT_PUBKEY>
npx ts-node scripts/solana/check-state.ts
npx ts-node scripts/solana/set-prices.ts --ball-type 0 --price 1000000
npx ts-node scripts/solana/withdraw-revenue.ts --amount 100000000
```

## Build Notes

### Platform-Tools v1.53 Requirement
The default Solana platform-tools v1.51 ships Cargo 1.84.0 which doesn't support Rust edition 2024. The `blake3` crate (transitive dependency via `solana-program`) requires it. Must use platform-tools v1.53.

```bash
# Install v1.53
cargo-build-sbf --install-only --tools-version v1.53

# Build with v1.53 (--tools-version leaks to IDL cargo test step, so split build)
anchor build --no-idl -- --tools-version v1.53
anchor idl build -o target/idl/pokeball_game.json

# If .so lands in wrong directory, copy manually:
cp programs/pokeball_game/target/deploy/pokeball_game.so target/deploy/
```

### Boxing Large Accounts
All `GameConfig`, `PokemonSlots`, and `NftVault` account fields use `Box<Account<...>>` to avoid Solana's 4KB stack frame limit. The `NftVault` alone has `[Pubkey; 20]` (640 bytes).

## Project Structure

```
├── programs/                    # Solana Anchor program
│   └── pokeball_game/
│       ├── Cargo.toml               # Anchor 0.32.1, orao-solana-vrf 0.7.0
│       ├── src/
│       │   ├── lib.rs                   # Program entrypoint, 12 instructions
│       │   ├── state.rs                 # 7 account structs (GameConfig, PokemonSlots, etc.)
│       │   ├── constants.rs             # Seeds, defaults, limits
│       │   ├── errors.rs               # 25 error codes
│       │   ├── events.rs               # 14 events
│       │   └── instructions/
│       │       ├── mod.rs                   # Module re-exports
│       │       ├── initialize.rs            # Create all PDAs + game SolBalls ATA
│       │       ├── purchase_balls.rs        # Player buys balls with SolBalls tokens
│       │       ├── spawn_pokemon.rs         # VRF-based random spawn (authority)
│       │       ├── force_spawn_pokemon.rs   # Direct spawn at coordinates (authority)
│       │       ├── reposition_pokemon.rs    # Move Pokemon to new position (authority)
│       │       ├── despawn_pokemon.rs       # Remove Pokemon from slot (authority)
│       │       ├── throw_ball.rs            # Player throws ball, requests VRF
│       │       ├── consume_randomness.rs    # VRF callback: catch/spawn resolution
│       │       ├── deposit_nft.rs           # Deposit Metaplex NFT into vault (authority)
│       │       ├── withdraw_nft.rs          # Withdraw NFT from vault (authority)
│       │       ├── admin.rs                 # set_ball_price, set_catch_rate, set_max_active_pokemon
│       │       └── withdraw_revenue.rs      # Withdraw SolBalls revenue (authority)
│       └── target/                  # Build artifacts (gitignored except deploy/)
│
├── target/                      # Anchor build output
│   ├── deploy/
│   │   ├── pokeball_game.so            # Compiled program binary (536KB)
│   │   └── pokeball_game-keypair.json  # Program deploy keypair
│   ├── idl/
│   │   └── pokeball_game.json          # Anchor IDL (63KB, 12 instructions)
│   └── types/
│       └── pokeball_game.ts            # Generated TypeScript types
│
├── backend/                     # Revenue Processor (Node.js/Express)
│   ├── package.json                 # Backend dependencies
│   ├── tsconfig.json                # TypeScript config
│   ├── vitest.config.ts             # Test runner config
│   ├── .env.example                 # Backend env vars template
│   └── src/
│       ├── index.ts                     # Express server + cron scheduler
│       ├── config.ts                    # Env var loading & validation
│       ├── solanaClient.ts              # Anchor program client (PDAs, withdraw, deposit)
│       ├── revenueProcessor.ts          # Swap pipeline (Jupiter) + USDC split
│       ├── gachaClient.ts              # Collector Crypt Gacha API client
│       ├── nftDepositor.ts             # NFT scan + vault deposit
│       └── __tests__/
│           └── revenueProcessor.test.ts # Unit tests (split, thresholds)
│
├── scripts/solana/              # Admin CLI scripts (TypeScript)
│   ├── common.ts                    # Shared setup: PDA derivation, helpers
│   ├── initialize.ts                # Initialize game (one-time)
│   ├── spawn-pokemon.ts             # Spawn Pokemon via VRF
│   ├── deposit-nft.ts               # Deposit NFT into vault
│   ├── check-state.ts               # Read and display all on-chain state
│   ├── set-prices.ts                # Update ball prices / catch rates
│   └── withdraw-revenue.ts          # Withdraw SolBalls revenue
│
├── tests/                       # Anchor integration tests
│   └── pokeball_game.ts             # Full test suite
│
├── docs/                        # Documentation
│   ├── SOLANA_ARCHITECTURE.md       # Solana port architecture (v1.1)
│   └── ...                          # Legacy ApeChain docs
│
├── src/                         # Frontend (React + Phaser, ported to Solana)
│   ├── solana/                      # Solana integration layer
│   │   ├── wallet.tsx                   # SolanaWalletProvider (wallet-adapter)
│   │   ├── programClient.ts             # Anchor IDL client + PDA helpers
│   │   └── constants.ts                 # Ball prices, catch rates, program ID
│   ├── hooks/solana/                # Solana hooks (active)
│   │   ├── index.ts                     # Barrel exports
│   │   ├── usePlayerInventory.ts        # Read PlayerInventory PDA
│   │   ├── usePurchaseBalls.ts          # purchase_balls instruction
│   │   ├── useThrowBall.ts             # throw_ball instruction + VRF
│   │   ├── usePokemonSpawns.ts          # Read PokemonSlots PDA
│   │   ├── useSolBallsBalance.ts        # SolBalls token balance
│   │   ├── useSolanaEvents.ts           # WebSocket event listener
│   │   └── useActiveWeb3React.ts        # Wallet adapter → { account }
│   ├── components/                  # React UI components (rewritten for Solana)
│   ├── game/                        # Phaser game code (mostly unchanged)
│   ├── hooks/pokeballGame/          # Legacy EVM hooks (not imported)
│   └── services/                    # Legacy EVM services (not imported)
│
├── Anchor.toml                  # Anchor config (cluster, program ID, wallet)
├── .env.example                 # Environment variables template (Solana)
└── CLAUDE.md                    # This file
```

## Anchor Program: `pokeball_game`

### Program ID
```
B93VJQKD5UW8qfNsLrQ4ZQvTG6AG7PZsR6o2WeBiboBZ
```

### Account Structs (PDAs)

| Account | Seeds | Size | Purpose |
|---------|-------|------|---------|
| `GameConfig` | `["game_config"]` | 196 bytes | Authority, treasury, mints, ball prices, catch rates, counters |
| `PokemonSlots` | `["pokemon_slots"]` | 452 bytes | 20 `PokemonSlot` structs (22 bytes each) + active_count + bump |
| `PlayerInventory` | `["player_inv", player]` | 81 bytes | Per-player ball counts [4], lifetime stats |
| `NftVault` | `["nft_vault"]` | 676 bytes | Authority, 20 mint pubkeys, count, max_size, bump |
| `TreasuryConfig` | `["treasury"]` | 49 bytes | Treasury wallet, total_withdrawn, bump |
| `VrfRequest` | `["vrf_req", seed]` | 77 bytes | Request type, player, slot, ball_type, seed, is_fulfilled |

### Instructions (12 total)

| Instruction | Signer | Description |
|-------------|--------|-------------|
| `initialize` | Authority | Create all PDAs + game SolBalls ATA. Set initial prices/rates. One-time. |
| `purchase_balls` | Player | Transfer SolBalls to game account. Auto-creates PlayerInventory on first buy. |
| `spawn_pokemon` | Authority | Request ORAO VRF for random position. Creates VrfRequest PDA. |
| `force_spawn_pokemon` | Authority | Spawn at specific (x, y) coordinates. No VRF needed. |
| `reposition_pokemon` | Authority | Move existing Pokemon to new position. Resets throw attempts. |
| `despawn_pokemon` | Authority | Remove Pokemon from slot. |
| `throw_ball` | Player | Decrement ball, request ORAO VRF for catch determination. |
| `consume_randomness` | Anyone | Read fulfilled VRF, resolve spawn position or catch/miss. Awards NFT on catch. |
| `deposit_nft` | Authority | Transfer Metaplex NFT into vault PDA. |
| `withdraw_nft` | Authority | Transfer NFT from vault back to authority (admin recovery). |
| `set_ball_price` | Authority | Update price for a ball tier. |
| `set_catch_rate` | Authority | Update catch rate for a ball tier. |
| `set_max_active_pokemon` | Authority | Update soft cap on active spawns (1-20). |
| `withdraw_revenue` | Authority | Withdraw SolBalls from game token account. |

### Events (14)

| Event | Emitted By | Fields |
|-------|-----------|--------|
| `BallPurchased` | `purchase_balls` | buyer, ball_type, quantity, total_cost |
| `ThrowAttempted` | `throw_ball` | thrower, pokemon_id, ball_type, slot_index, vrf_seed |
| `CaughtPokemon` | `consume_randomness` | catcher, pokemon_id, slot_index, nft_mint |
| `FailedCatch` | `consume_randomness` | thrower, pokemon_id, slot_index, attempts_remaining |
| `PokemonSpawned` | `consume_randomness` / `force_spawn` | pokemon_id, slot_index, pos_x, pos_y |
| `PokemonRelocated` | `reposition_pokemon` | pokemon_id, slot_index, old_x, old_y, new_x, new_y |
| `PokemonDespawned` | `despawn_pokemon` / `consume_randomness` | pokemon_id, slot_index |
| `NftAwarded` | `consume_randomness` | winner, nft_mint, vault_remaining |
| `NftDeposited` | `deposit_nft` | nft_mint, vault_count |
| `NftWithdrawn` | `withdraw_nft` | nft_mint, vault_count |
| `BallPriceUpdated` | `set_ball_price` | ball_type, old_price, new_price |
| `CatchRateUpdated` | `set_catch_rate` | ball_type, old_rate, new_rate |
| `MaxActivePokemonUpdated` | `set_max_active_pokemon` | old_max, new_max |
| `RevenueWithdrawn` | `withdraw_revenue` | recipient, amount |

### Error Codes (25)

`AlreadyInitialized`, `NotInitialized`, `InvalidBallType`, `InvalidCatchRate`, `InsufficientBalls`, `SlotNotActive`, `SlotAlreadyOccupied`, `InvalidSlotIndex`, `MaxAttemptsReached`, `InvalidCoordinate`, `MaxActivePokemonReached`, `InvalidMaxActivePokemon`, `VaultFull`, `VaultEmpty`, `InvalidNftIndex`, `NftNotInVault`, `InsufficientSolBalls`, `ZeroQuantity`, `PurchaseExceedsMax`, `VrfAlreadyFulfilled`, `VrfNotFulfilled`, `InvalidVrfRequestType`, `InsufficientWithdrawalAmount`, `MathOverflow`, `ZeroBallPrice`, `Unauthorized`

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_POKEMON_SLOTS` | 20 | Hard cap on simultaneous Pokemon |
| `MAX_COORDINATE` | 999 | Position range (0-999) |
| `MAX_THROW_ATTEMPTS` | 3 | Throws before Pokemon despawns |
| `MAX_VAULT_SIZE` | 20 | Max NFTs in vault |
| `NUM_BALL_TYPES` | 4 | Poke, Great, Ultra, Master |
| `VRF_TYPE_SPAWN` | 0 | VRF request for spawn |
| `VRF_TYPE_THROW` | 1 | VRF request for throw |

### PDA Seeds

| Seed | Constant | Used By |
|------|----------|---------|
| `"game_config"` | `GAME_CONFIG_SEED` | GameConfig PDA |
| `"pokemon_slots"` | `POKEMON_SLOTS_SEED` | PokemonSlots PDA |
| `"player_inv"` + player pubkey | `PLAYER_INV_SEED` | PlayerInventory PDA |
| `"nft_vault"` | `NFT_VAULT_SEED` | NftVault PDA |
| `"treasury"` | `TREASURY_SEED` | TreasuryConfig PDA |
| `"vrf_req"` + seed bytes | `VRF_REQ_SEED` | VrfRequest PDA |
| `"game_solballs"` | `GAME_SOLBALLS_SEED` | (reserved) |

### Ball System

| Ball Type | Index | Default Price (SolBalls) | Catch Rate |
|-----------|-------|--------------------------|------------|
| Poke Ball | 0 | 1.000000 | 2% |
| Great Ball | 1 | 10.000000 | 20% |
| Ultra Ball | 2 | 25.000000 | 50% |
| Master Ball | 3 | 49.900000 | 99% |

Prices are in SolBalls atomic units (6 decimals). Configurable via `set_ball_price`.

## ORAO VRF Integration

ORAO VRF v2 provides on-chain verifiable randomness via CPI.

### Key Details
- **Program ID**: `VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y`
- **Cost**: ~0.001 SOL per request
- **Fulfillment**: Sub-second (same epoch)
- **Randomness**: 64 bytes (`[u8; 64]`)

### Integration Pattern
```rust
// Request VRF (in throw_ball or spawn_pokemon)
orao_solana_vrf::cpi::request_v2(cpi_ctx, seed);

// Consume VRF (in consume_randomness, called by anyone after fulfillment)
let data = randomness_account_info.try_borrow_data()?;
let randomness_data = RandomnessAccountData::try_deserialize(&mut data.as_ref())?;
let randomness_64 = randomness_data.fulfilled_randomness().ok_or(GameError::VrfNotFulfilled)?;
let randomness: [u8; 64] = *randomness_64;
drop(data);  // Must drop borrow before mutating other accounts
```

### Important: `RandomnessAccountData` is an enum
It must be deserialized from raw `AccountInfo` using `try_deserialize()`. It is NOT an Anchor account struct — you cannot use `Account<'info, RandomnessAccountData>`. Use `AccountInfo<'info>` with manual deserialization and PDA seed validation.

### Randomness Usage
- **Spawn position**: bytes [0..4] → pos_x, pos_y (modulo MAX_COORDINATE+1)
- **Catch determination**: bytes [0..8] → roll (modulo 100) vs catch_rate
- **NFT selection**: bytes [8..16] → index (modulo vault count)

## Deployment Details

### Devnet (Current)

| Detail | Value |
|--------|-------|
| **Program ID** | `B93VJQKD5UW8qfNsLrQ4ZQvTG6AG7PZsR6o2WeBiboBZ` |
| **Deploy Authority** | `FLNticLtYTTzFmNLQ2oAExJWNqew929h2SrCgqy9LJER` |
| **Program Size** | 536,384 bytes |
| **Program Rent** | ~3.73 SOL |
| **Cluster** | `devnet` |

### Wallet Addresses

| Role | Address | Notes |
|------|---------|-------|
| **Deploy Authority (WSL)** | `FLNticLtYTTzFmNLQ2oAExJWNqew929h2SrCgqy9LJER` | WSL-generated keypair at `~/.config/solana/id.json` |
| **User Phantom** | `4tzBtNgWQxSWqh5dAKh3cPwkbJwzPFi82FCk8KUw2dLq` | Test wallet |

### Build Environment (WSL)

- **WSL Distro**: Ubuntu, user `chanz08`
- **Project Path**: `/mnt/c/Users/zarac/Pokemon-Trader-Solana`
- **Rust**: 1.93.0 (system), 1.89.0-dev (platform-tools v1.53 for SBF)
- **Solana CLI**: 3.0.15 (Agave)
- **Anchor CLI**: 0.32.1
- **Platform-Tools**: v1.53 (at `~/.cache/solana/v1.53/`)
- **CRITICAL**: Builds MUST use `--tools-version v1.53` or v1.51 will be auto-downloaded (breaks edition2024)

## Off-Chain Architecture

### Revenue Flow
```
Player pays SolBalls → on-chain game token account
                           ↓
         Revenue Processor (backend, off-chain)
                           ↓
              Jupiter API: swap SolBalls → USDC
                           ↓
          Split: 3% treasury / 96% NFT pool / 1% reserves
                           ↓
          When NFT pool ≥ $50: call Gacha API
                           ↓
          Gacha API → NFT minted → backend wallet
                           ↓
          Backend calls deposit_nft instruction → vault PDA
```

### Collector Crypt Gacha API
- **Devnet**: `https://dev-gacha.collectorcrypt.com`
- **Mainnet**: `https://gacha.collectorcrypt.com`
- **Auth**: `x-api-key` header (get from Discord)
- **Flow**: `generatePack` → sign tx → `submitTransaction` → `openPack`
- **Cost**: ~$50 USDC per pack
- **Delivery**: NFTs sent to backend wallet, then deposited into vault

### Jupiter Aggregator
- **API**: `https://lite-api.jup.ag/swap/v1`
- **Usage**: Off-chain SolBalls → USDC swap (revenue processor)
- **Frontend**: Jupiter Plugin widget for players to acquire SolBalls
- **Note**: SolBalls launched via Bankr on Raydium — liquidity pool exists from day one

## Admin Scripts

All scripts use Anchor's provider from `Anchor.toml` or `ANCHOR_WALLET` env var.

```bash
# Initialize game (one-time)
npx ts-node scripts/solana/initialize.ts \
  --treasury <TREASURY_PUBKEY> \
  --solballs-mint <SOLBALLS_MINT> \
  --usdc-mint <USDC_MINT>

# Spawn Pokemon (VRF-based random position)
npx ts-node scripts/solana/spawn-pokemon.ts --slot 0

# Deposit NFT into vault
npx ts-node scripts/solana/deposit-nft.ts --mint <NFT_MINT_PUBKEY>

# Check all on-chain state
npx ts-node scripts/solana/check-state.ts

# Update ball prices
npx ts-node scripts/solana/set-prices.ts --ball-type 0 --price 2000000

# Withdraw SolBalls revenue
npx ts-node scripts/solana/withdraw-revenue.ts --amount 100000000
```

## Key Technical Notes

### ORAO VRF v0.7 Specifics
- `RandomnessAccountData` is an **enum**, not a struct — use `AccountInfo` + manual `try_deserialize()`
- `fulfilled_randomness()` returns `Option<&[u8; 64]>` (64 bytes)
- **Must copy bytes before dropping borrow**: `let randomness: [u8; 64] = *randomness_64; drop(data);`
- CPI: `orao_solana_vrf::cpi::accounts::RequestV2` + `request_v2(ctx, seed)`
- Seeds: `CONFIG_ACCOUNT_SEED` for network state, `RANDOMNESS_ACCOUNT_SEED` for randomness PDA

### Anchor Patterns
- `Context` passed **by value** (owned) to handler functions for mutable access
- `Option<Account<'info, T>>` with `.as_ref()` for optional account borrowing (avoids E0507 move errors)
- `init_if_needed` requires feature in both `Cargo.toml [features]` and `anchor-lang` dependency
- Fixed-size arrays `[Pubkey; 20]` for vault mints (avoids Vec realloc in Solana)
- Swap-and-pop O(1) removal from fixed arrays
- PDA signer: `&[&[SEED, &[bump]]]` pattern

### Solana-Specific Constraints
- 4KB stack frame limit — box all large accounts (`Box<Account<...>>`)
- `associated_token::mint` constraint requires `Account<'info, Mint>`, not `AccountInfo`
- No gasless needed — Solana fees are ~$0.001/tx
- No ERC-20 approvals — SPL Token transfers are owner-signed

## Environment Variables

See `.env.example` for the complete template. Key variables:

| Variable | Description |
|----------|-------------|
| `POKEBALL_GAME_PROGRAM_ID` | Deployed program ID |
| `SOLANA_CLUSTER` | `devnet` or `mainnet-beta` |
| `SOLANA_RPC_URL` | RPC endpoint |
| `SOLBALLS_MINT` | SolBalls SPL token mint |
| `USDC_MINT` | USDC SPL token mint |
| `TREASURY_WALLET` | Treasury pubkey for fees |
| `GACHA_API_URL` | Collector Crypt Gacha endpoint |
| `GACHA_API_KEY` | Gacha API authentication key |
| `JUPITER_API_URL` | Jupiter swap API endpoint |
| `ANCHOR_WALLET` | Path to authority keypair |
| `BACKEND_WALLET_PRIVATE_KEY` | Backend wallet (base58, JSON array, or keypair path) |
| `ADMIN_API_KEY` | Shared secret for backend admin endpoints |
| `MIN_SOLBALLS_TO_SWAP` | Threshold to trigger swap (atomic units) |
| `PACK_COST_USDC` | Gacha pack cost (atomic units, default 50M = $50) |
| `VITE_POKEBALL_GAME_PROGRAM_ID` | Program ID for frontend |
| `VITE_SOLANA_CLUSTER` | Cluster for frontend wallet adapter |

## Frontend (Ported to Solana)

The Phaser game engine, game entities, and UI components from the ApeChain version are preserved. The Web3 layer has been ported from EVM to Solana. **The frontend builds successfully.**

### Solana Frontend Architecture

| Layer | Files | Description |
|-------|-------|-------------|
| Wallet Provider | `src/solana/wallet.tsx` | `SolanaWalletProvider` — ConnectionProvider + WalletProvider + WalletModalProvider |
| Program Client | `src/solana/programClient.ts` | Anchor IDL-based client with PDA derivation helpers |
| Constants | `src/solana/constants.ts` | Ball prices, catch rates, decimals, program ID |
| Hooks | `src/hooks/solana/` | 8 hooks for on-chain interactions |
| Components | `src/components/` | Rewritten for Solana (PokeBallShop, CatchAttemptModal, etc.) |

### Solana Hooks (`src/hooks/solana/`)

| Hook | Purpose |
|------|---------|
| `useActiveWeb3React` | Returns `{ account: string }` from `useWallet().publicKey` |
| `usePlayerInventory` | Reads `PlayerInventory` PDA (ball counts, stats) with polling |
| `usePurchaseBalls` | Calls `purchase_balls` instruction |
| `useThrowBall` | Calls `throw_ball` instruction with VRF seed |
| `usePokemonSpawns` | Reads `PokemonSlots` PDA, returns active spawns |
| `useSolBallsBalance` | Reads player's SolBalls token account balance |
| `useSolanaEvents` | WebSocket event listener for Anchor program events |
| `useCaughtPokemonEvents` / `useFailedCatchEvents` / `useBallPurchasedEvents` | Typed event hooks (built on `useSolanaEvents`) |

### Components Rewritten for Solana

| Component | Key Changes |
|-----------|-------------|
| `PokeBallShop` | SolBalls-only (no APE/USDC toggle), no approval step, Jupiter swap button |
| `SwapWidget` | Jupiter Terminal v3 integration (CDN), output locked to SolBalls |
| `CatchAttemptModal` | Direct tx via `useThrowBall`, Solana Explorer links |
| `CatchWinModal` | Solana Explorer links, no EVM NFT metadata fetching |
| `CatchResultModal` | Solana Explorer links |
| `InventoryTerminal` | Uses `usePlayerInventory` for stats display |
| `AdminDevTools` | Reads Anchor accounts (GameConfig, PokemonSlots, NftVault) |
| `TransactionHistory` | Session-based event log from WebSocket subscriptions |
| `WalletConnector` | Solana Wallet Adapter button (auto-detects Phantom, Solflare, etc.) |
| `TradeModal` | Stubbed (OTC trading not yet on Solana) |
| `GameCanvas` | Uses `usePokemonSpawns` hook for on-chain spawn data |

### Stubbed (EVM-only, disabled for Solana)

| Component/Manager | Reason |
|-------------------|--------|
| `TradeIconManager` | OTC listing system was EVM-specific |
| `NPCManager` | Trade NPCs now spawn as decorative (no OTC listings) |
| `FundingWidget` | ThirdWeb Bridge widget (replaced by Jupiter swap) |
| `BallShop` | Old test shop (replaced by PokeBallShop) |

### Legacy EVM Files (kept for reference, not imported)

The original ApeChain/EVM hooks, services, and connectors remain in the repo but are **not imported** by any active Solana code:
- `src/hooks/pokeballGame/` — 13+ wagmi-based hooks
- `src/hooks/useAllListings.tsx`, `useManageListing.tsx`, etc.
- `src/services/contractService.ts`, `apechainConfig.ts`, `thirdwebConfig.ts`
- `src/connectors/` — EVM wallet connectors (dGen1, Glyph)
- `src/utils/alchemy.ts` — Alchemy NFT API

### What Changed (Summary)

| ApeChain | Solana |
|----------|--------|
| Wagmi + Viem + RainbowKit | @solana/wallet-adapter |
| EVM contract calls | Anchor program client (IDL-based) |
| ERC-20 approvals | SPL Token transfers (no approval step) |
| ThirdWeb FundingWidget | Jupiter Terminal v3 (CDN swap widget) |
| Gasless relayer (CF Worker) | Direct transactions (~$0.001 fees) |
| Apescan explorer links | Solana Explorer links |
| `useReadContract` / `useWriteContract` | `program.methods.X().accounts({}).rpc()` |
| Alchemy NFT API | Placeholder (Metaplex metadata TBD) |

## Revenue Processor Backend

### Admin HTTP Endpoints

All endpoints (except `/health`) require `X-ADMIN-KEY` header.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (no auth) |
| `/status` | GET | Balances, vault count, timestamps, processing state |
| `/trigger-swap` | POST | Manual swap + split pipeline |
| `/trigger-gacha` | POST | Manual Gacha purchase + NFT deposit |

### Cron Pipeline (every 5 min)

1. **Phase 1 — Revenue**: Check game SolBalls balance >= threshold → `withdraw_revenue` → Jupiter swap to USDC → split (3% treasury / 96% NFT pool / 1% SOL reserve)
2. **Phase 2 — Gacha**: Check NFT pool USDC >= pack cost AND vault not full → Gacha API `generatePack` → sign/submit → `openPack` → `deposit_nft`

### Key Files

| File | Responsibility |
|------|---------------|
| `solanaClient.ts` | Anchor wrapper: PDA derivation, `withdrawRevenue()`, `depositNft()`, `findNewNftsInWallet()`, `signAndSendTransaction()` |
| `revenueProcessor.ts` | Jupiter quote/swap, `splitUsdcAmounts()`, `shouldRunSwap()`, full pipeline orchestration |
| `gachaClient.ts` | Gacha API: `purchasePack()` (generate→sign→submit→open), `purchaseMultiplePacks()` |
| `nftDepositor.ts` | Scan wallet for NFTs not in vault, deposit each via `deposit_nft` instruction |
| `config.ts` | All env vars with validation (revenue split must total 100) |

## Coding Conventions

### Rust (Anchor Program)
- All handler functions in separate files under `instructions/`
- Large account structs boxed (`Box<Account<...>>`)
- Constants in `constants.rs`, errors in `errors.rs`, events in `events.rs`
- PDA seeds as `&[u8]` byte slices
- Fixed-size arrays for on-chain collections (no `Vec`)

### TypeScript (Frontend + Scripts)
- Strict mode enabled
- Interfaces for all props and state
- Functional React components with hooks
- Admin scripts use `@coral-xyz/anchor` + `@solana/web3.js`

### Styling
- Inline pixel art styles with `imageRendering: 'pixelated'`
- Monospace fonts (`'Courier New', monospace`)
- Dark color scheme (#000, #1a1a1a, #2a2a2a)
- Green accent (#00ff88)

## Legacy (ApeChain)

The original ApeChain/EVM code still exists in the repo for reference:
- `contracts/` — Solidity contracts (PokeballGame v1.0-v1.9, SlabNFTManager v1.0-v2.4)
- `contracts/abi/` — Contract ABIs
- `contracts/deployment/` — Hardhat deployment/upgrade scripts
- `hardhat.config.cjs` — Hardhat configuration
- `relayer/` — Cloudflare Workers gasless relayer
- `nft-recovery-worker/` — NFT recovery cron worker
- `scripts/` (non-solana) — Hardhat scripts

These files are kept for reference during the port but are not active for the Solana version.

## Documentation

| File | Description |
|------|-------------|
| `docs/SOLANA_ARCHITECTURE.md` | **Solana port architecture (v1.1)** — component mapping, program design, Gacha API, token flow, VRF, Jupiter Plugin theme |
| `docs/PRD.md` | Product Requirements Document (v1) |
| `docs/EXECUTIVE_SUMMARY.md` | Project summary |
| `docs/implementation_plan.md` | Development roadmap |
| `docs/UUPS_UPGRADE_GUIDE.md` | ApeChain UUPS proxy docs (legacy reference) |
