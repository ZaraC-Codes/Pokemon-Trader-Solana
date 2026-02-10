# README: CHALLENGE

## 🎮 Pokemon Trader - Pixelverse Gachapon Experience

A pixel art Pokemon-style trading game built on ApeChain that allows users to participate in Slab Cash activation through an immersive in-game experience.

---

## 🚀 Deployment Instructions

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** or **yarn** package manager
- A code editor (VS Code recommended)
- Git (for cloning the repository)

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd "Pokemon Trader"
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required dependencies including:

- React & TypeScript
- Phaser.js (game engine)
- Wagmi & RainbowKit (Web3 wallet integration)
- Vite (build tool)

### Step 3: Configure Environment Variables

Create a `.env` file in the root directory (optional - the app uses default Alchemy API key):

```env
# Optional: Override Alchemy API key if needed
# Current default: U6nPHGu_q380fQMfQRGcX
VITE_ALCHEMY_API_KEY=your_api_key_here
```

**Note**: The application is pre-configured with an Alchemy API key for ApeChain Mainnet. The key is used for both RPC calls and NFT API requests. If you need to use a different key, update `src/services/apechainConfig.ts`.

### Step 4: Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Step 5: Build for Production

```bash
npm run build
```

This creates an optimized production build in the `dist` folder.

### Step 6: Deploy

You can deploy the `dist` folder to any static hosting service:

- **Vercel**: `vercel deploy`
- **Netlify**: Drag and drop the `dist` folder
- **GitHub Pages**: Follow GitHub Pages deployment guide
- **Any static host**: Upload the `dist` folder contents

### Important Notes

- The application requires a Web3 wallet (MetaMask, RainbowKit, etc.) to interact with ApeChain
- Users must be connected to ApeChain Mainnet (Chain ID: 33139)
- The app uses Alchemy RPC endpoints (configured in `src/services/apechainConfig.ts`)
- NFT inventory uses Alchemy NFT API for reliable fetching (no contract calls needed)
- The game state persists when opening/closing modals (no resets)
- Volume control and inventory terminal are isolated from game canvas to prevent interference

### Known Console Warnings

- **SES (Secure EcmaScript) Warnings**: You may see console warnings about "Removing unpermitted intrinsics" from `lockdown-install.js`. These are harmless warnings from MetaMask and other wallet extensions that use SES (Secure EcmaScript) for security. They indicate that the wallet extension is removing certain JavaScript intrinsics that could pose security risks. These warnings can be safely ignored and do not affect application functionality.

---

## 🎯 THE CHALLENGE

### Overview

Create an on-screen terminal or experience within the pixelverse that allows users on ApeChain to participate in **Slab Cash activation** using **APE** or **USDC.e** at values below **50 USDC.e**.

### Core Requirements

#### 1. Gachapon Spin Mechanics

- Users can play for a chance at a spin on the gachapon on [slab.cash](https://slab.cash) on ApeChain
- **Example**: If a user inserts **25 USDC.e**, they get a **49.75% chance** of winning a pokemon card
- The smart contract should have a **97% RTP** (Return to Player)
- **Creators must use POP VRNG** (Verifiable Random Number Generator) to ensure fairness and transparency in all spin outcomes

#### 2. Deposit & Owner Configuration

- **treasury wallet** should be **editable by owner** (configurable)
- **Owner wallet** should be **editable by owner** (configurable)

#### 3. Multi-Chain Support

- Enable gameplay via **any chain** using **Thirdweb Checkout Widget**
- The game is an experience within the pixelverse that offers users a chance at the gacha

#### 4. Probability System

- The more users deposit (up to **$49.9 = 99.9% chance**), the higher their probability of hitting a card
- Probability should scale proportionally with deposit amount
- Maximum deposit: **49.9 USDC.e** (99.9% win chance)
- Minimum deposit: Configurable (suggested minimum for meaningful gameplay)

#### 5. Revenue & Payout System

- Contract should **generate revenue** based on losing spins
- Contract should **pay out winners** by forwarding the Pokemon card which users have won via the smart contract **directly to the user wallet**
- Winning cards are transferred automatically to the winner's wallet address

### Technical Specifications

#### Smart Contract Requirements

1. **Deposit Function**

   - Accept APE or USDC.e
   - Validate deposit amount (must be < 50 USDC.e)
   - Calculate win probability based on deposit amount
   - Store deposit information

2. **Spin/Gacha Function**

   - Execute random number generation using **POP VRNG** (Verifiable Random Number Generator) to ensure fairness
   - Determine win/loss based on probability
   - Handle both winning and losing outcomes

3. **Payout Function**

   - Transfer Pokemon card NFT to winner's wallet
   - NFT selection uses verifiable randomness (Pyth Entropy) to pick a random card from the pool
   - Handle NFT transfer from contract to user
   - Emit events for tracking

4. **Owner Configuration**

   - Owner wallet should be updatable (only by current owner)

5. **Revenue Generation**
   - Losing spins contribute to contract revenue
   - Revenue can be used for:
     - Funding future payouts
     - Contract maintenance
     - Reserve pool

#### Frontend Integration

1. **Terminal/UI Experience**

   - Create an in-game terminal or modal interface
   - Display deposit options (APE or USDC.e)
   - Show current win probability based on deposit amount
   - Display spin results
   - Show NFT rewards when won

2. **Thirdweb Checkout Widget**

   - Integrate Thirdweb Checkout for multi-chain support
   - Allow users to purchase tokens on any chain
   - Bridge/swap functionality if needed

3. **Wallet Integration**
   - Connect wallet (already implemented with RainbowKit)
   - Approve token spending
   - Execute deposit transactions
   - Handle NFT transfers

### Implementation Guidelines

#### Smart Contract Structure

```solidity
// Pseudo-code structure
contract PixelverseGachapon {
    address public owner;
    address public depositWallet;
    uint256 public constant MAX_DEPOSIT = 49900000; // 49.9 USDC.e (6 decimals)

    struct Spin {
        address player;
        uint256 deposit;
        uint256 probability; // in basis points (e.g., 2475 = 24.75%)
        bool won;
        uint256 tokenId; // if won
    }

    function deposit(uint256 amount, bool useUSDC) external;
    function spin() external;
    function setDepositWallet(address newWallet) external; // owner only
    function setOwner(address newOwner) external; // owner only
    function withdrawRevenue() external; // owner only
}
```

#### RTP (Return to Player)

- Target: **at least 97% RTP**
- This means for every 100 USDC.e deposited, players should receive 97 USDC.e in probability value back
- Implemented through:
  - Win probability scaling
  - NFT value distribution
  - Fair random number generation using **Pyth Entropy** to ensure verifiable fairness

#### Randomness Coverage (Implementation Note)

The game uses verifiable randomness (Pyth Entropy) for two decisions:

1. **Catch success/failure** – determines whether a throw wins.
2. **NFT selection** – when a player wins, a random index is selected from the SlabNFTManager pool, so the card awarded is unpredictable.

The 97% RTP target is still respected. Approximately 3% goes to the treasury, ~96.5% funds the NFT pool (USDC.e used to purchase cards), and a sub‑percent slice (~0.5%) is held in APE to cover Entropy gas and SlabMachine pull costs. This APE buffer is platform‑controlled and not withdrawable as player rewards; it exists solely to guarantee randomness and future NFT pulls without charging players extra fees.

### Integration Points

1. **Slab Cash Integration**

   - Connect to Slab Cash gachapon system
   - Verify card availability
   - Handle card distribution

2. **NFT Contract Integration**

   - Pokemon Cards NFT Collection: Find using Magic Eden (SLAB collection)
   - Current contract address: `0x8a981c2cfdd7fbc65395dd2c02ead94e9a2f65a7` (may need updating)
   - Transfer winning cards to users
   - Verify ownership before transfer
   - Use Alchemy NFT API for reliable NFT data fetching

3. **Token Contracts**

   - USDC.e on ApeChain
   - APE token on ApeChain
   - Handle approvals and transfers

4. **Alchemy NFT API Integration**
   - Uses `getNFTsForOwner` endpoint (v3) with owner and contract filters
   - **Endpoint**: `GET /nft/v3/{apiKey}/getNFTsForOwner`
   - **Base URL for ApeChain**: `https://apechain-mainnet.g.alchemy.com`
   - Fetches NFT metadata including images, names, and attributes
   - Handles pagination for large collections
   - **Query Parameters**:
     - `owner`: Wallet address (required)
     - `contractAddresses[]`: Array of contract addresses to filter (max 45)
     - `withMetadata`: Boolean, defaults to `true`
   - API Key: `U6nPHGu_q380fQMfQRGcX`
   - **Reference**: https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-ownership-endpoints/get-nf-ts-for-owner-v-3
   - **Note**: Ensure ApeChain supports NFT API v3 endpoints. If not available, may need to use on-chain contract calls as fallback.

### Testing Checklist

- [ ] Deposit functionality works with APE
- [ ] Deposit functionality works with USDC.e
- [ ] Probability calculation is accurate
- [ ] Spin mechanics work correctly using POP VRNG
- [ ] Random number generation is verifiable and fair
- [ ] Winners receive NFT cards
- [ ] Losers don't receive cards
- [ ] Owner wallet can be updated
- [ ] Treasury wallet can be updated
- [ ] Thirdweb Checkout widget integrates properly
- [ ] Multi-chain support works
- [ ] Revenue generation from losing spins
- [ ] Maximum deposit limit enforced (49.9 USDC.e)
- [ ] RTP is at least 97%
- [ ] Alchemy NFT API correctly fetches wallet holdings
- [ ] NFT transfers work correctly (single and bulk)
- [ ] Inventory terminal displays NFTs correctly
- [ ] Volume control doesn't cause game resets
- [ ] Terminal overlay doesn't interfere with gameplay

### Resources

- **Slab Cash**: https://slab.cash
- **Thirdweb Checkout**: https://thirdweb.com/checkout
- **POP VRNG**: https://pop.network (Verifiable Random Number Generator for ensuring fairness)
- **Alchemy NFT API**: https://www.alchemy.com/docs/reference/nft-api-endpoints (Used for fetching NFT metadata and wallet holdings)
- **Alchemy API Key**: `U6nPHGu_q380fQMfQRGcX` (Pre-configured for ApeChain Mainnet)
- **ApeChain Docs**: https://docs.apechain.com
- **Pokemon Cards NFT**: Find using Magic Eden (SLAB collection)
- **ApeChain Mainnet**: Chain ID 33139

### Submission

When implementing the challenge:

1. Create the smart contract with all required functionality
2. Integrate the terminal/UI experience into the existing game
3. Connect to Slab Cash and NFT contracts
4. Implement Thirdweb Checkout widget
5. Test thoroughly on ApeChain testnet (if available) or mainnet
6. Document your implementation
7. Submit with clear instructions on how to use the new features

---

## 📝 Current Application Features

- **Pixel Art Pokemon-Style Game**: Explore a 2D world with NPCs, buildings, and trading posts
- **NFT Trading**: Trade Pokemon Cards NFTs on ApeChain via OTC marketplace
- **Wallet Integration**: Connect wallet using RainbowKit (supports MetaMask, WalletConnect, and more)
- **Background Music**: Mo Bamba 8-bit remix with on-screen volume control
- **Inventory Terminal**:
  - View all ApeChain NFTs owned by connected wallet
  - Terminal-style UI matching the game's pixel art aesthetic
  - Bulk NFT transfers (send multiple NFTs at once)
  - Uses Alchemy NFT API for reliable NFT fetching
  - Real-time inventory updates
- **Volume Control**: On-screen volume toggle with mute/unmute functionality
- **Bike Rental System**: Rent and return bicycles for faster movement
- **NPC Interactions**: Trade with NPCs displaying real marketplace listings

---

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript
- **Game Engine**: Phaser.js 3.80+
- **Web3**: Wagmi + RainbowKit + Viem
- **Build Tool**: Vite
- **Blockchain**: ApeChain Mainnet (Chain ID: 33139)
- **NFT Metadata**: Alchemy NFT API v3
- **Icons**: Font Awesome 6.5.1 (via CDN)
- **State Management**: TanStack Query (React Query)
- **Styling**: Inline styles with pixel art aesthetic

### API Services

- **Alchemy NFT API v3**: Used for fetching NFT metadata and wallet holdings
  - API Key: `U6nPHGu_q380fQMfQRGcX`
  - Base URL: `https://apechain-mainnet.g.alchemy.com`
  - **Endpoints Used**:
    - `getNFTsForOwner` - Get NFTs owned by wallet for specific contract(s)
      - Full path: `/nft/v3/{apiKey}/getNFTsForOwner`
      - Method: `GET`
      - Parameters: `owner`, `contractAddresses[]`, `withMetadata`
      - Reference: https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-ownership-endpoints/get-nf-ts-for-owner-v-3
    - `getNFTMetadata` - Get metadata for specific NFT
      - Full path: `/nft/v3/{apiKey}/getNFTMetadata`
      - Parameters: `contractAddress`, `tokenId`
  - **Important**: Verify ApeChain NFT API support. If endpoints return "Method name is invalid", ApeChain may not fully support NFT API v3 endpoints yet. Consider using on-chain contract calls as fallback.

---

## 📄 License

The original Pokemon Trader challenge repository did not specify an explicit license.  
Please refer to the upstream repository or contact the project owner (@simplefarmer69) for definitive licensing terms.

---

## 🤝 Contributions

This repository is an extension of the original **Pokemon Trader – Pixelverse Gachapon Experience** challenge application.

Additional gameplay, UI, and smart contract features were implemented by @ZaraC-Codes as part of the Pixelverse / Slab.cash Pokéball catch game challenge.

---

**Good luck with the challenge! 🎮🚀**
