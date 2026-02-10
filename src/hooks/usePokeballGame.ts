/**
 * usePokeballGame Hook
 *
 * React hook for integrating with the PokeballGame smart contract.
 * Manages ball inventory, purchases, and syncs state with BallInventoryManager.
 *
 * Usage:
 * ```tsx
 * const {
 *   inventory,
 *   isLoading,
 *   purchaseBalls,
 *   isPurchasing,
 * } = usePokeballGame();
 *
 * // Display inventory
 * <div>Poke Balls: {inventory.pokeBalls}</div>
 *
 * // Purchase balls
 * <button onClick={() => purchaseBalls(0, 5, false)}>
 *   Buy 5 Poke Balls
 * </button>
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { useWriteContract, useReadContract, useWatchContractEvent } from 'wagmi';
import { useActiveWeb3React } from './useActiveWeb3React';
import { apeChainMainnet } from '../services/apechainConfig';
import {
  getBallInventoryManager,
  type BallInventory,
  type BallType,
} from '../game/managers/BallInventoryManager';

// ============================================================
// CONTRACT CONFIGURATION
// ============================================================

/**
 * PokeballGame contract address on ApeChain.
 * TODO: Update this when the contract is deployed.
 */
export const POKEBALL_GAME_ADDRESS = process.env.REACT_APP_POKEBALL_GAME_ADDRESS as `0x${string}` | undefined;

/**
 * Minimal ABI for PokeballGame - only the functions we need.
 */
export const POKEBALL_GAME_ABI = [
  // Read functions
  {
    inputs: [{ internalType: 'address', name: 'player', type: 'address' }],
    name: 'getAllPlayerBalls',
    outputs: [
      { internalType: 'uint256', name: 'pokeBalls', type: 'uint256' },
      { internalType: 'uint256', name: 'greatBalls', type: 'uint256' },
      { internalType: 'uint256', name: 'ultraBalls', type: 'uint256' },
      { internalType: 'uint256', name: 'masterBalls', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'enum PokeballGame.BallType', name: 'ballType', type: 'uint8' }],
    name: 'getBallPrice',
    outputs: [{ internalType: 'uint256', name: 'price', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  // Write functions
  {
    inputs: [
      { internalType: 'enum PokeballGame.BallType', name: 'ballType', type: 'uint8' },
      { internalType: 'uint256', name: 'quantity', type: 'uint256' },
      { internalType: 'bool', name: 'useAPE', type: 'bool' },
    ],
    name: 'purchaseBalls',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'buyer', type: 'address' },
      { indexed: false, internalType: 'uint8', name: 'ballType', type: 'uint8' },
      { indexed: false, internalType: 'uint256', name: 'quantity', type: 'uint256' },
      { indexed: false, internalType: 'bool', name: 'usedAPE', type: 'bool' },
    ],
    name: 'BallPurchased',
    type: 'event',
  },
] as const;

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

interface UsePokeballGameReturn {
  /** Current ball inventory */
  inventory: BallInventory;
  /** Whether initial inventory is loading */
  isLoading: boolean;
  /** Whether a purchase transaction is pending */
  isPurchasing: boolean;
  /** Last error message */
  error: string | null;
  /** Purchase balls function */
  purchaseBalls: (ballType: BallType, quantity: number, useAPE: boolean) => Promise<void>;
  /** Manually refresh inventory from contract */
  refreshInventory: () => void;
  /** Check if contract is configured */
  isContractConfigured: boolean;
}

/**
 * Hook for interacting with the PokeballGame contract.
 * Manages ball inventory and purchase transactions.
 */
export function usePokeballGame(): UsePokeballGameReturn {
  const { account, publicClient } = useActiveWeb3React();
  const { writeContractAsync } = useWriteContract();

  // Local state
  const [inventory, setInventory] = useState<BallInventory>({
    pokeBalls: 0,
    greatBalls: 0,
    ultraBalls: 0,
    masterBalls: 0,
  });
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the singleton inventory manager
  const inventoryManager = getBallInventoryManager();

  // Check if contract is configured
  const isContractConfigured = !!POKEBALL_GAME_ADDRESS;

  // Read initial inventory from contract
  const {
    data: ballCounts,
    isLoading,
    refetch: refetchBalls,
  } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'getAllPlayerBalls',
    args: account ? [account] : undefined,
    chainId: apeChainMainnet.id,
    query: {
      enabled: !!account && isContractConfigured,
    },
  });

  // Sync inventory manager when contract data changes
  useEffect(() => {
    if (ballCounts) {
      const [pokeBalls, greatBalls, ultraBalls, masterBalls] = ballCounts;

      const newInventory: BallInventory = {
        pokeBalls: Number(pokeBalls),
        greatBalls: Number(greatBalls),
        ultraBalls: Number(ultraBalls),
        masterBalls: Number(masterBalls),
      };

      // Sync to manager (will notify all listeners)
      inventoryManager.onInventorySynced(newInventory);

      console.log('[usePokeballGame] Synced inventory from contract:', newInventory);
    }
  }, [ballCounts, inventoryManager]);

  // Subscribe to inventory manager changes
  useEffect(() => {
    const handleInventoryUpdate = (newInventory: BallInventory) => {
      setInventory(newInventory);
    };

    inventoryManager.addListener(handleInventoryUpdate);

    return () => {
      inventoryManager.removeListener(handleInventoryUpdate);
    };
  }, [inventoryManager]);

  // Watch for BallPurchased events
  useWatchContractEvent({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    eventName: 'BallPurchased',
    onLogs: (logs) => {
      for (const log of logs) {
        const { buyer, ballType, quantity } = log.args as {
          buyer: `0x${string}`;
          ballType: number;
          quantity: bigint;
        };

        // Only process events for the current user
        if (account && buyer.toLowerCase() === account.toLowerCase()) {
          console.log('[usePokeballGame] BallPurchased event:', {
            ballType,
            quantity: Number(quantity),
          });

          // Update inventory manager
          inventoryManager.onBallPurchased(ballType as BallType, Number(quantity));
        }
      }
    },
    enabled: !!account && isContractConfigured,
  });

  // Purchase balls function
  const purchaseBalls = useCallback(
    async (ballType: BallType, quantity: number, useAPE: boolean) => {
      if (!account) {
        setError('Wallet not connected');
        return;
      }

      if (!POKEBALL_GAME_ADDRESS) {
        setError('PokeballGame contract not configured');
        return;
      }

      if (quantity <= 0) {
        setError('Quantity must be greater than 0');
        return;
      }

      setIsPurchasing(true);
      setError(null);

      try {
        console.log('[usePokeballGame] Purchasing balls:', { ballType, quantity, useAPE });

        const tx = await writeContractAsync({
          address: POKEBALL_GAME_ADDRESS,
          abi: POKEBALL_GAME_ABI,
          functionName: 'purchaseBalls',
          args: [ballType, BigInt(quantity), useAPE],
          chainId: apeChainMainnet.id,
        });

        console.log('[usePokeballGame] Transaction submitted:', tx);

        // Wait for transaction confirmation
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: tx });
          console.log('[usePokeballGame] Transaction confirmed');
        }

        // Refetch inventory after successful purchase
        await refetchBalls();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Purchase failed';
        console.error('[usePokeballGame] Purchase error:', errorMessage);
        setError(errorMessage);
      } finally {
        setIsPurchasing(false);
      }
    },
    [account, writeContractAsync, publicClient, refetchBalls]
  );

  // Manual refresh function
  const refreshInventory = useCallback(() => {
    if (account && isContractConfigured) {
      refetchBalls();
    }
  }, [account, isContractConfigured, refetchBalls]);

  return {
    inventory,
    isLoading,
    isPurchasing,
    error,
    purchaseBalls,
    refreshInventory,
    isContractConfigured,
  };
}

// ============================================================
// UTILITY HOOKS
// ============================================================

/**
 * Hook to get ball price from the contract.
 *
 * @param ballType - Ball type (0-3)
 * @returns Price in USDC (6 decimals)
 */
export function useBallPrice(ballType: BallType) {
  const { data: price, isLoading } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'getBallPrice',
    args: [ballType],
    chainId: apeChainMainnet.id,
    query: {
      enabled: !!POKEBALL_GAME_ADDRESS,
    },
  });

  return {
    price: price ? Number(price) / 1e6 : null, // Convert from 6 decimals to USD
    isLoading,
  };
}

/**
 * Hook to check if player has a specific ball type.
 * Uses the global inventory manager for real-time updates.
 *
 * @param ballType - Ball type to check
 * @returns Whether player has at least one ball of that type
 */
export function useHasBall(ballType: BallType): boolean {
  const [hasBall, setHasBall] = useState(false);
  const inventoryManager = getBallInventoryManager();

  useEffect(() => {
    const handleUpdate = () => {
      const count = inventoryManager.getBallCount(ballType);
      setHasBall(count > 0);
    };

    inventoryManager.addListener(handleUpdate);
    return () => inventoryManager.removeListener(handleUpdate);
  }, [ballType, inventoryManager]);

  return hasBall;
}
