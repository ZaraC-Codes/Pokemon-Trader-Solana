# Custom Wallet Integration Guide

## Overview

Pokemon Trader supports custom EVM wallets for ApeChain:
1. **Glyph Wallet** - Yuga Labs' social login wallet for ApeChain
2. **dGen1 Wallet** - EthereumPhone device wallet (ethOS)

These wallets appear at the **TOP** of RainbowKit's wallet picker, before MetaMask and other standard wallets.

---

## File Structure

```
src/
├── connectors/
│   ├── index.ts                    # Barrel export for all connectors
│   ├── customWallets.ts            # RainbowKit Wallet definitions (factory functions)
│   ├── ethereumPhoneConnector.ts   # Wagmi connector for dGen1/ethOS
│   └── glyphConnector.ts           # Wagmi connector for Glyph (with SDK fallback)
├── utils/
│   └── walletDetection.ts          # Detection utilities for custom wallets
├── styles/
│   └── touchscreen.css             # Touch-friendly responsive styles
└── services/
    └── apechainConfig.ts           # Wagmi + RainbowKit configuration
```

---

## Wallet Detection

### dGen1 / EthereumPhone

Detection strategy (in priority order):
1. `window.ethereum.isEthereumPhone === true` (primary)
2. `window.__ETHOS_WALLET__ === true` (fallback)
3. User agent contains "ethos" or "ethereumphone" (tertiary)

```typescript
import { isEthereumPhoneAvailable, getEthereumPhoneProvider } from './utils/walletDetection';

// Check availability
if (isEthereumPhoneAvailable()) {
  const provider = getEthereumPhoneProvider();
  // Use provider...
}
```

### Glyph Wallet

Detection strategy:
1. `window.glyph?.isGlyph === true` (direct provider)
2. SDK-based connection always available (via `@use-glyph/sdk-react`)

```typescript
import { isGlyphAvailable, getGlyphProvider } from './utils/walletDetection';

// Check availability
if (isGlyphAvailable()) {
  // Glyph SDK connector is always available
}
```

---

## RainbowKit Integration

Custom wallets are integrated using `connectorsForWallets`:

```typescript
// src/services/apechainConfig.ts
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { dGen1Wallet, glyphWallet } from '../connectors/customWallets';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'ApeChain Wallets',
      wallets: [glyphWallet, dGen1Wallet],  // At TOP of list
    },
    {
      groupName: 'Popular Wallets',
      wallets: [metaMaskWallet, rainbowWallet, ...],
    },
  ],
  {
    appName: 'Pokemon Trader',
    projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  }
);

export const config = createConfig({
  connectors,
  chains: [apeChainMainnet],
  // ...
});
```

---

## Connector Implementation

### dGen1 Connector

The dGen1 connector (`ethereumPhoneConnector.ts`) implements:
- `connect()` - Initiates wallet connection
- `disconnect()` - Cleans up connection
- `getAccounts()` - Returns wallet address
- `getChainId()` - Returns current chain ID
- `switchChain()` - Switches to different chain
- Event handlers for account/chain changes

**Key Features:**
- ERC-4337 Account Abstraction support
- Optional bundler RPC configuration via `VITE_BUNDLER_RPC_URL`
- Graceful fallback on non-dGen1 devices

### Glyph Connector

The Glyph connector (`glyphConnector.ts`) implements:
- SDK integration via `@use-glyph/sdk-react`
- Fallback connector if SDK not installed
- Social login support (X, email, Apple ID)

**Configuration:**
```typescript
// With official SDK (recommended)
npm install @use-glyph/sdk-react

// Without SDK (fallback)
// Shows helpful message directing users to install SDK
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_BUNDLER_RPC_URL` | No | ERC-4337 bundler URL for dGen1 |
| `VITE_GLYPH_API_KEY` | No | Glyph API key (if required) |
| `VITE_WALLETCONNECT_PROJECT_ID` | Yes | WalletConnect project ID |

---

## Touchscreen & Small Screen Support

The app includes comprehensive touch-friendly styles for dGen1's square screen:

### Key Breakpoints
- **240px × 240px** - Smallest dGen1 estimate
- **280px × 280px** - Mid-range dGen1
- **320px × 320px** - Typical mobile
- **360px × 360px** - Largest dGen1 estimate

### Touch Targets
- All interactive elements have minimum **44px × 44px** touch targets
- No hover-only interactions (uses `active` state instead)
- Adequate spacing for finger taps

### Media Queries

```css
/* Square screen detection */
@media (min-aspect-ratio: 4/5) and (max-aspect-ratio: 5/4) {
  /* Square screen optimizations */
}

/* Touch device detection */
@media (pointer: coarse) {
  /* Touch-friendly styles */
}

/* No hover support */
@media (hover: none) {
  /* Replace hover with active states */
}
```

---

## ThirdWeb v5 Compatibility

Custom wallets work alongside ThirdWeb v5 without conflict:

1. **RainbowKit/Wagmi** - Handles wallet connection
2. **ThirdWeb** - Handles crypto checkout/payments

```tsx
// Provider hierarchy
<WagmiProvider config={config}>
  <QueryClientProvider client={queryClient}>
    <RainbowKitProvider>
      <App />
    </RainbowKitProvider>
  </QueryClientProvider>
</WagmiProvider>
```

ThirdWeb components (PayEmbed, FundingWidget) use the connected wallet automatically.

---

## Testing

### Browser Console Commands

```javascript
// Check detection
console.log('dGen1 available:', window.ethereum?.isEthereumPhone);
console.log('Glyph available:', window.glyph);

// Log detailed status
import { logWalletDetectionStatus } from './utils/walletDetection';
logWalletDetectionStatus();
```

### DevTools Device Emulation

1. Open Chrome DevTools (F12)
2. Toggle Device Toolbar (Ctrl+Shift+M)
3. Set custom dimensions: 300×300 for dGen1 testing
4. Enable touch emulation

### Expected Behavior

| Device | dGen1 Wallet | Glyph Wallet |
|--------|--------------|--------------|
| dGen1 device | Fully functional | Fully functional |
| Desktop browser | Shows "device only" | Opens useglyph.io |
| Mobile browser | Shows "device only" | SDK or useglyph.io |

---

## Troubleshooting

### Wallet Not Appearing in Picker

1. Check `src/connectors/index.ts` exports both connectors
2. Verify `src/services/apechainConfig.ts` uses `connectorsForWallets`
3. Check browser console for errors

### Provider Detection Fails

1. Check `window.ethereum?.isEthereumPhone` in console
2. Verify `src/utils/walletDetection.ts` has proper null checks
3. Check for TypeScript errors preventing detection functions

### Small Screen Unreadable

1. Check `src/styles/touchscreen.css` is imported in `src/index.css`
2. Verify DevTools device emulation is enabled
3. Check font sizes in CSS (should use rem units)
4. Verify button sizes >= 44px × 44px

### ThirdWeb Conflicts

1. Verify provider nesting: Wagmi -> RainbowKit -> App
2. Check no console errors about duplicate providers
3. Ensure `VITE_THIRDWEB_CLIENT_ID` still set in `.env`

---

## API Reference

### walletDetection.ts

```typescript
// Detection functions
isEthereumPhoneAvailable(): boolean
getEthereumPhoneProvider(): EthereumPhoneProvider | null
isGlyphAvailable(): boolean
getGlyphProvider(): GlyphProvider | null

// Viewport detection
isSquareScreen(): boolean
isTouchOnlyDevice(): boolean

// Configuration
getBundlerRpcUrl(): string
getGlyphApiKey(): string | undefined

// Debugging
logWalletDetectionStatus(): void
```

### customWallets.ts

```typescript
// Wallet factory functions (for connectorsForWallets)
dGen1Wallet(): Wallet
glyphWallet(): Wallet

// Pre-configured wallet group
customWalletGroup: WalletGroup

// Device capabilities
getDeviceCapabilities(): DeviceCapabilities
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-24 | Initial implementation |

---

## References

- [RainbowKit Custom Wallets](https://rainbowkit.com/docs/custom-wallets)
- [Wagmi Connectors](https://wagmi.sh/core/connectors)
- [EthereumPhone Documentation](https://www.ethereumphone.org)
- [Glyph SDK Documentation](https://docs.useglyph.io)
- [ThirdWeb v5 Documentation](https://portal.thirdweb.com)
