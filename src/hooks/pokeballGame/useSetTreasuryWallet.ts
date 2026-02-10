/**
 * useSetTreasuryWallet Hook
 *
 * Hook for updating the treasury wallet address in the PokeballGame contract.
 * This is an owner-only function that changes where platform fees are sent.
 *
 * Usage:
 * ```tsx
 * const {
 *   write,
 *   isLoading,
 *   error,
 *   hash,
 *   receipt,
 * } = useSetTreasuryWallet();
 *
 * // Update treasury wallet address
 * const handleUpdate = () => {
 *   if (write) {
 *     write('0x1234567890123456789012345678901234567890');
 *   }
 * };
 *
 * // Show loading state
 * {isLoading && <div>Updating treasury wallet...</div>}
 *
 * // Show success
 * {receipt && <div>Treasury wallet updated!</div>}
 * ```
 *
 * Note: Only the contract owner can call this function.
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

export interface UseSetTreasuryWalletReturn {
  /**
   * Function to update the treasury wallet address.
   * @param newAddress - The new treasury wallet address
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
 * Hook for updating the treasury wallet in the PokeballGame contract.
 *
 * @returns Object with write function, loading states, error, hash, and receipt
 */
export function useSetTreasuryWallet(): UseSetTreasuryWalletReturn {
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
        console.error('[useSetTreasuryWallet] Contract address not configured');
        return;
      }

      if (!newAddress || newAddress === '0x0000000000000000000000000000000000000000') {
        console.error('[useSetTreasuryWallet] Invalid treasury address');
        return;
      }

      console.log('[useSetTreasuryWallet] Updating treasury wallet to:', newAddress);

      writeContract({
        address: POKEBALL_GAME_ADDRESS,
        abi: POKEBALL_GAME_ABI,
        functionName: 'setTreasuryWallet',
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

/**
 * Hook for updating the NFT revenue wallet in the PokeballGame contract.
 * This is similar to treasury but for NFT-related revenue.
 */
export function useSetNFTRevenueWallet(): UseSetTreasuryWalletReturn {
  const { isConfigured } = usePokeballGameAddress();

  const [currentHash, setCurrentHash] = useState<`0x${string}` | undefined>(undefined);

  const {
    writeContract,
    isPending: isWritePending,
    error: writeError,
    data: writeHash,
    reset: resetWrite,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: isReceiptLoading,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: currentHash,
    chainId: POKEBALL_GAME_CHAIN_ID,
  });

  useEffect(() => {
    if (writeHash && writeHash !== currentHash) {
      setCurrentHash(writeHash);
    }
  }, [writeHash, currentHash]);

  const isLoading = isWritePending || isReceiptLoading;
  const error = writeError || receiptError || undefined;

  const write = useCallback(
    (newAddress: `0x${string}`) => {
      if (!POKEBALL_GAME_ADDRESS) {
        console.error('[useSetNFTRevenueWallet] Contract address not configured');
        return;
      }

      if (!newAddress || newAddress === '0x0000000000000000000000000000000000000000') {
        console.error('[useSetNFTRevenueWallet] Invalid NFT revenue address');
        return;
      }

      console.log('[useSetNFTRevenueWallet] Updating NFT revenue wallet to:', newAddress);

      writeContract({
        address: POKEBALL_GAME_ADDRESS,
        abi: POKEBALL_GAME_ABI,
        functionName: 'setNFTRevenueWallet',
        args: [newAddress],
        chainId: POKEBALL_GAME_CHAIN_ID,
      });
    },
    [writeContract]
  );

  const reset = useCallback(() => {
    setCurrentHash(undefined);
    resetWrite();
  }, [resetWrite]);

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

export default useSetTreasuryWallet;
