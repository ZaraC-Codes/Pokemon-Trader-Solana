/**
 * useThrowFee Hook
 *
 * Hook for fetching the current Pyth Entropy fee required for throwBall().
 * This fee is paid in native APE and covers the randomness callback.
 *
 * v1.6.0: throwBall() is now PAYABLE and requires msg.value for the Entropy fee.
 *
 * Usage:
 * ```tsx
 * import { useThrowFee } from '../hooks/pokeballGame';
 *
 * function CatchAttemptModal() {
 *   const { throwFee, formattedFee, isLoading } = useThrowFee();
 *
 *   return (
 *     <div>
 *       <p>Throw fee: {formattedFee} APE</p>
 *       <button disabled={isLoading}>Throw Ball</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import {
  POKEBALL_GAME_ADDRESS,
  POKEBALL_GAME_ABI,
  POKEBALL_GAME_CHAIN_ID,
  usePokeballGameAddress,
} from './pokeballGameConfig';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface UseThrowFeeReturn {
  /**
   * Current throw fee in wei (bigint).
   * This is the exact value required for throwBall() msg.value.
   */
  throwFee: bigint | undefined;

  /**
   * Fee formatted as a human-readable APE string (e.g., "0.073").
   */
  formattedFee: string;

  /**
   * Fee with 10% buffer for safety (accounts for fee changes between read and write).
   * Use this value when calling throwBall().
   */
  throwFeeWithBuffer: bigint;

  /**
   * Whether the fee is being loaded.
   */
  isLoading: boolean;

  /**
   * Error from fetching the fee, if any.
   */
  error: Error | null;

  /**
   * Refetch the current fee from the contract.
   */
  refetch: () => void;
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

/**
 * Hook for fetching the current Pyth Entropy fee required for throwBall().
 *
 * @returns Object with throwFee (wei), formattedFee (APE string), and loading state
 */
export function useThrowFee(): UseThrowFeeReturn {
  const { isConfigured } = usePokeballGameAddress();

  const {
    data: throwFee,
    isLoading,
    error,
    refetch,
  } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'getThrowFee',
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: isConfigured,
      staleTime: 60_000, // Consider fresh for 60 seconds (was 30)
      refetchInterval: false, // DISABLE auto-polling - fee rarely changes (was 60_000)
      // Users can manually refresh or it will refetch when they open the catch modal
      retry: 1, // Only 1 retry on failure to prevent spam
      retryDelay: 2000, // 2 second delay before retry
    },
  });

  // Format fee as APE string (e.g., "0.073")
  const formattedFee = throwFee ? formatEther(throwFee as bigint) : '0';

  // Add 10% buffer to account for potential fee changes
  const fee = throwFee as bigint | undefined;
  const throwFeeWithBuffer = fee ? (fee * 110n) / 100n : 0n;

  if (!isConfigured) {
    return {
      throwFee: undefined,
      formattedFee: '0',
      throwFeeWithBuffer: 0n,
      isLoading: false,
      error: null,
      refetch: () => {},
    };
  }

  return {
    throwFee: throwFee as bigint | undefined,
    formattedFee,
    throwFeeWithBuffer,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export default useThrowFee;
