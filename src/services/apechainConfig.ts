import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  rainbowWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import { mainnet, arbitrum, base, optimism, polygon } from 'wagmi/chains';
import { dGen1Wallet, glyphWallet } from '../connectors/customWallets';
import { logWalletDetectionStatus } from '../utils/walletDetection';

// Log wallet detection status on module load (for debugging)
if (typeof window !== 'undefined') {
  logWalletDetectionStatus();
}

// =============================================================================
// RPC CONFIGURATION - SINGLE STABLE ENDPOINT
// =============================================================================
// Using the OFFICIAL ApeChain public RPC from Caldera (per docs.apechain.com)
// This endpoint is:
// - CORS-enabled (works directly from browser)
// - No rate limits for normal usage
// - No API key required
// - Official and maintained by the ApeChain team
//
// DO NOT add conditional logic or multiple endpoints here.
// If this endpoint fails, we need to fix it at the source, not add fallbacks
// that mask the problem.
// =============================================================================
const PRIMARY_RPC_URL = 'https://rpc.apechain.com/http';

// ApeChain Mainnet configuration
// According to https://docs.apechain.com/contracts/Mainnet/contract-information
// L2 multicall address: 0x411f8A148e448bBe75382d4FFABee0796484f3c6
export const apeChainMainnet = defineChain({
  id: 33139,
  name: 'ApeChain',
  network: 'apechain',
  nativeCurrency: {
    decimals: 18,
    name: 'ApeCoin',
    symbol: 'APE',
  },
  rpcUrls: {
    default: {
      http: [PRIMARY_RPC_URL],
    },
    public: {
      http: [PRIMARY_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'ApeChain Explorer',
      url: 'https://apechain.calderaexplorer.xyz',
    },
    apescan: {
      name: 'Apescan',
      url: 'https://apescan.io',
    },
  },
  contracts: {
    multicall3: {
      // Standard Multicall3 address (deployed at same address on most EVM chains)
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 0, // Unknown, but required
    },
  },
} as const);

/**
 * WalletConnect Project ID for RainbowKit.
 * Get yours at: https://cloud.walletconnect.com/
 */
const WALLETCONNECT_PROJECT_ID = '3508d227dfa70cee7f6b68f4e1da9170';

/**
 * Create connectors with custom wallets at TOP of the wallet picker.
 *
 * Custom Wallets (appear FIRST in the wallet list):
 * 1. Glyph Wallet - Yuga Labs' wallet for ApeChain (social login)
 * 2. dGen1 Wallet - For EthereumPhone devices running ethOS
 *
 * Plus popular wallets (MetaMask, Rainbow, etc.)
 */
const connectors = connectorsForWallets(
  [
    {
      groupName: 'ApeChain Wallets',
      wallets: [glyphWallet, dGen1Wallet],
    },
    {
      groupName: 'Popular Wallets',
      wallets: [
        metaMaskWallet,
        rainbowWallet,
        coinbaseWallet,
        walletConnectWallet,
        injectedWallet,
      ],
    },
  ],
  {
    appName: 'Pokemon Trader',
    projectId: WALLETCONNECT_PROJECT_ID,
  }
);

/**
 * Wagmi + RainbowKit configuration with custom wallet connectors.
 *
 * This uses createConfig (instead of getDefaultConfig) to support
 * custom wallets appearing at the TOP of the wallet picker.
 */
export const config = createConfig({
  connectors,
  // ApeChain is the primary chain; others are included so the ThirdWeb
  // FundingWidget bridge can switch to source chains (Ethereum, Arbitrum, etc.)
  chains: [apeChainMainnet, mainnet, arbitrum, base, optimism, polygon],
  transports: {
    [apeChainMainnet.id]: http(PRIMARY_RPC_URL),
    // Public RPCs for bridge source chains (only used for chain switching)
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
  },
  ssr: false,
});

// Alchemy API key for NFT metadata (using the same key as RPC)
export const ALCHEMY_API_KEY = 'U6nPHGu_q380fQMfQRGcX';
// Export the browser-safe RPC URL (used by wagmi client)
// Note: useTransactionHistory uses Caldera directly for historical queries
export const ALCHEMY_RPC_URL = PRIMARY_RPC_URL;

// OTC Marketplace contract configuration - ApeChain Mainnet
export const CONTRACT_ADDRESSES = {
  OTC_MARKETPLACE: '0xe190E7cA0C7C7438CBaFca49457e1DCeE6c6CdAf',
  NFT_COLLECTION: '0x8a981c2cfdd7fbc65395dd2c02ead94e9a2f65a7', // Pokemon Cards NFT Collection
  ERC20_HANDLER: '0x5027F2e6E8271FeF7811d146Dd3F3319e2C76252',
  ERC721_HANDLER: '0xDcC301eCcCb0B13Bc49B34a756cD650eEb99F036',
  ERC1155_HANDLER: '0xC2448a90829Ca7DC25505Fa884B1602Ce7E3b2E2', // Keep existing if still valid
  NFT_UTILS: '0xA063CB0ffD8907e59b1c74f95F724783eBF8C36b',
  EXECUTOR: '0xcCE466a522984415bC91338c232d98869193D46e',
} as const;
