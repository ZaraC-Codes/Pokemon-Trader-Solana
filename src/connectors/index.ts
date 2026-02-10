/**
 * Custom Wallet Connectors
 *
 * This module exports custom Wagmi connectors for wallets not included
 * in RainbowKit's default wallet list.
 *
 * Available Connectors:
 * - ethereumPhoneConnector: For dGen1 devices running ethOS
 * - glyphConnector: For Yuga Labs' Glyph wallet on ApeChain
 *
 * RainbowKit Wallet Definitions:
 * - dGen1Wallet: RainbowKit Wallet object for dGen1
 * - glyphWallet: RainbowKit Wallet object for Glyph
 * - customWalletGroup: Pre-configured wallet group
 *
 * Usage with RainbowKit:
 * ```ts
 * import { dGen1Wallet, glyphWallet, customWalletGroup } from './connectors';
 * import { connectorsForWallets } from '@rainbow-me/rainbowkit';
 *
 * const connectors = connectorsForWallets([
 *   customWalletGroup,
 *   // ... other wallet groups
 * ]);
 * ```
 */

// Wagmi Connectors
export { ethereumPhoneConnector } from './ethereumPhoneConnector';
export type { EthereumPhoneConnectorOptions } from './ethereumPhoneConnector';

export { glyphConnector, GlyphConfig, StrategyType, WalletClientType } from './glyphConnector';
export type { GlyphConnectorOptions } from './glyphConnector';

// RainbowKit Wallet Definitions
export {
  dGen1Wallet,
  glyphWallet,
  customWalletGroup,
  getDeviceCapabilities,
} from './customWallets';
