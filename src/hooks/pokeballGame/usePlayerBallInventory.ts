/**
 * usePlayerBallInventory Hook
 *
 * Hook for reading a player's ball inventory from the PokeballGame contract.
 * Returns the count of each ball type owned by the specified address.
 *
 * Usage:
 * ```tsx
 * // Get current user's inventory
 * const { account } = useActiveWeb3React();
 * const {
 *   pokeBalls,
 *   greatBalls,
 *   ultraBalls,
 *   masterBalls,
 *   isLoading,
 *   error,
 *   refetch,
 * } = usePlayerBallInventory(account);
 *
 * // Display inventory
 * <div>
 *   <p>Poké Balls: {pokeBalls}</p>
 *   <p>Great Balls: {greatBalls}</p>
 *   <p>Ultra Balls: {ultraBalls}</p>
 *   <p>Master Balls: {masterBalls}</p>
 * </div>
 *
 * // Refresh after purchase
 * await purchaseBalls(0, 5, false);
 * refetch();
 * ```
 */

import { useMemo, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import {
  POKEBALL_GAME_ADDRESS,
  POKEBALL_GAME_ABI,
  POKEBALL_GAME_CHAIN_ID,
  usePokeballGameAddress,
  type PlayerBallInventory,
} from './pokeballGameConfig';
import { getBallInventoryManager } from '../../game/managers/BallInventoryManager';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface UsePlayerBallInventoryReturn extends PlayerBallInventory {
  /**
   * Total balls across all types.
   */
  totalBalls: number;

  /**
   * Whether the data is currently loading.
   */
  isLoading: boolean;

  /**
   * Error from the contract read, if any.
   */
  error: Error | undefined;

  /**
   * Function to manually refetch inventory.
   */
  refetch: () => void;

  /**
   * Whether the contract is configured.
   */
  isContractConfigured: boolean;
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

/**
 * Hook for reading a player's ball inventory from the contract.
 *
 * @param playerAddress - The player's wallet address to query
 * @returns Object with ball counts, loading state, error, and refetch function
 */
export function usePlayerBallInventory(
  playerAddress: `0x${string}` | undefined
): UsePlayerBallInventoryReturn {
  const { isConfigured } = usePokeballGameAddress();

  // Read player's ball inventory from contract
  const {
    data: rawData,
    isLoading,
    error,
    refetch,
  } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'getAllPlayerBalls',
    args: playerAddress ? [playerAddress] : undefined,
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: isConfigured && !!playerAddress,
      // Refetch every 10 seconds for inventory updates
      refetchInterval: 10000,
    },
  });

  // Debug logging for inventory fetch
  useEffect(() => {
    console.log('[usePlayerBallInventory] Query state:', {
      playerAddress: playerAddress ?? 'undefined',
      contractAddress: POKEBALL_GAME_ADDRESS ?? 'undefined',
      isConfigured,
      enabled: isConfigured && !!playerAddress,
      isLoading,
      rawData: rawData ? `[${(rawData as bigint[]).map(n => n.toString()).join(', ')}]` : 'null',
      error: error?.message ?? 'none',
    });
  }, [playerAddress, isConfigured, isLoading, rawData, error]);

  // Sync to BallInventoryManager singleton (used by Phaser CatchMechanicsManager)
  useEffect(() => {
    if (rawData && !isLoading) {
      const [pokeBalls, greatBalls, ultraBalls, masterBalls] = rawData as readonly [
        bigint,
        bigint,
        bigint,
        bigint
      ];
      const manager = getBallInventoryManager();
      manager.onInventorySynced({
        pokeBalls: Number(pokeBalls),
        greatBalls: Number(greatBalls),
        ultraBalls: Number(ultraBalls),
        masterBalls: Number(masterBalls),
      });
      console.log('[usePlayerBallInventory] Synced to BallInventoryManager singleton');
    }
  }, [rawData, isLoading]);

  // Parse the raw contract data
  const inventory = useMemo((): PlayerBallInventory & { totalBalls: number } => {
    if (!rawData) {
      return {
        pokeBalls: 0,
        greatBalls: 0,
        ultraBalls: 0,
        masterBalls: 0,
        totalBalls: 0,
      };
    }

    // rawData is a tuple: [pokeBalls, greatBalls, ultraBalls, masterBalls]
    const [pokeBalls, greatBalls, ultraBalls, masterBalls] = rawData as readonly [
      bigint,
      bigint,
      bigint,
      bigint
    ];

    const poke = Number(pokeBalls);
    const great = Number(greatBalls);
    const ultra = Number(ultraBalls);
    const master = Number(masterBalls);

    return {
      pokeBalls: poke,
      greatBalls: great,
      ultraBalls: ultra,
      masterBalls: master,
      totalBalls: poke + great + ultra + master,
    };
  }, [rawData]);

  // Return safe defaults if contract not configured or no address
  if (!isConfigured || !playerAddress) {
    return {
      pokeBalls: 0,
      greatBalls: 0,
      ultraBalls: 0,
      masterBalls: 0,
      totalBalls: 0,
      isLoading: false,
      error: undefined,
      refetch: () => {},
      isContractConfigured: isConfigured,
    };
  }

  return {
    ...inventory,
    isLoading,
    error: error as Error | undefined,
    refetch,
    isContractConfigured: isConfigured,
  };
}

/**
 * Hook to get a specific ball type count for a player.
 *
 * @param playerAddress - The player's wallet address
 * @param ballType - The ball type to query (0-3)
 * @returns The count of that ball type
 */
export function usePlayerBallCount(
  playerAddress: `0x${string}` | undefined,
  ballType: 0 | 1 | 2 | 3
): number {
  const inventory = usePlayerBallInventory(playerAddress);

  return useMemo(() => {
    switch (ballType) {
      case 0:
        return inventory.pokeBalls;
      case 1:
        return inventory.greatBalls;
      case 2:
        return inventory.ultraBalls;
      case 3:
        return inventory.masterBalls;
      default:
        return 0;
    }
  }, [inventory, ballType]);
}

/**
 * Hook to check if a player has any balls available to throw.
 *
 * @param playerAddress - The player's wallet address
 * @returns Whether the player has at least one ball of any type
 */
export function useHasAnyBalls(playerAddress: `0x${string}` | undefined): boolean {
  const { totalBalls, isLoading } = usePlayerBallInventory(playerAddress);
  return !isLoading && totalBalls > 0;
}

export default usePlayerBallInventory;
