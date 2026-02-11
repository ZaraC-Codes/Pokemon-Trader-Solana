/**
 * Solana Hooks - Barrel Export
 *
 * All Solana-specific hooks for the Pokemon Trader frontend.
 * Import from this file for cleaner imports in components.
 */

// ============================================================
// WALLET & CONNECTION
// ============================================================

export { useActiveWallet } from './useActiveWallet';

// ============================================================
// TOKEN BALANCES
// ============================================================

export {
  useSolBallsBalance,
  useSolBalance,
  type TokenBalanceResult,
} from './useSolBallsBalance';

// ============================================================
// GAME HOOKS
// ============================================================

// Pokemon spawns
export {
  usePokemonSpawns,
  usePokemonById,
  usePokemonBySlot,
  type PokemonSpawn,
  type UsePokemonSpawnsReturn,
} from './usePokemonSpawns';

// Player inventory
export {
  usePlayerInventory,
  usePlayerBallCount,
  useHasAnyBalls,
  type UsePlayerInventoryReturn,
} from './usePlayerInventory';

// Purchase balls
export {
  usePurchaseBalls,
  type UsePurchaseBallsReturn,
} from './usePurchaseBalls';

// Throw ball
export {
  useThrowBall,
  type UseThrowBallReturn,
  type ThrowStatus,
  type ThrowResult,
} from './useThrowBall';

// ============================================================
// EVENTS
// ============================================================

export {
  useSolanaEvents,
  useBallPurchasedEvents,
  useCaughtPokemonEvents,
  useFailedCatchEvents,
  usePokemonSpawnedEvents,
  useThrowAttemptedEvents,
  useAllGameEvents,
  type SolanaEvent,
  type SolanaEventName,
  type BallPurchasedArgs,
  type CaughtPokemonArgs,
  type FailedCatchArgs,
  type PokemonSpawnedArgs,
  type PokemonDespawnedArgs,
  type ThrowAttemptedArgs,
  type NftAwardedArgs,
  type EventArgsMap,
  type UseSolanaEventsReturn,
  type AllGameEventsReturn,
} from './useSolanaEvents';

// ============================================================
// CONSTANTS RE-EXPORTS (convenience)
// ============================================================

export {
  type BallType,
  BALL_NAMES,
  DEFAULT_BALL_PRICES,
  DEFAULT_CATCH_RATES,
  MAX_POKEMON_SLOTS,
  SOLBALLS_DECIMALS,
  getBallTypeName,
  getBallPriceDisplay,
  getCatchRatePercent,
} from '../../solana/constants';
