/**
 * useThrowBall Hook
 *
 * Hook for throwing a PokeBall at a Pokemon in the PokeballGame contract.
 * Initiates a catch attempt which triggers a Pyth Entropy callback.
 *
 * v1.6.0: throwBall() is now PAYABLE and requires msg.value for the Entropy fee.
 * The hook automatically fetches and includes the fee.
 *
 * Usage:
 * ```tsx
 * const {
 *   write,
 *   isLoading,
 *   isPending,
 *   error,
 *   hash,
 *   requestId,
 *   throwFee,
 * } = useThrowBall();
 *
 * // Throw a Great Ball at Pokemon in slot 0
 * const handleThrow = () => {
 *   if (write) {
 *     write(0, 1); // pokemonSlot=0, ballType=1 (Great Ball)
 *   }
 * };
 *
 * // Monitor the request ID for Entropy callback
 * useEffect(() => {
 *   if (requestId) {
 *     console.log('Waiting for Entropy result:', requestId);
 *   }
 * }, [requestId]);
 * ```
 *
 * Note: The contract uses pokemonSlot (0-19), not pokemonId directly.
 * Use useGetPokemonSpawns to get the slot index for a Pokemon.
 */

import { useState, useCallback, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient, useReadContract, useAccount } from 'wagmi';
import { decodeEventLog, type TransactionReceipt } from 'viem';
import {
  POKEBALL_GAME_ADDRESS,
  POKEBALL_GAME_ABI,
  POKEBALL_GAME_CHAIN_ID,
  MAX_ACTIVE_POKEMON,
  usePokeballGameAddress,
  type BallType,
} from './pokeballGameConfig';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface UseThrowBallReturn {
  /**
   * Function to throw a ball at a Pokemon.
   * Returns false if the throw was blocked due to fee/gas issues.
   * @param pokemonSlot - Pokemon slot index (0-19)
   * @param ballType - Ball type to throw (0-3)
   */
  write: ((pokemonSlot: number, ballType: BallType) => Promise<boolean>) | undefined;

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
   * Includes fee errors and gas estimation failures.
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
   * Entropy sequence number from the ThrowAttempted event (v1.6.0).
   * Use this to track the catch result via Entropy callback.
   */
  requestId: bigint | undefined;

  /**
   * Current throw fee required by Pyth Entropy (in wei).
   * This is automatically included when calling write().
   */
  throwFee: bigint | undefined;

  /**
   * Whether the throw fee is being loaded.
   */
  isFeeLoading: boolean;

  /**
   * Whether the throw fee is available and valid.
   * If false, the write function will block and return an error.
   */
  isFeeReady: boolean;

  /**
   * Error specifically related to fee reading.
   * Null if fee was read successfully.
   */
  feeError: string | null;

  /**
   * Reset the hook state to initial values.
   */
  reset: () => void;
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

/**
 * Hook for throwing a PokeBall at a Pokemon.
 *
 * @returns Object with write function, loading states, error, hash, receipt, requestId, and throwFee
 */
export function useThrowBall(): UseThrowBallReturn {
  const { isConfigured } = usePokeballGameAddress();
  const publicClient = usePublicClient({ chainId: POKEBALL_GAME_CHAIN_ID });
  const { address: userAddress } = useAccount();

  // Track the current transaction hash and request ID
  const [currentHash, setCurrentHash] = useState<`0x${string}` | undefined>(undefined);
  const [requestId, setRequestId] = useState<bigint | undefined>(undefined);

  // Local error state for fee/gas estimation failures (blocks wallet popup)
  const [localError, setLocalError] = useState<Error | undefined>(undefined);

  // Guard flag to prevent duplicate throw attempts while one is in progress
  // This prevents RPC spam from multiple rapid clicks
  const [isThrowInProgress, setIsThrowInProgress] = useState(false);

  // Fetch the current throw fee from contract (v1.6.0 - Pyth Entropy)
  const {
    data: throwFeeRaw,
    isLoading: isFeeLoading,
    error: feeReadError,
  } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'getThrowFee',
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: isConfigured,
      staleTime: 60_000, // Consider fresh for 60 seconds (increased from 30)
      refetchInterval: false, // Disable auto-polling to prevent RPC spam
      retry: 1, // Only 1 retry on failure
      retryDelay: 2000, // 2 second delay before retry
    },
  });

  // Cast the raw fee to bigint (contract returns uint256)
  const throwFee = throwFeeRaw as bigint | undefined;

  // Determine if fee is ready (loaded successfully and non-zero)
  const isFeeReady = !isFeeLoading && !feeReadError && throwFee !== undefined && throwFee > 0n;

  // Fee-specific error message
  const feeError: string | null = feeReadError
    ? `Failed to read throw fee: ${feeReadError.message}`
    : (throwFee === 0n || throwFee === undefined) && !isFeeLoading
      ? 'Throw fee is 0 or unavailable. RPC may be unreachable.'
      : null;

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
      setRequestId(undefined); // Reset request ID for new transaction
    }
  }, [writeHash, currentHash]);

  // Extract requestId from ThrowAttempted event in receipt
  useEffect(() => {
    if (receipt && receipt.logs && !requestId) {
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: POKEBALL_GAME_ABI,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === 'ThrowAttempted') {
            const args = decoded.args as unknown as {
              thrower: `0x${string}`;
              pokemonId: bigint;
              ballTier: number;
              requestId: bigint;
            };
            console.log('[useThrowBall] ThrowAttempted event:', args);
            setRequestId(args.requestId);
            break;
          }
        } catch {
          // Not a matching event, continue
        }
      }
    }
  }, [receipt, requestId]);

  // Combined loading state
  const isLoading = isWritePending || isReceiptLoading;

  // Combined error - includes local errors for fee/gas failures
  const error = localError || writeError || receiptError || undefined;

  // Write function - includes Entropy fee as msg.value (v1.6.0)
  // FAIL-SAFE: Blocks transaction if fee unavailable or gas estimation fails
  const write = useCallback(
    async (pokemonSlot: number, ballType: BallType): Promise<boolean> => {
      // GUARD: Prevent duplicate throw attempts while one is in progress
      // This prevents RPC spam from rapid clicks or retry loops
      if (isThrowInProgress) {
        console.warn('[useThrowBall] BLOCKED: Throw already in progress, ignoring duplicate request');
        return false;
      }

      // Set guard flag immediately
      setIsThrowInProgress(true);

      // Clear any previous local error
      setLocalError(undefined);

      // Validation: Contract address
      if (!POKEBALL_GAME_ADDRESS) {
        const err = new Error('[useThrowBall] Contract address not configured');
        console.error(err.message);
        setLocalError(err);
        setIsThrowInProgress(false); // Reset guard
        return false;
      }

      // Validation: Pokemon slot range
      if (pokemonSlot < 0 || pokemonSlot >= MAX_ACTIVE_POKEMON) {
        const err = new Error(`[useThrowBall] Invalid pokemon slot (must be 0-${MAX_ACTIVE_POKEMON - 1}): ${pokemonSlot}`);
        console.error(err.message);
        setLocalError(err);
        setIsThrowInProgress(false); // Reset guard
        return false;
      }

      // FAIL-SAFE: Block if throw fee is not available or is zero
      if (!throwFee || throwFee === 0n) {
        const errorDetails = {
          pokemonSlot,
          ballType,
          throwFee: throwFee?.toString() ?? 'undefined',
          isFeeLoading,
          feeReadError: feeReadError?.message,
        };
        console.error('[useThrowBall] BLOCKED: Cannot proceed without valid throw fee', errorDetails);

        const err = new Error(
          'Cannot throw ball: Entropy fee unavailable. ' +
          'This may be due to RPC connection issues. ' +
          'Please check your connection and try again.'
        );
        setLocalError(err);
        setIsThrowInProgress(false); // Reset guard
        return false;
      }

      // Add 10% buffer to the fee to account for potential fee changes between read and write
      const feeToSend = (throwFee * 110n) / 100n;

      console.log('[useThrowBall] Preparing throw:', {
        pokemonSlot,
        ballType,
        address: POKEBALL_GAME_ADDRESS,
        throwFee: throwFee.toString(),
        feeWithBuffer: feeToSend.toString(),
      });

      // FAIL-SAFE: Estimate gas before sending to catch revert errors
      try {
        if (publicClient) {
          console.log('[useThrowBall] Estimating gas...');
          await publicClient.estimateContractGas({
            address: POKEBALL_GAME_ADDRESS,
            abi: POKEBALL_GAME_ABI,
            functionName: 'throwBall',
            args: [pokemonSlot, ballType],
            value: feeToSend,
            account: userAddress,
          });
          console.log('[useThrowBall] Gas estimation successful');
        }
      } catch (gasError) {
        const gasErrorMsg = gasError instanceof Error ? gasError.message : String(gasError);
        const errorDetails = {
          pokemonSlot,
          ballType,
          throwFee: throwFee.toString(),
          feeWithBuffer: feeToSend.toString(),
          gasError: gasErrorMsg,
        };
        console.error('[useThrowBall] BLOCKED: Gas estimation failed', errorDetails);
        console.error('[useThrowBall] Full error:', gasError);

        // Parse common revert reasons for user-friendly messages
        let userMessage = 'Transaction would fail: ';

        if (gasErrorMsg.includes('InsufficientBalls')) {
          userMessage += 'You don\'t have any of that ball type.';
        } else if (gasErrorMsg.includes('PokemonNotActive')) {
          userMessage += 'No Pokemon in that slot.';
        } else if (gasErrorMsg.includes('NoAttemptsRemaining')) {
          userMessage += 'Pokemon has no attempts remaining.';
        } else if (gasErrorMsg.includes('insufficient funds') || gasErrorMsg.includes('exceeds balance')) {
          userMessage += 'Insufficient APE balance for throw fee + gas.';
        } else {
          userMessage += gasErrorMsg.slice(0, 100); // Truncate long messages
        }

        const err = new Error(userMessage);
        setLocalError(err);
        setIsThrowInProgress(false); // Reset guard
        return false;
      }

      // All checks passed - proceed with transaction
      console.log('[useThrowBall] === SENDING TRANSACTION ===');
      console.log('[useThrowBall] Contract address:', POKEBALL_GAME_ADDRESS);
      console.log('[useThrowBall] Function: throwBall');
      console.log('[useThrowBall] Args: [pokemonSlot=' + pokemonSlot + ', ballType=' + ballType + ']');
      console.log('[useThrowBall] Value (fee):', feeToSend.toString());
      console.log('[useThrowBall] Chain ID:', POKEBALL_GAME_CHAIN_ID);
      console.log('[useThrowBall] Calling writeContract NOW - wallet should open...');

      try {
        writeContract({
          address: POKEBALL_GAME_ADDRESS,
          abi: POKEBALL_GAME_ABI,
          functionName: 'throwBall',
          args: [pokemonSlot, ballType],
          chainId: POKEBALL_GAME_CHAIN_ID,
          value: feeToSend, // v1.6.0: Include Entropy fee
        });
        console.log('[useThrowBall] writeContract() called successfully');
        // Note: Guard will be reset by the effect that watches isWritePending
      } catch (writeErr) {
        console.error('[useThrowBall] writeContract() threw:', writeErr);
        setIsThrowInProgress(false); // Reset guard on immediate error
        throw writeErr;
      }

      return true;
    },
    [writeContract, throwFee, isFeeLoading, feeReadError, publicClient, userAddress, isThrowInProgress]
  );

  // Reset guard flag when transaction completes (success or error)
  useEffect(() => {
    // Reset when writeContract finishes (isPending goes from true to false)
    // or when a write error occurs
    if (!isWritePending && isThrowInProgress) {
      // Small delay to ensure state is consistent
      const timer = setTimeout(() => {
        setIsThrowInProgress(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isWritePending, isThrowInProgress, writeError]);

  // Reset function - also clears local error state and guard flag
  const reset = useCallback(() => {
    setCurrentHash(undefined);
    setRequestId(undefined);
    setLocalError(undefined);
    setIsThrowInProgress(false); // Reset guard
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
      requestId: undefined,
      throwFee: undefined,
      isFeeLoading: false,
      isFeeReady: false,
      feeError: 'Contract not configured',
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
    requestId,
    throwFee,
    isFeeLoading,
    isFeeReady,
    feeError,
    reset,
  };
}

export default useThrowBall;
