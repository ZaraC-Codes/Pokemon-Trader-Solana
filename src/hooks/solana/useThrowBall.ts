/**
 * useThrowBall Hook (Solana)
 *
 * Hook for throwing a PokeBall at a Pokemon via the Anchor program.
 * Requests ORAO VRF for catch determination, then listens for
 * CaughtPokemon / FailedCatch events to resolve the result.
 *
 * Lifecycle: idle → sending → confirming → waiting_vrf → caught/missed/error
 *
 * On Solana, throws are direct transactions (~$0.001 fee), not gasless.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { throwBall as throwBallTx } from '../../solana/programClient';
import { MAX_POKEMON_SLOTS } from '../../solana/constants';
import type { BallType } from '../../solana/constants';
import {
  useCaughtPokemonEvents,
  useFailedCatchEvents,
} from './useSolanaEvents';

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
// VRF TIMEOUT
// ============================================================

const VRF_TIMEOUT_MS = 12_000; // 12 seconds

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

  // Track which slot we're currently waiting on
  const pendingSlotRef = useRef<number | null>(null);
  const pendingPlayerRef = useRef<string | null>(null);
  const vrfTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for VRF resolution events
  const { events: caughtEvents } = useCaughtPokemonEvents();
  const { events: failedEvents } = useFailedCatchEvents();

  // ---- Watch for CaughtPokemon matching our pending throw ----
  useEffect(() => {
    if (throwStatus !== 'waiting_vrf') return;
    if (pendingSlotRef.current === null || !pendingPlayerRef.current) return;

    const slot = pendingSlotRef.current;
    const player = pendingPlayerRef.current;

    for (const ev of caughtEvents) {
      if (
        ev.args.catcher === player &&
        ev.args.slotIndex === slot
      ) {
        console.log('[useThrowBall] CaughtPokemon event matched:', ev.args);

        // Clear timeout
        if (vrfTimeoutRef.current) {
          clearTimeout(vrfTimeoutRef.current);
          vrfTimeoutRef.current = null;
        }

        const result: ThrowResult = {
          status: 'caught',
          pokemonId: ev.args.pokemonId,
          slotIndex: ev.args.slotIndex,
          nftMint: ev.args.nftMint,
          txSignature: txSignature ?? undefined,
        };

        setLastResult(result);
        setThrowStatus('caught');
        setIsLoading(false);
        pendingSlotRef.current = null;
        pendingPlayerRef.current = null;
        return;
      }
    }
  }, [caughtEvents, throwStatus, txSignature]);

  // ---- Watch for FailedCatch matching our pending throw ----
  useEffect(() => {
    if (throwStatus !== 'waiting_vrf') return;
    if (pendingSlotRef.current === null || !pendingPlayerRef.current) return;

    const slot = pendingSlotRef.current;
    const player = pendingPlayerRef.current;

    for (const ev of failedEvents) {
      if (
        ev.args.thrower === player &&
        ev.args.slotIndex === slot
      ) {
        console.log('[useThrowBall] FailedCatch event matched:', ev.args);

        // Clear timeout
        if (vrfTimeoutRef.current) {
          clearTimeout(vrfTimeoutRef.current);
          vrfTimeoutRef.current = null;
        }

        const result: ThrowResult = {
          status: 'missed',
          pokemonId: ev.args.pokemonId,
          slotIndex: ev.args.slotIndex,
          attemptsRemaining: ev.args.attemptsRemaining,
          txSignature: txSignature ?? undefined,
        };

        setLastResult(result);
        setThrowStatus('missed');
        setIsLoading(false);
        pendingSlotRef.current = null;
        pendingPlayerRef.current = null;
        return;
      }
    }
  }, [failedEvents, throwStatus, txSignature]);

  // ---- Cleanup timeout on unmount ----
  useEffect(() => {
    return () => {
      if (vrfTimeoutRef.current) {
        clearTimeout(vrfTimeoutRef.current);
      }
    };
  }, []);

  // ---- throwBall function ----
  const throwBall = useCallback(
    async (slotIndex: number, ballType: BallType): Promise<boolean> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        setError(new Error('Wallet not connected'));
        return false;
      }

      if (slotIndex < 0 || slotIndex >= MAX_POKEMON_SLOTS) {
        setError(new Error(`Invalid slot index (must be 0-${MAX_POKEMON_SLOTS - 1})`));
        return false;
      }

      // Guard against duplicate throws
      if (isLoading) {
        console.warn('[useThrowBall] Throw already in progress');
        return false;
      }

      // Clear any previous result
      setLastResult(null);
      setIsLoading(true);
      setError(undefined);
      setTxSignature(undefined);
      setThrowStatus('sending');

      const playerKey = wallet.publicKey.toBase58();
      pendingSlotRef.current = slotIndex;
      pendingPlayerRef.current = playerKey;

      try {
        console.log('[useThrowBall] Throwing ball:', {
          slotIndex,
          ballType,
          player: playerKey,
        });

        const anchorWallet: AnchorWallet = {
          publicKey: wallet.publicKey,
          signTransaction: wallet.signTransaction,
          signAllTransactions: wallet.signAllTransactions!,
        };

        setThrowStatus('confirming');

        const sig = await throwBallTx(
          connection,
          anchorWallet,
          slotIndex,
          ballType
        );

        console.log('[useThrowBall] Throw confirmed:', sig);
        setTxSignature(sig);
        setThrowStatus('waiting_vrf');

        // Start VRF timeout
        if (vrfTimeoutRef.current) clearTimeout(vrfTimeoutRef.current);
        vrfTimeoutRef.current = setTimeout(() => {
          // Only timeout if still waiting
          if (pendingSlotRef.current !== null) {
            console.warn('[useThrowBall] VRF timeout — no event received within', VRF_TIMEOUT_MS, 'ms');
            const result: ThrowResult = {
              status: 'error',
              slotIndex,
              txSignature: sig,
              errorMessage: 'VRF timeout — catch result not received. The result may still process on-chain.',
            };
            setLastResult(result);
            setThrowStatus('error');
            setError(new Error('VRF timeout — result not received'));
            setIsLoading(false);
            pendingSlotRef.current = null;
            pendingPlayerRef.current = null;
          }
        }, VRF_TIMEOUT_MS);

        return true;
      } catch (e) {
        console.error('[useThrowBall] Throw failed:', e);
        const err = e instanceof Error ? e : new Error(String(e));

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
        } else if (msg.includes('blockhash') || msg.includes('Blockhash not found')) {
          friendlyError = new Error('Network congestion. Please try again.');
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
        pendingSlotRef.current = null;
        pendingPlayerRef.current = null;
        return false;
      } finally {
        // Note: isLoading stays true until VRF resolves or timeout
        // Only set false on tx failure (caught in the catch block)
        if (throwStatus === 'error' || throwStatus === 'idle') {
          setIsLoading(false);
        }
      }
    },
    [connection, wallet, isLoading, throwStatus]
  );

  const reset = useCallback(() => {
    setError(undefined);
    setTxSignature(undefined);
    setIsLoading(false);
    setThrowStatus('idle');
    setLastResult(null);
    pendingSlotRef.current = null;
    pendingPlayerRef.current = null;
    if (vrfTimeoutRef.current) {
      clearTimeout(vrfTimeoutRef.current);
      vrfTimeoutRef.current = null;
    }
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
