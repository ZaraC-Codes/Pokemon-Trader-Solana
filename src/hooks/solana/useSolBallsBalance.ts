/**
 * useSolBallsBalance Hook
 *
 * Reads the player's SolBalls SPL token balance.
 * Replaces the EVM useApeBalance / useUsdcBalance hooks.
 * On Solana we only need SolBalls balance (no dual-currency).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { LAMPORTS_PER_SOL, type PublicKey } from '@solana/web3.js';
import { SOLBALLS_MINT, SOLBALLS_DECIMALS } from '../../solana/constants';

// ============================================================
// TYPES
// ============================================================

export interface TokenBalanceResult {
  /** Formatted balance (human-readable, e.g., 100.50) */
  balance: number;
  /** Raw balance in smallest unit (atomic units) */
  raw: bigint;
  /** Whether the balance is currently loading */
  isLoading: boolean;
  /** Whether there was an error */
  isError: boolean;
  /** Error message if any */
  error: string | null;
  /** Function to manually refetch */
  refetch: () => void;
}

const POLL_INTERVAL = 15_000; // 15 seconds

// ============================================================
// SOLBALLS BALANCE HOOK
// ============================================================

export function useSolBallsBalance(): TokenBalanceResult {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [rawBalance, setRawBalance] = useState<bigint>(0n);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollTrigger, setPollTrigger] = useState(0);

  const fetchBalance = useCallback(async () => {
    if (!publicKey) {
      setRawBalance(0n);
      setIsLoading(false);
      return;
    }

    try {
      const ata = await getAssociatedTokenAddress(SOLBALLS_MINT, publicKey);
      const accountInfo = await connection.getTokenAccountBalance(ata);
      const amount = BigInt(accountInfo.value.amount);
      setRawBalance(amount);
      setError(null);
    } catch (e) {
      // Account not found means 0 balance (user hasn't created ATA yet)
      if ((e as Error)?.message?.includes('could not find account') ||
          (e as Error)?.message?.includes('Invalid param') ||
          (e as Error)?.message?.includes('TokenAccountNotFoundError')) {
        setRawBalance(0n);
        setError(null);
      } else {
        setError((e as Error)?.message ?? 'Failed to fetch balance');
      }
    } finally {
      setIsLoading(false);
    }
  }, [connection, publicKey]);

  // Initial fetch + polling
  useEffect(() => {
    fetchBalance();
    const interval = setInterval(() => {
      setPollTrigger((prev) => prev + 1);
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  useEffect(() => {
    if (pollTrigger > 0) fetchBalance();
  }, [pollTrigger, fetchBalance]);

  const balance = useMemo(() => {
    return Number(rawBalance) / Math.pow(10, SOLBALLS_DECIMALS);
  }, [rawBalance]);

  const refetch = useCallback(() => {
    fetchBalance();
  }, [fetchBalance]);

  return {
    balance,
    raw: rawBalance,
    isLoading,
    isError: !!error,
    error,
    refetch,
  };
}

// ============================================================
// SOL BALANCE HOOK (for gas display)
// ============================================================

export function useSolBalance(): TokenBalanceResult {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [rawBalance, setRawBalance] = useState<bigint>(0n);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!publicKey) {
      setRawBalance(0n);
      setIsLoading(false);
      return;
    }

    try {
      const lamports = await connection.getBalance(publicKey);
      setRawBalance(BigInt(lamports));
      setError(null);
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to fetch SOL balance');
    } finally {
      setIsLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 30_000); // 30s polling
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const balance = useMemo(() => {
    return Number(rawBalance) / LAMPORTS_PER_SOL;
  }, [rawBalance]);

  return {
    balance,
    raw: rawBalance,
    isLoading,
    isError: !!error,
    error,
    refetch: fetchBalance,
  };
}
