/**
 * useThrowBall Hook (Solana)
 *
 * Hook for throwing a PokeBall at a Pokemon via the Anchor program.
 * Full lifecycle:
 *   1. Send throw_ball tx (requests ORAO VRF)
 *   2. Poll for VRF fulfillment (ORAO fills randomness sub-second)
 *   3. Send consume_randomness tx (crank — resolves catch/miss)
 *   4. Parse tx logs for CaughtPokemon / FailedCatch result
 *
 * Status: idle → sending → confirming → waiting_vrf → confirming → caught/missed/error
 *
 * On Solana, throws are direct transactions (~$0.001 fee per tx, 2 txs total).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import type { Connection } from '@solana/web3.js';
import {
  throwBall as throwBallTx,
  pollVrfFulfillment,
  consumeRandomness,
} from '../../solana/programClient';
import { MAX_POKEMON_SLOTS } from '../../solana/constants';
import type { BallType } from '../../solana/constants';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type ThrowStatus = 'idle' | 'sending' | 'confirming' | 'waiting_vrf' | 'caught' | 'missed' | 'error';

export interface ThrowResult {
  status: 'caught' | 'missed' | 'error';
  pokemonId?: bigint;
  slotIndex?: number;
  nftMint?: string;
  attemptsRemaining?: number;
  txSignature?: string;
  errorMessage?: string;
}

export interface UseThrowBallReturn {
  throwBall: ((slotIndex: number, ballType: BallType) => Promise<boolean>) | undefined;
  isLoading: boolean;
  isPending: boolean;
  error: Error | undefined;
  txSignature: string | undefined;
  throwStatus: ThrowStatus;
  lastResult: ThrowResult | null;
  reset: () => void;
}

// ============================================================
// PARSE CONSUME_RANDOMNESS RESULT FROM TX LOGS
// ============================================================

/**
 * Parse the consume_randomness transaction logs to determine caught/missed.
 * Anchor emits events as base64-encoded data in program logs.
 * We use a simpler approach: look for the program log messages.
 */
async function parseConsumeResult(
  connection: Connection,
  consumeTxSig: string,
  slotIndex: number,
  throwTxSig: string
): Promise<ThrowResult> {
  try {
    // Fetch the transaction with logs
    const txInfo = await connection.getTransaction(consumeTxSig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!txInfo?.meta?.logMessages) {
      console.warn('[parseConsumeResult] No log messages found, defaulting to missed');
      return { status: 'missed', slotIndex, txSignature: throwTxSig };
    }

    const logs = txInfo.meta.logMessages;
    console.log('[parseConsumeResult] Transaction logs:', logs);

    // Look for program log messages that indicate caught or missed
    // The on-chain code uses msg!() which produces "Program log: ..." entries
    const caughtLog = logs.find((log: string) => log.includes('CAUGHT by'));
    const missedLog = logs.find((log: string) => log.includes('NOT caught'));

    if (caughtLog) {
      console.log('[parseConsumeResult] CAUGHT! Log:', caughtLog);
      // Extract Pokemon ID from log: "Pokemon {id} CAUGHT by {player}! NFT: {mint}"
      const pokemonIdMatch = caughtLog.match(/Pokemon (\d+) CAUGHT/);
      const pokemonId = pokemonIdMatch ? BigInt(pokemonIdMatch[1]) : undefined;
      return {
        status: 'caught',
        slotIndex,
        pokemonId,
        txSignature: throwTxSig,
      };
    }

    if (missedLog) {
      console.log('[parseConsumeResult] MISSED. Log:', missedLog);
      // Extract from: "Pokemon {id} NOT caught. Attempts remaining: {n}"
      const pokemonIdMatch = missedLog.match(/Pokemon (\d+) NOT caught/);
      const remainingMatch = missedLog.match(/Attempts remaining: (\d+)/);
      const pokemonId = pokemonIdMatch ? BigInt(pokemonIdMatch[1]) : undefined;
      const attemptsRemaining = remainingMatch ? parseInt(remainingMatch[1], 10) : undefined;
      return {
        status: 'missed',
        slotIndex,
        pokemonId,
        attemptsRemaining,
        txSignature: throwTxSig,
      };
    }

    // Fallback: check if transaction succeeded — if so, default to missed
    console.warn('[parseConsumeResult] Could not determine caught/missed from logs');
    return { status: 'missed', slotIndex, txSignature: throwTxSig };
  } catch (e) {
    console.error('[parseConsumeResult] Failed to parse result:', e);
    // If we can't parse, the consume_randomness tx still succeeded.
    // Default to missed since caught is the rarer outcome.
    return { status: 'missed', slotIndex, txSignature: throwTxSig };
  }
}

// ============================================================
// VRF POLLING CONFIG
// ============================================================

const VRF_POLL_TIMEOUT_MS = 30_000; // 30 seconds for VRF fulfillment
const VRF_POLL_INTERVAL_MS = 1_500; // Poll every 1.5 seconds

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

export function useThrowBall(): UseThrowBallReturn {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const [txSignature, setTxSignature] = useState<string | undefined>();
  const [throwStatus, setThrowStatus] = useState<ThrowStatus>('idle');
  const [lastResult, setLastResult] = useState<ThrowResult | null>(null);

  // Track cancellation on unmount
  const cancelledRef = useRef(false);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // ---- throwBall function ----
  // Full lifecycle: throw_ball tx → poll VRF → consume_randomness tx → result
  const throwBall = useCallback(
    async (slotIndex: number, ballType: BallType): Promise<boolean> => {
      console.log('[useThrowBall] throwBall called:', { slotIndex, ballType });

      if (!wallet.publicKey || !wallet.signTransaction) {
        console.warn('[useThrowBall] no wallet connected, not sending');
        setError(new Error('Wallet not connected'));
        return false;
      }

      if (slotIndex < 0 || slotIndex >= MAX_POKEMON_SLOTS) {
        console.warn('[useThrowBall] invalid slotIndex:', slotIndex);
        setError(new Error(`Invalid slot index (must be 0-${MAX_POKEMON_SLOTS - 1})`));
        return false;
      }

      if (ballType == null || ballType < 0 || ballType > 3) {
        console.warn('[useThrowBall] invalid ballType:', ballType);
        setError(new Error('Invalid ball type'));
        return false;
      }

      // Guard against duplicate throws
      if (isLoading) {
        console.warn('[useThrowBall] Throw already in progress, not sending');
        return false;
      }

      // Clear any previous result
      setLastResult(null);
      setIsLoading(true);
      setError(undefined);
      setTxSignature(undefined);
      setThrowStatus('sending');

      const playerKey = wallet.publicKey;

      try {
        console.log('[useThrowBall] sending throw transaction:', {
          slotIndex,
          ballType,
          payer: playerKey.toBase58(),
        });

        const anchorWallet: AnchorWallet = {
          publicKey: wallet.publicKey,
          signTransaction: wallet.signTransaction,
          signAllTransactions: wallet.signAllTransactions!,
        };

        setThrowStatus('confirming');

        // ---- Step 1: Send throw_ball transaction (requests VRF) ----
        const throwResult = await throwBallTx(
          connection,
          anchorWallet,
          slotIndex,
          ballType
        );

        if (cancelledRef.current) return false;

        console.log('[useThrowBall] throw_ball tx confirmed:', throwResult.txSignature);
        setTxSignature(throwResult.txSignature);
        setThrowStatus('waiting_vrf');

        // ---- Step 2: Poll for ORAO VRF fulfillment ----
        console.log('[useThrowBall] polling for VRF fulfillment...');
        await pollVrfFulfillment(
          connection,
          throwResult.vrfRandomnessPDA,
          VRF_POLL_TIMEOUT_MS,
          VRF_POLL_INTERVAL_MS
        );

        if (cancelledRef.current) return false;

        console.log('[useThrowBall] VRF fulfilled, sending consume_randomness...');
        setThrowStatus('confirming');

        // ---- Step 3: Send consume_randomness transaction (crank) ----
        const consumeTx = await consumeRandomness(
          connection,
          anchorWallet,
          throwResult.vrfRequestPDA,
          throwResult.vrfSeed,
          playerKey
        );

        if (cancelledRef.current) return false;

        console.log('[useThrowBall] consume_randomness tx confirmed:', consumeTx);

        // ---- Step 4: Parse the transaction logs for the result ----
        // The on-chain program emits CaughtPokemon or FailedCatch events.
        // We can parse these from the transaction logs.
        const parsedResult = await parseConsumeResult(connection, consumeTx, slotIndex, throwResult.txSignature);

        if (cancelledRef.current) return false;

        setLastResult(parsedResult);
        setThrowStatus(parsedResult.status === 'caught' ? 'caught' : 'missed');
        setIsLoading(false);
        return true;
      } catch (e) {
        if (cancelledRef.current) return false;

        console.error('[useThrowBall] throw flow failed:', e);
        const err = e instanceof Error ? e : new Error(String(e));
        console.error('[useThrowBall] raw error message:', err.message);

        // Parse Anchor errors
        const msg = err.message;
        let friendlyError: Error;
        if (msg.includes('InsufficientBalls')) {
          friendlyError = new Error("You don't have any of that ball type");
        } else if (msg.includes('SlotNotActive')) {
          friendlyError = new Error('This Pokemon has already been caught or despawned');
        } else if (msg.includes('MaxAttemptsReached')) {
          friendlyError = new Error('No attempts remaining for this Pokemon');
        } else if (msg.includes('InvalidSlotIndex')) {
          friendlyError = new Error('Invalid Pokemon slot');
        } else if (msg.includes('InvalidBallType')) {
          friendlyError = new Error('Invalid ball type selected');
        } else if (msg.includes('NotInitialized')) {
          friendlyError = new Error('Game not initialized. Please try again later.');
        } else if (msg.includes('User rejected') || msg.includes('rejected')) {
          friendlyError = new Error('Transaction cancelled');
        } else if (msg.includes('insufficient') || msg.includes('0x1')) {
          friendlyError = new Error('Insufficient SOL for transaction fee');
        } else if (msg.includes('timeout') || msg.includes('Timed out')) {
          friendlyError = new Error('Transaction timed out. Please try again.');
        } else if (msg.includes('VRF fulfillment timeout')) {
          friendlyError = new Error('VRF timeout — catch result not received. It may still process on-chain.');
        } else if (msg.includes('blockhash') || msg.includes('Blockhash not found')) {
          friendlyError = new Error('Network congestion. Please try again.');
        } else if (msg.includes('VrfAlreadyFulfilled')) {
          friendlyError = new Error('This throw was already resolved. Refresh and try again.');
        } else {
          friendlyError = new Error('Throw failed. Please try again.');
        }

        setError(friendlyError);
        setLastResult({
          status: 'error',
          slotIndex,
          errorMessage: friendlyError.message,
        });
        setThrowStatus('error');
        setIsLoading(false);
        return false;
      }
    },
    [connection, wallet, isLoading]
  );

  const reset = useCallback(() => {
    setError(undefined);
    setTxSignature(undefined);
    setIsLoading(false);
    setThrowStatus('idle');
    setLastResult(null);
  }, []);

  const isConnected = !!wallet.publicKey && !!wallet.signTransaction;

  return {
    throwBall: isConnected ? throwBall : undefined,
    isLoading,
    isPending: isLoading,
    error,
    txSignature,
    throwStatus,
    lastResult,
    reset,
  };
}
