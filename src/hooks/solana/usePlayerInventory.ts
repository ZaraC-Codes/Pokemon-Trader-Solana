/**
 * usePlayerInventory Hook
 *
 * Reads the player's ball inventory from the PlayerInventory PDA.
 * Replaces the EVM usePlayerBallInventory hook.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { fetchPlayerInventory, type PlayerInventory } from '../../solana/programClient';
import { getBallInventoryManager } from '../../game/managers/BallInventoryManager';

export interface UsePlayerInventoryReturn {
  pokeBalls: number;
  greatBalls: number;
  ultraBalls: number;
  masterBalls: number;
  totalBalls: number;
  totalPurchased: number;
  totalThrows: number;
  totalCatches: number;
  isLoading: boolean;
  error: Error | undefined;
  refetch: () => void;
  isContractConfigured: boolean;
}

const POLL_INTERVAL = 10_000; // 10 seconds

export function usePlayerInventory(): UsePlayerInventoryReturn {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [inventory, setInventory] = useState<PlayerInventory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const [pollTrigger, setPollTrigger] = useState(0);

  const fetchData = useCallback(async () => {
    if (!publicKey) return;

    setIsLoading(true);
    setError(undefined);

    try {
      const data = await fetchPlayerInventory(connection, publicKey);
      setInventory(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [connection, publicKey]);

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

  // Sync to BallInventoryManager singleton (used by Phaser CatchMechanicsManager)
  useEffect(() => {
    if (inventory && !isLoading) {
      const manager = getBallInventoryManager();
      manager.onInventorySynced({
        pokeBalls: inventory.balls[0] ?? 0,
        greatBalls: inventory.balls[1] ?? 0,
        ultraBalls: inventory.balls[2] ?? 0,
        masterBalls: inventory.balls[3] ?? 0,
      });
    }
  }, [inventory, isLoading]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const parsed = useMemo(() => {
    if (!inventory) {
      return {
        pokeBalls: 0,
        greatBalls: 0,
        ultraBalls: 0,
        masterBalls: 0,
        totalBalls: 0,
        totalPurchased: 0,
        totalThrows: 0,
        totalCatches: 0,
      };
    }

    const balls = inventory.balls;
    const poke = balls[0] ?? 0;
    const great = balls[1] ?? 0;
    const ultra = balls[2] ?? 0;
    const master = balls[3] ?? 0;

    return {
      pokeBalls: poke,
      greatBalls: great,
      ultraBalls: ultra,
      masterBalls: master,
      totalBalls: poke + great + ultra + master,
      totalPurchased: inventory.totalPurchased?.toNumber() ?? 0,
      totalThrows: inventory.totalThrows?.toNumber() ?? 0,
      totalCatches: inventory.totalCatches?.toNumber() ?? 0,
    };
  }, [inventory]);

  if (!publicKey) {
    return {
      pokeBalls: 0,
      greatBalls: 0,
      ultraBalls: 0,
      masterBalls: 0,
      totalBalls: 0,
      totalPurchased: 0,
      totalThrows: 0,
      totalCatches: 0,
      isLoading: false,
      error: undefined,
      refetch: () => {},
      isContractConfigured: true,
    };
  }

  return {
    ...parsed,
    isLoading,
    error,
    refetch,
    isContractConfigured: true,
  };
}

/**
 * Hook to get a specific ball type count for the connected player.
 */
export function usePlayerBallCount(ballType: 0 | 1 | 2 | 3): number {
  const inventory = usePlayerInventory();

  return useMemo(() => {
    switch (ballType) {
      case 0: return inventory.pokeBalls;
      case 1: return inventory.greatBalls;
      case 2: return inventory.ultraBalls;
      case 3: return inventory.masterBalls;
      default: return 0;
    }
  }, [inventory, ballType]);
}

/**
 * Hook to check if the connected player has any balls.
 */
export function useHasAnyBalls(): boolean {
  const { totalBalls, isLoading } = usePlayerInventory();
  return !isLoading && totalBalls > 0;
}
