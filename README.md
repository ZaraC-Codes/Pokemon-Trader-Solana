# Pokemon Trader – Slab Cash Gachapon Challenge Entry

Pokemon Trader is a 2D pixel-art, Pokemon-style game on **ApeChain** where players buy Poke Balls with APE or USDC.e, explore the map, and attempt to catch Pokemon for a chance to win real **Pokemon card NFTs** from the Slab collection. The game features gasless throws, provably fair randomness via Pyth Entropy, and a self-sustaining NFT pool that auto-purchases new cards as players spend.

---

## What's New (v1.9.0 / v2.4.0)

- **Gasless Throws (v1.8.0+)** – Players sign a message; a relayer pays gas. No wallet popups for throws.
- **Spawn Management (v1.9.0)** – Owner can reposition or despawn Pokemon without disrupting gameplay.
- **Auto-Purchase Loop (v2.4.0)** – SlabNFTManager now loops purchases until 20 NFTs OR funds depleted.
- **Transaction History** – View your ball purchases, throws, catches, and spending stats.
- **Operator Dashboard** – Owner diagnostics panel showing APE reserves, pool status, CLI commands.
- **Admin Dev Tools** – Dev-mode panel for NFT recovery, contract state inspection.
- **Bike Rental** – 2x movement speed boost for faster exploration.
- **dGen1/EthereumPhone Support** – Touch-optimized UI for square screens (experimental).
- **Glyph Wallet Support** – Fast onboarding and multi-chain swaps for ApeChain.

---

## Features

- **Pixel Art Pokemon Game** – Explore a 2D world, find wild Pokemon, and throw balls to catch them
- **Win Real NFTs** – Successful catches award Pokemon card NFTs from the Slab collection
- **Gasless Throws** – Sign a message to throw; the platform pays Entropy fees from reserves
- **Multi-Wallet Support** – Connect via RainbowKit with 50+ options including MetaMask, Rainbow, and WalletConnect
- **Glyph Wallet** – ApeChain-optimized wallet with fast onboarding and built-in swaps
- **dGen1/EthereumPhone** – Experimental support for ethOS devices with ERC-4337 (square touchscreen UI). Requires the ethOS system wallet browser and may not support all transaction types yet (see `docs/WALLET_INTEGRATION.md`)
- **Cross-Chain Funding** – Buy APE or USDC.e from any chain via ThirdWeb Universal Bridge
- **Provably Fair** – Pyth Entropy provides verifiable randomness for catches and NFT selection
- **Bike Rental** – 2x movement speed boost for faster exploration
- **Transaction History** – Track your purchases, throws, catches, and spending

---

## Challenge Context

This project is a custom implementation of the **Pokemon Trader** challenge app created by @simplefarmer69. The original challenge brief and baseline app are documented in `README_CHALLENGE.md`.

I implemented the Pokeball catch game mechanics, UI/UX polish, and on-chain integrations as my submission to this challenge, and this repo represents my contribution on top of the original work.

### Challenge Result

This implementation was selected as the **winner** of the Pixelverse / Slab.cash Pokeball game challenge.

---

## How to Run

### Prerequisites

- Node.js 18+
- npm or yarn
- A Web3 wallet connected to **ApeChain Mainnet (Chain ID 33139)**:
  - Desktop: MetaMask, Rainbow, WalletConnect, Coinbase, Ledger, and 50+ more via RainbowKit
  - Mobile: **Glyph Wallet** (recommended), or any WalletConnect-compatible wallet. On mobile, open the game URL in the wallet's built-in browser (e.g., Glyph's in-app browser); regular mobile browsers won't be connected to your wallet.
  - Experimental: **dGen1/EthereumPhone** (ethOS, square touchscreen)

### Environment Setup

1. Copy the example file:

```bash
cp .env.example .env
```

On Windows PowerShell:
```powershell
copy .env.example .env
```

2. Open `.env` and configure:

```bash
# Required for Pokemon spawns
VITE_POKEBALL_GAME_ADDRESS=0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f

# Gasless throws (production)
VITE_RELAYER_API_URL=https://pokeball-relayer.pokeballgame.workers.dev

# ThirdWeb (for crypto checkout widget)
VITE_THIRDWEB_CLIENT_ID=your_client_id

# Wallet Integration (optional)
VITE_BUNDLER_RPC_URL=https://your-bundler-endpoint  # For dGen1 ERC-4337
VITE_GLYPH_API_KEY=<api-key>                        # For Glyph Wallet (if required)

# Touch Controls (optional)
VITE_TOUCH_CONTROL_MODE=tap                         # tap, dpad, or auto
```

### Setup

```bash
git clone <your-fork-url>
cd Pokemon-Trader
npm install
```

### Wallet Configuration

The app supports multiple wallet options out of the box:

1. **Glyph Wallet** (ApeChain-optimized, recommended for mobile)
   - Appears at the top of the wallet picker
   - Fast onboarding (<75 seconds)
   - Seamless multi-chain swaps built-in

2. **Desktop Wallets** (MetaMask, Rainbow, WalletConnect, etc.)
   - Click "Connect Wallet" and select from the RainbowKit modal

3. **dGen1/EthereumPhone** (experimental)
   - For ethOS Android devices with square touchscreens
   - Requires the ethOS system wallet browser; other browsers on the device are not supported
   - Appears at the top of the wallet picker on compatible devices
   - Supports ERC-4337 Account Abstraction
   - Some transaction types may have known issues (see `docs/WALLET_INTEGRATION.md`)
   - **Note:** MetaMask and Glyph are the primary tested wallets; dGen1 in-browser transactions may not work reliably yet

See `docs/WALLET_INTEGRATION.md` for detailed setup instructions.

### Development

```bash
npm run dev
```

The game will be available at:

**http://localhost:5173** (dev server port is locked to 5173)

> **Important:** The dev server MUST run on port 5173. If that port is busy, kill the process using it before starting.

### Production Build

```bash
npm run build
```

This generates an optimized build in the `dist` folder, which can be deployed to any static host (Vercel, Netlify, GitHub Pages, etc.).

---

## How to Play

### Gotta Catch 'Em All!

1. **Buy balls in the shop**
   - Pay with APE or USDC.e (APE is auto-swapped to USDC.e in the contract)
   - Higher tier balls (Great, Ultra, Master) have better catch rates
   - Max $49.90 per transaction

2. **Explore the map**
   - Use keyboard (WASD/arrows) or tap-to-move on touch devices
   - Look for wild Pokemon spawns (up to 20 active at once)
   - Rent a bike for 2x movement speed

3. **Get close and throw**
   - Click/tap a nearby Pokemon to open the Throw modal
   - Choose a ball type and throw (gasless – no wallet popup!)
   - Each Pokemon relocates after 3 failed attempts

4. **Win a Pokemon NFT**
   - On success, Pyth Entropy randomly selects an NFT from the pool
   - The NFT is transferred to your wallet automatically
   - View your collection in the inventory or on Magic Eden

5. **Track your progress**
   - Click the ball inventory in the HUD to open Transaction History
   - See all purchases, throws, catches, and spending stats

An in-game Help modal (accessible via the "?" button) summarizes these steps.

---

## Architecture Overview

### Smart Contracts (ApeChain Mainnet)

**[PokeballGame v1.9.0](https://apescan.io/address/0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f)** (proxy)

- Unified APE/USDC.e payments; APE is auto-swapped to USDC.e via Camelot DEX
- Uses **Pyth Entropy** for verifiable randomness (not POP VRNG)
- Handles ball purchases, throws, randomness callbacks, and NFT award logic
- **Gasless throws** via `throwBallFor()` – relayer pays gas, player signs message
- **APE reserves** (0.5%) fund Entropy fees; players pay only ball prices
- **Spawn management** (v1.9.0): `repositionPokemon()`, `despawnPokemon()`, configurable `maxActivePokemon`
- Revenue split: 96% NFT pool, 3% treasury, 0.5% PokeballGame APE reserve, 0.5% SlabNFTManager APE reserve

**[SlabNFTManager v2.4.0](https://apescan.io/address/0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71)** (proxy)

- Holds USDC.e revenue and a pool of Pokemon card NFTs (max 20)
- **Auto-purchase loop** (v2.4.0): Continues buying NFTs until inventory reaches 20 OR funds depleted
- Uses Pyth Entropy to select a random NFT index when awarding to winners
- **APE reserves** for SlabMachine pull gas
- Tracks NFT inventory, awards NFTs to winners, includes recovery utilities

**[Slab NFT Pokemon Cards](https://apescan.io/token/0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7)**

- Existing NFT collection contract that stores all Pokemon card NFTs used as prizes

### Frontend

- **React + TypeScript + Vite** for UI and build tooling
- **Phaser 3** for the 2D pixel-art game world (movement, Pokemon entities, animations)
- **Wagmi + Viem + RainbowKit** for wallet connection, contract calls, and event subscriptions
- **Custom Wagmi connectors** for dGen1/EthereumPhone and Glyph Wallet
- **ThirdWeb Checkout / Universal Bridge** for multi-chain APE/USDC.e funding
- **Alchemy NFT API** for resolving NFT metadata and images

### Key Frontend Components

| Component | Purpose |
|-----------|---------|
| `GameCanvas` | Phaser game wrapper + Web3 spawn sync |
| `PokeBallShop` | Ball purchase modal with APE/USDC.e toggle |
| `CatchAttemptModal` | Ball selection + gasless throw UI |
| `CatchWinModal` | NFT win celebration with card display |
| `TransactionHistory` | Player's purchase/throw/catch history |
| `OperatorDashboard` | Owner diagnostics (APE reserves, pool status) |
| `AdminDevTools` | Dev-mode NFT recovery and state inspection |
| `FundingWidget` | Cross-chain bridge/swap/buy modal |
| `HelpModal` | In-game instructions |

For a detailed breakdown of files, hooks, contracts, and troubleshooting notes, see `CLAUDE.md`.

---

## Mapping to the Challenge Checklist

This section shows how this implementation satisfies the Testing Checklist and core requirements described in `README_CHALLENGE.md`.

| Requirement | Implementation |
|-------------|----------------|
| Deposit functionality works with APE | APE payments route through PokeballGame v1.9.0, auto-swapped to USDC.e |
| Deposit functionality works with USDC.e | Direct USDC.e payments supported and treated identically |
| Probability calculation and randomness | `throwBall` uses Pyth Entropy; catch probabilities per ball type |
| Spin mechanics / gachapon equivalent | Throw and catch flow serves as gachapon spin |
| Random number generation is verifiable | Pyth Entropy provides verifiable randomness |
| Winners receive NFT cards; losers don't | `CaughtPokemon` event triggers NFT award; `FailedCatch` does not |
| Owner and treasury wallets editable | Contracts expose `setOwnerWallet` / `setTreasuryWallet` functions |
| ThirdWeb Checkout widget integrates | "NEED CRYPTO?" section in shop with Universal Bridge |
| Multi-chain support works | ThirdWeb Universal Bridge supports 95+ chains |
| Revenue generation from losing spins | All spend converted to USDC.e, split to NFT pool and treasury |
| Maximum deposit limit enforced | $49.90 per transaction cap in shop |
| RTP ~97% | Revenue split and probabilities designed for ~97% RTP |
| NFT API and inventory terminal | Alchemy NFT API + on-chain reads for wallet NFTs |
| NFT transfers work | Existing bulk transfer tooling remains functional |
| Volume control and terminal overlays | Audio controls and inventory overlays implemented |

### Owner / Maintenance Scripts

For contract revenue verification, withdraw flows, and spawn management:
- `scripts/verify_revenue_flow.cjs` – Verify 3%/97% fee/revenue split
- `scripts/withdraw_test_funds.cjs` – Withdraw fees/revenue for testing
- `scripts/repositionPokemonV9.cjs` – Reposition all Pokemon (v1.9.0)
- `scripts/update_ape_price.cjs` – Update APE/USD price from CoinGecko

See `CLAUDE.md` for full script documentation and Hardhat tasks.

---

## Device & Platform Support

### Browsers
- Chrome/Chromium (Recommended)
- Safari (macOS & iOS)
- Firefox
- Edge

### Wallets
- **Desktop:** MetaMask, Rainbow, WalletConnect, Ledger, Coinbase, and 50+ more
- **Mobile:** Glyph (recommended), WalletConnect-compatible wallets
- **Experimental:** dGen1/EthereumPhone (ethOS)
- **Hardware:** Ledger, Trezor (via WalletConnect)

### Devices
- Desktop (Windows, macOS, Linux)
- Mobile (iPhone, Android) – via wallet in-app browsers such as Glyph or WalletConnect; standalone mobile browsers are not supported
- Tablet
- **dGen1/EthereumPhone** (ethOS, 2.5"–3" square touchscreen) – use the ethOS system wallet browser; still experimental

### Screen Sizes
- Desktop: 1024px+
- Mobile: 320px+
- Compact: 240px–360px (dGen1 optimized)

---

## Documentation

- `CLAUDE.md` – Full technical documentation, contract ABIs, debugging history
- `docs/WALLET_INTEGRATION.md` – dGen1 and Glyph wallet setup guide
- `docs/UUPS_UPGRADE_GUIDE.md` – UUPS proxy upgrade documentation
- `docs/SETUP_POKEBALL_GAME.md` – PokeballGame integration setup
- `docs/WEB3_FRONTEND.md` – Web3 frontend integration details
- [RainbowKit Documentation](https://www.rainbowkit.com)
- [Wagmi Documentation](https://wagmi.sh)
- [Pyth Entropy Documentation](https://docs.pyth.network/entropy)

---

## License

This repository is a public fork of the original Pokemon Trader challenge app, which did not declare a formal license in its root.

- Core game code, art, and original docs are authored by the upstream Pokemon Trader / Pixelverse / Slab.cash team.
- My contributions (Pokeball catch game, UI/UX changes, and integration work) are shared for learning and portfolio purposes only.

For any commercial or production use, please coordinate with the original project owners regarding licensing.

---

## Contributing

This branch is submitted as part of the Slab Cash Gachapon Challenge.

External contributions are not expected during the judging period, but forks are welcome for experimentation or further development.

For maintainers or reviewers, the best starting points are:

- `README_CHALLENGE.md` – original challenge description and checklist
- `CLAUDE.md` – full technical log, contract versions, debugging history, and detailed documentation
