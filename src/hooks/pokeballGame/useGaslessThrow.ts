/**
 * useGaslessThrow Hook
 *
 * Hook for throwing a PokeBall at a Pokemon using gasless meta-transactions (v1.8.0).
 * The player signs a message, and a relayer submits the transaction on their behalf.
 *
 * This replaces the user-paid throwBall() flow with the relayer-paid throwBallFor() pattern.
 *
 * Flow (Production - with relayer):
 * 1. Player clicks "Throw" button
 * 2. Frontend fetches player's current nonce from contract
 * 3. Player signs EIP-712 typed message (no wallet gas popup)
 * 4. Frontend POSTs signature + params to relayer API
 * 5. Relayer validates signature, calls throwBallFor() on-chain
 * 6. Player sees catch result via contract events
 *
 * Flow (Dev Mode - no relayer):
 * 1. Player clicks "Throw" button
 * 2. Direct throwBall() contract call (player pays Entropy fee)
 * 3. Player sees catch result via contract events
 *
 * Dev Mode is enabled when:
 * - VITE_GASLESS_DEV_MODE=true, OR
 * - VITE_RELAYER_API_URL is not set/empty
 *
 * Usage:
 * ```tsx
 * const {
 *   initiateThrow,
 *   isLoading,
 *   isPending,
 *   error,
 *   throwStatus,
 *   isDevMode,  // True if using direct contract calls
 * } = useGaslessThrow();
 *
 * // Player presses throw button
 * const handleThrow = async () => {
 *   const success = await initiateThrow(0, 1); // slot=0, ballType=1
 *   if (success) {
 *     // Throw submitted, wait for events
 *   }
 * };
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import { useAccount, usePublicClient, useSignMessage, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { keccak256, encodePacked, type Hex } from 'viem';
import {
  POKEBALL_GAME_ADDRESS,
  POKEBALL_GAME_ABI,
  POKEBALL_GAME_CHAIN_ID,
  MAX_ACTIVE_POKEMON,
  type BallType,
} from './pokeballGameConfig';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type ThrowStatus =
  | 'idle'
  | 'fetching_nonce'
  | 'signing'
  | 'submitting'
  | 'pending'
  | 'success'
  | 'error';

export interface GaslessThrowPayload {
  player: `0x${string}`;
  pokemonSlot: number;
  ballType: BallType;
  nonce: bigint;
  signature: `0x${string}`;
}

export interface UseGaslessThrowReturn {
  /**
   * Initiate a gasless throw. Returns true if the request was submitted successfully.
   * The actual catch result will come through contract events.
   */
  initiateThrow: (pokemonSlot: number, ballType: BallType) => Promise<boolean>;

  /** Current status of the throw process */
  throwStatus: ThrowStatus;

  /** Whether any part of the throw process is in progress */
  isLoading: boolean;

  /** Whether waiting for relayer submission confirmation */
  isPending: boolean;

  /** Error message if something went wrong */
  error: string | null;

  /** Reset the hook state */
  reset: () => void;

  /** The transaction hash from the relayer (if available) */
  txHash: `0x${string}` | undefined;

  /** The request ID / sequence number (if available) */
  requestId: bigint | undefined;

  /** Whether running in dev mode (direct contract calls instead of relayer) */
  isDevMode: boolean;
}

// ============================================================
// CONFIG
// ============================================================

/**
 * Relayer API endpoint. Can be configured via environment variable.
 * If empty/undefined, dev mode is enabled (direct contract calls).
 */
const RELAYER_API_URL = import.meta.env.VITE_RELAYER_API_URL || '';

/**
 * Explicit dev mode flag. If true, bypasses relayer even if URL is set.
 */
const DEV_MODE_EXPLICIT = import.meta.env.VITE_GASLESS_DEV_MODE === 'true';

/**
 * Whether to use dev mode (direct contract calls instead of relayer).
 * Enabled when:
 * 1. VITE_GASLESS_DEV_MODE=true, OR
 * 2. VITE_RELAYER_API_URL is not set
 */
const IS_DEV_MODE = DEV_MODE_EXPLICIT || !RELAYER_API_URL;

/**
 * Timeout for relayer API requests (milliseconds).
 */
const RELAYER_TIMEOUT_MS = 30_000;

// Log mode on startup
console.log('[useGaslessThrow] Mode:', IS_DEV_MODE ? 'DEV (direct contract calls)' : 'PRODUCTION (relayer)', {
  RELAYER_API_URL: RELAYER_API_URL || '(not set)',
  DEV_MODE_EXPLICIT,
});

/**
 * Build the message hash that the contract expects.
 * Must match the contract's keccak256(abi.encodePacked(player, pokemonSlot, ballType, nonce, block.chainid, address(this)))
 */
function buildMessageHash(
  player: Hex,
  pokemonSlot: number,
  ballType: number,
  nonce: bigint,
  chainId: number,
  contractAddress: Hex
): Hex {
  return keccak256(
    encodePacked(
      ['address', 'uint8', 'uint8', 'uint256', 'uint256', 'address'],
      [player, pokemonSlot, ballType, nonce, BigInt(chainId), contractAddress]
    )
  );
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

export function useGaslessThrow(): UseGaslessThrowReturn {
  const { address: playerAddress, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: POKEBALL_GAME_CHAIN_ID });

  // State
  const [throwStatus, setThrowStatus] = useState<ThrowStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [requestId, setRequestId] = useState<bigint | undefined>(undefined);

  // Guard against duplicate requests
  const isProcessingRef = useRef(false);

  // Wagmi sign message hook (only used in production mode)
  // Uses personal_sign to match contract's "\x19Ethereum Signed Message:\n32" prefix
  const { signMessageAsync } = useSignMessage();

  // Wagmi write contract hook (only used in dev mode)
  const {
    writeContract,
    isPending: isWritePending,
    error: writeError,
    data: writeHash,
    reset: resetWrite,
  } = useWriteContract();

  // Wait for transaction receipt (dev mode)
  const {
    data: receipt,
    isLoading: isReceiptLoading,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: POKEBALL_GAME_CHAIN_ID,
  });

  // Read throw fee from contract (dev mode only - for Entropy fee)
  const {
    data: throwFeeRaw,
    isLoading: isFeeLoading,
  } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'getThrowFee',
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: IS_DEV_MODE && !!POKEBALL_GAME_ADDRESS,
      staleTime: 60_000,
    },
  });
  const throwFee = throwFeeRaw as bigint | undefined;

  // Read player's current nonce from contract (production mode only)
  const {
    data: currentNonce,
    refetch: refetchNonce,
  } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'getPlayerNonce',
    args: playerAddress ? [playerAddress] : undefined,
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: !IS_DEV_MODE && !!POKEBALL_GAME_ADDRESS && !!playerAddress,
      staleTime: 5_000, // Refresh nonce frequently
    },
  });

  /**
   * DEV MODE: Direct throwBall contract call (player pays Entropy fee).
   */
  const initiateThrowDevMode = useCallback(
    async (pokemonSlot: number, ballType: BallType): Promise<boolean> => {
      console.log('[useGaslessThrow] DEV MODE: Direct contract call');

      // Check throw fee
      if (!throwFee || throwFee === 0n) {
        setError('Entropy fee unavailable. Please try again.');
        setThrowStatus('error');
        return false;
      }

      // Add 10% buffer to fee
      const feeWithBuffer = (throwFee * 110n) / 100n;

      setThrowStatus('signing'); // Shows "Preparing..." in UI
      console.log('[useGaslessThrow] DEV MODE: Calling throwBall with fee:', feeWithBuffer.toString());

      try {
        writeContract({
          address: POKEBALL_GAME_ADDRESS!,
          abi: POKEBALL_GAME_ABI,
          functionName: 'throwBall',
          args: [pokemonSlot, ballType],
          chainId: POKEBALL_GAME_CHAIN_ID,
          value: feeWithBuffer,
        });

        setThrowStatus('pending');
        console.log('[useGaslessThrow] DEV MODE: Transaction submitted, waiting for confirmation...');
        return true;
      } catch (writeErr) {
        const msg = writeErr instanceof Error ? writeErr.message : 'Transaction failed';
        console.error('[useGaslessThrow] DEV MODE: Write error:', writeErr);
        setError(msg);
        setThrowStatus('error');
        return false;
      }
    },
    [throwFee, writeContract]
  );

  /**
   * PRODUCTION MODE: Gasless throw via relayer.
   */
  const initiateThrowRelayerMode = useCallback(
    async (pokemonSlot: number, ballType: BallType): Promise<boolean> => {
      console.log('[useGaslessThrow] PRODUCTION MODE: Relayer submission');

      // Step 1: Fetch current nonce
      setThrowStatus('fetching_nonce');
      console.log('[useGaslessThrow] Fetching player nonce...');

      const { data: freshNonce } = await refetchNonce();
      const nonce = (freshNonce as bigint) ?? BigInt(0);

      console.log('[useGaslessThrow] Player nonce:', nonce.toString());

      // Step 2: Sign message hash (personal_sign)
      // The contract uses: keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", innerHash))
      // where innerHash = keccak256(abi.encodePacked(player, pokemonSlot, ballType, nonce, chainId, contractAddress))
      // signMessageAsync automatically adds the "\x19Ethereum Signed Message:\n32" prefix
      setThrowStatus('signing');
      console.log('[useGaslessThrow] Building message hash...');

      const messageHash = buildMessageHash(
        playerAddress!,
        pokemonSlot,
        ballType,
        nonce,
        POKEBALL_GAME_CHAIN_ID,
        POKEBALL_GAME_ADDRESS!
      );
      console.log('[useGaslessThrow] Message hash:', messageHash);

      let signature: `0x${string}`;
      try {
        // Sign the raw hash - wagmi's signMessageAsync will add the Ethereum prefix
        signature = await signMessageAsync({
          message: { raw: messageHash },
        });
        console.log('[useGaslessThrow] Got signature:', signature.slice(0, 20) + '...');
      } catch (signError) {
        const signMsg = signError instanceof Error ? signError.message : 'User rejected signature';
        console.error('[useGaslessThrow] Signature failed:', signMsg);
        setError(signMsg.includes('rejected') ? 'Signature request cancelled' : signMsg);
        setThrowStatus('error');
        return false;
      }

      // Step 3: Submit to relayer
      setThrowStatus('submitting');
      console.log('[useGaslessThrow] Submitting to relayer:', RELAYER_API_URL);

      const payload: GaslessThrowPayload = {
        player: playerAddress!,
        pokemonSlot,
        ballType,
        nonce,
        signature,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RELAYER_TIMEOUT_MS);

      try {
        const response = await fetch(RELAYER_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...payload,
            nonce: payload.nonce.toString(), // Serialize bigint
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error || errorData.message || `Relayer error: ${response.status}`;
          console.error('[useGaslessThrow] Relayer error:', errorMsg);
          setError(errorMsg);
          setThrowStatus('error');
          return false;
        }

        const result = await response.json();
        console.log('[useGaslessThrow] Relayer response:', result);

        // Extract transaction hash and request ID if available
        if (result.txHash) {
          setTxHash(result.txHash as `0x${string}`);
        }
        if (result.requestId) {
          setRequestId(BigInt(result.requestId));
        }

        setThrowStatus('pending');
        console.log('[useGaslessThrow] Throw submitted successfully, waiting for events...');

        return true;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        const fetchMsg = fetchError instanceof Error ? fetchError.message : 'Network error';

        if (fetchMsg.includes('abort') || fetchMsg.includes('timeout')) {
          setError('Relayer request timed out. Please try again.');
        } else {
          setError(`Failed to reach relayer: ${fetchMsg}`);
        }

        console.error('[useGaslessThrow] Fetch error:', fetchError);
        setThrowStatus('error');
        return false;
      }
    },
    [playerAddress, signMessageAsync, refetchNonce]
  );

  /**
   * Main throw function - routes to dev mode or relayer mode.
   */
  const initiateThrow = useCallback(
    async (pokemonSlot: number, ballType: BallType): Promise<boolean> => {
      // Guard against duplicate requests
      if (isProcessingRef.current) {
        console.warn('[useGaslessThrow] Already processing a throw, ignoring duplicate request');
        return false;
      }

      // Validation
      if (!POKEBALL_GAME_ADDRESS) {
        setError('Contract address not configured');
        setThrowStatus('error');
        return false;
      }

      if (!isConnected || !playerAddress) {
        setError('Wallet not connected');
        setThrowStatus('error');
        return false;
      }

      if (pokemonSlot < 0 || pokemonSlot >= MAX_ACTIVE_POKEMON) {
        setError(`Invalid pokemon slot (must be 0-${MAX_ACTIVE_POKEMON - 1})`);
        setThrowStatus('error');
        return false;
      }

      if (ballType < 0 || ballType > 3) {
        setError('Invalid ball type');
        setThrowStatus('error');
        return false;
      }

      isProcessingRef.current = true;
      setError(null);
      setTxHash(undefined);
      setRequestId(undefined);

      try {
        // Route to appropriate mode
        if (IS_DEV_MODE) {
          return await initiateThrowDevMode(pokemonSlot, ballType);
        } else {
          return await initiateThrowRelayerMode(pokemonSlot, ballType);
        }
      } catch (unexpectedError) {
        const msg = unexpectedError instanceof Error ? unexpectedError.message : 'Unexpected error';
        console.error('[useGaslessThrow] Unexpected error:', unexpectedError);
        setError(msg);
        setThrowStatus('error');
        return false;
      } finally {
        isProcessingRef.current = false;
      }
    },
    [playerAddress, isConnected, initiateThrowDevMode, initiateThrowRelayerMode]
  );

  // Update txHash from writeContract result (dev mode)
  const writeHashRef = useRef(writeHash);
  if (writeHash && writeHash !== writeHashRef.current) {
    writeHashRef.current = writeHash;
    setTxHash(writeHash);
    console.log('[useGaslessThrow] DEV MODE: Got txHash:', writeHash);
  }

  // Handle writeContract error (dev mode)
  const writeErrorRef = useRef(writeError);
  if (writeError && writeError !== writeErrorRef.current) {
    writeErrorRef.current = writeError;
    const msg = writeError.message || 'Transaction failed';
    setError(msg.includes('rejected') ? 'Transaction cancelled' : msg);
    setThrowStatus('error');
    console.error('[useGaslessThrow] DEV MODE: Write error:', writeError);
  }

  /**
   * Reset hook state.
   */
  const reset = useCallback(() => {
    setThrowStatus('idle');
    setError(null);
    setTxHash(undefined);
    setRequestId(undefined);
    isProcessingRef.current = false;
    // Also reset wagmi write state (dev mode)
    if (IS_DEV_MODE) {
      resetWrite();
    }
  }, [resetWrite]);

  // Derived state
  const isLoading = ['fetching_nonce', 'signing', 'submitting'].includes(throwStatus) || (IS_DEV_MODE && isWritePending);
  const isPending = throwStatus === 'pending' || (IS_DEV_MODE && isReceiptLoading);

  return {
    initiateThrow,
    throwStatus,
    isLoading,
    isPending,
    error,
    reset,
    txHash,
    requestId,
    isDevMode: IS_DEV_MODE,
  };
}

export default useGaslessThrow;
