/**
 * Glyph Wallet Wagmi Connector
 *
 * Integration wrapper for Yuga Labs' Glyph wallet on ApeChain.
 * Glyph provides easy onboarding via X/email/Apple ID with seamless
 * multi-chain support.
 *
 * SDK: @use-glyph/sdk-react
 * Docs: https://docs.useglyph.io
 *
 * Features:
 * - Account creation in <75 seconds (no KYC for ≤$500 USD onramp)
 * - Multi-chain swaps (ApeChain, Ethereum, Arbitrum, Base, BNB, HyperLiquid)
 * - React hooks integration (useGlyph, useBalances, etc.)
 * - Social login (X/Twitter, email, Apple ID)
 *
 * Supported Chains:
 * - ApeChain (33139) - Primary
 * - Ethereum (1)
 * - Arbitrum (42161)
 * - Base (8453)
 * - BNB Smart Chain (56)
 * - HyperLiquid
 *
 * Environment Variables:
 * - VITE_GLYPH_API_KEY: Glyph API key if required (optional)
 *
 * Integration:
 * - Use glyphWalletConnector from @use-glyph/sdk-react directly
 * - Wrap app with GlyphProvider for full SDK functionality
 * - Use StrategyType.EIP1193 for Wagmi/RainbowKit compatibility
 * - Use WalletClientType.RAINBOWKIT for RainbowKit integration
 *
 * ThirdWeb v5 Compatibility:
 * - Glyph handles wallet connection and transactions
 * - ThirdWeb handles crypto checkout (separate concern)
 * - Both can coexist in the provider hierarchy
 */

import { createConnector } from 'wagmi';
import type { CreateConnectorFn } from 'wagmi';
import type { Address, Chain } from 'viem';

// ============================================================
// TYPES
// ============================================================

/** Configuration options for Glyph connector */
export interface GlyphConnectorOptions {
  /** Glyph API key if required */
  apiKey?: string;
  /** Whether to ask for signature on connect */
  askForSignature?: boolean;
}

/** Glyph provider interface */
interface GlyphProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
}

// ============================================================
// CONSTANTS
// ============================================================

/** Unique identifier for this connector */
const CONNECTOR_ID = 'glyph';

/** Human-readable wallet name */
const CONNECTOR_NAME = 'Glyph Wallet';

/** Glyph brand icon (purple/blue gradient with G) */
const CONNECTOR_ICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9ImdseXBoR3JhZCIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM2MzY2RjEiLz4KPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjOEI1Q0Y2Ii8+CjwvbGluZWFyR3JhZGllbnQ+CjwvZGVmcz4KPHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIHJ4PSIyMCIgZmlsbD0idXJsKCNnbHlwaEdyYWQpIi8+Cjx0ZXh0IHg9IjUwIiB5PSI2NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iNDVweCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZvbnQtZmFtaWx5PSJBcmlhbCI+RzwvdGV4dD4KPC9zdmc+';

// ============================================================
// SDK RE-EXPORT
// ============================================================

/**
 * Re-export the official Glyph connector from @use-glyph/sdk-react.
 *
 * Usage:
 * ```ts
 * import { glyphWalletConnector } from '@use-glyph/sdk-react';
 *
 * const connectors = [
 *   glyphWalletConnector(),
 *   // ... other connectors
 * ];
 * ```
 *
 * If the SDK is not installed, this file provides a fallback connector
 * that shows an installation message.
 */

// Try to import from the official SDK
let officialGlyphConnector: (() => CreateConnectorFn) | null = null;

try {
  // Dynamic import would be better but wagmi needs static connectors
  // This will be replaced with actual import when SDK is installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sdk = require('@use-glyph/sdk-react');
  if (sdk.glyphWalletConnector) {
    officialGlyphConnector = sdk.glyphWalletConnector;
  }
} catch {
  // SDK not installed - will use fallback
  console.log('[glyphConnector] @use-glyph/sdk-react not installed, using fallback');
}

// ============================================================
// FALLBACK CONNECTOR
// ============================================================

/**
 * Fallback Glyph connector when SDK is not installed.
 * Shows a helpful message directing users to install the SDK.
 */
function createFallbackConnector(_options: GlyphConnectorOptions = {}): CreateConnectorFn {
  return createConnector((config) => ({
    id: CONNECTOR_ID,
    name: CONNECTOR_NAME,
    type: 'glyph',
    icon: CONNECTOR_ICON,

    async connect(_params = {}) {
      console.log('[glyphConnector] Fallback connect() called');

      // Open Glyph website for users to learn more
      window.open('https://useglyph.io', '_blank');

      throw new Error(
        'Glyph wallet connection requires @use-glyph/sdk-react. ' +
        'Install with: npm install @use-glyph/sdk-react'
      );
    },

    async disconnect() {
      console.log('[glyphConnector] Fallback disconnect() called');
    },

    async getAccounts(): Promise<Address[]> {
      return [];
    },

    async getChainId(): Promise<number> {
      return 33139; // ApeChain
    },

    async isAuthorized(): Promise<boolean> {
      return false;
    },

    async getProvider(): Promise<GlyphProvider | undefined> {
      return undefined;
    },

    async switchChain({ chainId }: { chainId: number }): Promise<Chain> {
      const chain = config.chains.find((c: Chain) => c.id === chainId);
      if (!chain) {
        throw new Error(`Chain ${chainId} not configured`);
      }
      return chain;
    },

    onAccountsChanged(_accounts: string[]) {
      // No-op in fallback
    },

    onChainChanged(_chainIdHex: string) {
      // No-op in fallback
    },

    onDisconnect() {
      // No-op in fallback
    },
  }));
}

// ============================================================
// EXPORTED CONNECTOR
// ============================================================

/**
 * Create a Glyph wallet connector.
 *
 * If @use-glyph/sdk-react is installed, uses the official connector.
 * Otherwise, uses a fallback that prompts installation.
 *
 * @param options - Optional connector configuration
 * @returns Wagmi connector for Glyph wallet
 */
export function glyphConnector(options: GlyphConnectorOptions = {}): CreateConnectorFn {
  // Use official SDK connector if available
  if (officialGlyphConnector) {
    console.log('[glyphConnector] Using official @use-glyph/sdk-react connector');
    return officialGlyphConnector();
  }

  // Fall back to our implementation
  console.log('[glyphConnector] Using fallback connector');
  return createFallbackConnector(options);
}

// ============================================================
// GLYPH PROVIDER SETUP
// ============================================================

/**
 * GlyphProvider configuration types for SDK integration.
 *
 * When using the full SDK, wrap your app with GlyphProvider:
 * ```tsx
 * import { GlyphProvider, StrategyType, WalletClientType } from '@use-glyph/sdk-react';
 *
 * <GlyphProvider
 *   strategy={StrategyType.EIP1193}
 *   walletClientType={WalletClientType.RAINBOWKIT}
 *   askForSignature={true}
 * >
 *   <App />
 * </GlyphProvider>
 * ```
 */
export const GlyphConfig = {
  /** Strategy for wallet connection */
  strategy: 'EIP1193' as const,
  /** Wallet client type for RainbowKit integration */
  walletClientType: 'RAINBOWKIT' as const,
};

// ============================================================
// HELPER TYPES FOR SDK CONSUMERS
// ============================================================

/**
 * Strategy types from @use-glyph/sdk-react.
 * Re-exported for convenience when SDK is installed.
 */
export enum StrategyType {
  EIP1193 = 'EIP1193',
  IFRAME = 'IFRAME',
}

/**
 * Wallet client types from @use-glyph/sdk-react.
 * Re-exported for convenience when SDK is installed.
 */
export enum WalletClientType {
  CONNECTKIT = 'CONNECTKIT',
  RAINBOWKIT = 'RAINBOWKIT',
  PRIVY = 'PRIVY',
  DYNAMIC = 'DYNAMIC',
}

export default glyphConnector;
