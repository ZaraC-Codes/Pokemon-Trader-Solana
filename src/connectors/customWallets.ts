/**
 * Custom RainbowKit Wallet Definitions
 *
 * Defines custom wallet options for RainbowKit's wallet picker UI.
 * These wallets appear at the top of the wallet list, before default wallets.
 *
 * Wallets:
 * 1. dGen1 Wallet - EthereumPhone device wallet (ethOS)
 * 2. Glyph Wallet - Yuga Labs' ApeChain wallet
 *
 * Usage:
 * ```tsx
 * import { connectorsForWallets } from '@rainbow-me/rainbowkit';
 * import { dGen1Wallet, glyphWallet } from './connectors/customWallets';
 *
 * const connectors = connectorsForWallets([
 *   {
 *     groupName: 'Recommended',
 *     wallets: [dGen1Wallet, glyphWallet],
 *   },
 *   // ... other wallet groups
 * ]);
 * ```
 */

import type { Wallet, WalletDetailsParams } from '@rainbow-me/rainbowkit';
import { ethereumPhoneConnector } from './ethereumPhoneConnector';
import { glyphConnector } from './glyphConnector';
import { isEthereumPhoneAvailable, isSquareScreen, isTouchOnlyDevice } from '../utils/walletDetection';

// ============================================================
// WALLET ICONS (Base64 SVG)
// ============================================================

/** dGen1 wallet icon - orange phone with ETH text */
const DGEN1_ICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHg9IjI1IiB5PSI1IiB3aWR0aD0iNTAiIGhlaWdodD0iOTAiIHJ4PSI4IiBmaWxsPSIjRkY2NjAwIi8+CjxyZWN0IHg9IjMwIiB5PSIxNSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjYwIiByeD0iNCIgZmlsbD0iIzFhMWEyZSIvPgo8Y2lyY2xlIGN4PSI1MCIgY3k9Ijg1IiByPSI1IiBmaWxsPSIjMWExYTJlIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI0ZGNjYwMCIgZm9udC1zaXplPSIxNnB4IiBmb250LWZhbWlseT0ibW9ub3NwYWNlIj5FVEg8L3RleHQ+Cjwvc3ZnPg==';

/** Glyph wallet icon - purple/blue gradient with G */
const GLYPH_ICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9ImdseXBoR3JhZCIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM2MzY2RjEiLz4KPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjOEI1Q0Y2Ii8+CjwvbGluZWFyR3JhZGllbnQ+CjwvZGVmcz4KPHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIHJ4PSIyMCIgZmlsbD0idXJsKCNnbHlwaEdyYWQpIi8+Cjx0ZXh0IHg9IjUwIiB5PSI2NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iNDVweCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZvbnQtZmFtaWx5PSJBcmlhbCI+RzwvdGV4dD4KPC9zdmc+';

// ============================================================
// dGen1 WALLET DEFINITION
// ============================================================

/**
 * dGen1 (EthereumPhone) wallet factory for RainbowKit.
 *
 * Only available on ethOS devices. Shows tooltip on desktop/web
 * indicating device-only availability.
 *
 * Features:
 * - ERC-4337 Account Abstraction
 * - System-level wallet integration
 * - Square screen (1:1) optimized UI
 * - Touch-only interface
 *
 * @returns Wallet object for RainbowKit connectorsForWallets
 */
export const dGen1Wallet = (): Wallet => ({
  id: 'dgen1',
  name: 'dGen1 Wallet',
  iconUrl: DGEN1_ICON,
  iconBackground: '#FF6600',
  // Show as "installed" only on actual dGen1 devices
  installed: isEthereumPhoneAvailable(),
  // Hide on non-dGen1 devices to avoid confusion
  // Set to false to always show (with "device only" message)
  hidden: () => false,
  downloadUrls: {
    android: 'https://www.ethereumphone.org',
    mobile: 'https://www.ethereumphone.org',
  },
  // RainbowKit expects a function that returns CreateConnectorFn
  createConnector: (_walletDetails: WalletDetailsParams) => ethereumPhoneConnector(),
});

// ============================================================
// GLYPH WALLET DEFINITION
// ============================================================

/**
 * Glyph wallet factory for RainbowKit.
 *
 * Yuga Labs' onboarding wallet for ApeChain. Available to all users
 * via the @use-glyph/sdk-react package.
 *
 * Features:
 * - Social login (X, email, Apple ID)
 * - No KYC for purchases ≤$500
 * - Multi-chain swaps
 * - ApeChain-native
 *
 * @returns Wallet object for RainbowKit connectorsForWallets
 */
export const glyphWallet = (): Wallet => ({
  id: 'glyph',
  name: 'Glyph',
  iconUrl: GLYPH_ICON,
  iconBackground: '#6366F1',
  // Glyph is always "installed" since it works via SDK
  installed: true,
  downloadUrls: {
    browserExtension: 'https://useglyph.io',
    chrome: 'https://useglyph.io',
    mobile: 'https://useglyph.io',
  },
  // RainbowKit expects a function that returns CreateConnectorFn
  createConnector: (_walletDetails: WalletDetailsParams) => glyphConnector(),
});

// ============================================================
// WALLET GROUP FOR RAINBOWKIT
// ============================================================

/**
 * Pre-configured wallet group with dGen1 and Glyph at the top.
 *
 * Usage with connectorsForWallets:
 * ```tsx
 * import { connectorsForWallets } from '@rainbow-me/rainbowkit';
 * import { customWalletGroup } from './connectors/customWallets';
 *
 * const connectors = connectorsForWallets([
 *   customWalletGroup,
 *   // ... other groups or default wallets
 * ], { appName: 'My App', projectId: 'xxx' });
 * ```
 */
export const customWalletGroup = {
  groupName: 'ApeChain Wallets',
  wallets: [glyphWallet, dGen1Wallet],  // Factory functions
};

// ============================================================
// VIEWPORT & TOUCH DETECTION FOR UI OPTIMIZATION
// ============================================================

/**
 * Check if the current device requires touch-friendly UI optimizations.
 * Used to adjust RainbowKit modal sizing and button targets.
 *
 * @returns Object with device capabilities
 */
export function getDeviceCapabilities() {
  return {
    isSquareScreen: isSquareScreen(),
    isTouchOnly: isTouchOnlyDevice(),
    isEthereumPhone: isEthereumPhoneAvailable(),
    // Minimum touch target size (iOS guidelines)
    minTouchTarget: 44,
    // Recommended viewport for dGen1
    dGen1Viewport: { width: 300, height: 300 },
  };
}

export default {
  dGen1Wallet,
  glyphWallet,
  customWalletGroup,
  getDeviceCapabilities,
};
