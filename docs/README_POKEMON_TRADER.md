# Pokemon Trader - ApeChain Web3 Game

A 2D pixel art game on ApeChain where users explore a map, see OTC marketplace trade listings as icons, and walk through a gorilla-shaped garden. Built with React, Phaser.js, and Rainbow wallet integration.

## Features

- 🎮 Pokemon-style 2D pixel art gameplay
- 🌐 Web3 integration with Rainbow wallet on ApeChain
- 💱 Real-time OTC marketplace listings displayed as trade icons
- 🦍 Gorilla-shaped garden area based on the mask PNG
- 🎨 Pixel-perfect rendering matching GameBoy aesthetic
- 🔄 Auto-refreshing trade listings every 30 seconds

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A WalletConnect Project ID (for RainbowKit)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure contract addresses:
   - Open `src/services/apechainConfig.ts`
   - Replace `CONTRACT_ADDRESSES.OTC_MARKETPLACE` with your verified OTC marketplace contract address
   - Replace `CONTRACT_ADDRESSES.NFT_COLLECTION` with your NFT collection address
   - Update the contract ABI in `src/services/contractService.ts` to match your contract's interface

3. Configure WalletConnect:
   - Get a Project ID from [WalletConnect Cloud](https://cloud.walletconnect.com)
   - Replace `YOUR_PROJECT_ID` in `src/services/apechainConfig.ts` with your Project ID

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`)

## Project Structure

```
src/
├── components/          # React components
│   ├── GameCanvas.tsx   # Phaser game wrapper
│   ├── WalletConnector.tsx
│   └── TradeModal.tsx   # Trade listing detail modal
├── game/                # Phaser game code
│   ├── scenes/          # Game scenes
│   ├── entities/        # Game entities (Player, TradeIcon)
│   ├── managers/        # Game managers (Map, TradeIcon)
│   └── config/          # Game configuration
├── services/            # Web3 services
│   ├── apechainConfig.ts
│   └── contractService.ts
└── utils/               # Utility functions
```

## Configuration

### Contract Configuration

The contract service expects the OTC marketplace contract to have these functions:
- `getAllListings()` - Returns all listings
- `getListingsByCollection(address nftContract)` - Returns listings filtered by NFT collection

Update the ABI in `src/services/contractService.ts` to match your contract's exact interface.

### ApeChain Network

The project is configured for ApeChain Mainnet. The network configuration is in `src/services/apechainConfig.ts`.

## Game Controls

- **Arrow Keys** or **WASD**: Move character
- **Click on Trade Icons**: View trade listing details

## Future Enhancements

- Shop area with trading interface
- GameBoy link cable visualization for trades
- Button system for map navigation
- Sound effects and background music
- Replace programmatic sprites with custom pixel art assets

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Notes

- The gorilla garden shape is currently approximated programmatically. For a more accurate shape, process the `Mask group(1).png` image and extract the boundary coordinates.
- Sprites are currently generated programmatically. Replace with custom pixel art sprite sheets for better visuals.
- Trade listings refresh automatically every 30 seconds.
