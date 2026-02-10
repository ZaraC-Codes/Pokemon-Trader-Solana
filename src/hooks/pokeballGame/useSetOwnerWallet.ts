/**
 * useSetOwnerWallet Hook
 *
 * Hook for transferring ownership of the PokeballGame contract.
 * This is an owner-only function that transfers contract ownership to a new address.
 *
 * Usage:
 * ```tsx
 * const {
 *   write,
 *   isLoading,
 *   error,
 *   hash,
 *   receipt,
 * } = useSetOwnerWallet();
 *
 * // Transfer ownership to new address
 * const handleTransfer = () => {
 *   if (write) {
 *     write('0x1234567890123456789012345678901234567890');
 *   }
 * };
 *
 * // Show loading state
 * {isLoading && <div>Transferring ownership...</div>}
 *
 * // Show error
 * {error && <div>Error: {error.message}</div>}
 * ```
 *
 * Note: Only the current contract owner can call this function.
 * The transaction will revert if called by a non-owner address.
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

export interface UseSetOwnerWalletReturn {
  /**
   * Function to transfer ownership to a new address.
   * @param newAddress - The new owner's wallet address
   */
  write: ((newAddress: `0x${string}`) => void) | undefined;

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
 * Hook for transferring ownership of the PokeballGame contract.
 *
 * @returns Object with write function, loading states, error, hash, and receipt
 */
export function useSetOwnerWallet(): UseSetOwnerWalletReturn {
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
    (newAddress: `0x${string}`) => {
      if (!POKEBALL_GAME_ADDRESS) {
        console.error('[useSetOwnerWallet] Contract address not configured');
        return;
      }

      if (!newAddress || newAddress === '0x0000000000000000000000000000000000000000') {
        console.error('[useSetOwnerWallet] Invalid new owner address');
        return;
      }

      console.log('[useSetOwnerWallet] Transferring ownership to:', newAddress);

      writeContract({
        address: POKEBALL_GAME_ADDRESS,
        abi: POKEBALL_GAME_ABI,
        functionName: 'transferOwnership',
        args: [newAddress],
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

export default useSetOwnerWallet;
