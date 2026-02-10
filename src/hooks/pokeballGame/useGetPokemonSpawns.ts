/**
 * useGetPokemonSpawns Hook
 *
 * Hook for reading the current active Pokemon spawns from the PokeballGame contract v1.2.0.
 * Returns up to 20 Pokemon that players can attempt to catch.
 *
 * Usage:
 * ```tsx
 * const {
 *   data,
 *   allSlots,
 *   activeCount,
 *   activeSlotIndices,
 *   isLoading,
 *   error,
 *   refetch,
 * } = useGetPokemonSpawns();
 *
 * // Display active Pokemon
 * {data?.map((pokemon) => (
 *   <div key={pokemon.id.toString()}>
 *     Pokemon #{pokemon.id.toString()} at ({pokemon.x}, {pokemon.y})
 *     Slot: {pokemon.slotIndex}, Attempts: {pokemon.attemptCount}/3
 *   </div>
 * ))}
 *
 * // Refresh spawns after a catch attempt
 * const handleCatch = async () => {
 *   await throwBall();
 *   refetch();
 * };
 * ```
 */

import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import {
  POKEBALL_GAME_ADDRESS,
  POKEBALL_GAME_ABI,
  POKEBALL_GAME_CHAIN_ID,
  MAX_ACTIVE_POKEMON,
  usePokeballGameAddress,
} from './pokeballGameConfig';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/**
 * Parsed Pokemon spawn data for UI consumption.
 */
export interface PokemonSpawn {
  /** Unique Pokemon ID from contract */
  id: bigint;
  /** X coordinate in game world (pixels) */
  x: number;
  /** Y coordinate in game world (pixels) */
  y: number;
  /** Number of throw attempts made (0-3) */
  attemptCount: number;
  /** Whether this spawn slot is currently active */
  isActive: boolean;
  /** Spawn timestamp (Unix seconds) */
  spawnTime: bigint;
  /** Slot index in the contract (0-2) */
  slotIndex: number;
}

export interface UseGetPokemonSpawnsReturn {
  /**
   * Array of active Pokemon spawns (only includes isActive=true).
   * Empty array if no spawns or contract not configured.
   */
  data: PokemonSpawn[] | undefined;

  /**
   * All 20 spawn slots (including inactive).
   * Useful for debugging or showing all slots.
   */
  allSlots: PokemonSpawn[] | undefined;

  /**
   * Number of currently active Pokemon (from getActivePokemonCount).
   */
  activeCount: number;

  /**
   * Array of slot indices that have active Pokemon (from getActivePokemonSlots).
   */
  activeSlotIndices: number[];

  /**
   * Whether the data is currently loading.
   */
  isLoading: boolean;

  /**
   * Error from the contract read, if any.
   */
  error: Error | undefined;

  /**
   * Function to manually refetch spawn data.
   */
  refetch: () => void;
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

/**
 * Hook for reading active Pokemon spawns from the contract v1.2.0.
 * Now supports up to 20 Pokemon slots with helper functions.
 *
 * @returns Object with spawn data, counts, slot indices, loading state, error, and refetch function
 */
export function useGetPokemonSpawns(): UseGetPokemonSpawnsReturn {
  const { isConfigured } = usePokeballGameAddress();

  // Batch read all three functions in a single multicall
  const {
    data: results,
    isLoading,
    error,
    refetch,
  } = useReadContracts({
    contracts: [
      {
        address: POKEBALL_GAME_ADDRESS,
        abi: POKEBALL_GAME_ABI,
        functionName: 'getAllActivePokemons',
        chainId: POKEBALL_GAME_CHAIN_ID,
      },
      {
        address: POKEBALL_GAME_ADDRESS,
        abi: POKEBALL_GAME_ABI,
        functionName: 'getActivePokemonCount',
        chainId: POKEBALL_GAME_CHAIN_ID,
      },
      {
        address: POKEBALL_GAME_ADDRESS,
        abi: POKEBALL_GAME_ABI,
        functionName: 'getActivePokemonSlots',
        chainId: POKEBALL_GAME_CHAIN_ID,
      },
    ],
    query: {
      enabled: isConfigured,
      // Poll every 5 seconds for spawn updates
      refetchInterval: 5000,
    },
  });

  // Parse and transform the raw contract data
  const { allSlots, activeSpawns, activeCount, activeSlotIndices } = useMemo(() => {
    // === DIAGNOSTIC LOGGING START ===
    console.log('[useGetPokemonSpawns] ========== useMemo recalculating ==========');
    console.log('[useGetPokemonSpawns] results defined:', !!results);

    if (!results) {
      console.log('[useGetPokemonSpawns] No results yet, returning undefined');
      return {
        allSlots: undefined,
        activeSpawns: undefined,
        activeCount: 0,
        activeSlotIndices: [],
      };
    }

    // Extract results from multicall
    const [pokemonsResult, countResult, slotsResult] = results;

    console.log('[useGetPokemonSpawns] pokemonsResult status:', pokemonsResult?.status);
    console.log('[useGetPokemonSpawns] countResult status:', countResult?.status);
    console.log('[useGetPokemonSpawns] slotsResult status:', slotsResult?.status);

    // Parse active count (uint8)
    const count = countResult.status === 'success' ? Number(countResult.result as number) : 0;
    console.log('[useGetPokemonSpawns] Parsed activeCount:', count);

    // Parse active slot indices (uint8[])
    const slotIndices =
      slotsResult.status === 'success'
        ? (slotsResult.result as readonly number[]).map(Number)
        : [];
    console.log('[useGetPokemonSpawns] Parsed slotIndices:', slotIndices);

    // Parse Pokemon array (tuple[20])
    if (pokemonsResult.status !== 'success') {
      console.warn('[useGetPokemonSpawns] pokemonsResult failed:', pokemonsResult.error);
      return {
        allSlots: undefined,
        activeSpawns: undefined,
        activeCount: count,
        activeSlotIndices: slotIndices,
      };
    }

    // rawData is a 20-element tuple array of Pokemon structs
    const pokemons = pokemonsResult.result as readonly {
      id: bigint;
      positionX: bigint;
      positionY: bigint;
      throwAttempts: number;
      isActive: boolean;
      spawnTime: bigint;
    }[];

    console.log('[useGetPokemonSpawns] Raw pokemons array length:', pokemons?.length);

    // Log first 3 raw pokemon for debugging
    for (let i = 0; i < Math.min(3, pokemons?.length ?? 0); i++) {
      const p = pokemons[i];
      console.log(`[useGetPokemonSpawns] Raw pokemon[${i}]:`, {
        id: p.id?.toString(),
        positionX: p.positionX?.toString(),
        positionY: p.positionY?.toString(),
        throwAttempts: p.throwAttempts,
        isActive: p.isActive,
        spawnTime: p.spawnTime?.toString(),
      });
    }

    const all: PokemonSpawn[] = pokemons.map((pokemon, index) => ({
      id: pokemon.id,
      x: Number(pokemon.positionX),
      y: Number(pokemon.positionY),
      attemptCount: pokemon.throwAttempts,
      isActive: pokemon.isActive,
      spawnTime: pokemon.spawnTime,
      slotIndex: index,
    }));

    const active = all.filter((pokemon) => pokemon.isActive);

    console.log('[useGetPokemonSpawns] Parsed all slots:', all.length);
    console.log('[useGetPokemonSpawns] Parsed active spawns:', active.length);

    // Log first 3 active spawns
    for (let i = 0; i < Math.min(3, active.length); i++) {
      const s = active[i];
      console.log(`[useGetPokemonSpawns] Active spawn[${i}]:`, {
        id: s.id?.toString(),
        slotIndex: s.slotIndex,
        x: s.x,
        y: s.y,
        isActive: s.isActive,
      });
    }

    console.log('[useGetPokemonSpawns] ==========================================');

    return {
      allSlots: all,
      activeSpawns: active,
      activeCount: count,
      activeSlotIndices: slotIndices,
    };
  }, [results]);

  // Return safe defaults if contract not configured
  if (!isConfigured) {
    return {
      data: undefined,
      allSlots: undefined,
      activeCount: 0,
      activeSlotIndices: [],
      isLoading: false,
      error: undefined,
      refetch: () => {},
    };
  }

  return {
    data: activeSpawns,
    allSlots,
    activeCount,
    activeSlotIndices,
    isLoading,
    error: error as Error | undefined,
    refetch,
  };
}

/**
 * Hook to get a specific Pokemon by its ID.
 *
 * @param pokemonId - The Pokemon ID to find
 * @returns The Pokemon spawn data or undefined if not found
 */
export function usePokemonById(pokemonId: bigint | undefined): PokemonSpawn | undefined {
  const { data } = useGetPokemonSpawns();

  return useMemo(() => {
    if (!data || pokemonId === undefined) {
      return undefined;
    }
    return data.find((pokemon) => pokemon.id === pokemonId);
  }, [data, pokemonId]);
}

/**
 * Hook to get a Pokemon by its slot index.
 *
 * @param slotIndex - The slot index (0-19)
 * @returns The Pokemon spawn data or undefined if slot is empty
 */
export function usePokemonBySlot(slotIndex: number): PokemonSpawn | undefined {
  const { allSlots } = useGetPokemonSpawns();

  return useMemo(() => {
    if (!allSlots || slotIndex < 0 || slotIndex >= MAX_ACTIVE_POKEMON) {
      return undefined;
    }
    const pokemon = allSlots[slotIndex];
    return pokemon?.isActive ? pokemon : undefined;
  }, [allSlots, slotIndex]);
}

/**
 * Hook to get the active Pokemon count directly from contract.
 * More efficient than filtering all slots if you only need the count.
 *
 * @returns Object with activeCount and loading state
 */
export function useActivePokemonCount(): {
  count: number;
  isLoading: boolean;
  error: Error | undefined;
} {
  const { isConfigured } = usePokeballGameAddress();

  const { data, isLoading, error } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'getActivePokemonCount',
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: isConfigured,
      refetchInterval: 5000,
    },
  });

  return {
    count: data !== undefined ? Number(data) : 0,
    isLoading,
    error: error as Error | undefined,
  };
}

/**
 * Hook to get the active slot indices directly from contract.
 * Useful when you need to know which slots are occupied without fetching full Pokemon data.
 *
 * @returns Object with slot indices and loading state
 */
export function useActivePokemonSlots(): {
  slots: number[];
  isLoading: boolean;
  error: Error | undefined;
} {
  const { isConfigured } = usePokeballGameAddress();

  const { data, isLoading, error } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'getActivePokemonSlots',
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: isConfigured,
      refetchInterval: 5000,
    },
  });

  return {
    slots: data !== undefined ? (data as readonly number[]).map(Number) : [],
    isLoading,
    error: error as Error | undefined,
  };
}

export default useGetPokemonSpawns;
