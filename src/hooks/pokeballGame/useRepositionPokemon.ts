/**
 * useRepositionPokemon Hook (v1.9.0)
 *
 * Hook for repositioning an existing Pokemon to a new position.
 * This is an owner-only function for adjusting spawn layouts.
 *
 * Usage:
 * ```tsx
 * const {
 *   write,
 *   isLoading,
 *   error,
 *   hash,
 *   receipt,
 * } = useRepositionPokemon();
 *
 * // Reposition Pokemon in slot 0 to new coordinates
 * const handleReposition = () => {
 *   if (write) {
 *     write(0, 500, 500); // slot, newPosX, newPosY (contract coords 0-999)
 *   }
 * };
 *
 * // Show loading state
 * {isLoading && <div>Repositioning Pokemon...</div>}
 *
 * // Show error
 * {error && <div>Error: {error.message}</div>}
 * ```
 *
 * Note: Only the contract owner can call this function.
 * Coordinates are in contract space (0-999), not pixel space.
 */

import { useState, useCallback, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import type { TransactionReceipt } from 'viem';
import {
  POKEBALL_GAME_ADDRESS,
  POKEBALL_GAME_ABI,
  POKEBALL_GAME_CHAIN_ID,
  usePokeballGameAddress,
} from './pokeballGameConfig';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface UseRepositionPokemonReturn {
  /**
   * Function to reposition a Pokemon to a new position.
   * @param slot - The Pokemon slot index (0-19)
   * @param newPosX - New X position in contract coords (0-999)
   * @param newPosY - New Y position in contract coords (0-999)
   */
  write: ((slot: number, newPosX: number, newPosY: number) => void) | undefined;

  /**
   * Whether the transaction is currently being processed.
   */
  isLoading: boolean;

  /**
   * Whether the transaction is pending submission.
   */
  isPending: boolean;

  /**
   * Error from the transaction, if any.
   */
  error: Error | undefined;

  /**
   * Transaction hash after submission.
   */
  hash: `0x${string}` | undefined;

  /**
   * Transaction receipt after confirmation.
   */
  receipt: TransactionReceipt | undefined;

  /**
   * Reset the hook state to initial values.
   */
  reset: () => void;
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

/**
 * Hook for repositioning a Pokemon to a new position (v1.9.0).
 *
 * @returns Object with write function, loading states, error, hash, and receipt
 */
export function useRepositionPokemon(): UseRepositionPokemonReturn {
  const { isConfigured } = usePokeballGameAddress();

  // Track the current transaction hash
  const [currentHash, setCurrentHash] = useState<`0x${string}` | undefined>(undefined);

  // Wagmi write contract hook
  const {
    writeContract,
    isPending: isWritePending,
    error: writeError,
    data: writeHash,
    reset: resetWrite,
  } = useWriteContract();

  // Wait for transaction receipt
  const {
    data: receipt,
    isLoading: isReceiptLoading,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: currentHash,
    chainId: POKEBALL_GAME_CHAIN_ID,
  });

  // Update current hash when write succeeds
  useEffect(() => {
    if (writeHash && writeHash !== currentHash) {
      setCurrentHash(writeHash);
    }
  }, [writeHash, currentHash]);

  // Combined loading state
  const isLoading = isWritePending || isReceiptLoading;

  // Combined error
  const error = writeError || receiptError || undefined;

  // Write function
  const write = useCallback(
    (slot: number, newPosX: number, newPosY: number) => {
      if (!POKEBALL_GAME_ADDRESS) {
        console.error('[useRepositionPokemon] Contract address not configured');
        return;
      }

      // Validate slot range
      if (slot < 0 || slot > 19) {
        console.error('[useRepositionPokemon] Invalid slot index, must be 0-19');
        return;
      }

      // Validate coordinate ranges
      if (newPosX < 0 || newPosX > 999 || newPosY < 0 || newPosY > 999) {
        console.error('[useRepositionPokemon] Invalid coordinates, must be 0-999');
        return;
      }

      console.log('[useRepositionPokemon] Repositioning slot', slot, 'to', { newPosX, newPosY });

      writeContract({
        address: POKEBALL_GAME_ADDRESS,
        abi: POKEBALL_GAME_ABI,
        functionName: 'repositionPokemon',
        args: [slot, newPosX, newPosY],
        chainId: POKEBALL_GAME_CHAIN_ID,
      });
    },
    [writeContract]
  );

  // Reset function
  const reset = useCallback(() => {
    setCurrentHash(undefined);
    resetWrite();
  }, [resetWrite]);

  // Return safe defaults if contract not configured
  if (!isConfigured) {
    return {
      write: undefined,
      isLoading: false,
      isPending: false,
      error: undefined,
      hash: undefined,
      receipt: undefined,
      reset: () => {},
    };
  }

  return {
    write,
    isLoading,
    isPending: isWritePending,
    error,
    hash: currentHash,
    receipt,
    reset,
  };
}

export default useRepositionPokemon;
