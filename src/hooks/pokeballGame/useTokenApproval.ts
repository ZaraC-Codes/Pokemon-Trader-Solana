/**
 * useTokenApproval Hook
 *
 * Hook for checking and requesting ERC-20 token approval for PokeballGame contract.
 *
 * IMPORTANT (v1.4.0): APE payments no longer require approval!
 * - APE: Uses native APE via msg.value (like ETH on Ethereum). NO approval needed.
 * - USDC.e: Still requires ERC-20 approval via this hook.
 *
 * Usage:
 * ```tsx
 * // For USDC.e payments (requires approval)
 * const {
 *   allowance,
 *   isApproved,
 *   approve,
 *   isApproving,
 *   refetch,
 * } = useTokenApproval('USDC', totalCostWei);
 *
 * // Check if approval is needed
 * if (!isApproved) {
 *   await approve();
 * }
 *
 * // Then proceed with purchase
 * purchaseBalls(ballType, quantity, false);
 *
 * // For APE payments - NO approval needed!
 * // Just call purchaseBalls directly, the hook sends native APE via msg.value
 * purchaseBalls(ballType, quantity, true);
 * ```
 */

import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useConnectorClient } from 'wagmi';
import { erc20Abi, maxUint256, encodeFunctionData } from 'viem';
import { useActiveWeb3React } from '../useActiveWeb3React';
import {
  POKEBALL_GAME_ADDRESS,
  POKEBALL_GAME_CHAIN_ID,
  RELATED_CONTRACTS,
  type BallType,
} from './pokeballGameConfig';
import {
  isEthereumPhoneAvailable,
  getDGen1Diagnostic,
  getEthereumPhoneProvider,
  getRawEthereumProvider,
  getBundlerRpcUrl,
  type DGen1Diagnostic,
} from '../../utils/walletDetection';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type TokenType = 'APE' | 'USDC';

export interface UseTokenApprovalReturn {
  /** Current allowance in wei */
  allowance: bigint;
  /** Whether the current allowance covers the required amount */
  isApproved: boolean;
  /** Function to request unlimited approval */
  approve: () => void;
  /** Whether approval transaction is pending (wallet prompt) */
  isApproving: boolean;
  /** Whether approval transaction is being confirmed (on-chain) */
  isConfirming: boolean;
  /** Whether approval transaction was confirmed successfully */
  isConfirmed: boolean;
  /** Error from approval transaction */
  error: Error | undefined;
  /** Approval transaction hash */
  hash: `0x${string}` | undefined;
  /** Refetch the current allowance */
  refetch: () => void;
  /** Whether allowance is loading */
  isLoading: boolean;
  /** dGen1-specific debug state for on-screen debugging */
  dgen1Debug?: {
    isDGen1: boolean;
    isApproving: boolean;
    hash: `0x${string}` | undefined;
    error: string | undefined;
    lastStep: string;
    providerMethods?: string; // Available methods on the provider
    txParams?: string; // JSON string of the eth_sendTransaction params
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get ball price in the smallest unit (wei for APE, micro for USDC).
 * Matches contract constants.
 */
export function getBallPriceInWei(ballType: BallType, useAPE: boolean, apePriceUSD8Decimals: bigint = BigInt(64000000)): bigint {
  // Prices in USDC.e (6 decimals) - matching contract
  const BALL_PRICES_USDC: Record<BallType, bigint> = {
    0: BigInt(1_000_000),    // $1.00 = 1e6
    1: BigInt(10_000_000),   // $10.00 = 10e6
    2: BigInt(25_000_000),   // $25.00 = 25e6
    3: BigInt(49_900_000),   // $49.90 = 49.9e6
  };

  const priceUSDC = BALL_PRICES_USDC[ballType];

  if (!useAPE) {
    return priceUSDC;
  }

  // Guard against division by zero - use default price if 0 or undefined
  const safeApePriceUSD = apePriceUSD8Decimals && apePriceUSD8Decimals > 0n
    ? apePriceUSD8Decimals
    : BigInt(64000000); // Default to $0.64

  // Convert USDC to APE using the formula from contract:
  // apeAmount = (usdcAmount * 10^20) / apePriceUSD
  // apePriceUSD is 8 decimals (e.g., $0.64 = 64000000)
  const apeAmount = (priceUSDC * BigInt(10 ** 20)) / safeApePriceUSD;
  return apeAmount;
}

/**
 * Calculate total cost for a purchase.
 * Safe: returns BigInt(0) for invalid/NaN/negative quantities.
 */
export function calculateTotalCost(
  ballType: BallType,
  quantity: number,
  useAPE: boolean,
  apePriceUSD8Decimals: bigint = BigInt(64000000)
): bigint {
  // Guard against NaN, undefined, null, negative, or non-integer values
  const safeQuantity = Number.isFinite(quantity) && quantity > 0
    ? Math.floor(quantity)
    : 0;

  if (safeQuantity === 0) {
    return BigInt(0);
  }

  const pricePerBall = getBallPriceInWei(ballType, useAPE, apePriceUSD8Decimals);
  return pricePerBall * BigInt(safeQuantity);
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

/**
 * Hook for checking and requesting token approval for PokeballGame.
 *
 * IMPORTANT (v1.4.0): APE payments use native APE via msg.value and don't need approval.
 * This hook will return isApproved=true for APE type without making any contract calls.
 *
 * @param tokenType - 'APE' or 'USDC'
 * @param requiredAmount - Amount needed in wei (0 to just check current allowance)
 * @returns Object with allowance info, approve function, and loading states
 */
export function useTokenApproval(
  tokenType: TokenType,
  requiredAmount: bigint = BigInt(0)
): UseTokenApprovalReturn {
  const { account } = useActiveWeb3React();

  // v1.4.0: APE payments use native APE via msg.value - NO approval needed!
  // We check this flag but still call all hooks unconditionally to follow React rules
  const isNativeCurrency = tokenType === 'APE';

  // For APE (native), we don't need a token address, but we still need to call hooks
  // Use USDC address as a placeholder when APE is selected (hooks will be disabled)
  const tokenAddress = RELATED_CONTRACTS.USDC;
  const spender = POKEBALL_GAME_ADDRESS;

  // Log the configuration being used (only for USDC)
  useEffect(() => {
    if (!isNativeCurrency) {
      console.log('[useTokenApproval] Config:', {
        tokenType,
        tokenAddress,
        spender,
        owner: account,
        chainId: POKEBALL_GAME_CHAIN_ID,
      });
    } else {
      console.log('[useTokenApproval] APE uses native currency (v1.4.0) - no approval needed');
    }
  }, [isNativeCurrency, tokenType, tokenAddress, spender, account]);

  // Read current allowance - disabled for native currency
  const {
    data: allowanceData,
    isLoading: isAllowanceLoading,
    refetch,
  } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: account && spender ? [account, spender] : undefined,
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      // Disable for native currency (APE) - no allowance needed
      enabled: !isNativeCurrency && !!account && !!spender,
    },
  });

  // For native currency, allowance is effectively unlimited
  const allowance = isNativeCurrency ? maxUint256 : ((allowanceData as bigint) ?? BigInt(0));

  // Check if approved for required amount
  // Native currency is always approved
  const isApproved = useMemo(() => {
    if (isNativeCurrency) return true;
    if (requiredAmount == 0n) return true;
    return allowance >= requiredAmount;
  }, [isNativeCurrency, allowance, requiredAmount]);

  // Write contract for approval (standard wallets)
  const {
    writeContract,
    isPending: isApprovingWagmi,
    error: writeError,
    data: writeHash,
  } = useWriteContract();

  // dGen1-specific state for direct provider calls
  const [dgen1Approving, setDgen1Approving] = useState(false);
  const [dgen1Hash, setDgen1Hash] = useState<`0x${string}` | undefined>(undefined);
  const [dgen1Error, setDgen1Error] = useState<Error | undefined>(undefined);
  const [dgen1LastStep, setDgen1LastStep] = useState<string>('idle');
  const [dgen1ProviderMethods, setDgen1ProviderMethods] = useState<string>('');
  const [dgen1TxParams, setDgen1TxParams] = useState<string>(''); // JSON string of txParams for debug display

  // Check if this is a dGen1 device (cached value for debug display)
  const isDGen1 = isEthereumPhoneAvailable();

  // Combined approval state (wagmi OR dgen1)
  const isApproving = isApprovingWagmi || dgen1Approving;
  const combinedHash = writeHash || dgen1Hash;
  const combinedWriteError = writeError || dgen1Error;

  // Wait for confirmation (uses combined hash from wagmi or dGen1)
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: confirmError,
  } = useWaitForTransactionReceipt({
    hash: combinedHash,
    chainId: POKEBALL_GAME_CHAIN_ID,
  });

  // Track if we've already refetched for this confirmation
  const lastConfirmedHashRef = useRef<`0x${string}` | undefined>(undefined);

  // Auto-refetch allowance when approval transaction confirms (only for ERC-20)
  useEffect(() => {
    if (isNativeCurrency) return; // No refetch needed for native currency

    if (isConfirmed && combinedHash && combinedHash !== lastConfirmedHashRef.current) {
      console.log('[useTokenApproval] Approval tx confirmed! Refetching allowance...', {
        hash: combinedHash,
        token: tokenType,
        tokenAddress,
        spender,
        owner: account,
        chainId: POKEBALL_GAME_CHAIN_ID,
      });
      lastConfirmedHashRef.current = combinedHash;
      // Reset dGen1 state after confirmation
      setDgen1Approving(false);
      // Refetch the allowance after successful approval
      refetch().then((result) => {
        console.log('[useTokenApproval] Refetch result:', {
          data: result.data?.toString(),
          status: result.status,
          error: result.error,
        });
      });
    }
  }, [isNativeCurrency, isConfirmed, combinedHash, refetch, tokenType, tokenAddress, spender, account]);

  // Debug logging for approval state (only for USDC)
  useEffect(() => {
    if (isNativeCurrency) return;

    console.log('[useTokenApproval] State update:', {
      token: tokenType,
      allowance: allowance.toString(),
      requiredAmount: requiredAmount.toString(),
      isApproved,
      isApproving,
      isConfirming,
      isConfirmed,
      hash: combinedHash,
      isDgen1Approving: dgen1Approving,
    });
  }, [isNativeCurrency, tokenType, allowance, requiredAmount, isApproved, isApproving, isConfirming, isConfirmed, combinedHash, dgen1Approving]);

  // Approve function - requests unlimited approval (no-op for native currency)
  // For dGen1 devices, uses direct provider.request() instead of wagmi writeContract
  const approve = useCallback(async () => {
    if (isNativeCurrency) {
      console.warn('[useTokenApproval] APE does not require approval (uses native msg.value)');
      return;
    }

    if (!spender) {
      console.error('[useTokenApproval] Contract address not configured');
      return;
    }

    if (!account) {
      console.error('[useTokenApproval] No account connected');
      return;
    }

    // Check if this is a dGen1 device
    const isDGen1 = isEthereumPhoneAvailable();

    // Build the approve() call data
    const approveCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, maxUint256],
    });

    // ====== dGen1 DIAGNOSTIC LOGGING ======
    if (isDGen1) {
      console.log('[useTokenApproval] === dGen1 APPROVAL DIAGNOSTIC ===');
      try {
        const diagnostic = await getDGen1Diagnostic();
        console.log('[useTokenApproval] dGen1 diagnostic:', JSON.stringify(diagnostic, null, 2));

        // Warn if no bundler URL configured
        if (!diagnostic.hasBundlerUrl) {
          console.warn('[useTokenApproval] ⚠️ WARNING: No bundler RPC URL configured for dGen1!');
          console.warn('[useTokenApproval] Set VITE_BUNDLER_RPC_URL in .env for ApeChain (chainId: 33139)');
        }

        console.log('[useTokenApproval] dGen1 approve() transaction request:', {
          to: tokenAddress,
          data: approveCallData,
          value: '0x0',
          chainId: POKEBALL_GAME_CHAIN_ID,
          bundlerUrl: diagnostic.bundlerUrl,
        });
      } catch (diagError) {
        console.error('[useTokenApproval] Failed to get dGen1 diagnostic:', diagError);
      }
    }

    console.log('[useTokenApproval] Requesting approval:', {
      token: tokenType,
      tokenAddress,
      spender,
      amount: 'unlimited',
      isDGen1,
      chainId: POKEBALL_GAME_CHAIN_ID,
    });

    // ====== dGen1: Use direct provider.request() instead of wagmi ======
    // The dGen1 wallet may not properly receive wagmi's writeContract calls
    // because it needs transactions routed through its ERC-4337 bundler
    if (isDGen1) {
      console.log('[useTokenApproval] dGen1 detected - using direct eth_sendTransaction...');
      console.log('[useTokenApproval] Using WalletSDK-react-native format: value as decimal string, no from field');
      setDgen1LastStep('getting_provider');

      // Try the normal provider first, fall back to raw window.ethereum
      let provider = getEthereumPhoneProvider();
      if (!provider) {
        console.log('[useTokenApproval] getEthereumPhoneProvider returned null, trying raw provider...');
        provider = getRawEthereumProvider();
      }

      if (!provider) {
        console.error('[useTokenApproval] No provider available for dGen1');
        setDgen1Error(new Error('dGen1 wallet provider not available'));
        setDgen1LastStep('error_no_provider');
        return;
      }

      console.log('[useTokenApproval] Using provider:', {
        hasRequest: typeof provider.request === 'function',
        isEthereumPhone: provider.isEthereumPhone,
        isMetaMask: provider.isMetaMask,
      });

      try {
        setDgen1Approving(true);
        setDgen1Error(undefined);
        setDgen1Hash(undefined);
        setDgen1LastStep('building_tx');

        // Log all provider properties and methods for debugging
        const providerInfo = {
          keys: Object.keys(provider).slice(0, 10), // First 10 keys
          hasRequest: typeof provider.request === 'function',
          hasSend: typeof (provider as any).send === 'function',
          hasSendAsync: typeof (provider as any).sendAsync === 'function',
          hasSendTransaction: typeof (provider as any).sendTransaction === 'function',
          isEthereumPhone: provider.isEthereumPhone,
        };
        console.log('[useTokenApproval] dGen1 provider inspection:', providerInfo);

        // Update debug state with provider methods info
        const methodsStr = `req:${providerInfo.hasRequest} send:${providerInfo.hasSend} sendTx:${providerInfo.hasSendTransaction}`;
        setDgen1ProviderMethods(methodsStr);

        // Build the transaction object for eth_sendTransaction
        // Based on WalletSDK-react-native TransactionParams interface:
        // - value is a DECIMAL string (not hex) e.g., "0" not "0x0"
        // - chainId is a number (optional)
        // - No 'from' field (SDK gets it internally)
        // See: https://github.com/EthereumPhone/WalletSDK-react-native/blob/main/src/index.tsx
        const txParams = {
          to: tokenAddress,        // USDC.e token contract (checksummed)
          value: '0',              // No ETH/APE value for approve (DECIMAL string, not hex)
          data: approveCallData,   // Encoded approve(spender, maxUint256)
          chainId: POKEBALL_GAME_CHAIN_ID, // Chain ID as number (33139)
        };

        // Store for debug display
        setDgen1TxParams(JSON.stringify(txParams, null, 2));
        console.log('[useTokenApproval] dGen1 eth_sendTransaction params:', JSON.stringify(txParams, null, 2));

        setDgen1LastStep('sending_tx');

        // Try multiple provider methods in order of preference
        // The ethOS injected provider may use a non-standard API
        let txHash: `0x${string}`;
        let lastError: unknown;

        // Method 1: Standard EIP-1193 provider.request()
        if (typeof provider.request === 'function') {
          try {
            console.log('[useTokenApproval] Trying provider.request({ method: eth_sendTransaction })...');
            txHash = await provider.request({
              method: 'eth_sendTransaction',
              params: [txParams],
            }) as `0x${string}`;
            console.log('[useTokenApproval] provider.request succeeded:', txHash);
          } catch (err) {
            console.error('[useTokenApproval] provider.request failed:', err);
            lastError = err;
            setDgen1LastStep('request_failed');
          }
        }

        // Method 2: Direct sendTransaction method (some providers expose this)
        if (!txHash && typeof (provider as any).sendTransaction === 'function') {
          try {
            console.log('[useTokenApproval] Trying provider.sendTransaction()...');
            setDgen1LastStep('trying_sendTransaction');
            txHash = await (provider as any).sendTransaction(txParams) as `0x${string}`;
            console.log('[useTokenApproval] provider.sendTransaction succeeded:', txHash);
          } catch (err) {
            console.error('[useTokenApproval] provider.sendTransaction failed:', err);
            lastError = err;
            setDgen1LastStep('sendTransaction_failed');
          }
        }

        // Method 3: Legacy provider.send() (older web3 style)
        if (!txHash && typeof (provider as any).send === 'function') {
          try {
            console.log('[useTokenApproval] Trying provider.send(eth_sendTransaction, [...])...');
            setDgen1LastStep('trying_send');
            txHash = await (provider as any).send('eth_sendTransaction', [txParams]) as `0x${string}`;
            console.log('[useTokenApproval] provider.send succeeded:', txHash);
          } catch (err) {
            console.error('[useTokenApproval] provider.send failed:', err);
            lastError = err;
            setDgen1LastStep('send_failed');
          }
        }

        // If all methods failed, throw the last error
        if (!txHash) {
          throw lastError || new Error('No transaction method worked on this provider');
        }

        console.log('[useTokenApproval] dGen1 transaction submitted! Hash:', txHash);
        setDgen1Hash(txHash);
        setDgen1LastStep('tx_submitted');
        // Note: setDgen1Approving(false) will be called when tx confirms via useEffect

      } catch (error) {
        console.error('[useTokenApproval] dGen1 approval failed:', error);
        setDgen1Error(error instanceof Error ? error : new Error(String(error)));
        setDgen1Approving(false);
        setDgen1LastStep('error_' + (error instanceof Error ? error.message.slice(0, 30) : String(error).slice(0, 30)));
      }

      return; // Exit early for dGen1
    }

    // ====== Standard wallets: Use wagmi writeContract ======
    console.log('[useTokenApproval] Using wagmi writeContract for approval...');

    writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, maxUint256],
      chainId: POKEBALL_GAME_CHAIN_ID,
    });

    console.log('[useTokenApproval] writeContract called - waiting for wallet response...');
  }, [isNativeCurrency, tokenType, tokenAddress, spender, account, writeContract]);

  // For native currency, no errors possible from approval flow
  // For ERC-20, combine wagmi errors, dGen1 errors, and confirm errors
  const error = isNativeCurrency ? undefined : (combinedWriteError || confirmError || undefined);

  // For native currency, never loading
  const isLoading = isNativeCurrency ? false : isAllowanceLoading;

  // Build dGen1 debug state for on-screen debugging (since console logs aren't accessible on device)
  const dgen1Debug = isDGen1 ? {
    isDGen1: true,
    isApproving: dgen1Approving,
    hash: dgen1Hash,
    error: dgen1Error?.message,
    lastStep: dgen1LastStep,
    providerMethods: dgen1ProviderMethods,
    txParams: dgen1TxParams, // JSON string of the params sent
  } : undefined;

  return {
    allowance,
    isApproved,
    approve,
    isApproving: isNativeCurrency ? false : isApproving,
    isConfirming: isNativeCurrency ? false : isConfirming,
    isConfirmed: isNativeCurrency ? false : isConfirmed,
    error,
    hash: isNativeCurrency ? undefined : combinedHash,
    refetch: isNativeCurrency ? () => {} : refetch,
    isLoading,
    dgen1Debug,
  };
}

/**
 * Hook for APE token approval specifically.
 */
export function useApeApproval(requiredAmount: bigint = BigInt(0)) {
  return useTokenApproval('APE', requiredAmount);
}

/**
 * Hook for USDC.e token approval specifically.
 */
export function useUsdcApproval(requiredAmount: bigint = BigInt(0)) {
  return useTokenApproval('USDC', requiredAmount);
}

/**
 * Hook to read the APE price from the contract.
 * Returns the price in 8 decimals (e.g., $0.64 = 64000000).
 */
export function useApePriceFromContract(): {
  price: bigint;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: [
      {
        name: 'apePriceUSD',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint256' }],
      },
    ],
    functionName: 'apePriceUSD',
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: !!POKEBALL_GAME_ADDRESS,
    },
  });

  // Ensure price is never 0 to prevent division by zero errors
  // Use nullish coalescing with fallback, then guard against 0
  const rawPrice = (data as bigint) ?? BigInt(64000000);
  const safePrice = rawPrice > 0n ? rawPrice : BigInt(64000000);

  return {
    price: safePrice, // Default to $0.64, never returns 0
    isLoading,
    error: error || null,
  };
}

export default useTokenApproval;
