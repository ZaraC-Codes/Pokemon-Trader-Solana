/**
 * ThirdWeb SDK v5 Configuration
 *
 * Centralized configuration for ThirdWeb client and chain definitions.
 * Uses the new unified thirdweb SDK (v5) that is compatible with ethers v6 and viem.
 *
 * Setup:
 * 1. Get a free client ID at https://thirdweb.com/create-api-key
 * 2. Add VITE_THIRDWEB_CLIENT_ID to your .env file
 */

import { createThirdwebClient } from 'thirdweb';
import { defineChain } from 'thirdweb/chains';

// ============================================================
// CLIENT CONFIGURATION
// ============================================================

const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID;

/**
 * ThirdWeb client instance for browser-side usage.
 * Returns null if VITE_THIRDWEB_CLIENT_ID is not configured.
 */
export const thirdwebClient = clientId
  ? createThirdwebClient({ clientId })
  : null;

/**
 * Check if ThirdWeb is properly configured
 */
export function isThirdwebConfigured(): boolean {
  return !!thirdwebClient;
}

// ============================================================
// CHAIN DEFINITIONS
// ============================================================

/**
 * ApeChain Mainnet chain definition for ThirdWeb SDK v5
 *
 * IMPORTANT: The rpc field is required for ThirdWeb to monitor bridge
 * transaction completion on ApeChain. Without it, the Universal Bridge
 * cannot detect that bridged tokens arrived and gets stuck in a waiting state.
 */
export const apechain = defineChain({
  id: 33139,
  name: 'ApeChain Mainnet',
  rpc: 'https://rpc.apechain.com/http',
  nativeCurrency: {
    name: 'ApeCoin',
    symbol: 'APE',
    decimals: 18,
  },
  blockExplorers: [
    {
      name: 'Apescan',
      url: 'https://apescan.io',
    },
  ],
});

// ============================================================
// TOKEN ADDRESSES
// ============================================================

/**
 * Token contract addresses on ApeChain Mainnet
 *
 * IMPORTANT: On ApeChain, APE is the native gas token.
 * For ERC-20 APE payments, use WAPE (Wrapped APE).
 */
export const APECHAIN_TOKENS = {
  /** Native APE - undefined means native gas token (no contract address) */
  APE: undefined as undefined,
  /** USDC.e (Stargate Bridged) - 6 decimals */
  USDC: '0xF1815bd50389c46847f0Bda824eC8da914045D14' as const,
  /** WAPE (Wrapped APE) - ERC-20 token for APE payments - 18 decimals */
  WAPE: '0x48b62137EdfA95a428D35C09E44256a739F6B557' as const,
  /** @deprecated Use WAPE for ERC-20 APE payments. This was the wrong Ethereum mainnet address. */
  APE_DEPRECATED: '0x4d224452801aced8b2f0aebe155379bb5d594381' as const,
};

/**
 * Token metadata for ThirdWeb PayEmbed prefillBuy configuration.
 * Used to specify destination tokens when funding wallets.
 */
export const APECHAIN_TOKEN_METADATA = {
  /** Native APE token metadata - no address needed for native token */
  APE: {
    symbol: 'APE',
    name: 'ApeCoin',
    // No address for native tokens in ThirdWeb - just pass chain
  },
  /** USDC.e token metadata */
  USDC: {
    address: APECHAIN_TOKENS.USDC,
    symbol: 'USDC.e',
    name: 'USDC.e (Stargate)',
  },
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get ThirdWeb client, throwing if not configured
 */
export function getThirdwebClient() {
  if (!thirdwebClient) {
    throw new Error(
      'ThirdWeb client not configured. Set VITE_THIRDWEB_CLIENT_ID in .env'
    );
  }
  return thirdwebClient;
}

/**
 * Log configuration status (useful for debugging)
 */
export function logThirdwebConfig() {
  if (isThirdwebConfigured()) {
    console.log('[ThirdWeb] Client configured for ApeChain (chainId: 33139)');
  } else {
    console.warn(
      '[ThirdWeb] Not configured. Set VITE_THIRDWEB_CLIENT_ID in .env to enable crypto purchases.'
    );
  }
}
