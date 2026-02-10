/**
 * useDespawnPokemon Hook (v1.9.0)
 *
 * Hook for despawning (removing) a Pokemon from a slot.
 * This is an owner-only function for managing spawn layouts.
 *
 * Usage:
 * ```tsx
 * const {
 *   write,
 *   isLoading,
 *   error,
 *   hash,
 *   receipt,
 * } = useDespawnPokemon();
 *
 * // Despawn Pokemon in slot 5
 * const handleDespawn = () => {
 *   if (write) {
 *     write(5); // slot index
 *   }
 * };
 *
 * // Show loading state
 * {isLoading && <div>Despawning Pokemon...</div>}
 *
 * // Show error
 * {error && <div>Error: {error.message}</div>}
 * ```
 *
 * Note: Only the contract owner can call this function.
 * The slot must contain an active Pokemon.
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

export interface UseDespawnPokemonReturn {
  /**
   * Function to despawn a Pokemon from a slot.
   * @param slot - The Pokemon slot index (0-19)
   */
  write: ((slot: number) => void) | undefined;

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
 * Hook for despawning a Pokemon from a slot (v1.9.0).
 *
 * @returns Object with write function, loading states, error, hash, and receipt
 */
export function useDespawnPokemon(): UseDespawnPokemonReturn {
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
    (slot: number) => {
      if (!POKEBALL_GAME_ADDRESS) {
        console.error('[useDespawnPokemon] Contract address not configured');
        return;
      }

      // Validate slot range
      if (slot < 0 || slot > 19) {
        console.error('[useDespawnPokemon] Invalid slot index, must be 0-19');
        return;
      }

      console.log('[useDespawnPokemon] Despawning Pokemon in slot', slot);

      writeContract({
        address: POKEBALL_GAME_ADDRESS,
        abi: POKEBALL_GAME_ABI,
        functionName: 'despawnPokemon',
        args: [slot],
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

export default useDespawnPokemon;
