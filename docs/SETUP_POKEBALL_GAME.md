# PokeballGame Integration Setup Guide

This guide explains how to integrate and run the PokeballGame mini-game within the Pokemon Trader application.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Integration Steps](#integration-steps)
- [Environment Variables](#environment-variables)
- [Dependencies](#dependencies)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Overview

The PokeballGame is an on-chain Pokemon catching mini-game that integrates with the Pokemon Trader Phaser game. Players can:

1. **Purchase PokeBalls** - Buy balls using APE or USDC.e tokens
2. **Catch Pokemon** - Click wild Pokemon in the game world to attempt catches
3. **Win NFTs** - Successfully caught Pokemon award Slab NFTs from the SlabMachine

### Key Features

- **Provably fair**: Uses POP VRNG for verifiable random catch outcomes
- **Dual payment**: Accepts both APE and USDC.e for ball purchases
- **Real-time updates**: Inventory and spawn data update via polling hooks
- **Upgradeable**: UUPS proxy pattern allows contract upgrades

---

## Architecture

### File Structure

```
src/
├── services/
│   └── pokeballGameConfig.ts    # Centralized on-chain configuration
│
├── hooks/
│   ├── useTokenBalances.ts      # APE and USDC.e balance hooks
│   └── pokeballGame/            # PokeballGame Wagmi hooks
│       ├── index.ts             # Barrel export
│       ├── pokeballGameConfig.ts # Hook-level config, types, utilities
│       ├── usePurchaseBalls.ts  # Buy balls transaction
│       ├── useThrowBall.ts      # Throw ball transaction
│       ├── useGetPokemonSpawns.ts # Read active Pokemon spawns
│       ├── usePlayerBallInventory.ts # Read player ball counts
│       ├── useContractEvents.ts # Event subscriptions
│       ├── useSetOwnerWallet.ts # Owner: transfer ownership
│       └── useSetTreasuryWallet.ts # Owner: update treasury
│
├── components/
│   ├── GameCanvas.tsx           # Phaser game wrapper, emits pokemon-clicked
│   ├── PokeBallShop/
│   │   ├── index.ts             # Barrel export
│   │   ├── PokeBallShop.tsx     # Shop modal for buying balls
│   │   └── GameHUD.tsx          # HUD overlay (inventory + spawns + shop button)
│   ├── CatchAttemptModal/
│   │   ├── index.ts             # Barrel export
│   │   └── CatchAttemptModal.tsx # Ball selection + throw UI
│   └── CatchResultModal/
│       ├── index.ts             # Barrel export
│       └── CatchResultModal.tsx # Success/failure feedback
│
└── game/
    └── managers/
        ├── PokemonSpawnManager.ts    # Phaser manager for spawn entities
        ├── BallInventoryManager.ts   # Client-side inventory tracking
        └── CatchMechanicsManager.ts  # Catch flow state machine
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User Interaction                              │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GameCanvas (Phaser)                                                 │
│  - Renders Pokemon sprites via PokemonSpawnManager                   │
│  - Emits 'pokemon-clicked' event when Pokemon clicked                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  App.tsx (React)                                                     │
│  - Listens for pokemon-clicked → opens CatchAttemptModal             │
│  - Renders GameHUD, PokeBallShop, CatchResultModal                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│  CatchAttemptModal           │   │  PokeBallShop                │
│  - Select ball type          │   │  - Purchase balls            │
│  - Execute throwBall()       │   │  - APE or USDC.e payment     │
└──────────────────────────────┘   └──────────────────────────────┘
                    │                           │
                    └─────────────┬─────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Wagmi Hooks (pokeballGame/*)                                        │
│  - useThrowBall() → throwBall(slot, ballType)                        │
│  - usePurchaseBalls() → purchaseBalls(type, qty, useAPE)             │
│  - usePlayerBallInventory() → getAllPlayerBalls(player)              │
│  - useGetPokemonSpawns() → getAllActivePokemons()                    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PokeballGame Contract (ApeChain)                                    │
│  - Processes transactions                                            │
│  - Requests random number from POP VRNG                              │
│  - Emits events: CaughtPokemon, FailedCatch, BallPurchased, etc.     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SlabNFTManager Contract                                             │
│  - Receives 97% of ball purchase revenue                             │
│  - Auto-purchases NFTs from SlabMachine when >= $51                  │
│  - Awards NFTs to successful catchers                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Centralized Config File

All on-chain configuration is centralized in `src/services/pokeballGameConfig.ts`:

```typescript
import { pokeballGameConfig, isPokeballGameConfigured } from './services/pokeballGameConfig';

// Check if contract is configured
if (!isPokeballGameConfigured()) {
  console.warn('Set VITE_POKEBALL_GAME_ADDRESS in .env');
}

// Access configuration
const {
  chainId,          // 33139 (ApeChain Mainnet)
  rpcUrl,           // Alchemy RPC URL
  explorerUrl,      // https://apescan.io
  pokeballGameAddress, // From VITE_POKEBALL_GAME_ADDRESS env var
  abi,              // PokeballGame ABI
  tokenAddresses,   // { APE, USDC }
  ballConfig,       // Ball prices, catch rates, colors
  gameConstants,    // MAX_SPAWNS, MAX_ATTEMPTS, etc.
} = pokeballGameConfig;
```

### Helper Functions

```typescript
import {
  getTransactionUrl,  // Get Apescan tx link
  getAddressUrl,      // Get Apescan address link
  getNftUrl,          // Get Apescan NFT link
  getBallConfig,      // Get ball name, price, catch rate, color
} from './services/pokeballGameConfig';

// Example usage
const txUrl = getTransactionUrl('0xabc...');
// => https://apescan.io/tx/0xabc...

const ball = getBallConfig(2); // Ultra Ball
// => { name: 'Ultra Ball', price: 25.0, catchRate: 50, color: '#ffcc00' }
```

---

## Integration Steps

### 1. Ensure Providers Are Configured

In `App.tsx`, ensure Web3 providers wrap your app:

```tsx
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClientProvider } from '@tanstack/react-query';
import { config } from './services/apechainConfig';

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <AppContent />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

### 2. Render Required Components

In your main app content component:

```tsx
import GameCanvas, { type PokemonClickData } from './components/GameCanvas';
import { GameHUD } from './components/PokeBallShop';
import { CatchAttemptModal } from './components/CatchAttemptModal';
import { CatchResultModal } from './components/CatchResultModal';
import { useActiveWeb3React } from './hooks/useActiveWeb3React';

function AppContent() {
  const { account } = useActiveWeb3React();
  const [selectedPokemon, setSelectedPokemon] = useState<SelectedPokemon | null>(null);
  const [catchResult, setCatchResult] = useState<CatchResult | null>(null);

  // Handle Pokemon click from Phaser scene
  const handlePokemonClick = useCallback((data: PokemonClickData) => {
    setSelectedPokemon({
      pokemonId: data.pokemonId,
      slotIndex: data.slotIndex,
      attemptsRemaining: 3 - data.attemptCount,
    });
  }, []);

  return (
    <div>
      {/* Phaser game canvas */}
      <GameCanvas onPokemonClick={handlePokemonClick} />

      {/* HUD overlay (top-right) - shows inventory, spawns, shop button */}
      <GameHUD playerAddress={account} />

      {/* Catch attempt modal - ball selection + throw */}
      <CatchAttemptModal
        isOpen={selectedPokemon !== null}
        onClose={() => setSelectedPokemon(null)}
        playerAddress={account}
        pokemonId={selectedPokemon?.pokemonId ?? BigInt(0)}
        slotIndex={selectedPokemon?.slotIndex ?? 0}
        attemptsRemaining={selectedPokemon?.attemptsRemaining ?? 0}
      />

      {/* Result modal - success/failure feedback */}
      <CatchResultModal
        isOpen={catchResult !== null}
        onClose={() => setCatchResult(null)}
        result={catchResult}
      />
    </div>
  );
}
```

### 3. Component Connections

| Component | Trigger | Purpose |
|-----------|---------|---------|
| **GameHUD** | Always visible | Shows ball inventory, active Pokemon count, SHOP button |
| **PokeBallShop** | GameHUD SHOP button | Modal for purchasing balls with APE/USDC.e |
| **CatchAttemptModal** | `pokemon-clicked` event | Select ball type and execute throw transaction |
| **CatchResultModal** | `CaughtPokemon`/`FailedCatch` events | Display catch outcome with NFT links or retry option |

### 4. Event Handling

The Phaser scene emits events that React components listen to:

```typescript
// In GameCanvas.tsx - listens for scene events
gameScene.events.on('pokemon-clicked', (data: PokemonClickData) => {
  onPokemonClick?.(data);
});

// In parent component - handle the event
const handlePokemonClick = (data: PokemonClickData) => {
  // Open CatchAttemptModal with this Pokemon's data
  setSelectedPokemon({ ... });
};
```

---

## Environment Variables

Create a `.env` file in the project root with these variables:

### Required

```env
# PokeballGame proxy contract address on ApeChain
VITE_POKEBALL_GAME_ADDRESS=0xYourPokeballGameProxyAddress
```

### Optional (already configured in codebase)

```env
# RPC URL (defaults to Alchemy endpoint in apechainConfig.ts)
# Only set if you want to override the default
VITE_PUBLIC_RPC_URL=https://apechain.calderachain.xyz/http

# WalletConnect Project ID (already set in apechainConfig.ts)
# Get yours at https://cloud.walletconnect.com/
VITE_WALLETCONNECT_PROJECT_ID=your-project-id
```

### Example `.env` File

```env
# PokeballGame Integration
VITE_POKEBALL_GAME_ADDRESS=0x1234567890abcdef1234567890abcdef12345678

# Optional overrides (usually not needed)
# VITE_PUBLIC_RPC_URL=https://apechain.calderachain.xyz/http
# VITE_WALLETCONNECT_PROJECT_ID=3508d227dfa70cee7f6b68f4e1da9170
```

### Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_POKEBALL_GAME_ADDRESS` | Yes | PokeballGame UUPS proxy address on ApeChain |
| `VITE_PUBLIC_RPC_URL` | No | Override default ApeChain RPC URL |
| `VITE_WALLETCONNECT_PROJECT_ID` | No | WalletConnect project ID (has default) |

---

## Dependencies

### No Additional Packages Required

The PokeballGame integration uses the existing Pokemon Trader dependencies:

- **wagmi** `^2.5.0` - React hooks for Ethereum
- **viem** `^2.5.0` - Low-level Ethereum library
- **@rainbow-me/rainbowkit** `^2.0.0` - Wallet connection UI
- **@tanstack/react-query** `^5.17.0` - Server state management
- **phaser** `^3.80.1` - 2D game engine
- **react** `^18.2.0` - UI framework

All contract ABIs are included in `contracts/abi/` directory.

### Verifying Dependencies

```bash
# Check if required packages are installed
npm ls wagmi viem @rainbow-me/rainbowkit @tanstack/react-query phaser react

# If any are missing, install all dependencies
npm install
```

---

## Testing

### Local Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   # Create .env file
   cp .env.example .env  # or create manually

   # Edit .env and set VITE_POKEBALL_GAME_ADDRESS
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```
   App runs at http://localhost:5173

4. **Connect wallet to ApeChain**:
   - Open app in browser
   - Click "Connect Wallet"
   - Select your wallet (MetaMask, WalletConnect, etc.)
   - Ensure you're on ApeChain (Chain ID: 33139)

### Functional Test Checklist

#### 1. GameHUD Display
- [ ] Ball inventory shows counts for each type (0 initially)
- [ ] Active Pokemon count displays correctly
- [ ] "Connect Wallet" message shows if not connected
- [ ] SHOP button is visible and clickable

#### 2. Ball Purchase Flow
- [ ] Click SHOP button → PokeBallShop modal opens
- [ ] Select ball type (Poké/Great/Ultra/Master)
- [ ] Set quantity with +/- buttons
- [ ] Toggle between APE and USDC.e payment
- [ ] Click BUY → wallet prompts for transaction approval
- [ ] Loading state shows during transaction
- [ ] Success: inventory updates in GameHUD
- [ ] Error: error message displays in modal

#### 3. Pokemon Catch Flow
- [ ] Click Pokemon sprite in game world
- [ ] CatchAttemptModal opens with Pokemon info
- [ ] Ball selection shows available balls (owned count > 0)
- [ ] Select ball type → THROW button enabled
- [ ] Click THROW → wallet prompts for transaction
- [ ] Loading state shows "Throwing ball..."
- [ ] Wait for VRNG callback (may take a few seconds)

#### 4. Catch Result - Success
- [ ] CatchResultModal shows "CAUGHT!"
- [ ] Confetti animation plays
- [ ] NFT image or placeholder displays
- [ ] "View on Apescan" link works
- [ ] Pokemon removed from game world
- [ ] Inventory decremented by 1

#### 5. Catch Result - Failure
- [ ] CatchResultModal shows "ESCAPED!"
- [ ] Shake animation plays
- [ ] Attempts remaining displayed
- [ ] "Try Again" button available (if attempts > 0)
- [ ] "Close" returns to game
- [ ] Pokemon still visible (unless max attempts reached)

### Console Debug Functions

The app exposes test utilities in the browser console:

```javascript
// Test contract connection
window.testContractConnection()

// Fetch all listings (OTC marketplace)
window.testListings()

// Check specific listing
window.checkListing(1233)
```

### Network Verification

Ensure you're connected to ApeChain Mainnet:

| Property | Value |
|----------|-------|
| Chain ID | 33139 |
| Chain Name | ApeChain |
| Native Currency | APE |
| RPC URL | https://apechain.calderachain.xyz/http |
| Block Explorer | https://apescan.io |

---

## Troubleshooting

### Common Issues

#### "Contract not configured"
**Cause**: `VITE_POKEBALL_GAME_ADDRESS` not set in `.env`

**Fix**:
1. Create/edit `.env` file in project root
2. Add: `VITE_POKEBALL_GAME_ADDRESS=0x...`
3. Restart dev server (`npm run dev`)

#### "Wrong network" or transaction fails
**Cause**: Wallet not connected to ApeChain

**Fix**:
1. Open wallet (MetaMask)
2. Switch network to ApeChain (Chain ID: 33139)
3. If ApeChain not listed, add it manually with settings above

#### "Insufficient balance" for purchase
**Cause**: Not enough APE or USDC.e for ball purchase

**Fix**:
1. Check wallet balance in GameHUD
2. Bridge tokens to ApeChain if needed
3. Use alternative payment token (APE ↔ USDC.e toggle)

#### Ball inventory not updating
**Cause**: Polling not detecting changes

**Fix**:
1. Wait 10 seconds (inventory poll interval)
2. Manually refresh page
3. Check browser console for errors

#### Pokemon click not opening modal
**Cause**: Event not propagating from Phaser to React

**Fix**:
1. Check browser console for errors
2. Ensure `onPokemonClick` prop passed to GameCanvas
3. Verify Phaser scene emits `pokemon-clicked` event

### Debug Tips

1. **Check contract address**:
   ```javascript
   import { POKEBALL_GAME_ADDRESS } from './services/pokeballGameConfig';
   console.log('Contract:', POKEBALL_GAME_ADDRESS);
   ```

2. **Verify ABI loaded**:
   ```javascript
   import { POKEBALL_GAME_ABI } from './services/pokeballGameConfig';
   console.log('ABI functions:', POKEBALL_GAME_ABI.filter(x => x.type === 'function').map(x => x.name));
   ```

3. **Check wallet connection**:
   ```javascript
   import { useActiveWeb3React } from './hooks/useActiveWeb3React';
   const { account, chainId } = useActiveWeb3React();
   console.log('Account:', account, 'Chain:', chainId);
   ```

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Main project documentation
- [UUPS_UPGRADE_GUIDE.md](./UUPS_UPGRADE_GUIDE.md) - Contract upgrade process
- [pop_vrng_integration.md](./pop_vrng_integration.md) - Randomness integration
- [WALLET_CONFIG.md](./WALLET_CONFIG.md) - Wallet setup guide
