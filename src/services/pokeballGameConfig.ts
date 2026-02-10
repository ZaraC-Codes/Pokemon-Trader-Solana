/**
 * PokeballGame Centralized Configuration
 *
 * This file provides a single source of truth for all PokeballGame-related
 * on-chain configuration. It consolidates settings that were previously
 * scattered across multiple hooks and components.
 *
 * Architecture:
 * - Chain config: ApeChain Mainnet (ID 33139)
 * - Contract: PokeballGame proxy (UUPS upgradeable)
 * - Tokens: APE (native) and USDC.e (Stargate bridged)
 * - Randomness: Pyth Entropy for provably fair catch mechanics (v1.8.0)
 *   - throwBall() requires ~0.073 APE fee for entropy callback
 *   - On catch success, reuses random number to select random NFT from inventory
 * - APE Reserves: v1.8.0 adds contract APE reserves for gas-free operations
 *   - Revenue split: 3% treasury, 95% NFT pool, 1% PokeballGame APE, 1% SlabNFTManager APE
 * - Gasless Throws: v1.8.0 adds throwBallFor() for relayer-paid transactions
 *
 * Usage:
 * ```ts
 * import { pokeballGameConfig, isPokeballGameConfigured } from './pokeballGameConfig';
 *
 * // Check if contract is configured
 * if (!isPokeballGameConfigured()) {
 *   console.warn('Set VITE_POKEBALL_GAME_ADDRESS in .env');
 * }
 *
 * // Access config values
 * const { chainId, explorerUrl, tokenAddresses } = pokeballGameConfig;
 * ```
 */

import { apeChainMainnet, ALCHEMY_RPC_URL } from './apechainConfig';
// Use V9 ABI with admin spawn control functions (v1.9.0)
// v1.9.0: Adds repositionPokemon(), despawnPokemon(), setMaxActivePokemon(), getEffectiveMaxActivePokemon()
// v1.8.0: APE reserves, gasless relay via throwBallFor()
// v1.8.0: Revenue split: 3% treasury, 95% NFT pool, 1% PokeballGame APE, 1% SlabNFTManager APE
// Must be a raw array, not a Hardhat artifact object
import PokeballGameABI from '../../contracts/abi/abi_PokeballGameV9.json';

// ============================================================
// CHAIN CONFIGURATION
// ============================================================

/**
 * ApeChain Mainnet chain ID.
 * Used for all PokeballGame contract interactions.
 *
 * @see https://docs.apechain.com/
 */
export const APECHAIN_CHAIN_ID = 33139 as const;

/**
 * Primary RPC URL for ApeChain.
 * Uses Alchemy endpoint via existing apechainConfig.
 *
 * In development: Proxied through Vite dev server to avoid CORS
 * In production: Direct Alchemy endpoint
 *
 * Alternative public RPCs:
 * - https://apechain.calderachain.xyz/http
 * - https://apechain.drpc.org
 */
export const APECHAIN_RPC_URL = ALCHEMY_RPC_URL;

/**
 * Alternative public RPC URL (no rate limiting, but may be slower).
 * Use as fallback if Alchemy rate limits are hit.
 */
export const APECHAIN_PUBLIC_RPC_URL = 'https://apechain.calderachain.xyz/http' as const;

/**
 * Block explorer URL for viewing transactions and contracts.
 * Apescan is the primary explorer for ApeChain.
 */
export const APECHAIN_EXPLORER_URL = 'https://apescan.io' as const;

// ============================================================
// CONTRACT CONFIGURATION
// ============================================================

/**
 * PokeballGame contract address on ApeChain.
 *
 * Loaded from VITE_POKEBALL_GAME_ADDRESS environment variable.
 * This is the UUPS proxy address - implementation can be upgraded.
 *
 * Set in .env file:
 * ```
 * VITE_POKEBALL_GAME_ADDRESS=0xYourPokeballGameProxy
 * ```
 */
export const POKEBALL_GAME_ADDRESS = import.meta.env.VITE_POKEBALL_GAME_ADDRESS as
  | `0x${string}`
  | undefined;

/**
 * PokeballGame contract ABI (v1.9.0 with admin spawn control).
 * Imported from contracts/abi/abi_PokeballGameV9.json.
 * Note: The JSON file is an array directly (not { abi: [...] }).
 *
 * Key functions:
 * - purchaseBallsWithAPE(ballType, quantity) - Buy balls with native APE
 * - purchaseBallsWithUSDC(ballType, quantity) - Buy balls with USDC.e
 * - throwBall(pokemonSlot, ballType) - Attempt catch (PAYABLE, requires Entropy fee)
 * - throwBallFor(player, slot, ballType, nonce, sig) - Gasless throw via relayer
 * - getThrowFee() - Get current Pyth Entropy fee for throwBall
 * - depositAPEReserve() - Deposit APE to contract reserve (PAYABLE)
 * - totalAPEReserve() - View current APE reserve balance
 * - getAllPlayerBalls(player) - Get player inventory
 * - getAllActivePokemons() - Get spawned Pokemon
 *
 * v1.9.0 Changes (Admin Spawn Control):
 * - repositionPokemon(slot, newPosX, newPosY) - Move existing Pokemon to new position (owner only)
 * - despawnPokemon(slot) - Remove Pokemon from slot (owner only)
 * - setMaxActivePokemon(newMax) - Set max active Pokemon (owner only)
 * - getEffectiveMaxActivePokemon() - Get current max active Pokemon
 *
 * v1.8.0 Changes:
 * - APE reserves for entropy fees and gas operations
 * - Revenue split: 3% treasury, 95% NFT pool, 1% PokeballGame APE, 1% SlabNFTManager APE
 * - Gasless throws via throwBallFor() with EIP-712 signatures
 */
export const POKEBALL_GAME_ABI = PokeballGameABI as typeof PokeballGameABI;

// ============================================================
// TOKEN ADDRESSES
// ============================================================

/**
 * Token contract addresses on ApeChain Mainnet.
 *
 * CONTRACT v1.4.0 PAYMENT METHODS:
 * - APE: Uses NATIVE APE via msg.value (like ETH on Ethereum). NO approval needed!
 * - USDC.e: Uses ERC-20 transferFrom. Requires approval.
 *
 * USDC.e is the Stargate Bridged USDC from Ethereum.
 * Both tokens are accepted for ball purchases in PokeballGame.
 * 97% of revenue goes to SlabNFTManager, 3% platform fee to treasury.
 */
export const TOKEN_ADDRESSES = {
  /**
   * @deprecated v1.4.0 uses native APE via msg.value. WAPE is no longer used.
   * Kept for backwards compatibility reference only.
   */
  WAPE: '0x48b62137EdfA95a428D35C09E44256a739F6B557' as const,

  /**
   * USDC.e - Stargate Bridged USDC from Ethereum.
   * 6 decimals. Requires ERC-20 approval before purchase.
   */
  USDC: '0xF1815bd50389c46847f0Bda824eC8da914045D14' as const,
} as const;

/**
 * Token decimals for balance formatting.
 */
export const TOKEN_DECIMALS = {
  WAPE: 18,
  APE: 18, // Alias for backwards compatibility
  USDC: 6,
} as const;

// ============================================================
// RELATED CONTRACT ADDRESSES
// ============================================================

/**
 * Additional contract addresses used by the PokeballGame ecosystem.
 * These are referenced by PokeballGame and SlabNFTManager.
 */
export const RELATED_CONTRACTS = {
  /**
   * SlabMachine contract - Source for NFT purchases.
   * SlabNFTManager calls this to buy NFTs when threshold is met.
   */
  SLAB_MACHINE: '0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466' as const,

  /**
   * Slab NFT Collection - Pokemon card NFTs awarded to catchers.
   */
  SLAB_NFT: '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7' as const,

  /**
   * Pyth Entropy - On-chain verifiable randomness (v1.6.0).
   * Used for provably fair catch mechanics.
   * No whitelist required - permissionless!
   */
  PYTH_ENTROPY: '0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320' as const,

  /**
   * Pyth Entropy Provider - Randomness provider address.
   */
  PYTH_ENTROPY_PROVIDER: '0x52DeaA1c84233F7bb8C8A45baeDE41091c616506' as const,

  /**
   * @deprecated v1.6.0 uses Pyth Entropy instead of POP VRNG.
   * POP VRNG required whitelist which caused InvalidCaller errors.
   */
  POP_VRNG_DEPRECATED: '0x9eC728Fce50c77e0BeF7d34F1ab28a46409b7aF1' as const,
} as const;

// ============================================================
// BALL CONFIGURATION
// ============================================================

/**
 * Ball type enum matching the contract's BallType enum.
 */
export type BallType = 0 | 1 | 2 | 3;

/**
 * Ball configuration with prices and catch rates.
 * Matches PokeballGame contract constants.
 */
export const BALL_CONFIG = {
  0: { name: 'Poké Ball', price: 1.0, catchRate: 2, color: '#ff4444' },
  1: { name: 'Great Ball', price: 10.0, catchRate: 20, color: '#4488ff' },
  2: { name: 'Ultra Ball', price: 25.0, catchRate: 50, color: '#ffcc00' },
  3: { name: 'Master Ball', price: 49.9, catchRate: 99, color: '#aa44ff' },
} as const;

// ============================================================
// GAME CONSTANTS
// ============================================================

/**
 * Game mechanics constants matching contract values.
 */
export const GAME_CONSTANTS = {
  /** Maximum concurrent Pokemon spawns */
  MAX_ACTIVE_SPAWNS: 3,
  /** Maximum throw attempts before Pokemon relocates */
  MAX_ATTEMPTS: 3,
  /** Catch interaction range in pixels (frontend only) */
  CATCH_RANGE_PIXELS: 48,
} as const;

// ============================================================
// CONSOLIDATED CONFIG OBJECT
// ============================================================

/**
 * Centralized configuration object for PokeballGame integration.
 *
 * Usage:
 * ```ts
 * import { pokeballGameConfig } from './pokeballGameConfig';
 *
 * const { chainId, explorerUrl, abi } = pokeballGameConfig;
 * ```
 */
export const pokeballGameConfig = {
  /** ApeChain Mainnet chain ID */
  chainId: APECHAIN_CHAIN_ID,

  /** Primary RPC URL (Alchemy) */
  rpcUrl: APECHAIN_RPC_URL,

  /** Public fallback RPC URL */
  publicRpcUrl: APECHAIN_PUBLIC_RPC_URL,

  /** Block explorer URL (Apescan) */
  explorerUrl: APECHAIN_EXPLORER_URL,

  /** PokeballGame proxy address (from env) */
  pokeballGameAddress: POKEBALL_GAME_ADDRESS,

  /** PokeballGame ABI */
  abi: POKEBALL_GAME_ABI,

  /** Token addresses (APE, USDC) */
  tokenAddresses: TOKEN_ADDRESSES,

  /** Token decimals */
  tokenDecimals: TOKEN_DECIMALS,

  /** Related ecosystem contracts */
  relatedContracts: RELATED_CONTRACTS,

  /** Ball type configuration */
  ballConfig: BALL_CONFIG,

  /** Game mechanics constants */
  gameConstants: GAME_CONSTANTS,

  /** Viem chain definition for Wagmi */
  chain: apeChainMainnet,
} as const;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Check if PokeballGame contract is properly configured.
 *
 * @returns true if VITE_POKEBALL_GAME_ADDRESS is set
 */
export function isPokeballGameConfigured(): boolean {
  return !!POKEBALL_GAME_ADDRESS;
}

/**
 * Get Apescan URL for a transaction hash.
 *
 * @param txHash - Transaction hash
 * @returns Full Apescan URL
 */
export function getTransactionUrl(txHash: string): string {
  return `${APECHAIN_EXPLORER_URL}/tx/${txHash}`;
}

/**
 * Get Apescan URL for a contract address.
 *
 * @param address - Contract or wallet address
 * @returns Full Apescan URL
 */
export function getAddressUrl(address: string): string {
  return `${APECHAIN_EXPLORER_URL}/address/${address}`;
}

/**
 * Get Apescan URL for an NFT token.
 *
 * @param contractAddress - NFT contract address
 * @param tokenId - Token ID
 * @returns Full Apescan URL
 */
export function getNftUrl(contractAddress: string, tokenId: string | number | bigint): string {
  return `${APECHAIN_EXPLORER_URL}/nft/${contractAddress}/${tokenId}`;
}

/**
 * Get ball configuration by type.
 *
 * @param ballType - Ball type (0-3)
 * @returns Ball config object or undefined
 */
export function getBallConfig(ballType: BallType) {
  return BALL_CONFIG[ballType];
}

// Type exports for external use
export type { BallType as PokeballGameBallType };
export type PokeballGameConfig = typeof pokeballGameConfig;
