/**
 * usePurchaseBalls Hook
 *
 * Hook for purchasing PokeBalls from the PokeballGame contract (v1.4.0+).
 * Supports both native APE and USDC.e payment methods.
 *
 * PAYMENT METHODS (v1.4.0+):
 * - APE: Uses dedicated `purchaseBallsWithAPE(ballType, quantity)` function
 *        Native APE sent via msg.value. NO approval needed.
 * - USDC.e: Uses dedicated `purchaseBallsWithUSDC(ballType, quantity)` function
 *           Requires approval via useTokenApproval hook.
 *
 * IMPORTANT: Uses dedicated contract functions to avoid gas estimation issues.
 * The generic `purchaseBalls()` function can cause "ERC20: transfer amount exceeds
 * allowance" errors during gas estimation when switching between APE and USDC.e.
 *
 * Usage:
 * ```tsx
 * const {
 *   write,
 *   isLoading,
 *   isPending,
 *   error,
 *   hash,
 *   receipt,
 * } = usePurchaseBalls();
 *
 * // Purchase 5 Great Balls with USDC.e (requires prior approval)
 * const handlePurchase = () => {
 *   if (write) {
 *     write(1, 5, false); // ballType=1 (Great Ball), quantity=5, useAPE=false
 *   }
 * };
 *
 * // Purchase 10 Poke Balls with native APE (no approval needed!)
 * const handlePurchaseAPE = () => {
 *   if (write) {
 *     write(0, 10, true); // ballType=0 (Poke Ball), quantity=10, useAPE=true
 *     // The hook automatically calculates and sends msg.value
 *   }
 * };
 * ```
 *
 * Note: Only USDC.e requires approval. APE payments send native currency directly.
 */

import { useState, useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient, useAccount } from 'wagmi';
import type { TransactionReceipt } from 'viem';
import { formatEther, formatGwei, encodeFunctionData, toHex } from 'viem';
import {
  POKEBALL_GAME_ADDRESS,
  POKEBALL_GAME_ABI,
  POKEBALL_GAME_CHAIN_ID,
  usePokeballGameAddress,
  type BallType,
} from './pokeballGameConfig';
import {
  isEthereumPhoneAvailable,
  getDGen1Diagnostic,
  getEthereumPhoneProvider,
  getRawEthereumProvider,
} from '../../utils/walletDetection';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface UsePurchaseBallsReturn {
  /**
   * Function to initiate the purchase transaction.
   * @param ballType - Ball type (0-3)
   * @param quantity - Number of balls to purchase
   * @param useAPE - If true, pay with native APE; if false, pay with USDC.e
   * @param apePriceUSD8Dec - Optional APE price in 8 decimals for accurate APE cost calculation
   */
  write: ((ballType: BallType, quantity: number, useAPE: boolean, apePriceUSD8Dec?: bigint) => Promise<void>) | undefined;

  /**
   * Whether the transaction is currently being submitted to the network.
   */
  isLoading: boolean;

  /**
   * Whether the transaction is pending confirmation (submitted but not yet mined).
   */
  isPending: boolean;

  /**
   * Error from the transaction, if any.
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
   * Reset the hook state to initial values.
   */
  reset: () => void;
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

/**
 * Hook for purchasing PokeBalls from the PokeballGame contract.
 *
 * @returns Object with write function, loading states, error, hash, and receipt
 */
export function usePurchaseBalls(): UsePurchaseBallsReturn {
  const { isConfigured } = usePokeballGameAddress();
  const publicClient = usePublicClient({ chainId: POKEBALL_GAME_CHAIN_ID });
  const { address: userAddress } = useAccount();

  // Track the current transaction hash for receipt fetching
  const [currentHash, setCurrentHash] = useState<`0x${string}` | undefined>(undefined);

  // Track local errors (e.g., gas estimation failures)
  const [localError, setLocalError] = useState<Error | undefined>(undefined);

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
  if (writeHash && writeHash !== currentHash) {
    setCurrentHash(writeHash);
  }

  // Combined loading state
  const isLoading = isWritePending || isReceiptLoading;

  // Combined error (prioritize local errors like gas estimation failures)
  const error = localError || writeError || receiptError || undefined;

  // Write function
  const write = useCallback(
    async (ballType: BallType, quantity: number, useAPE: boolean, apePriceUSD8Dec?: bigint) => {
      // Clear any previous local error
      setLocalError(undefined);

      if (!POKEBALL_GAME_ADDRESS) {
        console.error('[usePurchaseBalls] Contract address not configured');
        setLocalError(new Error('Contract not configured'));
        return;
      }

      if (quantity <= 0) {
        console.error('[usePurchaseBalls] Quantity must be greater than 0');
        setLocalError(new Error('Quantity must be greater than 0'));
        return;
      }

      // Calculate expected cost for logging and msg.value
      // Prices in USDC.e (6 decimals)
      const BALL_PRICES_USDC: Record<BallType, bigint> = {
        0: BigInt(1_000_000),    // $1.00
        1: BigInt(10_000_000),   // $10.00
        2: BigInt(25_000_000),   // $25.00
        3: BigInt(49_900_000),   // $49.90
      };
      const pricePerBallUSDC = BALL_PRICES_USDC[ballType];
      const totalCostUSDC = pricePerBallUSDC * BigInt(quantity);

      // Use provided APE price or default to ~$0.64 (64000000 in 8 decimals)
      const effectiveApePriceUSD = apePriceUSD8Dec && apePriceUSD8Dec > 0n
        ? apePriceUSD8Dec
        : BigInt(64000000);

      // If using APE, convert USDC cost to APE
      // Formula: apeAmount = (usdcAmount * 10^20) / apePriceUSD
      // NO buffer added - user pays exact price, fees are split internally by contract
      const totalCostAPE = useAPE
        ? (totalCostUSDC * BigInt(10 ** 20)) / effectiveApePriceUSD
        : BigInt(0);

      console.log('[usePurchaseBalls] Purchasing balls:', {
        ballType,
        quantity,
        useAPE,
        address: POKEBALL_GAME_ADDRESS,
        pricePerBallUSD: Number(pricePerBallUSDC) / 1_000_000,
        totalCostUSD: Number(totalCostUSDC) / 1_000_000,
        totalCostUSDCWei: totalCostUSDC.toString(),
        ...(useAPE && {
          estimatedAPECost: Number(totalCostAPE) / 1e18,
          totalCostAPEWei: totalCostAPE.toString(),
          apePriceUSD: Number(effectiveApePriceUSD) / 1e8,
          note: 'Sending exact APE amount via msg.value - no markup (fees split internally)',
        }),
      });

      // ====== dGen1 DIAGNOSTIC LOGGING ======
      const isDGen1 = isEthereumPhoneAvailable();
      if (isDGen1) {
        console.log('[usePurchaseBalls] === dGen1 PURCHASE DIAGNOSTIC ===');
        try {
          const diagnostic = await getDGen1Diagnostic();
          console.log('[usePurchaseBalls] dGen1 diagnostic:', JSON.stringify(diagnostic, null, 2));

          // Warn if no bundler URL configured
          if (!diagnostic.hasBundlerUrl) {
            console.warn('[usePurchaseBalls] ⚠️ WARNING: No bundler RPC URL configured for dGen1!');
            console.warn('[usePurchaseBalls] Set VITE_BUNDLER_RPC_URL in .env for ApeChain (chainId: 33139)');
          }

          // Log the exact transaction that will be built
          const callData = encodeFunctionData({
            abi: POKEBALL_GAME_ABI,
            functionName: useAPE ? 'purchaseBallsWithAPE' : 'purchaseBallsWithUSDC',
            args: [ballType, BigInt(quantity)],
          });

          console.log('[usePurchaseBalls] dGen1 transaction request:', {
            to: POKEBALL_GAME_ADDRESS,
            data: callData,
            value: useAPE ? totalCostAPE.toString() : '0',
            chainId: POKEBALL_GAME_CHAIN_ID,
            bundlerUrl: diagnostic.bundlerUrl,
          });
        } catch (diagError) {
          console.error('[usePurchaseBalls] Failed to get dGen1 diagnostic:', diagError);
        }
      }

      // ====== DEBUG: Log transaction parameters ======
      // v1.4.0+: Uses dedicated functions (purchaseBallsWithAPE / purchaseBallsWithUSDC)
      console.log('='.repeat(60));
      console.log('[usePurchaseBalls] DEBUG: Transaction Configuration');
      console.log('='.repeat(60));
      console.log('[usePurchaseBalls] Transaction params:', {
        to: POKEBALL_GAME_ADDRESS,
        account: userAddress,
        functionName: useAPE ? 'purchaseBallsWithAPE' : 'purchaseBallsWithUSDC',
        args: [ballType, BigInt(quantity)],
        value: useAPE ? totalCostAPE.toString() : 'undefined (USDC.e)',
        valueInAPE: useAPE ? formatEther(totalCostAPE) : 'N/A',
        chainId: POKEBALL_GAME_CHAIN_ID,
      });

      // ====== DEBUG: Estimate gas and get gas price ======
      // IMPORTANT (v1.4.0+): Use dedicated functions to avoid ERC-20 allowance checks
      // - purchaseBallsWithAPE(ballType, quantity) - payable, 2 args
      // - purchaseBallsWithUSDC(ballType, quantity) - nonpayable, 2 args
      if (publicClient) {
        try {
          console.log('[usePurchaseBalls] Estimating gas using dedicated function:', {
            function: useAPE ? 'purchaseBallsWithAPE' : 'purchaseBallsWithUSDC',
            args: [ballType, BigInt(quantity)],
          });

          // Get current gas price
          const gasPrice = await publicClient.getGasPrice();
          console.log('[usePurchaseBalls] Current gas price:', {
            gasPrice: gasPrice.toString(),
            gasPriceGwei: formatGwei(gasPrice),
          });

          // Estimate gas using the dedicated function to avoid ERC-20 allowance check errors
          // The generic purchaseBalls() may internally check USDC.e allowance even when useAPE=true
          const estimatedGas = await publicClient.estimateContractGas({
            address: POKEBALL_GAME_ADDRESS,
            abi: POKEBALL_GAME_ABI,
            functionName: useAPE ? 'purchaseBallsWithAPE' : 'purchaseBallsWithUSDC',
            args: [ballType, BigInt(quantity)],
            account: userAddress,
            ...(useAPE && { value: totalCostAPE }),
          });

          console.log('[usePurchaseBalls] Gas estimate:', {
            estimatedGas: estimatedGas.toString(),
            gasPrice: gasPrice.toString(),
            gasPriceGwei: formatGwei(gasPrice),
            estimatedGasCostWei: (estimatedGas * gasPrice).toString(),
            estimatedGasCostAPE: formatEther(estimatedGas * gasPrice),
          });

          // Calculate what the total cost would be
          const totalGasCost = estimatedGas * gasPrice;
          const totalTxCost = useAPE ? totalCostAPE + totalGasCost : totalGasCost;
          console.log('[usePurchaseBalls] Total transaction cost breakdown:', {
            valueToSend: useAPE ? formatEther(totalCostAPE) + ' APE' : 'N/A (USDC.e)',
            gasCost: formatEther(totalGasCost) + ' APE',
            totalCost: formatEther(totalTxCost) + ' APE',
            // Check if gas is unreasonable
            isGasReasonable: estimatedGas < 1_000_000n,
            warningIfHigh: estimatedGas > 500_000n ? '⚠️ Gas estimate seems high!' : '✓ Gas looks normal',
          });

        } catch (gasError) {
          console.error('[usePurchaseBalls] Gas estimation failed:', gasError);
          // Log more details about the error for debugging
          const errorMessage = gasError instanceof Error ? gasError.message : String(gasError);
          const isAllowanceError = errorMessage.includes('allowance') || errorMessage.includes('exceeds');
          const isInsufficientFunds = errorMessage.includes('insufficient') || errorMessage.includes('funds');

          console.error('[usePurchaseBalls] Error details:', {
            message: errorMessage,
            isAllowanceError,
            isInsufficientFunds,
          });

          // STOP on gas estimation failure - don't proceed to avoid insane gas limits
          // Common causes:
          // - Insufficient APE balance (for APE payments)
          // - Missing USDC.e approval (for USDC.e payments - should use useTokenApproval first)
          // - Contract revert (invalid ball type, quantity 0, etc.)
          if (isAllowanceError) {
            console.error('[usePurchaseBalls] ALLOWANCE ERROR - For USDC.e payments, approve first via useTokenApproval.');
            console.error('[usePurchaseBalls] For APE payments, this error should NOT occur. Check if correct function is called.');
            setLocalError(new Error('ERC-20 allowance error. For USDC.e payments, please approve first.'));
            return; // Don't proceed
          }

          if (isInsufficientFunds) {
            console.error('[usePurchaseBalls] INSUFFICIENT FUNDS - User does not have enough APE to complete purchase.');
            setLocalError(new Error(`Insufficient APE balance. Need at least ${useAPE ? formatEther(totalCostAPE) : '0'} APE plus gas.`));
            return; // Don't proceed
          }

          // For other errors, also stop and show error
          console.error('[usePurchaseBalls] STOPPING - Gas estimation failed. Transaction would likely fail.');
          setLocalError(new Error(`Transaction would fail: ${errorMessage.slice(0, 100)}`));
          return; // Don't proceed
        }
      } else {
        console.warn('[usePurchaseBalls] No public client available for gas estimation');
      }

      console.log('='.repeat(60));
      console.log('[usePurchaseBalls] Sending transaction...');
      console.log('='.repeat(60));

      // Build the call data for the appropriate function
      const functionName = useAPE ? 'purchaseBallsWithAPE' : 'purchaseBallsWithUSDC';
      const callData = encodeFunctionData({
        abi: POKEBALL_GAME_ABI,
        functionName,
        args: [ballType, BigInt(quantity)],
      });

      // ====== dGen1: Use direct provider.request() instead of wagmi ======
      // The dGen1 wallet may not properly receive wagmi's writeContract calls
      // because it needs transactions routed through its ERC-4337 bundler
      if (isDGen1) {
        console.log('[usePurchaseBalls] dGen1 detected - using direct eth_sendTransaction...');

        // Try the normal provider first, fall back to raw window.ethereum
        let provider = getEthereumPhoneProvider();
        if (!provider) {
          console.log('[usePurchaseBalls] getEthereumPhoneProvider returned null, trying raw provider...');
          provider = getRawEthereumProvider();
        }

        if (!provider) {
          console.error('[usePurchaseBalls] No provider available for dGen1');
          setLocalError(new Error('dGen1 wallet provider not available'));
          return;
        }

        console.log('[usePurchaseBalls] Using provider:', {
          hasRequest: typeof provider.request === 'function',
          isEthereumPhone: provider.isEthereumPhone,
          isMetaMask: provider.isMetaMask,
        });

        try {
          // Build the transaction object for eth_sendTransaction
          // IMPORTANT: ethOS/dGen1 browser provider may be strict about params format
          // - `from` must be lowercase
          // - `to` must be lowercase
          // - Only include minimal required fields
          // - For value=0, omit the field entirely (some providers reject '0x0')
          const txParams: Record<string, string> = {
            from: userAddress!.toLowerCase(),
            to: POKEBALL_GAME_ADDRESS.toLowerCase(),
            data: callData,
          };

          // Only add value if sending APE (non-zero value)
          if (useAPE && totalCostAPE > 0n) {
            txParams.value = toHex(totalCostAPE);
          }

          console.log('[usePurchaseBalls] dGen1 eth_sendTransaction params:', {
            ...txParams,
            valueInAPE: useAPE ? formatEther(totalCostAPE) : '0',
            note: 'Minimal params - lowercase addresses, no gas/chainId',
          });

          // Send transaction directly via provider
          const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [txParams],
          }) as `0x${string}`;

          console.log('[usePurchaseBalls] dGen1 transaction submitted! Hash:', txHash);
          setCurrentHash(txHash);

        } catch (error) {
          console.error('[usePurchaseBalls] dGen1 purchase failed:', error);
          setLocalError(error instanceof Error ? error : new Error(String(error)));
        }

        return; // Exit early for dGen1
      }

      // ====== Standard wallets: Use wagmi writeContract ======
      if (useAPE) {
        // v1.4.0+: Use dedicated purchaseBallsWithAPE function for cleaner APE payments
        // This avoids any internal ERC-20 allowance checks that can cause gas estimation issues
        console.log('[usePurchaseBalls] Using purchaseBallsWithAPE (no approval required)');
        console.log(`[usePurchaseBalls] Sending ${formatEther(totalCostAPE)} APE via msg.value`);
        console.log('[usePurchaseBalls] value (wei):', totalCostAPE.toString());
        console.log('[usePurchaseBalls] value (APE):', formatEther(totalCostAPE));

        writeContract({
          address: POKEBALL_GAME_ADDRESS,
          abi: POKEBALL_GAME_ABI,
          functionName: 'purchaseBallsWithAPE',
          args: [ballType, BigInt(quantity)],
          value: totalCostAPE, // Native APE sent via msg.value
          chainId: POKEBALL_GAME_CHAIN_ID,
        });
      } else {
        // v1.4.0+: Use dedicated purchaseBallsWithUSDC function for cleaner USDC.e payments
        // Requires prior ERC-20 approval via useTokenApproval hook
        console.log('[usePurchaseBalls] Using purchaseBallsWithUSDC (requires ERC-20 approval)');
        console.log(`[usePurchaseBalls] Ensure USDC.e approval for ${POKEBALL_GAME_ADDRESS}`);

        writeContract({
          address: POKEBALL_GAME_ADDRESS,
          abi: POKEBALL_GAME_ABI,
          functionName: 'purchaseBallsWithUSDC',
          args: [ballType, BigInt(quantity)],
          chainId: POKEBALL_GAME_CHAIN_ID,
        });
      }
    },
    [writeContract, publicClient, userAddress]
  );

  // Reset function
  const reset = useCallback(() => {
    setCurrentHash(undefined);
    setLocalError(undefined);
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
    reset,
  };
}

export default usePurchaseBalls;
