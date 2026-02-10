/**
 * SlabNFTManager Centralized Configuration
 *
 * This file provides a single source of truth for all SlabNFTManager-related
 * on-chain configuration. It mirrors the pattern used by pokeballGameConfig.ts.
 *
 * Architecture:
 * - Chain config: ApeChain Mainnet (ID 33139)
 * - Contract: SlabNFTManager proxy (UUPS upgradeable)
 * - Manages NFT inventory and auto-purchasing from SlabMachine
 * - v2.4.0: APE reserves for Entropy fees and auto-purchase loop
 *
 * Usage:
 * ```ts
 * import { slabNFTManagerConfig, SLAB_NFT_MANAGER_ADDRESS } from './slabNFTManagerConfig';
 *
 * // Access config values
 * const { abi, address } = slabNFTManagerConfig;
 * ```
 */

import { apeChainMainnet } from './apechainConfig';
// v2.4.0 ABI with APE reserves and auto-purchase loop
import SlabNFTManagerABI from '../../contracts/abi/abi_SlabNFTManagerV2_4.json';

// ============================================================
// CONTRACT ADDRESSES
// ============================================================

/**
 * SlabNFTManager proxy address on ApeChain Mainnet.
 * This is the UUPS proxy address - implementation can be upgraded.
 */
export const SLAB_NFT_MANAGER_ADDRESS = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71' as const;

/**
 * SlabNFTManager ABI (v2.4.0 with APE reserves and auto-purchase loop).
 * Imported from contracts/abi/abi_SlabNFTManagerV2_4.json.
 *
 * Key functions:
 * - depositRevenue(amount) - Receive USDC.e from PokeballGame
 * - checkAndPurchaseNFT() - Trigger auto-purchase loop if threshold met
 * - awardNFTToWinner(winner) - Transfer NFT to winner (legacy)
 * - awardNFTToWinnerWithRandomness(winner, randomNumber) - Random NFT selection
 * - getInventoryCount() - Get current NFT count
 * - getInventory() - Get all NFT token IDs
 * - canAutoPurchase() - Check if auto-purchase is possible (balance >= threshold)
 * - depositAPEReserve() - Receive APE for Entropy fees (v2.4.0)
 * - apeReserve() - View current APE reserve balance (v2.4.0)
 * - totalAPEReceived() - View total APE received from PokeballGame (v2.4.0)
 */
export const SLAB_NFT_MANAGER_ABI = SlabNFTManagerABI as typeof SlabNFTManagerABI;

// Startup diagnostic
console.log('[slabNFTManagerConfig] ABI loaded, entry count:', SLAB_NFT_MANAGER_ABI?.length ?? 'undefined');
console.log('[slabNFTManagerConfig] Contract address:', SLAB_NFT_MANAGER_ADDRESS);

// ============================================================
// RELATED CONTRACT ADDRESSES
// ============================================================

/**
 * Related contracts used by SlabNFTManager.
 */
export const SLAB_RELATED_CONTRACTS = {
  /** SlabMachine contract - Source for NFT purchases */
  SLAB_MACHINE: '0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466' as const,
  /** Slab NFT Collection - Pokemon card NFTs */
  SLAB_NFT: '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7' as const,
  /** USDC.e token address (6 decimals) */
  USDC: '0xF1815bd50389c46847f0Bda824eC8da914045D14' as const,
  /** Pyth Entropy for random NFT selection */
  PYTH_ENTROPY: '0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320' as const,
  /** Pyth Entropy Provider */
  PYTH_ENTROPY_PROVIDER: '0x52DeaA1c84233F7bb8C8A45baeDE41091c616506' as const,
} as const;

// ============================================================
// CONSTANTS
// ============================================================

/**
 * SlabNFTManager constants matching contract values.
 */
export const SLAB_CONSTANTS = {
  /** Maximum NFTs that can be held in inventory */
  MAX_INVENTORY_SIZE: 20,
  /** USDC.e threshold for auto-purchase trigger ($51) */
  AUTO_PURCHASE_THRESHOLD_USDC: 51_000_000n, // 6 decimals
  /** Cost per NFT pull from SlabMachine (~$51) */
  PULL_PRICE_USDC: 51_000_000n, // 6 decimals
  /** Minimum APE reserve to maintain for healthy operations */
  MIN_APE_RESERVE: 500_000_000_000_000_000n, // 0.5 APE in wei
} as const;

// ============================================================
// CONSOLIDATED CONFIG OBJECT
// ============================================================

/**
 * Centralized configuration object for SlabNFTManager integration.
 */
export const slabNFTManagerConfig = {
  /** SlabNFTManager proxy address */
  address: SLAB_NFT_MANAGER_ADDRESS,
  /** SlabNFTManager ABI (v2.4.0) */
  abi: SLAB_NFT_MANAGER_ABI,
  /** ApeChain Mainnet chain ID */
  chainId: apeChainMainnet.id,
  /** Viem chain definition */
  chain: apeChainMainnet,
  /** Related ecosystem contracts */
  relatedContracts: SLAB_RELATED_CONTRACTS,
  /** Contract constants */
  constants: SLAB_CONSTANTS,
} as const;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Check if SlabNFTManager is configured (always true since address is hardcoded).
 */
export function isSlabNFTManagerConfigured(): boolean {
  return !!SLAB_NFT_MANAGER_ADDRESS;
}

/**
 * Format APE reserve status for display.
 *
 * @param reserveWei - APE reserve in wei
 * @returns Formatted status object
 */
export function getApeReserveStatus(reserveWei: bigint): {
  formattedAmount: string;
  isHealthy: boolean;
  status: 'healthy' | 'low' | 'critical';
  throwsRemaining: number;
} {
  const MIN_RESERVE = SLAB_CONSTANTS.MIN_APE_RESERVE;
  const ENTROPY_FEE_APPROX = 73_000_000_000_000_000n; // ~0.073 APE

  const formattedAmount = (Number(reserveWei) / 1e18).toFixed(4);
  const isHealthy = reserveWei >= MIN_RESERVE;
  const throwsRemaining = Math.floor(Number(reserveWei) / Number(ENTROPY_FEE_APPROX));

  let status: 'healthy' | 'low' | 'critical';
  if (reserveWei >= MIN_RESERVE) {
    status = 'healthy';
  } else if (reserveWei >= MIN_RESERVE / 2n) {
    status = 'low';
  } else {
    status = 'critical';
  }

  return { formattedAmount, isHealthy, status, throwsRemaining };
}

/**
 * Format USDC.e balance status for auto-purchase eligibility.
 *
 * @param balanceUsdc - USDC.e balance (6 decimals)
 * @returns Formatted status object
 */
export function getUsdcPoolStatus(balanceUsdc: bigint): {
  formattedAmount: string;
  canAutoPurchase: boolean;
  status: 'eligible' | 'blocked';
  purchasesAvailable: number;
} {
  const THRESHOLD = SLAB_CONSTANTS.AUTO_PURCHASE_THRESHOLD_USDC;
  const PULL_PRICE = SLAB_CONSTANTS.PULL_PRICE_USDC;

  const formattedAmount = (Number(balanceUsdc) / 1e6).toFixed(2);
  const canAutoPurchase = balanceUsdc >= THRESHOLD;
  const purchasesAvailable = Math.floor(Number(balanceUsdc) / Number(PULL_PRICE));
  const status = canAutoPurchase ? 'eligible' : 'blocked';

  return { formattedAmount, canAutoPurchase, status, purchasesAvailable };
}

// Type exports
export type SlabNFTManagerConfig = typeof slabNFTManagerConfig;
