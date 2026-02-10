/**
 * usePurchaseBalls Hook (Solana)
 *
 * Hook for purchasing PokeBalls via the Anchor program.
 * Transfers SolBalls tokens to the game account.
 * Replaces the EVM usePurchaseBalls hook.
 */

import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { purchaseBalls as purchaseBallsTx } from '../../solana/programClient';
import type { BallType } from '../../solana/constants';

export interface UsePurchaseBallsReturn {
  /** @alias purchaseBalls */
  write: ((ballType: BallType, quantity: number) => Promise<void>) | undefined;
  /** Alias for write — used by PokeBallShop */
  purchaseBalls: ((ballType: BallType, quantity: number) => Promise<void>) | undefined;
  isLoading: boolean;
  isPending: boolean;
  error: Error | undefined;
  txSignature: string | undefined;
  reset: () => void;
}

export function usePurchaseBalls(): UsePurchaseBallsReturn {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const [txSignature, setTxSignature] = useState<string | undefined>();

  const write = useCallback(
    async (ballType: BallType, quantity: number) => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        setError(new Error('Wallet not connected'));
        return;
      }

      if (quantity <= 0) {
        setError(new Error('Quantity must be greater than 0'));
        return;
      }

      setIsLoading(true);
      setError(undefined);
      setTxSignature(undefined);

      try {
        console.log('[usePurchaseBalls] Purchasing balls:', {
          ballType,
          quantity,
          player: wallet.publicKey.toBase58(),
        });

        // Build AnchorWallet from wallet adapter
        const anchorWallet: AnchorWallet = {
          publicKey: wallet.publicKey,
          signTransaction: wallet.signTransaction,
          signAllTransactions: wallet.signAllTransactions!,
        };

        const sig = await purchaseBallsTx(
          connection,
          anchorWallet,
          ballType,
          quantity
        );

        console.log('[usePurchaseBalls] Transaction confirmed:', sig);
        setTxSignature(sig);
      } catch (e) {
        console.error('[usePurchaseBalls] Purchase failed:', e);
        const err = e instanceof Error ? e : new Error(String(e));

        // Parse Anchor errors for user-friendly messages
        const msg = err.message;
        if (msg.includes('InsufficientSolBalls')) {
          setError(new Error('Insufficient SolBalls balance'));
        } else if (msg.includes('ZeroQuantity')) {
          setError(new Error('Quantity must be greater than 0'));
        } else if (msg.includes('PurchaseExceedsMax')) {
          setError(new Error('Purchase exceeds maximum per transaction'));
        } else if (msg.includes('User rejected')) {
          setError(new Error('Transaction cancelled'));
        } else {
          setError(err);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [connection, wallet]
  );

  const reset = useCallback(() => {
    setError(undefined);
    setTxSignature(undefined);
    setIsLoading(false);
  }, []);

  const isConnected = !!wallet.publicKey && !!wallet.signTransaction;

  const writeFn = isConnected ? write : undefined;

  return {
    write: writeFn,
    purchaseBalls: writeFn,
    isLoading,
    isPending: isLoading,
    error,
    txSignature,
    reset,
  };
}
