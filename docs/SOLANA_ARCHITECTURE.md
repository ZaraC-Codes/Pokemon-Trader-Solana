# Pokemon Trader Solana — Architecture Document

**Version:** 1.1
**Date:** 2026-02-10
**Status:** Draft — Pending Owner Approval
**Author:** Solana Systems Architect (Claude)

### Changelog
- **v1.1 (2026-02-10)**: Updated SolBalls token description (Bankr-launched altcoin on Raydium, not custom utility token). Added Jupiter Plugin theme spec to match game's pixel-art dark theme. Resolved R1 risk (liquidity pool exists from Bankr launch). Finalized Q5 decision (Jupiter Plugin, not ThirdWeb). Added wallet adapter theming requirements.
- **v1.0 (2026-02-10)**: Initial architecture document.

---

## Table of Contents

1. [Component Map](#1-component-map)
2. [Solana Program Design](#2-solana-program-design)
3. [Gacha Machine Integration Design](#3-gacha-machine-integration-design)
4. [Token & Treasury Flow](#4-token--treasury-flow)
5. [Randomness Strategy](#5-randomness-strategy)
6. [Gasless / Fee Strategy](#6-gasless--fee-strategy)
7. [Data Flow Diagrams](#7-data-flow-diagrams)
8. [What Stays, What Goes, What's New](#8-what-stays-what-goes-whats-new)
9. [Open Questions & Risks](#9-open-questions--risks)

---

## 1. Component Map

| ApeChain Component | Solana Equivalent | On-Chain vs Off-Chain | Notes |
|---|---|---|---|
| **PokeballGame.sol** (v1.9.0) | **Anchor program: `pokeball_game`** | On-chain (Solana program) | Manages spawns, ball purchases, throws, catch logic, revenue split. Replaces all 9 Solidity contract versions with one Anchor program. |
| **SlabNFTManager.sol** (v2.4.0) | **Anchor program: `nft_vault`** (PDA-based NFT escrow) | On-chain (Solana program) | Holds Metaplex NFTs in a PDA vault. Awards random NFT on catch. No longer does auto-purchase — that moves off-chain. |
| **SlabMachine** (Collector Crypt EVM) | **Collector Crypt Gacha API** (Solana-native REST API) | Off-chain API + on-chain Solana txns | The Gacha Machine is already Solana-native. We call it via REST API from a backend service. NFTs are Metaplex compressed/standard NFTs. |
| **Pyth Entropy** (EVM) | **ORAO VRF v2** | On-chain (CPI from our program) | Pyth Entropy is NOT available on Solana. ORAO VRF provides verifiable randomness via CPI at 0.001 SOL/request with sub-second fulfillment. |
| **Camelot DEX swap** (APE→USDC.e) | **Jupiter Aggregator** (SolBalls→USDC) | Off-chain API + on-chain swap tx | Backend service calls Jupiter Metis API to swap SolBalls revenue to USDC. SolBalls launches via Bankr bot on Raydium, so a liquidity pool exists from day one and Jupiter auto-routes through it. |
| **Gasless Relayer** (CF Worker) | **Removed** (users pay ~0.000005 SOL per tx) | N/A | Solana tx fees are ~$0.001. Gasless is unnecessary. Users sign and pay directly. |
| **NFT Recovery Worker** (CF Cron) | **Removed** | N/A | The Gacha API delivers NFTs directly. Our backend service deposits them into the vault PDA. No `transferFrom` bug to work around. |
| **APE Price Updater** (CoinGecko cron) | **Removed** (prices via Jupiter quote API) | N/A | No need for an on-chain price oracle. Jupiter provides real-time quotes for SolBalls→USDC conversion at swap time. |
| **Wagmi + Viem + RainbowKit** | **Solana Wallet Adapter** (@solana/wallet-adapter) | Frontend | Standard Solana wallet integration: Phantom, Solflare, Backpack, etc. |
| **ThirdWeb FundingWidget** | **Jupiter Plugin** (swap widget, fully themed) | Frontend | Replaces ThirdWeb FundingWidget. Jupiter Plugin with custom `pokemonTraderTheme`: dark bg (#1a1a1a), green accent (#00ff88), monospace font, modal display mode, output locked to SolBalls. Wallet passthrough from Solana Wallet Adapter. See Appendix D for full theme spec. |
| **dGen1/Glyph Connectors** | **Removed** | N/A | ApeChain-specific hardware wallets. Not applicable to Solana. |
| **UUPS Proxy Pattern** | **Anchor program (immutable by default)** | On-chain | Solana programs can be upgradeable via BPF loader. Use `--program-id` deploy for upgrades during dev. Lock authority for mainnet. |
| **Hardhat + OpenZeppelin** | **Anchor framework** | Dev tooling | Anchor replaces Hardhat for Solana program development. |
| **ERC-20 approvals** | **SPL Token transfers** (no approval needed) | On-chain | Solana's owner-signed model means the program PDA holds tokens directly. No separate approve step. |
| **Revenue Split Worker** | **Backend service: `revenue-processor`** | Off-chain (Cloudflare Worker or similar) | Monitors vault, swaps SolBalls→USDC via Jupiter, splits to treasury/NFT pool/reserves, triggers Gacha purchases. |

---

## 2. Solana Program Design

### Framework: Anchor

All on-chain logic uses the **Anchor framework** (Rust). Anchor provides:
- Account validation via derive macros
- Automatic (de)serialization
- PDA derivation helpers
- CPI wrappers
- IDL generation for frontend TypeScript clients

### Program 1: `pokeball_game`

This is the main game program. It handles spawns, ball sales, throws, catch determination, and NFT awarding.

#### Accounts (PDAs)

| Account | Seeds | Owner | Purpose |
|---|---|---|---|
| `GameConfig` | `["game_config"]` | Program | Global game state: authority, treasury, ball prices, catch rates, max_pokemon, etc. |
| `PokemonSlots` | `["pokemon_slots"]` | Program | Array of 20 `PokemonSlot` structs (active/inactive, position, attempt_count, pokemon_id counter). |
| `PlayerInventory` | `["player_inv", player_pubkey]` | Program | Per-player ball counts: [poke, great, ultra, master]. One PDA per player. |
| `NftVault` | `["nft_vault"]` | Program | Metadata about held NFTs: array of up to 20 mint addresses, count, authority. |
| `NftVaultTokenAccount` | (ATA for each NFT mint, owned by vault PDA) | Program PDA | Actual token accounts holding each NFT. Standard Metaplex token accounts. |
| `VrfRequest` | `["vrf_req", sequence_number]` | Program | Pending VRF request state: request_type (spawn/throw), player, slot, ball_type. Closed after callback. |
| `TreasuryConfig` | `["treasury"]` | Program | Treasury wallet pubkey, NFT pool token account, reserve SOL account, accumulated fees. |

#### Instructions

| Instruction | Signer | Description |
|---|---|---|
| `initialize` | Authority | Create GameConfig, PokemonSlots, TreasuryConfig. Set initial ball prices, catch rates. One-time. |
| `purchase_balls` | Player | Player sends SolBalls to game's token account. Increments PlayerInventory. Emits `BallPurchased` event. |
| `spawn_pokemon` | Authority | Requests ORAO VRF for random position. Creates VrfRequest PDA. Fills PokemonSlot on callback. |
| `force_spawn_pokemon` | Authority | Spawn at specific coordinates (no VRF needed). For admin control. |
| `reposition_pokemon` | Authority | Move existing Pokemon to new coordinates. Resets attempt count. |
| `despawn_pokemon` | Authority | Remove Pokemon from slot. |
| `throw_ball` | Player | Decrements ball from PlayerInventory, requests ORAO VRF for catch determination. Creates VrfRequest. |
| `vrf_callback` | ORAO VRF program | Processes VRF result. For throws: determines catch/miss, awards NFT on catch. For spawns: sets position. |
| `deposit_nft` | Authority (or backend service) | Transfers a Metaplex NFT into the vault PDA. Adds mint to NftVault array. |
| `withdraw_nft` | Authority | Remove NFT from vault (admin recovery). |
| `set_ball_price` | Authority | Update price for a ball tier. |
| `set_catch_rate` | Authority | Update catch rate for a ball tier. |
| `set_max_active_pokemon` | Authority | Update soft cap (1-20). |
| `withdraw_revenue` | Authority | Withdraw SolBalls or USDC from game token accounts to treasury. |

#### Data Structures

```rust
#[account]
pub struct GameConfig {
    pub authority: Pubkey,           // Owner/admin wallet
    pub treasury: Pubkey,            // Treasury wallet for 3% fees
    pub solballs_mint: Pubkey,       // SolBalls SPL token mint
    pub usdc_mint: Pubkey,           // USDC SPL token mint
    pub ball_prices: [u64; 4],       // Prices in SolBalls (atomic units) for [poke, great, ultra, master]
    pub catch_rates: [u8; 4],        // Catch rates 0-100 for [poke, great, ultra, master]
    pub max_active_pokemon: u8,      // Soft cap (default 20)
    pub pokemon_id_counter: u64,     // Auto-incrementing Pokemon ID
    pub total_revenue: u64,          // Total SolBalls received
    pub is_initialized: bool,
    pub bump: u8,
}

#[account]
pub struct PokemonSlots {
    pub slots: [PokemonSlot; 20],
    pub active_count: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct PokemonSlot {
    pub is_active: bool,
    pub pokemon_id: u64,
    pub pos_x: u16,                  // 0-999
    pub pos_y: u16,                  // 0-999
    pub throw_attempts: u8,          // 0-3
    pub spawn_timestamp: i64,
}

#[account]
pub struct PlayerInventory {
    pub player: Pubkey,
    pub balls: [u32; 4],             // [poke, great, ultra, master] counts
    pub total_purchased: u64,        // Lifetime purchase count
    pub total_throws: u64,           // Lifetime throw count
    pub total_catches: u64,          // Lifetime catch count
    pub bump: u8,
}

#[account]
pub struct NftVault {
    pub authority: Pubkey,
    pub mints: Vec<Pubkey>,          // Up to 20 NFT mint addresses held
    pub count: u8,
    pub max_size: u8,                // 20
    pub bump: u8,
}

#[account]
pub struct VrfRequest {
    pub request_type: u8,            // 0 = spawn, 1 = throw
    pub player: Pubkey,              // Player who threw (or authority for spawn)
    pub slot_index: u8,              // Pokemon slot
    pub ball_type: u8,               // Ball tier (for throws)
    pub sequence_number: u64,        // ORAO VRF sequence
    pub is_fulfilled: bool,
    pub bump: u8,
}
```

#### Events

```rust
#[event]
pub struct BallPurchased {
    pub buyer: Pubkey,
    pub ball_type: u8,
    pub quantity: u32,
    pub total_cost: u64,             // SolBalls atomic units
}

#[event]
pub struct ThrowAttempted {
    pub thrower: Pubkey,
    pub pokemon_id: u64,
    pub ball_type: u8,
    pub slot_index: u8,
    pub vrf_sequence: u64,
}

#[event]
pub struct CaughtPokemon {
    pub catcher: Pubkey,
    pub pokemon_id: u64,
    pub slot_index: u8,
    pub nft_mint: Pubkey,            // Metaplex NFT mint awarded (or Pubkey::default() if vault empty)
}

#[event]
pub struct FailedCatch {
    pub thrower: Pubkey,
    pub pokemon_id: u64,
    pub slot_index: u8,
    pub attempts_remaining: u8,
}

#[event]
pub struct PokemonSpawned {
    pub pokemon_id: u64,
    pub slot_index: u8,
    pub pos_x: u16,
    pub pos_y: u16,
}

#[event]
pub struct PokemonRelocated {
    pub pokemon_id: u64,
    pub slot_index: u8,
    pub old_x: u16,
    pub old_y: u16,
    pub new_x: u16,
    pub new_y: u16,
}

#[event]
pub struct PokemonDespawned {
    pub pokemon_id: u64,
    pub slot_index: u8,
}

#[event]
pub struct NftAwarded {
    pub winner: Pubkey,
    pub nft_mint: Pubkey,
    pub vault_remaining: u8,
}

#[event]
pub struct NftDeposited {
    pub nft_mint: Pubkey,
    pub vault_count: u8,
}
```

#### Revenue Handling (On-Chain)

When a player calls `purchase_balls`:

1. Player's SolBalls tokens are transferred to the game's SolBalls token account (PDA-owned).
2. The on-chain program does **NOT** perform the swap or split. It simply holds the SolBalls.
3. The off-chain `revenue-processor` service periodically:
   - Reads the game's SolBalls balance
   - Swaps SolBalls → USDC via Jupiter API
   - Distributes: 3% treasury, 96% NFT pool, 1% SOL reserves
   - Triggers Gacha purchases when NFT pool ≥ $50

This separation keeps the on-chain program simple and avoids Jupiter CPI complexity.

#### Catch Determination (On-Chain via VRF)

1. Player calls `throw_ball(slot_index, ball_type)`.
2. Program validates: player has balls, slot is active, attempts < 3.
3. Program decrements ball count, increments attempt count.
4. Program CPIs into **ORAO VRF** to request randomness (~0.001 SOL).
5. ORAO fulfills randomness (sub-second, same epoch).
6. Program's `vrf_callback` instruction is invoked:
   - `random_number % 100 < catch_rate` → **CAUGHT**
   - If caught AND vault has NFTs: select `random_number / 100 % vault_count` → transfer NFT to player
   - If caught but vault empty: emit event with `nft_mint = Pubkey::default()`
   - If missed: decrement remaining attempts, relocate if attempts = 0

#### NFT Awarding (On-Chain)

When catch succeeds and vault has NFTs:
1. Use VRF randomness to pick index: `(random_number >> 64) % vault.count`
2. Get mint address at that index from `NftVault.mints`
3. Transfer NFT from vault's token account to player's ATA (creating ATA if needed)
4. Swap-and-pop removal from `NftVault.mints` array (O(1))
5. Emit `NftAwarded` event

### Program 2: Not Needed

The original ApeChain design had two contracts (PokeballGame + SlabNFTManager) because EVM contracts have size limits and the NFT management logic was separate. On Solana, a single Anchor program can handle everything via multiple instruction handlers and PDAs. The `NftVault` PDA within `pokeball_game` replaces `SlabNFTManager` entirely.

---

## 3. Gacha Machine Integration Design

### Architecture: Backend Service (Not On-Chain CPI, Not Frontend)

The Collector Crypt Gacha Machine is a **REST API** that constructs Solana transactions server-side. It is NOT a Solana program you CPI into. The integration requires:

1. A **backend service** (`revenue-processor`) that has a wallet keypair
2. The backend calls the Gacha API to generate purchase transactions
3. The backend signs and submits those transactions
4. The backend receives NFTs and deposits them into the on-chain vault

### Gacha API Flow

```
Backend Service (revenue-processor)
    |
    |-- POST /api/generatePack
    |   Body: { playerAddress: BACKEND_WALLET, packType: "pokemon_50" }
    |   Response: { memo: "abc-123", transaction: "base64..." }
    |
    |-- Deserialize + sign transaction (backend wallet pays 50 USDC)
    |
    |-- POST /api/submitTransaction
    |   Body: { signedTransaction: "base64..." }
    |   Response: { signature: "tx_hash" }
    |
    |-- POST /api/openPack
    |   Body: { memo: "abc-123" }
    |   Response: { nft_address: "...", rarity: "Mid", nftWon: {...} }
    |
    |-- NFT is now in backend wallet
    |-- Backend calls on-chain deposit_nft instruction
    |-- NFT transferred to vault PDA
```

### Who Calls the API

**The backend service** — NOT the frontend, NOT an on-chain program.

Reasons:
- The API key must stay secret (server-side only)
- Pack purchases require USDC from the NFT pool (held by the backend/treasury)
- The backend can batch purchases and handle retries
- The Gacha API is REST — you can't call REST from an on-chain program

### NFT Inventory Management

| Operation | How |
|---|---|
| **Purchase NFTs** | Backend calls Gacha API when USDC pool ≥ $50. Loops until pool < $50 or vault has 20 NFTs. |
| **Receive NFTs** | Gacha API sends NFT to backend wallet. Backend deposits into on-chain vault via `deposit_nft` instruction. |
| **Hold inventory** | On-chain `NftVault` PDA holds up to 20 Metaplex NFTs. Each in a PDA-owned token account. |
| **Award to winner** | On-chain `vrf_callback` uses randomness to pick and transfer an NFT from vault to player. |
| **Vault empty** | If catch succeeds but vault is empty, event emits with no NFT. Frontend shows warning. Backend should replenish ASAP. |

### Gacha API Failure Handling

| Scenario | Handling |
|---|---|
| **API down** | Backend retries with exponential backoff. Vault serves from existing inventory. |
| **Transaction fails** | Backend detects via Solana confirmation. Retries generate + submit. |
| **openPack fails** | Memo is still valid. Backend retries openPack. |
| **NFT transfer to vault fails** | Backend retries deposit_nft. NFT stays in backend wallet until deposited. |
| **Rate limiting** | Space purchases 5+ seconds apart. The API doesn't document limits but the backend should be conservative. |

### Gacha API Configuration

| Setting | Devnet | Mainnet |
|---|---|---|
| Base URL | `https://dev-gacha.collectorcrypt.com` | `https://gacha.collectorcrypt.com` |
| USDC Mint | `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` (devnet) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Pack Type | `pokemon_50` ($50 per pack) | `pokemon_50` |
| API Key | Dev key (from Discord) | Production key |

---

## 4. Token & Treasury Flow

### Step-by-Step: Player Buys Balls

```
1. Player opens PokeBallShop in frontend
2. Player selects ball type + quantity
3. Frontend calculates SolBalls cost:
   - Poke Ball: $1.00 equivalent in SolBalls
   - Great Ball: $10.00 equivalent in SolBalls
   - Ultra Ball: $25.00 equivalent in SolBalls
   - Master Ball: $49.90 equivalent in SolBalls
4. Frontend builds purchase_balls transaction
5. Player signs with Phantom/Solflare/etc.
6. Transaction executes on Solana:
   - SPL Token transfer: Player → Game SolBalls Account (PDA-owned)
   - PlayerInventory PDA updated: ball count incremented
   - BallPurchased event emitted
7. SolBalls now sit in the game's token account
```

### Step-by-Step: Revenue Processing (Off-Chain)

```
1. revenue-processor service runs on a schedule (every 5 minutes or on-demand)
2. Reads game's SolBalls token account balance
3. If balance > minimum threshold (e.g., 100 SolBalls):
   a. Withdraws SolBalls from game to backend wallet (authority-signed tx)
   b. Calls Jupiter Metis API:
      - GET /swap/v1/quote?inputMint=SOLBALLS_MINT&outputMint=USDC_MINT&amount=X
      - POST /swap/v1/swap (builds tx)
      - Sign and submit swap tx
   c. Receives USDC in backend wallet
   d. Splits USDC:
      - 3%  → Treasury wallet (SPL transfer)
      - 96% → NFT Pool account (SPL transfer, triggers Gacha check)
      - 1%  → SOL reserve (swap small USDC→SOL for tx fees via Jupiter)
4. If NFT Pool USDC ≥ $50 AND vault NFT count < 20:
   - Calls Gacha API to purchase pack(s)
   - Deposits received NFTs into on-chain vault
```

### Where Does the Swap Happen?

**Off-chain via Jupiter Metis API**, executed by the `revenue-processor` backend service.

Rationale:
- Jupiter CPI from on-chain is possible but adds significant complexity (account limits, ALTs, transaction size)
- The swap doesn't need to be atomic with the purchase — a small delay is fine
- Off-chain gives us retry logic, error handling, and logging
- Jupiter's Metis API handles routing through the best DEX pool automatically

### Account Map

| Account | Type | Holds | Who Controls |
|---|---|---|---|
| **Game SolBalls Account** | SPL Token (ATA of game PDA) | SolBalls received from ball purchases | `pokeball_game` program PDA |
| **Treasury Wallet** | External wallet | 3% of USDC revenue | Project owner |
| **NFT Pool Account** | SPL Token (USDC ATA of backend wallet) | 96% of USDC revenue for Gacha purchases | Backend service wallet |
| **SOL Reserve** | SOL in backend wallet | 1% converted to SOL for tx fees | Backend service wallet |
| **NftVault PDA** | Program PDA | Up to 20 Metaplex NFTs | `pokeball_game` program |
| **Backend Wallet** | Keypair | Intermediary for swaps and Gacha purchases | `revenue-processor` service |
| **Player Wallets** | External wallets | SolBalls, NFTs won, SOL for gas | Players |

### SolBalls Pricing

**SolBalls is a market-traded altcoin** launched via [Bankr bot](https://bankr.bot) on Raydium. It is NOT a stablecoin or fixed-price utility token — its price will fluctuate like any Solana memecoin/altcoin. This has direct implications for ball pricing.

Ball prices must be denominated in SolBalls. Since SolBalls is a volatile altcoin:

**Option A: Fixed SolBalls prices, update frequently**
- Set prices in SolBalls units on-chain (e.g., Poke Ball = 100 SolBalls)
- Backend service or admin updates prices based on SolBalls/USD market rate via `set_ball_price`
- **Update frequency: at least hourly**, potentially more often during high volatility
- Simpler for players — they see a stable SolBalls amount per purchase
- Risk: stale prices mean players overpay or underpay in USD terms

**Option B (Recommended): Dynamic pricing via Jupiter quote at purchase time**
- Frontend queries Jupiter for the current SolBalls/USD rate before building the transaction
- Calculates exact SolBalls amount for $1/$10/$25/$49.90 targets in real-time
- On-chain program stores ball prices in **USD cents** (e.g., 100 = $1.00) and the frontend converts to SolBalls
- More accurate, no stale pricing risk, no admin cron job needed
- Slightly more complex frontend logic but eliminates the price-update operational burden

**Recommendation:** Option B (dynamic pricing). Given that SolBalls is a volatile altcoin, stale fixed prices would frequently be wrong. The frontend should query Jupiter for a live SolBalls/USD quote, calculate the exact SolBalls cost, and display it to the player before they confirm. The on-chain program validates that the SolBalls received is ≥ the minimum acceptable amount (with a configurable slippage tolerance).

**Revenue processor impact:** The `revenue-processor` backend must handle slippage when swapping SolBalls→USDC. Use Jupiter's `slippageBps` parameter (recommend 100-300 bps / 1-3% given altcoin volatility) and implement retry logic for failed swaps during high-volatility periods.

---

## 5. Randomness Strategy

### Catch Determination: ORAO VRF v2

**Why ORAO VRF:**
- Available on Solana (unlike Pyth Entropy which is EVM-only)
- CPI integration from Anchor programs
- 0.001 SOL per request (very cheap)
- Sub-second fulfillment
- Verifiable on-chain proofs
- Well-documented Anchor SDK

**Program Address:** `VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y`

**Integration:**
```rust
// In Cargo.toml
[dependencies]
orao-solana-vrf = { version = "0.5", features = ["cpi"] }

// In throw_ball instruction
let vrf_request = orao_solana_vrf::cpi::request_v2(
    ctx.accounts.vrf_accounts(),
    seed, // unique per request
)?;
// Store sequence number in VrfRequest PDA

// In vrf_callback instruction (called by ORAO)
let randomness = ctx.accounts.vrf_randomness.randomness;
let catch_roll = randomness[0] as u8 % 100;
let caught = catch_roll < catch_rate;
```

### NFT Selection: Same VRF Result

When a catch succeeds, we reuse the same VRF random bytes for NFT selection:

```rust
// Use different bytes from the same 32-byte randomness
let catch_roll = randomness[0..8];   // First 8 bytes for catch determination
let nft_index = randomness[8..16];   // Next 8 bytes for NFT selection
let nft_pick = u64::from_le_bytes(nft_index) % vault.count as u64;
```

This provides two independent random values from one VRF request, saving cost and latency.

### Spawn Positioning: ORAO VRF

For `spawn_pokemon`, the same ORAO VRF is used to determine random X/Y coordinates:

```rust
let pos_x = (u16::from_le_bytes([randomness[0], randomness[1]]) % 1000) as u16;
let pos_y = (u16::from_le_bytes([randomness[2], randomness[3]]) % 1000) as u16;
```

### Summary

| Use Case | Source | Cost |
|---|---|---|
| Catch determination | ORAO VRF v2 (CPI) | 0.001 SOL |
| NFT selection | Same ORAO VRF result (different bytes) | Free (same request) |
| Spawn positioning | ORAO VRF v2 (CPI) | 0.001 SOL |
| Gacha pack rarity | Collector Crypt's built-in VRF | Included in pack price |

---

## 6. Gasless / Fee Strategy

### Recommendation: Users Pay Directly (No Gasless)

**Solana transaction fees are ~0.000005 SOL (~$0.001).** This is negligible compared to the ball prices ($1-$50). Gasless meta-transactions add significant complexity for virtually no user benefit on Solana.

| Metric | ApeChain | Solana |
|---|---|---|
| Tx fee | ~0.003 APE (~$0.002) | ~0.000005 SOL (~$0.001) |
| Justification for gasless | Moderate fees + UX goal | Fees are negligible |
| Implementation complexity | High (EIP-712, relayer, nonce tracking) | High (fee payer, serialization) |

**Decision: Remove the gasless relayer entirely.**

Players connect their Solana wallet (Phantom etc.), sign transactions directly, and pay ~$0.001 per action. This simplifies:
- No relayer service to maintain
- No meta-transaction signature verification
- No nonce tracking
- Simpler frontend code
- Fewer points of failure

### Cost Estimates Per Action

| Action | Tx Fee (SOL) | Additional Cost | Total |
|---|---|---|---|
| `purchase_balls` | ~0.000005 | SolBalls for balls | SolBalls + negligible SOL |
| `throw_ball` | ~0.000005 | 0.001 SOL (ORAO VRF fee) | ~0.001 SOL |
| Creating PlayerInventory PDA (first time) | ~0.002 (rent) | One-time | ~0.002 SOL |

**Player needs:** A small amount of SOL for gas (~0.01 SOL covers hundreds of transactions) plus SolBalls for ball purchases.

### SOL for Gas

Players need SOL for transaction fees. Options:
1. **Jupiter widget** in-app: Players swap SolBalls→SOL if needed
2. **Phantom's built-in swap**: Most Solana wallets have token swaps
3. **Assume players have SOL**: The onboarding flow should ensure players have SOL before playing

---

## 7. Data Flow Diagrams

### A. Buying Balls

```
Player (Frontend)                    Solana Blockchain              Backend Service
      |                                    |                             |
      |-- 1. Select balls, click Buy ----> |                             |
      |                                    |                             |
      |-- 2. Sign tx (Phantom) ---------> |                             |
      |                                    |                             |
      |                              3. purchase_balls ix:               |
      |                              - Transfer SolBalls                 |
      |                                Player → Game PDA ATA             |
      |                              - Update PlayerInventory PDA        |
      |                              - Emit BallPurchased event          |
      |                                    |                             |
      |<- 4. Tx confirmed, UI updates --- |                             |
      |                                    |                             |
      |                                    |   5. (Every 5 min)          |
      |                                    |   revenue-processor reads   |
      |                                    |   game SolBalls balance     |
      |                                    |<---------                   |
      |                                    |                             |
      |                                    |   6. Withdraw SolBalls      |
      |                                    |   from game to backend      |
      |                                    |<---------- authority tx     |
      |                                    |                             |
      |                                    |   7. Jupiter swap:          |
      |                                    |   SolBalls → USDC           |
      |                                    |<---------- swap tx          |
      |                                    |                             |
      |                                    |   8. Split USDC:            |
      |                                    |   3% → Treasury             |
      |                                    |   96% → NFT Pool            |
      |                                    |   1% → SOL reserve          |
      |                                    |<---------- transfer txs     |
```

### B. Throwing a Ball and Catching

```
Player (Frontend)                    Solana Blockchain              ORAO VRF
      |                                    |                          |
      |-- 1. Click Pokemon, select ball -->|                          |
      |                                    |                          |
      |-- 2. Sign tx (throw_ball) -------> |                          |
      |                                    |                          |
      |                              3. throw_ball ix:                |
      |                              - Validate: has ball, slot       |
      |                                active, attempts < 3           |
      |                              - Decrement ball count           |
      |                              - Increment attempt count        |
      |                              - CPI → ORAO VRF request ------>|
      |                              - Create VrfRequest PDA          |
      |                              - Emit ThrowAttempted event      |
      |                                    |                          |
      |<- 4. Tx confirmed, show anim ---- |                          |
      |                                    |                          |
      |                                    |    5. ORAO fulfills      |
      |                                    |    (sub-second)          |
      |                                    |<----------               |
      |                              6. vrf_callback ix:              |
      |                              - Read randomness                |
      |                              - catch_roll % 100 vs rate       |
      |                                    |                          |
      |                              [IF CAUGHT]:                     |
      |                              - Pick random NFT from vault     |
      |                              - Transfer NFT to player ATA     |
      |                              - Swap-and-pop vault array       |
      |                              - Relocate: new VRF for spawn    |
      |                              - Emit CaughtPokemon event       |
      |                                    |                          |
      |                              [IF MISSED]:                     |
      |                              - If attempts = 3: relocate      |
      |                              - Emit FailedCatch event         |
      |                                    |                          |
      |<- 7. Event detected, show result - |                          |
```

### C. NFT Pool Auto-Replenishment

```
Backend Service                      Solana Blockchain              Gacha API
      |                                    |                          |
      | 1. Check NFT Pool USDC balance     |                          |
      |-------- read account ------------> |                          |
      |                                    |                          |
      | 2. If USDC ≥ $50 AND vault < 20:   |                          |
      |                                    |                          |
      | 3. POST /api/generatePack -------->|                          |---->
      |    { playerAddress: BACKEND,       |                          |
      |      packType: "pokemon_50" }      |                          |
      |<--- { memo, transaction } ---------|--------------------------|
      |                                    |                          |
      | 4. Sign transaction                |                          |
      |                                    |                          |
      | 5. POST /api/submitTransaction --->|                          |---->
      |    { signedTransaction: base64 }   |                          |
      |<--- { signature } ----------------|--------------------------|
      |                                    |                          |
      |    (USDC transferred on-chain:     |                          |
      |     Backend → Gacha wallet)        |                          |
      |                                    |                          |
      | 6. POST /api/openPack ----------->|                          |---->
      |    { memo: "abc-123" }            |                          |
      |<--- { nft_address, rarity, ... } -|--------------------------|
      |                                    |                          |
      |    (NFT transferred on-chain:      |                          |
      |     Gacha → Backend wallet)        |                          |
      |                                    |                          |
      | 7. Call deposit_nft on-chain       |                          |
      |-------- authority tx ------------> |                          |
      |                              8. deposit_nft ix:               |
      |                              - Transfer NFT from backend      |
      |                                to vault PDA token account     |
      |                              - Add mint to NftVault.mints     |
      |                              - Emit NftDeposited event        |
      |                                    |                          |
      | 9. Loop back to step 2             |                          |
      |    until USDC < $50 or vault = 20  |                          |
```

---

## 8. What Stays, What Goes, What's New

### STAYS (Unchanged)

| Category | Items |
|---|---|
| **Phaser Game Engine** | All of `src/game/` — GameScene, entities (Player, Pokemon, NPC, GrassRustle, etc.), managers (MapManager, NPCManager, PokemonSpawnManager, CatchMechanicsManager, BallInventoryManager, TouchInputManager, TradeIconManager), utils (chiptuneSFX, mp3Music), config (gameConfig) |
| **React Components (UI-only)** | BikeRentalModal, HelpModal, VolumeToggle, SfxVolumeToggle, InventoryTerminal, TradeModal (if OTC stays), DialogBubble |
| **React Components (need Web3 adapter)** | GameCanvas (keep structure, replace Web3 hooks), PokeBallShop (replace payment hooks), CatchAttemptModal (replace throw hooks), CatchResultModal, CatchWinModal (replace NFT metadata hooks), TransactionHistory (replace event hooks), GameHUD, PokemonCard |
| **Game Assets** | All sprites, tilesets, audio files (MP3, chiptune), CSS styles, pixel art |
| **Build System** | Vite, TypeScript, ESLint configs |
| **Styling** | All CSS including touchscreen.css, index.css |

### GOES (Remove)

| Category | Items | Reason |
|---|---|---|
| **Solidity Contracts** | All of `contracts/` (19 .sol files, ABIs, deployment scripts) | Replaced by Anchor program |
| **Hardhat** | `hardhat.config.cjs`, `hardhat-tasks/`, `artifacts/`, `cache/`, `.openzeppelin/` | Replaced by Anchor CLI |
| **EVM Web3 Stack** | wagmi, viem, @rainbow-me/rainbowkit, ethers | Replaced by @solana/web3.js + wallet-adapter |
| **EVM Hooks** | All of `src/hooks/pokeballGame/` (15 files), useActiveWeb3React, useApprove, useTokenBalance, useTokenBalances | Replaced by Solana hooks |
| **EVM Services** | apechainConfig.ts, contractService.ts, pokeballGameConfig.ts, slabNFTManagerConfig.ts, config.ts | Replaced by Solana service layer |
| **EVM Connectors** | All of `src/connectors/` (dGen1, Glyph, customWallets) | ApeChain-specific |
| **EVM ABIs** | All of `contracts/abi/`, `src/config/abis/`, root `abi.json`, `abi_SlabMachine.json` | Not needed on Solana |
| **Cloudflare Workers** | `relayer/` (gasless), `nft-recovery-worker/` | Gasless removed, NFT recovery not needed |
| **EVM Scripts** | All of `scripts/` (spawn, reposition, price update, debug scripts) | Replaced by Anchor CLI scripts |
| **EVM Utilities** | walletDetection.ts, alchemy.ts | ApeChain-specific |
| **OTC/Legacy** | useAllListings, useManageListing, useBridgeListing, useLMBuyPositions, useMysteryBox, useAllNftPositions, useNFTBalances, knownListings.ts | ApeChain marketplace features |
| **ThirdWeb SDK (fully removed)** | thirdwebConfig.ts, @thirdweb-dev/react, thirdweb SDK v5, FundingWidget, PayEmbed, pokemonTraderTheme | Replaced entirely by Jupiter Plugin with equivalent pixel-art theming. ThirdWeb SDK fully removed from dependencies. |

### NEW (Build From Scratch)

| Category | Items | Description |
|---|---|---|
| **Anchor Program** | `programs/pokeball_game/` | Single Solana program with all game logic + NFT vault |
| **Anchor Tests** | `tests/pokeball_game.ts` | TypeScript tests using Anchor's test framework |
| **Solana Service Layer** | `src/services/solanaConfig.ts` | Wallet adapter config, RPC endpoints, program IDs |
| **Solana Service Layer** | `src/services/programClient.ts` | Anchor client for calling program instructions |
| **Solana Hooks** | `src/hooks/solana/usePurchaseBalls.ts` | Purchase balls via Anchor instruction |
| **Solana Hooks** | `src/hooks/solana/useThrowBall.ts` | Throw ball via Anchor instruction |
| **Solana Hooks** | `src/hooks/solana/usePlayerInventory.ts` | Read PlayerInventory PDA |
| **Solana Hooks** | `src/hooks/solana/usePokemonSpawns.ts` | Read PokemonSlots PDA |
| **Solana Hooks** | `src/hooks/solana/useNftVault.ts` | Read NftVault PDA |
| **Solana Hooks** | `src/hooks/solana/useContractEvents.ts` | Subscribe to program events via WebSocket |
| **Solana Hooks** | `src/hooks/solana/useTokenBalances.ts` | Read SOL + SolBalls + USDC balances |
| **Solana Hooks** | `src/hooks/solana/useTransactionHistory.ts` | Query program events for player history |
| **Wallet Component** | `src/components/WalletConnector.tsx` (rewrite) | Solana Wallet Adapter UI (Phantom, Solflare, etc.) |
| **Swap Widget** | `src/components/SwapWidget.tsx` | Jupiter Plugin with custom `pokemonTraderTheme` — dark bg (#1a1a1a), module bg (#2a2a2a), green accent (#00ff88), monospace font, modal display mode, output locked to `SOLBALLS_MINT` via `fixedOutputMint`. Wallet passthrough from Solana Wallet Adapter. See Appendix D. |
| **Backend Service** | `revenue-processor/` | Cloudflare Worker or standalone service: SolBalls→USDC swap, revenue split, Gacha purchases, NFT deposits |
| **Anchor Config** | `Anchor.toml`, `Cargo.toml` | Anchor workspace configuration |
| **CLI Scripts** | `scripts/` (new) | Anchor-based: initialize, spawn, deposit NFTs, admin commands |
| **Environment Config** | `.env.example` (rewrite) | Solana RPC URLs, program IDs, mint addresses, API keys |
| **NFT Metadata Hook** | `src/hooks/solana/useNFTMetadata.ts` | Fetch Metaplex NFT metadata (replaces IPFS/ERC-721 version) |

---

## 9. Open Questions & Risks

### Open Questions (Need Owner Decision)

| # | Question | Options | Recommendation |
|---|---|---|---|
| **Q1** | SolBalls token decimals? | Determined by Bankr bot launch defaults | **Resolved**: Bankr bot uses standard Solana token defaults (typically 6 or 9 decimals). Confirm actual value from the deployed mint account after Bankr launch. For devnet testing, create test mint matching the same decimals. |
| **Q2** | Where to host `revenue-processor`? | Cloudflare Workers, Vercel Serverless, AWS Lambda, VPS | **Cloudflare Workers** (already used for relayer, familiar tooling) |
| **Q3** | Revenue processor trigger? | Cron schedule vs webhook vs on-chain event | **Cron every 5 minutes** + manual trigger endpoint. Simple and reliable. |
| **Q4** | Ball prices in SolBalls or USD? | Fixed SolBalls vs dynamic USD-equivalent | **Fixed SolBalls amounts**, updated weekly by admin. Simpler UX. |
| **Q5** | ~~Keep ThirdWeb for swap widget?~~ | ~~ThirdWeb vs Jupiter Plugin~~ | **DECIDED: Jupiter Plugin.** Fully themed to match game's pixel-art dark theme. ThirdWeb SDK removed entirely. See Appendix D for theme spec. |
| **Q6** | Anchor program upgradeable? | Upgradeable (dev) → Immutable (mainnet) vs always immutable | **Upgradeable on devnet**, freeze upgrade authority before mainnet launch |
| **Q7** | What about the OTC marketplace features? | Keep (adapt to Solana) vs Remove | **Remove** — not core to the Pokeball game. Can add later. |
| **Q8** | What about BikeRental/TradeOutpost game features? | Keep vs Remove | **Keep** — they're purely frontend/Phaser, no Web3 dependency |
| **Q9** | VRF callback model on Solana? | Separate tx (ORAO calls back) vs same-tx (Switchboard SRS) | **ORAO VRF** with separate callback tx. Well-documented, cheaper, proven. |
| **Q10** | Devnet SolBalls token — how to test? | Create test SPL token + airdrop | Create a devnet SolBalls mint with the same decimals as planned mainnet. Airdrop to testers. |

### Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R1** | ~~**SolBalls liquidity on Jupiter**~~ | ~~HIGH~~ **RESOLVED** | SolBalls launches via Bankr bot on Raydium, which creates a bonding-curve liquidity pool automatically. Jupiter auto-routes through Raydium pools. Liquidity exists from day one. For devnet, still need a test pool or mock swap. |
| **R2** | **Gacha API rate limits unknown** — No documented rate limits. Rapid pack purchases could be throttled. | **MEDIUM** | Space purchases 5+ seconds apart. Contact Collector Crypt for rate limit info. Implement exponential backoff. |
| **R3** | **ORAO VRF devnet availability** — Need to verify ORAO VRF works on Solana devnet with test SOL. | **MEDIUM** | Test early. ORAO has devnet support documented. Fallback: use a mock randomness source for devnet testing. |
| **R4** | **Transaction size limits** — Solana's 1232-byte tx limit could be tight for complex instructions (throw_ball + VRF CPI + NFT transfer). | **MEDIUM** | The VRF callback is a separate transaction from the throw. NFT transfer happens in the callback. This keeps each tx simple. |
| **R5** | **Gacha API delivers NFTs to a wallet, not a PDA** — The Gacha API sends NFTs to a regular wallet address, not a program PDA. | **LOW** | The backend wallet receives NFTs, then deposits them into the on-chain vault PDA via a separate transaction. Two-step but reliable. |
| **R6** | **Revenue processor downtime** — If the backend service goes down, SolBalls accumulate in the game account but don't get swapped/split. | **LOW** | SolBalls are safe in the PDA. When service recovers, it processes the backlog. Add health check alerts. |
| **R7** | **Devnet USDC for Gacha testing** — Need devnet USDC to test Gacha pack purchases. | **LOW** | Use `spl-token-faucet.com` for devnet USDC (documented in Gacha starter). |
| **R8** | **NFT metadata format change** — Gacha NFTs are Metaplex standard. Need to verify metadata schema matches our PokemonCard component expectations. | **LOW** | Fetch a sample NFT from the devnet Gacha API and verify metadata fields (name, image, attributes). Adapt PokemonCard component if needed. |
| **R9** | **Player needs SOL for gas** — Unlike ApeChain where gasless was possible, players need SOL on Solana. | **LOW** | Fees are ~$0.001, negligible. Show "you need SOL" prompt if balance < 0.01 SOL. Jupiter widget can swap SolBalls→SOL. |
| **R10** | **Program account rent** — Solana accounts require rent-exempt deposits (~0.002 SOL for PlayerInventory PDA). First-time players pay this. | **LOW** | Include rent in the first `purchase_balls` transaction. ~$0.004 one-time cost. Can also have the program fund it from reserves. |
| **R11** | **SolBalls price volatility** — SolBalls is a Bankr-launched altcoin with memecoin-level volatility. Ball prices in SolBalls will swing significantly. Revenue-processor swaps may experience high slippage. Players may try to time purchases around price dips. | **MEDIUM** | Use dynamic pricing (Option B in Section 4) so ball costs always reflect current market rate. Revenue-processor should use 1-3% slippage tolerance on Jupiter swaps, implement retry logic for failed swaps during volatility spikes, and process revenue in small batches to reduce price impact. Monitor SolBalls/USDC pool depth — if liquidity thins, increase slippage tolerance or pause revenue processing. |

### Devnet Testing Plan

1. **Create devnet SolBalls mint** — SPL token matching Bankr's mainnet decimals (check deployed mint), mint to test wallets
2. **Deploy Anchor program** to devnet with upgrade authority
3. **Initialize game** — set ball prices, spawn Pokemon
4. **Test purchase flow** — buy balls with SolBalls
5. **Test throw flow** — verify ORAO VRF integration
6. **Test Gacha integration** — use devnet Gacha API, purchase packs, receive NFTs
7. **Test vault operations** — deposit NFTs, verify random award on catch
8. **Test revenue processor** — mock Jupiter swap (or use devnet pool), verify split
9. **Frontend integration** — wallet adapter, new hooks, existing Phaser game
10. **End-to-end test** — full player flow from wallet connect to catching and winning NFT

---

## Appendix A: Technology Choices Summary

| Decision | Choice | Alternatives Considered | Why |
|---|---|---|---|
| On-chain framework | **Anchor** | Native Rust, Seahorse | Industry standard, best tooling, IDL generation |
| Randomness | **ORAO VRF v2** | Switchboard VRF, Switchboard SRS, client-side | Cheapest (0.001 SOL), CPI-ready, proven |
| Token swap | **Jupiter Metis API** (off-chain) | Jupiter CPI, Raydium SDK, manual AMM | Simplest integration, best routing, handles complex paths |
| Wallet adapter | **@solana/wallet-adapter** | Privy, Dynamic, Web3Auth | Standard for Solana, supports Phantom/Solflare/Backpack natively |
| Swap widget | **Jupiter Plugin** (fully themed) | ThirdWeb, custom UI | Native Solana, drop-in React, best routes, full theme customization. See Appendix D. |
| SolBalls token | **Bankr-launched altcoin** on Raydium | Custom mint, Meteora pool | Bankr handles token creation, bonding curve, and Raydium pool. Jupiter auto-routes. |
| Backend hosting | **Cloudflare Workers** | Vercel, AWS Lambda | Already familiar from ApeChain relayer/recovery worker |
| NFT standard | **Metaplex** (standard NFTs) | Compressed NFTs, Token-2022 | Gacha Machine uses standard Metaplex |
| Gasless | **Removed** | Octane, fee payer pattern | Solana fees too cheap to justify complexity |

## Appendix B: Environment Variables (New)

```env
# Solana Network
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_SOLANA_WS_URL=wss://api.devnet.solana.com
VITE_SOLANA_NETWORK=devnet

# Program IDs
VITE_POKEBALL_GAME_PROGRAM_ID=<deployed_program_id>

# Token Mints
VITE_SOLBALLS_MINT=SOLBALLS_MINT
VITE_USDC_MINT=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr  # devnet USDC

# Wallet Addresses
VITE_TREASURY_WALLET=<treasury_pubkey>
VITE_AUTHORITY_WALLET=<authority_pubkey>

# Jupiter
VITE_JUPITER_API_KEY=<optional_for_pro_tier>

# Gacha (backend only — NOT exposed to frontend)
GACHA_API_KEY=<collector_crypt_api_key>
GACHA_API_URL=https://dev-gacha.collectorcrypt.com
BACKEND_WALLET_PRIVATE_KEY=<backend_keypair_base58>

# ThirdWeb (if keeping for fiat onramp)
VITE_THIRDWEB_CLIENT_ID=<optional>
```

## Appendix C: Migration Order (Recommended)

The migration should proceed in this order to minimize risk and allow incremental testing:

1. **Phase 1: Anchor Program** — Write and test the Solana program on devnet (ball purchases, throws, VRF, vault)
2. **Phase 2: Backend Service** — Build revenue-processor (Jupiter swap, revenue split, Gacha integration)
3. **Phase 3: Frontend Web3 Layer** — Replace Wagmi/RainbowKit with Solana wallet adapter, new hooks
4. **Phase 4: Frontend Integration** — Wire new hooks into existing components (PokeBallShop, CatchAttemptModal, etc.)
5. **Phase 5: Cleanup** — Remove all ApeChain/EVM code, contracts, ABIs, scripts
6. **Phase 6: Testing** — End-to-end on devnet, including Gacha API integration
7. **Phase 7: Mainnet Prep** — SolBalls pool already exists from Bankr launch. Switch to mainnet endpoints, verify Jupiter routing for SolBalls→USDC, freeze program upgrade authority.

Each phase can be tested independently before moving to the next.

---

## Appendix D: Jupiter Plugin Theme Spec

The Jupiter swap widget and Solana Wallet Adapter modal must match the game's pixel-art dark theme. The ApeChain version used ThirdWeb's `pokemonTraderTheme` — the Solana version replicates this via Jupiter Plugin's theming API.

### Theme Mapping: ApeChain ThirdWeb → Solana Jupiter Plugin

| ApeChain ThirdWeb Property | Value | Jupiter Plugin Equivalent |
|---|---|---|
| `colors.modalBg` | `#1a1a1a` | `theme.palette.background: '#1a1a1a'` |
| `colors.secondaryBg` / module color | `#2a2a2a` | `theme.palette.module: '#2a2a2a'` |
| `colors.accentButtonBg` / primary | `#00ff88` (green) | `theme.palette.primary: '#00ff88'` |
| `colors.accentButtonText` | `#000000` | Inherited from primary contrast |
| `colors.primaryText` | `#ffffff` | `theme.palette.text.primary: '#ffffff'` |
| `colors.secondaryText` | `#888888` | `theme.palette.text.secondary: '#888888'` |
| `colors.danger` | `#ff4444` | `theme.palette.warning: '#ff4444'` |
| `colors.success` | `#00ff88` | Same as primary |
| `colors.borderColor` | `#444444` | `containerStyles.borderColor: '#444444'` |
| `fontFamily` | `'Courier New', monospace` | `containerStyles.fontFamily: "'Courier New', Courier, monospace"` |
| Modal display | Modal overlay | `displayMode: 'modal'` |
| Locked destination token | APE or USDC.e | `formProps.fixedOutputMint: true`, `formProps.initialOutputMint: SOLBALLS_MINT` |
| Wallet reuse | `viemAdapter.walletClient.fromViem()` | `enableWalletPassthrough: true` + `useWallet()` from Solana Wallet Adapter |

### Jupiter Plugin Configuration

```typescript
import { JupiterPlugin } from '@jup-ag/plugin';

// Pokemon Trader theme for Jupiter Plugin
const pokemonTraderJupiterConfig = {
  displayMode: 'modal' as const,

  formProps: {
    fixedOutputMint: true,
    initialOutputMint: SOLBALLS_MINT,  // Lock destination to SolBalls
    swapMode: 'ExactIn' as const,
  },

  // Theme customization
  theme: {
    palette: {
      primary: '#00ff88',           // Green accent (game signature)
      background: '#1a1a1a',        // Dark background
      text: {
        primary: '#ffffff',         // White text
        secondary: '#888888',       // Muted text
      },
      warning: '#ff4444',           // Red danger/error
      module: '#2a2a2a',            // Card/module backgrounds
    },
  },

  // CSS overrides for pixel-art styling
  containerStyles: {
    fontFamily: "'Courier New', Courier, monospace",
    imageRendering: 'pixelated' as const,
    borderColor: '#444444',
    borderRadius: '4px',            // Sharp corners (pixel art)
  },

  containerClassName: 'pokemon-trader-swap',

  // Reuse existing wallet connection
  enableWalletPassthrough: true,
};
```

### Additional CSS Overrides

```css
/* src/styles/jupiterOverrides.css */

/* Jupiter Plugin container overrides */
.pokemon-trader-swap {
  font-family: 'Courier New', Courier, monospace !important;
  image-rendering: pixelated;
}

.pokemon-trader-swap * {
  font-family: 'Courier New', Courier, monospace !important;
}

/* Jupiter button styling to match game buttons */
.pokemon-trader-swap button[class*="swap"] {
  background-color: #00ff88 !important;
  color: #000000 !important;
  border: 2px solid #00cc66 !important;
  font-weight: bold !important;
  text-transform: uppercase !important;
}

.pokemon-trader-swap button[class*="swap"]:hover {
  background-color: #33ffaa !important;
}
```

### Solana Wallet Adapter Theming

The `@solana/wallet-adapter-react-ui` provides a `WalletModalProvider` with a built-in wallet selection modal. It supports CSS overrides:

```css
/* src/styles/walletAdapterOverrides.css */

/* Wallet modal overlay */
.wallet-adapter-modal-overlay {
  background-color: rgba(0, 0, 0, 0.8) !important;
}

/* Wallet modal container */
.wallet-adapter-modal-wrapper {
  background-color: #1a1a1a !important;
  border: 2px solid #444444 !important;
  border-radius: 4px !important;
  font-family: 'Courier New', Courier, monospace !important;
}

/* Modal title */
.wallet-adapter-modal-title {
  color: #ffffff !important;
  font-family: 'Courier New', Courier, monospace !important;
  font-weight: bold !important;
}

/* Wallet list items */
.wallet-adapter-modal-list li {
  background-color: #2a2a2a !important;
  border: 1px solid #444444 !important;
  border-radius: 4px !important;
  margin-bottom: 4px !important;
}

.wallet-adapter-modal-list li:hover {
  background-color: #333333 !important;
  border-color: #00ff88 !important;
}

/* Wallet name text */
.wallet-adapter-modal-list .wallet-adapter-button {
  color: #ffffff !important;
  font-family: 'Courier New', Courier, monospace !important;
}

/* Connect button (in header) */
.wallet-adapter-button {
  background-color: rgba(0, 0, 0, 0.85) !important;
  border: 2px solid #ffcc00 !important;
  color: #ffffff !important;
  font-family: 'Courier New', Courier, monospace !important;
  font-size: 12px !important;
  font-weight: bold !important;
  image-rendering: pixelated !important;
}

.wallet-adapter-button:hover {
  background-color: rgba(30, 30, 30, 0.9) !important;
  border-color: #ffdd44 !important;
}

/* Connected state — show balance + address */
.wallet-adapter-button-trigger {
  background-color: rgba(0, 0, 0, 0.85) !important;
  border: 2px solid #ffcc00 !important;
}
```

**Note:** The wallet connect button uses yellow border (#ffcc00) to match the existing ApeChain `WalletConnector.tsx` styling. The Jupiter swap widget uses green accent (#00ff88) to match the action/CTA color scheme. This intentional contrast distinguishes "wallet management" (yellow) from "game actions" (green).
