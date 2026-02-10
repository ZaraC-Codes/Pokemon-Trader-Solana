/**
 * useMaxActivePokemon Hook (v1.9.0)
 *
 * Hook for reading and setting the maximum number of active Pokemon.
 * Reading is public, writing is owner-only.
 *
 * Usage:
 * ```tsx
 * const {
 *   maxActive,
 *   isLoading,
 *   error,
 *   setMaxActive,
 *   isSettingMax,
 *   setMaxError,
 *   refetch,
 * } = useMaxActivePokemon();
 *
 * // Display current max
 * console.log(`Max active Pokemon: ${maxActive}`);
 *
 * // Set new max (owner only)
 * const handleSetMax = () => {
 *   if (setMaxActive) {
 *     setMaxActive(30); // Increase to 30 Pokemon
 *   }
 * };
 * ```
 *
 * Note: setMaxActive is owner-only. The max cannot exceed the
 * contract's hardcoded MAX_ACTIVE_POKEMON constant.
 */

import { useState, useCallback, useEffect } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
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

export interface UseMaxActivePokemonReturn {
  /**
   * Current effective max active Pokemon.
   * Undefined while loading or if contract not configured.
   */
  maxActive: number | undefined;

  /**
   * Whether the read query is loading.
   */
  isLoading: boolean;

  /**
   * Error from reading the value.
   */
  error: Error | undefined;

  /**
   * Function to set a new max active Pokemon count (owner only).
   * @param newMax - The new maximum (must be <= contract MAX_ACTIVE_POKEMON)
   */
  setMaxActive: ((newMax: number) => void) | undefined;

  /**
   * Whether the set transaction is being processed.
   */
  isSettingMax: boolean;

  /**
   * Whether the set transaction is pending submission.
   */
  isSetPending: boolean;

  /**
   * Error from the set transaction.
   */
  setMaxError: Error | undefined;

  /**
   * Transaction hash from set operation.
   */
  setMaxHash: `0x${string}` | undefined;

  /**
   * Transaction receipt from set operation.
   */
  setMaxReceipt: TransactionReceipt | undefined;

  /**
   * Refetch the current max active value.
   */
  refetch: () => void;

  /**
   * Reset the write hook state.
   */
  resetSetMax: () => void;
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

/**
 * Hook for reading and setting the max active Pokemon (v1.9.0).
 *
 * @returns Object with maxActive value, loading states, errors, and setMaxActive function
 */
export function useMaxActivePokemon(): UseMaxActivePokemonReturn {
  const { isConfigured } = usePokeballGameAddress();

  // Track the current transaction hash for write
  const [currentHash, setCurrentHash] = useState<`0x${string}` | undefined>(undefined);

  // ============================================================
  // READ: getEffectiveMaxActivePokemon
  // ============================================================

  const {
    data: maxActiveRaw,
    isLoading: isReadLoading,
    error: readError,
    refetch,
  } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'getEffectiveMaxActivePokemon',
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: isConfigured,
      staleTime: 30_000, // 30 seconds
    },
  });

  // Parse the result
  const maxActive = maxActiveRaw !== undefined ? Number(maxActiveRaw) : undefined;

  // ============================================================
  // WRITE: setMaxActivePokemon
  // ============================================================

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

  // Refetch after successful transaction
  useEffect(() => {
    if (receipt && receipt.status === 'success') {
      console.log('[useMaxActivePokemon] Transaction confirmed, refetching...');
      refetch();
    }
  }, [receipt, refetch]);

  // Combined write loading state
  const isSettingMax = isWritePending || isReceiptLoading;

  // Combined write error
  const setMaxError = writeError || receiptError || undefined;

  // Write function
  const setMaxActive = useCallback(
    (newMax: number) => {
      if (!POKEBALL_GAME_ADDRESS) {
        console.error('[useMaxActivePokemon] Contract address not configured');
        return;
      }

      // Validate range (basic client-side validation)
      if (newMax < 1 || newMax > 100) {
        console.error('[useMaxActivePokemon] Invalid max value, must be 1-100');
        return;
      }

      console.log('[useMaxActivePokemon] Setting max active Pokemon to', newMax);

      writeContract({
        address: POKEBALL_GAME_ADDRESS,
        abi: POKEBALL_GAME_ABI,
        functionName: 'setMaxActivePokemon',
        args: [newMax],
        chainId: POKEBALL_GAME_CHAIN_ID,
      });
    },
    [writeContract]
  );

  // Reset function
  const resetSetMax = useCallback(() => {
    setCurrentHash(undefined);
    resetWrite();
  }, [resetWrite]);

  // Return safe defaults if contract not configured
  if (!isConfigured) {
    return {
      maxActive: undefined,
      isLoading: false,
      error: undefined,
      setMaxActive: undefined,
      isSettingMax: false,
      isSetPending: false,
      setMaxError: undefined,
      setMaxHash: undefined,
      setMaxReceipt: undefined,
      refetch: () => {},
      resetSetMax: () => {},
    };
  }

  return {
    maxActive,
    isLoading: isReadLoading,
    error: readError as Error | undefined,
    setMaxActive,
    isSettingMax,
    isSetPending: isWritePending,
    setMaxError,
    setMaxHash: currentHash,
    setMaxReceipt: receipt,
    refetch,
    resetSetMax,
  };
}

export default useMaxActivePokemon;
