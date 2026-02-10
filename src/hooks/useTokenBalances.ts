/**
 * Token Balance Hooks
 *
 * Hooks for fetching APE (native) and USDC.e (ERC-20) token balances on ApeChain.
 *
 * IMPORTANT: On ApeChain, APE is the native gas token, not an ERC-20.
 * - APE: Use wagmi's useBalance hook (native balance)
 * - USDC.e: Use ERC-20 balanceOf via useReadContract
 *
 * Usage:
 * ```tsx
 * import { useApeBalance, useUsdcBalance, useApeUsdPrice } from '../hooks/useTokenBalances';
 *
 * function MyComponent() {
 *   const { account } = useActiveWeb3React();
 *   const { balance: apeBalance, isLoading: apeLoading } = useApeBalance(account);
 *   const { balance: usdcBalance, isLoading: usdcLoading } = useUsdcBalance(account);
 *   const { price: apePrice, isLoading: priceLoading } = useApeUsdPrice();
 *
 *   const apeUsdValue = apeBalance * (apePrice ?? 0);
 *
 *   return (
 *     <div>
 *       <p>APE: {apeBalance.toFixed(2)} (~${apeUsdValue.toFixed(2)})</p>
 *       <p>USDC: ${usdcBalance.toFixed(2)}</p>
 *     </div>
 *   );
 * }
 * ```
 */

import { useMemo } from 'react';
import { useBalance, useReadContract } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { apeChainMainnet } from '../services/apechainConfig';

// ============================================================
// TOKEN ADDRESSES (from contracts/addresses.json)
// ============================================================

/**
 * Token contract addresses on ApeChain Mainnet.
 */
export const TOKEN_ADDRESSES = {
  /** USDC.e (Stargate Bridged USDC) - ERC-20 */
  USDC: '0xF1815bd50389c46847f0Bda824eC8da914045D14' as const,
  /**
   * APE is the NATIVE token on ApeChain, not an ERC-20.
   * This address is only used for reference/display purposes.
   */
  APE: '0x0000000000000000000000000000000000000000' as const,
} as const;

/**
 * Token decimals for balance formatting.
 */
export const TOKEN_DECIMALS = {
  USDC: 6,
  APE: 18,
} as const;

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface TokenBalanceResult {
  /** Formatted balance (human-readable, e.g., 100.50) */
  balance: number;
  /** Raw balance in smallest unit (wei for APE, 6 decimals for USDC) */
  raw: bigint | undefined;
  /** Whether the balance is currently loading */
  isLoading: boolean;
  /** Whether there was an error fetching the balance */
  isError: boolean;
  /** Error message if any */
  error: string | null;
  /** Function to manually refetch the balance */
  refetch: () => void;
}

export interface PriceResult {
  /** USD price per token */
  price: number | null;
  /** Whether the price is loading */
  isLoading: boolean;
  /** Whether there was an error */
  isError: boolean;
  /** Error message if any */
  error: string | null;
  /** Function to manually refetch the price */
  refetch: () => void;
}

// ============================================================
// ERC-20 ABI (minimal for balanceOf)
// ============================================================

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ============================================================
// APE USD PRICE HOOK
// ============================================================

/**
 * Fetch APE/USD price from CoinGecko API.
 * Falls back gracefully if the API is unavailable.
 */
async function fetchApeUsdPrice(): Promise<number> {
  try {
    // CoinGecko free API - ApeCoin ID is 'apecoin'
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=apecoin&vs_currencies=usd',
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API returned ${response.status}`);
    }

    const data = await response.json();
    const price = data?.apecoin?.usd;

    if (typeof price !== 'number' || isNaN(price)) {
      throw new Error('Invalid price data from CoinGecko');
    }

    return price;
  } catch (error) {
    console.warn('[useApeUsdPrice] Failed to fetch APE price:', error);
    throw error;
  }
}

/**
 * Hook for fetching APE/USD price.
 * Uses CoinGecko API with 60-second cache.
 *
 * @returns Price data, loading state, and error state
 */
export function useApeUsdPrice(): PriceResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ape-usd-price'],
    queryFn: fetchApeUsdPrice,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes (formerly cacheTime)
    retry: 2,
    retryDelay: 1000,
  });

  return {
    price: data ?? null,
    isLoading,
    isError,
    error: isError ? (error as Error)?.message ?? 'Failed to fetch price' : null,
    refetch,
  };
}

// ============================================================
// NATIVE APE BALANCE HOOK
// ============================================================

/**
 * Hook for native APE balance on ApeChain.
 *
 * IMPORTANT: APE is the native gas token on ApeChain (like ETH on Ethereum).
 * We use wagmi's useBalance hook, not an ERC-20 balanceOf call.
 *
 * @param address - Wallet address to fetch balance for
 * @returns Formatted APE balance, raw value, loading state, and refetch function
 */
export function useApeBalance(address?: `0x${string}`): TokenBalanceResult {
  const { data, isLoading, isError, error, refetch } = useBalance({
    address: address,
    chainId: apeChainMainnet.id,
    query: {
      enabled: !!address,
      staleTime: 10_000, // 10 seconds
      refetchInterval: 30_000, // Refetch every 30 seconds
    },
  });

  const formatted = useMemo(() => {
    if (!data?.value) return 0;
    // data.value is in wei (18 decimals)
    return Number(data.value) / Math.pow(10, TOKEN_DECIMALS.APE);
  }, [data?.value]);

  return {
    balance: formatted,
    raw: data?.value,
    isLoading,
    isError,
    error: isError ? (error as Error)?.message ?? 'Failed to fetch APE balance' : null,
    refetch,
  };
}

// ============================================================
// USDC.e BALANCE HOOK (ERC-20)
// ============================================================

/**
 * Hook for USDC.e (ERC-20) balance on ApeChain.
 *
 * @param address - Wallet address to fetch balance for
 * @returns Formatted USDC balance, raw value, loading state, and refetch function
 */
export function useUsdcBalance(address?: `0x${string}`): TokenBalanceResult {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: TOKEN_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: apeChainMainnet.id,
    query: {
      enabled: !!address,
      staleTime: 10_000, // 10 seconds
      refetchInterval: 30_000, // Refetch every 30 seconds
    },
  });

  const formatted = useMemo(() => {
    if (data === undefined || data === null) return 0;
    // USDC has 6 decimals
    return Number(data) / Math.pow(10, TOKEN_DECIMALS.USDC);
  }, [data]);

  return {
    balance: formatted,
    raw: data as bigint | undefined,
    isLoading,
    isError,
    error: isError ? (error as Error)?.message ?? 'Failed to fetch USDC balance' : null,
    refetch,
  };
}

// ============================================================
// COMBINED BALANCES HOOK
// ============================================================

/**
 * Hook for both APE and USDC.e balances at once.
 * Useful when you need both balances in a component.
 *
 * @param address - Wallet address to fetch balances for
 * @returns Object with both token balances
 */
export function useTokenBalances(address?: `0x${string}`) {
  const ape = useApeBalance(address);
  const usdc = useUsdcBalance(address);

  return {
    ape,
    usdc,
    isLoading: ape.isLoading || usdc.isLoading,
    isError: ape.isError || usdc.isError,
    refetchAll: () => {
      ape.refetch();
      usdc.refetch();
    },
  };
}

// ============================================================
// BALANCE WITH USD VALUE HOOK
// ============================================================

export interface BalanceWithUsdResult extends TokenBalanceResult {
  /** USD value of the balance (balance * price) */
  usdValue: number | null;
  /** Whether the USD value is still loading (balance or price loading) */
  isUsdLoading: boolean;
}

/**
 * Hook for APE balance with USD value.
 * Combines balance fetching with price fetching.
 *
 * @param address - Wallet address to fetch balance for
 * @returns APE balance with USD value
 */
export function useApeBalanceWithUsd(address?: `0x${string}`): BalanceWithUsdResult {
  const balance = useApeBalance(address);
  const price = useApeUsdPrice();

  const usdValue = useMemo(() => {
    if (balance.balance === 0 || price.price === null) return null;
    return balance.balance * price.price;
  }, [balance.balance, price.price]);

  return {
    ...balance,
    usdValue,
    isUsdLoading: balance.isLoading || price.isLoading,
  };
}
