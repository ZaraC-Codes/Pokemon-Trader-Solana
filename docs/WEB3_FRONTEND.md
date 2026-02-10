# Web3 Frontend Integration Guide

This document describes the Web3 integration for Pokemon Trader, covering contract hooks, gasless transactions, and the v1.8.0/v2.4.0 architecture.

## Contract Overview

| Contract | Version | Proxy Address | Purpose |
|----------|---------|---------------|---------|
| PokeballGame | v1.8.0 | `0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f` | Ball purchases, Pokemon catching, gasless throws |
| SlabNFTManager | v2.4.0 | `0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71` | NFT inventory, auto-purchase, APE reserves |

## Revenue Split (v1.8.0)

When users purchase balls:
- **0.5% APE** → PokeballGame APE reserve (for Entropy fees)
- **0.5% APE** → SlabNFTManager APE reserve (for SlabMachine pulls)
- **96% USDC.e** → SlabNFTManager NFT pool
- **3% USDC.e** → Treasury

## Directory Structure

```
src/
├── hooks/
│   └── pokeballGame/           # PokeballGame-specific hooks
│       ├── index.ts                # Barrel exports
│       ├── pokeballGameConfig.ts   # Contract address, ABI, constants
│       ├── usePurchaseBalls.ts     # Ball purchase transactions
│       ├── useGaslessThrow.ts      # Meta-transaction throws (v1.8.0)
│       ├── useThrowBall.ts         # Direct throws (legacy/testing)
│       ├── useThrowFee.ts          # Pyth Entropy fee query
│       ├── useGetPokemonSpawns.ts  # Active Pokemon slots
│       ├── usePlayerBallInventory.ts # Player ball counts
│       ├── useContractEvents.ts    # Event subscriptions
│       ├── useContractDiagnostics.ts # APE reserves, pool status
│       └── useTokenApproval.ts     # ERC-20 approval helpers
│   ├── useTransactionHistory.ts    # Player transaction history
│   └── useTokenBalances.ts         # APE/USDC.e balance queries
├── services/
│   ├── pokeballGameConfig.ts       # PokeballGame shared config
│   ├── slabNFTManagerConfig.ts     # SlabNFTManager shared config
│   ├── apechainConfig.ts           # ApeChain network config
│   └── thirdwebConfig.ts           # ThirdWeb SDK config
└── components/
    ├── PokeBallShop/               # Ball purchase UI
    ├── CatchAttemptModal/          # Ball selection + throw
    ├── CatchResultModal/           # Success/failure display
    ├── CatchWinModal/              # NFT celebration modal
    ├── TransactionHistory/         # Player history modal
    └── OperatorDashboard/          # Owner diagnostics (dev mode)
```

## Gasless Throws (v1.8.0)

The v1.8.0 update introduces **gasless meta-transactions** for throwing PokeBalls. Players sign a message instead of paying gas.

### Flow

1. Player clicks Pokemon and selects ball type
2. Frontend fetches player's current nonce from contract
3. Player signs EIP-712 typed message (no wallet gas popup)
4. Frontend POSTs signature + params to relayer API
5. Relayer validates signature, calls `throwBallFor()` on-chain
6. Player sees catch result via contract events

### Hook Usage

```typescript
import { useGaslessThrow, type BallType, type ThrowStatus } from '../hooks/pokeballGame';

const {
  initiateThrow,  // (pokemonSlot: number, ballType: BallType) => Promise<boolean>
  throwStatus,    // 'idle' | 'fetching_nonce' | 'signing' | 'submitting' | 'pending' | 'error'
  isLoading,      // True during any in-progress step
  isPending,      // True while waiting for relayer confirmation
  error,          // Error message string or null
  reset,          // Reset hook state
  txHash,         // Transaction hash from relayer (if available)
} = useGaslessThrow();

// Trigger a throw
const handleThrow = async (slotIndex: number, ballType: BallType) => {
  const success = await initiateThrow(slotIndex, ballType);
  if (success) {
    // Throw submitted, wait for CaughtPokemon/FailedCatch events
  }
};
```

### EIP-712 Domain & Types

```typescript
const EIP712_DOMAIN = {
  name: 'PokeballGame',
  version: '1',
  chainId: 33139,  // ApeChain
  verifyingContract: '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f',
};

const EIP712_TYPES = {
  ThrowBall: [
    { name: 'player', type: 'address' },
    { name: 'pokemonSlot', type: 'uint8' },
    { name: 'ballType', type: 'uint8' },
    { name: 'nonce', type: 'uint256' },
  ],
};
```

### Relayer API

The relayer endpoint is configured via `VITE_RELAYER_API_URL` (default: `/api/throwBallFor`).

**Request:**
```json
{
  "player": "0x...",
  "pokemonSlot": 0,
  "ballType": 1,
  "nonce": "42",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0x...",
  "requestId": "123"
}
```

## Ball Purchases

Ball purchases still require a direct transaction from the user.

### Hook Usage

```typescript
import {
  usePurchaseBalls,
  useTokenApproval,
  useApePriceFromContract,
  calculateTotalCost,
} from '../hooks/pokeballGame';

const { write: purchase, isPending, error } = usePurchaseBalls();
const { price: apePriceUSD } = useApePriceFromContract();

// Calculate cost
const cost = calculateTotalCost(ballType, quantity, useAPE, apePriceUSD);

// Check approval (APE=always approved, USDC.e=check allowance)
const { isApproved, approve } = useTokenApproval(useAPE ? 'APE' : 'USDC', cost);

// Purchase flow
if (!isApproved) {
  await approve();  // Only triggers for USDC.e
}
purchase(ballType, quantity, useAPE);
```

### Payment Methods

| Token | Type | Approval | Contract Function |
|-------|------|----------|-------------------|
| APE | Native | Not needed | `purchaseBallsWithAPE()` |
| USDC.e | ERC-20 | Required | `purchaseBallsWithUSDC()` |

## Contract Diagnostics

The `useContractDiagnostics` hook provides real-time health monitoring.

```typescript
import { useContractDiagnostics } from '../hooks/pokeballGame';

const {
  // APE Reserves
  pokeballGameApeReserve,          // bigint - PokeballGame APE balance
  pokeballGameApeReserveFormatted, // number - e.g., 2.5
  slabManagerApeReserve,           // bigint - SlabNFTManager APE balance
  slabManagerApeReserveFormatted,  // number - e.g., 1.2

  // USDC Pool
  slabNFTManagerBalance,           // bigint - NFT pool balance
  slabNFTManagerBalanceFormatted,  // number - e.g., 125.50
  canAutoPurchase,                 // boolean - balance >= $51

  // NFT Inventory
  inventoryCount,                  // number - current NFT count
  maxInventorySize,                // number - 20

  // Warnings
  hasWarnings,                     // boolean
  warnings,                        // string[]

  // Loading
  isLoading,
  refetch,
} = useContractDiagnostics();
```

### Warning Conditions

- APE reserve < 0.5 APE (low reserve)
- APE price is 0 or unrealistic
- NFT inventory full (20/20)
- Auto-purchase blocked (< $51)

## Event Subscriptions

Events are fetched via manual `eth_getLogs` polling (ApeChain doesn't support `eth_newFilter`).

### Transaction History

```typescript
import { useTransactionHistory } from '../hooks/useTransactionHistory';

const {
  transactions,     // Transaction[] - newest first
  purchaseStats,    // All-time stats (persisted to localStorage)
  isLoading,
  hasMore,
  loadMore,
} = useTransactionHistory(playerAddress);

// Transaction types
type Transaction =
  | PurchaseTransaction  // Ball purchases
  | ThrowTransaction     // Throw attempts
  | CaughtTransaction    // Successful catches
  | FailedTransaction;   // Failed catches
```

### Real-time Event Hooks

```typescript
import {
  useBallPurchasedEvents,
  useCaughtPokemonEvents,
  useFailedCatchEvents,
  useThrowAttemptedEvents,
} from '../hooks/pokeballGame';

// Watch for catches
const { events: caughtEvents } = useCaughtPokemonEvents();

useEffect(() => {
  if (caughtEvents.length > 0) {
    const latest = caughtEvents[caughtEvents.length - 1];
    if (latest.args.catcher === myAddress) {
      showWinModal(latest.args.nftTokenId);
    }
  }
}, [caughtEvents]);
```

## Pokemon Spawns

```typescript
import {
  useGetPokemonSpawns,
  useActivePokemonCount,
  type PokemonSpawn,
} from '../hooks/pokeballGame';

const { data: spawns, isLoading } = useGetPokemonSpawns();
// spawns: PokemonSpawn[] with id, slotIndex, x, y, isActive

const { count } = useActivePokemonCount();
// count: number of active Pokemon (0-20)
```

## Token Balances

```typescript
import {
  useApeBalanceWithUsd,
  useUsdcBalance,
} from '../hooks/useTokenBalances';

// APE balance with USD value
const { balance: apeBalance, usdValue } = useApeBalanceWithUsd(address);

// USDC.e balance
const { balance: usdcBalance } = useUsdcBalance(address);
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_POKEBALL_GAME_ADDRESS` | Yes | PokeballGame proxy address |
| `VITE_RELAYER_API_URL` | No | Gasless throw API (default: `/api/throwBallFor`) |
| `VITE_THIRDWEB_CLIENT_ID` | No | ThirdWeb client ID for fiat purchases |

## Operator Dashboard

For owners/operators, the `OperatorDashboard` component provides:

1. **APE Reserves** - Both contract balances with health indicators
2. **USDC Pool Status** - NFT pool balance, auto-purchase eligibility
3. **NFT Inventory** - Current count vs max (20)
4. **CLI Commands** - Copy-to-clipboard Hardhat task suggestions

Access via dev mode: `?dev=1` URL param or F2 key.

## Error Handling

### Gas Estimation Failures

The `usePurchaseBalls` hook blocks transactions that would fail:

```typescript
const { write, error } = usePurchaseBalls();

// error will be set if gas estimation fails:
// - "ERC-20 allowance error. For USDC.e payments, please approve first."
// - "Insufficient APE balance..."
// - "Transaction would fail: [details]"
```

### Gasless Throw Errors

```typescript
const { error, throwStatus } = useGaslessThrow();

// Error states:
// - "Wallet not connected"
// - "Signature request cancelled"
// - "Relayer error: [status]"
// - "Relayer request timed out"
```

## Testing

### Force Touch Controls (Desktop)

```bash
VITE_FORCE_TOUCH_CONTROLS=true npm run dev
```

### Dev Mode

```bash
# URL parameter
http://localhost:5173/?dev=1

# Or localStorage
localStorage.setItem('pokeballTrader_devMode', 'true')
```

### Console Debugging

```javascript
// Access Phaser game
window.__PHASER_GAME__

// Access spawn manager
const mgr = window.__PHASER_GAME__.scene.getScene('GameScene').getPokemonSpawnManager();
mgr.setDebugMode(true);
mgr.printSpawnTable();
```

## Troubleshooting

### "Filter not found" RPC Errors

ApeChain's public RPC doesn't support `eth_newFilter`. All event watching uses manual `eth_getLogs` polling.

### Throw Fee Returns 0

1. Check dev server is on port 5173
2. Verify RPC endpoint is reachable
3. Check `useThrowFee` hook is enabled

### Ball Inventory Not Updating

Ensure `useBallPurchasedEvents` is wired in App.tsx to invalidate queries on purchase.

### Gasless Throw Stuck on "Signing"

User may have rejected the signature in their wallet. The error state will update after rejection.
