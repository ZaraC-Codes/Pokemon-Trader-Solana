/**
 * usePokemonSpawns Hook (Solana)
 *
 * Reads the PokemonSlots PDA and returns active Pokemon spawns.
 * Replaces the EVM useGetPokemonSpawns hook.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { fetchPokemonSlots, type PokemonSlots } from '../../solana/programClient';
import { MAX_POKEMON_SLOTS } from '../../solana/constants';
import { BN } from '@coral-xyz/anchor';

// ============================================================
// TYPES (compatible with existing PokemonSpawn interface)
// ============================================================

export interface PokemonSpawn {
  id: bigint;
  x: number;
  y: number;
  attemptCount: number;
  isActive: boolean;
  spawnTime: bigint;
  slotIndex: number;
}

export interface UsePokemonSpawnsReturn {
  data: PokemonSpawn[] | undefined;
  allSlots: PokemonSpawn[] | undefined;
  activeCount: number;
  activeSlotIndices: number[];
  isLoading: boolean;
  error: Error | undefined;
  refetch: () => void;
}

const POLL_INTERVAL = 5_000; // 5 seconds

export function usePokemonSpawns(): UsePokemonSpawnsReturn {
  const { connection } = useConnection();
  const [slotsData, setSlotsData] = useState<PokemonSlots | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [pollTrigger, setPollTrigger] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const data = await fetchPokemonSlots(connection);
      setSlotsData(data);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [connection]);

  // Initial fetch and polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      setPollTrigger((prev) => prev + 1);
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Refetch on poll trigger
  useEffect(() => {
    if (pollTrigger > 0) fetchData();
  }, [pollTrigger, fetchData]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const { allSlots, activeSpawns, activeCount, activeSlotIndices } = useMemo(() => {
    if (!slotsData) {
      return {
        allSlots: undefined,
        activeSpawns: undefined,
        activeCount: 0,
        activeSlotIndices: [],
      };
    }

    const all: PokemonSpawn[] = slotsData.slots.map((slot, index) => ({
      id: BigInt(slot.pokemonId?.toString() ?? '0'),
      x: slot.posX,
      y: slot.posY,
      attemptCount: slot.throwAttempts,
      isActive: slot.isActive,
      spawnTime: BigInt(slot.spawnTimestamp?.toString() ?? '0'),
      slotIndex: index,
    }));

    // Filter to active spawns that still have attempts left.
    // Pokemon at max attempts (3) are "dead" — consume_randomness should have
    // despawned them, but if it wasn't called (broken VRF flow), they're stuck.
    // Hide them so players don't click on unthrowable Pokemon.
    const MAX_THROW_ATTEMPTS = 3;
    const active = all.filter((s) => s.isActive && s.attemptCount < MAX_THROW_ATTEMPTS);
    const indices = active.map((s) => s.slotIndex);

    return {
      allSlots: all,
      activeSpawns: active,
      activeCount: slotsData.activeCount,
      activeSlotIndices: indices,
    };
  }, [slotsData]);

  return {
    data: activeSpawns,
    allSlots,
    activeCount,
    activeSlotIndices,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get a specific Pokemon by its ID.
 */
export function usePokemonById(pokemonId: bigint | undefined): PokemonSpawn | undefined {
  const { data } = usePokemonSpawns();

  return useMemo(() => {
    if (!data || pokemonId === undefined) return undefined;
    return data.find((p) => p.id === pokemonId);
  }, [data, pokemonId]);
}

/**
 * Hook to get a Pokemon by its slot index.
 */
export function usePokemonBySlot(slotIndex: number): PokemonSpawn | undefined {
  const { allSlots } = usePokemonSpawns();

  return useMemo(() => {
    if (!allSlots || slotIndex < 0 || slotIndex >= MAX_POKEMON_SLOTS) return undefined;
    const pokemon = allSlots[slotIndex];
    return pokemon?.isActive ? pokemon : undefined;
  }, [allSlots, slotIndex]);
}
