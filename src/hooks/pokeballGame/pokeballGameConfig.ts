/**
 * PokeballGame Contract Configuration
 *
 * Shared configuration for all PokeballGame hooks.
 * Contains the contract address, ABI, and helper functions.
 *
 * Usage:
 * ```ts
 * import { POKEBALL_GAME_ADDRESS, POKEBALL_GAME_ABI, usePokeballGameAddress } from './pokeballGameConfig';
 *
 * const { address, isConfigured } = usePokeballGameAddress();
 * if (!isConfigured) {
 *   return <div>Contract not configured</div>;
 * }
 * ```
 */

import { useMemo } from 'react';
import { apeChainMainnet } from '../../services/apechainConfig';
// v1.9.0 ABI with admin spawn control functions
// v1.9.0: Adds repositionPokemon(), despawnPokemon(), setMaxActivePokemon(), getEffectiveMaxActivePokemon()
// v1.8.0: APE reserves, gasless relay via throwBallFor()
// v1.8.0: Revenue split: 3% treasury, 95% NFT pool, 1% PokeballGame APE reserve, 1% SlabNFTManager APE reserve
import PokeballGameABI from '../../../contracts/abi/abi_PokeballGameV9.json';

// ============================================================
// CONTRACT ADDRESS
// ============================================================

/**
 * PokeballGame contract address on ApeChain.
 *
 * Loaded from VITE_POKEBALL_GAME_ADDRESS environment variable.
 * (Vite uses VITE_ prefix, not REACT_APP_ like Create React App)
 *
 * Set in .env file:
 * ```
 * VITE_POKEBALL_GAME_ADDRESS=0x...
 * ```
 */
export const POKEBALL_GAME_ADDRESS = import.meta.env.VITE_POKEBALL_GAME_ADDRESS as `0x${string}` | undefined;

// ============================================================
// CONTRACT ABI
// ============================================================

/**
 * Full PokeballGame ABI imported from contracts/abi/abi_PokeballGameV9.json.
 * The JSON file is an array directly (not { abi: [...] }), so we use it as-is.
 * Type assertion ensures Wagmi type inference works correctly.
 *
 * v1.9.0 ABI includes (adds to v1.8.0):
 * - repositionPokemon(slot, newPosX, newPosY) - move Pokemon to new position (owner only)
 * - despawnPokemon(slot) - remove Pokemon from slot (owner only)
 * - setMaxActivePokemon(newMax) - set max active Pokemon (owner only)
 * - getEffectiveMaxActivePokemon() - get current max active Pokemon
 *
 * v1.8.0 ABI includes:
 * - depositAPEReserve() PAYABLE - deposit APE to contract reserve
 * - totalAPEReserve() - view current APE reserve
 * - getAPEReserve() - alias for totalAPEReserve()
 * - throwBallFor(player, slot, ballType, nonce, signature) - gasless throw
 * - setRelayer(address) - set authorized relayer (owner only)
 * - getPlayerNonce(player) - get player's current nonce for gasless throws
 * - Revenue split: 3% treasury, 95% NFT pool, 1% PokeballGame APE, 1% SlabNFTManager APE
 */
export const POKEBALL_GAME_ABI = PokeballGameABI as typeof PokeballGameABI;

// Startup diagnostic - verify ABI loaded correctly
console.log('[pokeballGameConfig] ABI loaded, entry count:', POKEBALL_GAME_ABI?.length ?? 'undefined');
console.log('[pokeballGameConfig] Contract address:', POKEBALL_GAME_ADDRESS ?? 'NOT SET');
if (!Array.isArray(POKEBALL_GAME_ABI) || POKEBALL_GAME_ABI.length === 0) {
  console.error('[pokeballGameConfig] ERROR: ABI is not a valid array! Check import.');
}

// ============================================================
// CHAIN CONFIG
// ============================================================

/**
 * ApeChain Mainnet chain ID for all contract interactions.
 */
export const POKEBALL_GAME_CHAIN_ID = apeChainMainnet.id;

/**
 * Maximum number of active Pokemon slots in v1.2.0.
 * Contract returns a tuple[20] from getAllActivePokemons().
 */
export const MAX_ACTIVE_POKEMON = 20;

// ============================================================
// RELATED CONTRACT ADDRESSES
// ============================================================

/**
 * Token addresses used by PokeballGame contract.
 *
 * CONTRACT v1.4.0 PAYMENT METHODS:
 * - APE: Uses NATIVE APE via msg.value (like ETH on Ethereum). No approval needed!
 * - USDC.e: Uses ERC-20 transferFrom. Requires approval.
 *
 * USDC.e is the bridged USDC from Stargate.
 */
export const RELATED_CONTRACTS = {
  /** USDC.e token address (6 decimals) - requires ERC-20 approval */
  USDC: '0xF1815bd50389c46847f0Bda824eC8da914045D14' as `0x${string}`,
  /**
   * @deprecated v1.4.0 uses native APE via msg.value. WAPE is no longer used.
   * Kept for backwards compatibility reference only.
   */
  WAPE: '0x48b62137EdfA95a428D35C09E44256a739F6B557' as `0x${string}`,
  /** Slab NFT contract address */
  SLAB_NFT: '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7' as `0x${string}`,
};

/**
 * Token decimals for price calculations.
 */
export const TOKEN_DECIMALS = {
  USDC: 6,
  APE: 18,
};

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/**
 * Ball type enum matching the contract's BallType enum.
 * 0 = PokeBall ($1, 2% catch rate)
 * 1 = Great Ball ($10, 20% catch rate)
 * 2 = Ultra Ball ($25, 50% catch rate)
 * 3 = Master Ball ($49.90, 99% catch rate)
 */
export type BallType = 0 | 1 | 2 | 3;

/**
 * Pokemon spawn data returned from contract.
 */
export interface PokemonSpawnData {
  id: bigint;
  positionX: bigint;
  positionY: bigint;
  throwAttempts: number;
  isActive: boolean;
  spawnTime: bigint;
}

/**
 * Pending throw data from contract.
 */
export interface PendingThrowData {
  thrower: `0x${string}`;
  pokemonId: bigint;
  ballType: BallType;
  timestamp: bigint;
  resolved: boolean;
}

/**
 * Player ball inventory counts.
 */
export interface PlayerBallInventory {
  pokeBalls: number;
  greatBalls: number;
  ultraBalls: number;
  masterBalls: number;
}

/**
 * Event names supported by useContractEvents hook.
 */
export type PokeballGameEventName =
  | 'BallPurchased'
  | 'CaughtPokemon'
  | 'FailedCatch'
  | 'PokemonRelocated'
  | 'PokemonSpawned'
  | 'ThrowAttempted'
  | 'RevenueSentToManager'
  | 'WalletUpdated';

// ============================================================
// HELPER HOOKS
// ============================================================

/**
 * Hook to check if the PokeballGame contract address is configured.
 *
 * Usage:
 * ```ts
 * const { address, isConfigured } = usePokeballGameAddress();
 * if (!isConfigured) {
 *   console.warn('PokeballGame contract not configured');
 * }
 * ```
 *
 * @returns Object with address and isConfigured boolean
 */
export function usePokeballGameAddress(): {
  address: `0x${string}` | undefined;
  isConfigured: boolean;
} {
  return useMemo(
    () => ({
      address: POKEBALL_GAME_ADDRESS,
      isConfigured: !!POKEBALL_GAME_ADDRESS,
    }),
    []
  );
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get ball type name for display.
 *
 * @param ballType - Ball type (0-3)
 * @returns Human-readable ball name
 */
export function getBallTypeName(ballType: BallType): string {
  const names: Record<BallType, string> = {
    0: 'Poké Ball',
    1: 'Great Ball',
    2: 'Ultra Ball',
    3: 'Master Ball',
  };
  return names[ballType] ?? 'Unknown Ball';
}

/**
 * Get ball price in USD (for display purposes).
 * Note: Actual prices come from the contract.
 *
 * @param ballType - Ball type (0-3)
 * @returns Price in USD
 */
export function getBallPriceUSD(ballType: BallType): number {
  const prices: Record<BallType, number> = {
    0: 1.0,
    1: 10.0,
    2: 25.0,
    3: 49.9,
  };
  return prices[ballType] ?? 0;
}

/**
 * Get catch rate percentage for display.
 *
 * @param ballType - Ball type (0-3)
 * @returns Catch rate as percentage (e.g., 2 for 2%)
 */
export function getCatchRatePercent(ballType: BallType): number {
  const rates: Record<BallType, number> = {
    0: 2,
    1: 20,
    2: 50,
    3: 99,
  };
  return rates[ballType] ?? 0;
}
