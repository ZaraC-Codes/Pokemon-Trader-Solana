/**
 * useThrowBall Hook (Solana)
 *
 * Hook for throwing a PokeBall at a Pokemon via the Anchor program.
 * Requests ORAO VRF for catch determination.
 * Replaces the EVM useThrowBall and useGaslessThrow hooks.
 *
 * On Solana, throws are direct transactions (~$0.001 fee), not gasless.
 */

import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { throwBall as throwBallTx } from '../../solana/programClient';
import { MAX_POKEMON_SLOTS } from '../../solana/constants';
import type { BallType } from '../../solana/constants';

export type ThrowStatus = 'idle' | 'sending' | 'confirming' | 'success' | 'error';

export interface UseThrowBallReturn {
  throwBall: ((slotIndex: number, ballType: BallType) => Promise<boolean>) | undefined;
  isLoading: boolean;
  isPending: boolean;
  error: Error | undefined;
  txSignature: string | undefined;
  throwStatus: ThrowStatus;
  reset: () => void;
}

export function useThrowBall(): UseThrowBallReturn {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const [txSignature, setTxSignature] = useState<string | undefined>();
  const [throwStatus, setThrowStatus] = useState<ThrowStatus>('idle');

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

      setIsLoading(true);
      setError(undefined);
      setTxSignature(undefined);
      setThrowStatus('sending');

      try {
        console.log('[useThrowBall] Throwing ball:', {
          slotIndex,
          ballType,
          player: wallet.publicKey.toBase58(),
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
        setThrowStatus('success');
        return true;
      } catch (e) {
        console.error('[useThrowBall] Throw failed:', e);
        const err = e instanceof Error ? e : new Error(String(e));

        // Parse Anchor errors
        const msg = err.message;
        if (msg.includes('InsufficientBalls')) {
          setError(new Error("You don't have any of that ball type"));
        } else if (msg.includes('SlotNotActive')) {
          setError(new Error('This Pokemon has already been caught or despawned'));
        } else if (msg.includes('MaxAttemptsReached')) {
          setError(new Error('No attempts remaining for this Pokemon'));
        } else if (msg.includes('InvalidSlotIndex')) {
          setError(new Error('Invalid Pokemon slot'));
        } else if (msg.includes('InvalidBallType')) {
          setError(new Error('Invalid ball type selected'));
        } else if (msg.includes('NotInitialized')) {
          setError(new Error('Game not initialized. Please try again later.'));
        } else if (msg.includes('User rejected') || msg.includes('rejected')) {
          setError(new Error('Transaction cancelled'));
        } else if (msg.includes('insufficient') || msg.includes('0x1')) {
          setError(new Error('Insufficient SOL for transaction fee'));
        } else if (msg.includes('timeout') || msg.includes('Timed out')) {
          setError(new Error('Transaction timed out. Please try again.'));
        } else if (msg.includes('blockhash') || msg.includes('Blockhash not found')) {
          setError(new Error('Network congestion. Please try again.'));
        } else {
          setError(new Error('Throw failed. Please try again.'));
        }

        setThrowStatus('error');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [connection, wallet, isLoading]
  );

  const reset = useCallback(() => {
    setError(undefined);
    setTxSignature(undefined);
    setIsLoading(false);
    setThrowStatus('idle');
  }, []);

  const isConnected = !!wallet.publicKey && !!wallet.signTransaction;

  return {
    throwBall: isConnected ? throwBall : undefined,
    isLoading,
    isPending: isLoading,
    error,
    txSignature,
    throwStatus,
    reset,
  };
}
