/**
 * useContractDiagnostics Hook
 *
 * Provides environment sanity checks and diagnostics for the PokeballGame and SlabNFTManager contracts.
 * Used to detect misconfiguration issues before they cause transaction failures.
 *
 * v1.8.0/v2.4.0 Updates:
 * - Reads APE reserves from both PokeballGame and SlabNFTManager
 * - Tracks treasury USDC.e fees accumulated
 * - Provides operator-focused metrics for the dashboard
 *
 * Usage:
 * ```tsx
 * const {
 *   apePriceUSD,
 *   pullPrice,
 *   slabNFTManagerBalance,
 *   pokeballGameApeReserve,
 *   slabNFTManagerApeReserve,
 *   hasWarnings,
 *   warnings,
 *   isLoading,
 * } = useContractDiagnostics();
 *
 * if (hasWarnings) {
 *   console.warn('Contract config issues:', warnings);
 * }
 * ```
 */

import { useReadContract, useReadContracts } from 'wagmi';
import { useMemo } from 'react';
import {
  POKEBALL_GAME_ADDRESS,
  POKEBALL_GAME_ABI,
  POKEBALL_GAME_CHAIN_ID,
} from './pokeballGameConfig';
import {
  SLAB_NFT_MANAGER_ADDRESS,
  SLAB_NFT_MANAGER_ABI,
  SLAB_CONSTANTS,
  getApeReserveStatus,
  getUsdcPoolStatus,
} from '../../services/slabNFTManagerConfig';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface ApeReserveInfo {
  /** Raw APE reserve in wei */
  raw: bigint;
  /** Formatted APE amount (e.g., "0.5000") */
  formatted: string;
  /** Is reserve above minimum (0.5 APE) */
  isHealthy: boolean;
  /** Status: 'healthy' | 'low' | 'critical' */
  status: 'healthy' | 'low' | 'critical';
  /** Approximate throws remaining at ~0.073 APE each */
  throwsRemaining: number;
}

export interface UsdcPoolInfo {
  /** Raw USDC.e balance in wei (6 decimals) */
  raw: bigint;
  /** Formatted USDC.e amount (e.g., "125.50") */
  formatted: string;
  /** Can trigger auto-purchase (>= $51) */
  canAutoPurchase: boolean;
  /** Status: 'eligible' | 'blocked' */
  status: 'eligible' | 'blocked';
  /** Number of NFT purchases available */
  purchasesAvailable: number;
}

export interface ContractDiagnostics {
  // APE Price from PokeballGame (8 decimals)
  apePriceUSD: bigint;
  apePriceFormatted: number;

  // SlabNFTManager pull price (6 decimals - USDC)
  pullPrice: bigint;
  pullPriceFormatted: number;

  // Auto-purchase threshold (6 decimals - USDC)
  autoPurchaseThreshold: bigint;
  autoPurchaseThresholdFormatted: number;

  // SlabNFTManager USDC balance (NFT pool)
  slabNFTManagerBalance: bigint;
  slabNFTManagerBalanceFormatted: number;
  slabNFTManagerUsdcPool: UsdcPoolInfo;

  // Can auto-purchase check
  canAutoPurchase: boolean;

  // NFT Inventory
  inventoryCount: number;
  maxInventorySize: number;

  // v1.8.0/v2.4.0: APE Reserves
  pokeballGameApeReserve: ApeReserveInfo;
  slabNFTManagerApeReserve: ApeReserveInfo;

  // v1.8.0: Treasury USDC.e fees
  treasuryUsdcFees: bigint;
  treasuryUsdcFeesFormatted: string;

  // Warning flags
  hasWarnings: boolean;
  warnings: string[];

  // Operator-specific warnings (more sensitive thresholds)
  hasOperatorWarnings: boolean;
  operatorWarnings: string[];

  // Loading state
  isLoading: boolean;
  isError: boolean;
}

export interface UseContractDiagnosticsReturn extends ContractDiagnostics {
  refetch: () => void;
}

// ============================================================
// DEFAULT VALUES
// ============================================================

const DEFAULT_APE_RESERVE: ApeReserveInfo = {
  raw: 0n,
  formatted: '0.0000',
  isHealthy: false,
  status: 'critical',
  throwsRemaining: 0,
};

const DEFAULT_USDC_POOL: UsdcPoolInfo = {
  raw: 0n,
  formatted: '0.00',
  canAutoPurchase: false,
  status: 'blocked',
  purchasesAvailable: 0,
};

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

export function useContractDiagnostics(): UseContractDiagnosticsReturn {
  // Read APE price from PokeballGame
  const {
    data: apePriceData,
    isLoading: isApePriceLoading,
    isError: isApePriceError,
    refetch: refetchApePrice,
  } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'apePriceUSD',
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: !!POKEBALL_GAME_ADDRESS,
      staleTime: 30_000, // 30 seconds
      refetchInterval: 60_000, // 1 minute
    },
  });

  // Read PokeballGame APE reserve (v1.8.0)
  const {
    data: pokeballApeReserveData,
    isLoading: isPokeballReserveLoading,
    refetch: refetchPokeballReserve,
  } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'totalAPEReserve',
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: !!POKEBALL_GAME_ADDRESS,
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });

  // Read PokeballGame accumulated USDC fees (v1.8.0)
  const {
    data: treasuryFeesData,
    isLoading: isTreasuryFeesLoading,
    refetch: refetchTreasuryFees,
  } = useReadContract({
    address: POKEBALL_GAME_ADDRESS,
    abi: POKEBALL_GAME_ABI,
    functionName: 'accumulatedUSDCFees',
    chainId: POKEBALL_GAME_CHAIN_ID,
    query: {
      enabled: !!POKEBALL_GAME_ADDRESS,
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });

  // Read SlabNFTManager data in a batch
  const {
    data: slabData,
    isLoading: isSlabLoading,
    isError: isSlabError,
    refetch: refetchSlab,
  } = useReadContracts({
    contracts: [
      {
        address: SLAB_NFT_MANAGER_ADDRESS,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'canAutoPurchase',
        chainId: POKEBALL_GAME_CHAIN_ID,
      },
      {
        address: SLAB_NFT_MANAGER_ADDRESS,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'getInventoryCount',
        chainId: POKEBALL_GAME_CHAIN_ID,
      },
      {
        address: SLAB_NFT_MANAGER_ADDRESS,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'MAX_INVENTORY_SIZE',
        chainId: POKEBALL_GAME_CHAIN_ID,
      },
      {
        address: SLAB_NFT_MANAGER_ADDRESS,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'getPullPrice',
        chainId: POKEBALL_GAME_CHAIN_ID,
      },
      {
        address: SLAB_NFT_MANAGER_ADDRESS,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'getStats',
        chainId: POKEBALL_GAME_CHAIN_ID,
      },
      // v2.4.0: APE reserve
      {
        address: SLAB_NFT_MANAGER_ADDRESS,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'apeReserve',
        chainId: POKEBALL_GAME_CHAIN_ID,
      },
    ],
    query: {
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });

  // Process diagnostics data
  const diagnostics = useMemo<ContractDiagnostics>(() => {
    const warnings: string[] = [];
    const operatorWarnings: string[] = [];

    // Parse APE price
    const apePriceUSD = (apePriceData as bigint) ?? BigInt(0);
    const apePriceFormatted = Number(apePriceUSD) / 1e8;

    // Parse PokeballGame APE reserve (v1.8.0)
    const pokeballApeReserveRaw = (pokeballApeReserveData as bigint) ?? BigInt(0);
    const pokeballReserveStatus = getApeReserveStatus(pokeballApeReserveRaw);
    const pokeballGameApeReserve: ApeReserveInfo = {
      raw: pokeballApeReserveRaw,
      formatted: pokeballReserveStatus.formattedAmount,
      isHealthy: pokeballReserveStatus.isHealthy,
      status: pokeballReserveStatus.status,
      throwsRemaining: pokeballReserveStatus.throwsRemaining,
    };

    // Parse treasury USDC fees
    const treasuryUsdcFees = (treasuryFeesData as bigint) ?? BigInt(0);
    const treasuryUsdcFeesFormatted = (Number(treasuryUsdcFees) / 1e6).toFixed(2);

    // Parse SlabNFTManager data
    // canAutoPurchase returns: (bool canPurchase, uint256 threshold)
    const canAutoPurchaseResult = slabData?.[0]?.result as readonly [boolean, bigint] | undefined;
    const inventoryCountResult = slabData?.[1]?.result as bigint | undefined;
    const maxInventorySizeResult = slabData?.[2]?.result as number | undefined;
    const pullPriceResult = slabData?.[3]?.result as bigint | undefined;
    // getStats returns: (balance, inventorySize, purchased, awarded, spent, pending)
    const statsResult = slabData?.[4]?.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint] | undefined;
    // v2.4.0: APE reserve
    const slabApeReserveResult = slabData?.[5]?.result as bigint | undefined;

    const canAutoPurchase = canAutoPurchaseResult?.[0] ?? false;
    const autoPurchaseThreshold = canAutoPurchaseResult?.[1] ?? SLAB_CONSTANTS.AUTO_PURCHASE_THRESHOLD_USDC;
    const pullPrice = pullPriceResult ?? SLAB_CONSTANTS.PULL_PRICE_USDC;
    const slabNFTManagerBalance = statsResult?.[0] ?? BigInt(0);

    const slabNFTManagerBalanceFormatted = Number(slabNFTManagerBalance) / 1e6;
    const autoPurchaseThresholdFormatted = Number(autoPurchaseThreshold) / 1e6;
    const pullPriceFormatted = Number(pullPrice) / 1e6;

    const inventoryCount = Number(inventoryCountResult ?? 0);
    const maxInventorySize = Number(maxInventorySizeResult ?? 20);

    // Parse SlabNFTManager APE reserve (v2.4.0)
    const slabApeReserveRaw = slabApeReserveResult ?? BigInt(0);
    const slabReserveStatus = getApeReserveStatus(slabApeReserveRaw);
    const slabNFTManagerApeReserve: ApeReserveInfo = {
      raw: slabApeReserveRaw,
      formatted: slabReserveStatus.formattedAmount,
      isHealthy: slabReserveStatus.isHealthy,
      status: slabReserveStatus.status,
      throwsRemaining: slabReserveStatus.throwsRemaining,
    };

    // Create USDC pool info
    const slabNFTManagerUsdcPool = getUsdcPoolStatus(slabNFTManagerBalance);

    // ============================================================
    // USER WARNINGS (shown in PokeBallShop)
    // ============================================================

    // Distinguish between "env not configured" vs "on-chain price is 0"
    if (!POKEBALL_GAME_ADDRESS) {
      warnings.push('Contract address not configured (VITE_POKEBALL_GAME_ADDRESS missing)');
    } else if (isApePriceError) {
      warnings.push('Unable to read APE price from contract - RPC may be unavailable');
    } else if (apePriceUSD === BigInt(0)) {
      // On-chain price is actually 0 - needs update via scripts/update_ape_price.cjs
      warnings.push('APE price is 0 on-chain - run update_ape_price.cjs to set current price');
    } else if (apePriceFormatted < 0.05) {
      warnings.push(`APE price looks unusually low ($${apePriceFormatted.toFixed(4)})`);
    } else if (apePriceFormatted > 10) {
      warnings.push(`APE price looks unusually high ($${apePriceFormatted.toFixed(4)})`);
    }

    if (pullPriceFormatted < 50) {
      warnings.push(`Pull price looks too low ($${pullPriceFormatted.toFixed(2)}) - expected ~$51`);
    } else if (pullPriceFormatted > 100) {
      warnings.push(`Pull price looks unusually high ($${pullPriceFormatted.toFixed(2)})`);
    }

    if (inventoryCount >= maxInventorySize) {
      warnings.push(`NFT inventory is full (${inventoryCount}/${maxInventorySize}) - new catches won't get NFTs`);
    }

    // ============================================================
    // OPERATOR WARNINGS (shown in OperatorDashboard)
    // ============================================================

    // PokeballGame APE reserve warnings
    if (!pokeballGameApeReserve.isHealthy) {
      if (pokeballGameApeReserve.status === 'critical') {
        operatorWarnings.push(`PokeballGame APE reserve CRITICAL: ${pokeballGameApeReserve.formatted} APE (${pokeballGameApeReserve.throwsRemaining} throws remaining)`);
      } else {
        operatorWarnings.push(`PokeballGame APE reserve LOW: ${pokeballGameApeReserve.formatted} APE (${pokeballGameApeReserve.throwsRemaining} throws remaining)`);
      }
    }

    // SlabNFTManager APE reserve warnings
    if (!slabNFTManagerApeReserve.isHealthy) {
      if (slabNFTManagerApeReserve.status === 'critical') {
        operatorWarnings.push(`SlabNFTManager APE reserve CRITICAL: ${slabNFTManagerApeReserve.formatted} APE`);
      } else {
        operatorWarnings.push(`SlabNFTManager APE reserve LOW: ${slabNFTManagerApeReserve.formatted} APE`);
      }
    }

    // NFT pool warnings
    if (!canAutoPurchase) {
      operatorWarnings.push(`Auto-purchase BLOCKED: $${slabNFTManagerBalanceFormatted.toFixed(2)} < $${autoPurchaseThresholdFormatted.toFixed(2)} threshold`);
    }

    // Inventory warnings
    if (inventoryCount === 0) {
      operatorWarnings.push('NFT inventory is EMPTY - no NFTs available to award');
    } else if (inventoryCount >= maxInventorySize) {
      operatorWarnings.push(`NFT inventory FULL (${inventoryCount}/${maxInventorySize}) - auto-purchase disabled`);
    }

    return {
      apePriceUSD,
      apePriceFormatted,
      pullPrice,
      pullPriceFormatted,
      autoPurchaseThreshold,
      autoPurchaseThresholdFormatted,
      slabNFTManagerBalance,
      slabNFTManagerBalanceFormatted,
      slabNFTManagerUsdcPool,
      canAutoPurchase,
      inventoryCount,
      maxInventorySize,
      pokeballGameApeReserve,
      slabNFTManagerApeReserve,
      treasuryUsdcFees,
      treasuryUsdcFeesFormatted,
      hasWarnings: warnings.length > 0,
      warnings,
      hasOperatorWarnings: operatorWarnings.length > 0,
      operatorWarnings,
      isLoading: isApePriceLoading || isSlabLoading || isPokeballReserveLoading || isTreasuryFeesLoading,
      isError: isApePriceError || isSlabError,
    };
  }, [
    apePriceData, slabData, pokeballApeReserveData, treasuryFeesData,
    isApePriceLoading, isSlabLoading, isPokeballReserveLoading, isTreasuryFeesLoading,
    isApePriceError, isSlabError,
  ]);

  const refetch = () => {
    refetchApePrice();
    refetchSlab();
    refetchPokeballReserve();
    refetchTreasuryFees();
  };

  return {
    ...diagnostics,
    refetch,
  };
}

export default useContractDiagnostics;
