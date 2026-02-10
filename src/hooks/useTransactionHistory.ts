/**
 * useTransactionHistory Hook
 *
 * Fetches and subscribes to player transaction history from the PokeballGame contract.
 * Tracks ball purchases, throw attempts, and catch results (wins/losses).
 *
 * Events tracked:
 * - BallPurchased: Ball purchases with quantity, tier, token used, cost
 * - ThrowAttempted: Ball throws with Pokemon slot targeted
 * - CaughtPokemon: Successful catches with NFT tokenId
 * - FailedCatch: Failed catch attempts with remaining attempts
 *
 * Strategy:
 * - Uses Caldera public RPC for historical log queries (no block range limit)
 * - Uses manual eth_getLogs polling for real-time events (2s interval)
 * - ApeChain RPC doesn't support eth_newFilter, so we avoid wagmi's useWatchContractEvent
 * - Deduplicates events using txHash-logIndex keys
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import { createPublicClient, http, type Log, formatUnits, parseAbiItem, parseEventLogs } from 'viem';
import { pokeballGameConfig, getBallConfig, isPokeballGameConfigured, getTransactionUrl } from '../services/pokeballGameConfig';
import { apeChainMainnet } from '../services/apechainConfig';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type TransactionType = 'purchase' | 'throw' | 'caught' | 'failed';

export interface BaseTransaction {
  id: string;
  type: TransactionType;
  timestamp: number;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface PurchaseTransaction extends BaseTransaction {
  type: 'purchase';
  ballType: number;
  ballName: string;
  quantity: bigint;
  usedAPE: boolean;
  estimatedCost: string;
}

export interface ThrowTransaction extends BaseTransaction {
  type: 'throw';
  pokemonId: bigint;
  ballType: number;
  ballName: string;
  requestId: bigint;
}

export interface CaughtTransaction extends BaseTransaction {
  type: 'caught';
  pokemonId: bigint;
  nftTokenId: bigint;
}

export interface FailedTransaction extends BaseTransaction {
  type: 'failed';
  pokemonId: bigint;
  attemptsRemaining: number;
}

export type Transaction =
  | PurchaseTransaction
  | ThrowTransaction
  | CaughtTransaction
  | FailedTransaction;

export interface UseTransactionHistoryOptions {
  pageSize?: number;
  fromBlock?: bigint;
}

/**
 * Purchase stats calculated from ALL transactions (not just visible ones)
 */
export interface PurchaseStats {
  /** Total number of purchase transactions (all-time) */
  totalPurchaseCount: number;
  /** Total USDC.e spent (raw bigint, 6 decimals) */
  totalSpentUSDCRaw: bigint;
  /** Total APE spent (raw bigint, 18 decimals) */
  totalSpentAPERaw: bigint;
  /** Total USDC.e spent formatted as string */
  totalSpentUSDC: string;
  /** Total APE spent formatted as string */
  totalSpentAPE: string;
  /** Approximate total USD spent (number) */
  totalSpentUSD: number;
  /** Total throws (all-time) */
  totalThrows: number;
  /** Total catches (all-time) */
  totalCaught: number;
  /** Total escapes (all-time) */
  totalFailed: number;
  /** Catch rate percentage (all-time) */
  catchRate: number;
  /** Block number of oldest transaction in stats */
  oldestBlockNumber: bigint;
  /** Timestamp when stats were last updated */
  lastUpdated: number;
}

export interface UseTransactionHistoryReturn {
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  refresh: () => void;
  totalCount: number;
  /** All-time purchase stats (persisted to localStorage) */
  purchaseStats: PurchaseStats;
  /** Whether stats are still loading */
  isStatsLoading: boolean;
}

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_PAGE_SIZE = 50;
const STATS_STORAGE_KEY_PREFIX = 'pokemonTrader_txStats_';

// Official ApeChain public RPC (Caldera) - no block range limits, CORS-enabled
// This must match PRIMARY_RPC_URL in apechainConfig.ts
const PUBLIC_RPC_URL = 'https://rpc.apechain.com/http';

// Debug flag - set to true to enable verbose logging
const DEBUG_TX_HISTORY = true;

// How many blocks to search
// ApeChain has ~0.25s block time (Arbitrum Orbit L2)
// 2,419,200 blocks = ~7 days at 0.25s/block
// Caldera public RPC has no block range limits, so this is safe
const DEFAULT_LOOKBACK_BLOCKS = BigInt(2_419_200);

// Ball prices in USDC (6 decimals)
const BALL_PRICES_USDC: Record<number, bigint> = {
  0: BigInt(1_000000),
  1: BigInt(10_000000),
  2: BigInt(25_000000),
  3: BigInt(49_900000),
};

// Event ABIs for parsing
// IMPORTANT: These must match the actual contract event signatures exactly
// ThrowAttempted uses uint64 sequenceNumber (not uint256 requestId) - v1.6.0+
// GaslessThrowExecuted is emitted by throwBallFor() in v1.8.0
const EVENT_ABIS = {
  BallPurchased: parseAbiItem(
    'event BallPurchased(address indexed buyer, uint8 ballType, uint256 quantity, bool usedAPE, uint256 totalAmount)'
  ),
  ThrowAttempted: parseAbiItem(
    'event ThrowAttempted(address indexed thrower, uint256 pokemonId, uint8 ballTier, uint64 sequenceNumber)'
  ),
  CaughtPokemon: parseAbiItem(
    'event CaughtPokemon(address indexed catcher, uint256 pokemonId, uint256 nftTokenId)'
  ),
  FailedCatch: parseAbiItem(
    'event FailedCatch(address indexed thrower, uint256 pokemonId, uint8 attemptsRemaining)'
  ),
  // v1.8.0: Gasless throw event - emitted when relayer executes throwBallFor()
  GaslessThrowExecuted: parseAbiItem(
    'event GaslessThrowExecuted(address indexed player, address indexed relayer, uint256 pokemonId)'
  ),
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function createTransactionId(log: Log): string {
  return `${log.transactionHash}-${log.logIndex}`;
}

function formatCost(ballType: number, quantity: bigint, usedAPE: boolean): string {
  const pricePerBall = BALL_PRICES_USDC[ballType] || BigInt(0);
  const totalUsdc = pricePerBall * quantity;

  if (usedAPE) {
    const usdcFormatted = formatUnits(totalUsdc, 6);
    return `~${usdcFormatted} APE`;
  }

  return `${formatUnits(totalUsdc, 6)} USDC`;
}

// Create a separate viem client for historical queries using public RPC
// This avoids Alchemy's 10-block limit
const publicRpcClient = createPublicClient({
  chain: apeChainMainnet,
  transport: http(PUBLIC_RPC_URL),
});

// ============================================================
// STATS CALCULATION & PERSISTENCE
// ============================================================

const DEFAULT_STATS: PurchaseStats = {
  totalPurchaseCount: 0,
  totalSpentUSDCRaw: BigInt(0),
  totalSpentAPERaw: BigInt(0),
  totalSpentUSDC: '0.00',
  totalSpentAPE: '0.00',
  totalSpentUSD: 0,
  totalThrows: 0,
  totalCaught: 0,
  totalFailed: 0,
  catchRate: 0,
  oldestBlockNumber: BigInt(0),
  lastUpdated: 0,
};

/**
 * Calculate stats from ALL transactions (before any slicing)
 */
function calculateStatsFromTransactions(
  transactions: Transaction[],
  oldestBlockNumber: bigint
): PurchaseStats {
  let totalPurchaseCount = 0;
  let totalSpentUSDCRaw = BigInt(0);
  let totalSpentAPERaw = BigInt(0);
  let totalSpentUSD = 0;
  let totalThrows = 0;
  let totalCaught = 0;
  let totalFailed = 0;

  for (const tx of transactions) {
    switch (tx.type) {
      case 'purchase': {
        totalPurchaseCount++;
        const purchaseTx = tx as PurchaseTransaction;
        const ballPrice = BALL_PRICES_USDC[purchaseTx.ballType] || BigInt(0);
        const qty = purchaseTx.quantity;
        const totalUsdcValue = ballPrice * qty;

        if (purchaseTx.usedAPE) {
          // For APE purchases, we can extract the APE amount from estimatedCost
          const match = purchaseTx.estimatedCost.match(/^~?([\d.]+)\s*APE/i);
          if (match) {
            const apeAmount = parseFloat(match[1]);
            // Convert to raw (18 decimals)
            totalSpentAPERaw += BigInt(Math.floor(apeAmount * 1e18));
          }
          // Still track USD equivalent based on ball price
          totalSpentUSD += Number(formatUnits(totalUsdcValue, 6));
        } else {
          totalSpentUSDCRaw += totalUsdcValue;
          totalSpentUSD += Number(formatUnits(totalUsdcValue, 6));
        }
        break;
      }
      case 'throw':
        totalThrows++;
        break;
      case 'caught':
        totalCaught++;
        break;
      case 'failed':
        totalFailed++;
        break;
    }
  }

  const catchRate = totalThrows > 0 ? Math.round((totalCaught / totalThrows) * 100) : 0;

  return {
    totalPurchaseCount,
    totalSpentUSDCRaw,
    totalSpentAPERaw,
    totalSpentUSDC: formatUnits(totalSpentUSDCRaw, 6),
    totalSpentAPE: formatUnits(totalSpentAPERaw, 18),
    totalSpentUSD,
    totalThrows,
    totalCaught,
    totalFailed,
    catchRate,
    oldestBlockNumber,
    lastUpdated: Date.now(),
  };
}

/**
 * Load stats from localStorage
 */
function loadStatsFromStorage(playerAddress: string): PurchaseStats | null {
  try {
    const key = `${STATS_STORAGE_KEY_PREFIX}${playerAddress.toLowerCase()}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    // Restore bigint values (stored as strings)
    return {
      ...parsed,
      totalSpentUSDCRaw: BigInt(parsed.totalSpentUSDCRaw || '0'),
      totalSpentAPERaw: BigInt(parsed.totalSpentAPERaw || '0'),
      oldestBlockNumber: BigInt(parsed.oldestBlockNumber || '0'),
    };
  } catch (err) {
    console.warn('[useTransactionHistory] Failed to load stats from localStorage:', err);
    return null;
  }
}

/**
 * Save stats to localStorage
 */
function saveStatsToStorage(playerAddress: string, stats: PurchaseStats): void {
  try {
    const key = `${STATS_STORAGE_KEY_PREFIX}${playerAddress.toLowerCase()}`;
    // Convert bigint to string for JSON serialization
    const toStore = {
      ...stats,
      totalSpentUSDCRaw: stats.totalSpentUSDCRaw.toString(),
      totalSpentAPERaw: stats.totalSpentAPERaw.toString(),
      oldestBlockNumber: stats.oldestBlockNumber.toString(),
    };
    localStorage.setItem(key, JSON.stringify(toStore));
    console.log('[useTransactionHistory] Stats saved to localStorage:', {
      purchases: stats.totalPurchaseCount,
      spentUSD: stats.totalSpentUSD.toFixed(2),
    });
  } catch (err) {
    console.warn('[useTransactionHistory] Failed to save stats to localStorage:', err);
  }
}

/**
 * Merge new stats with existing stats (for loadMore)
 */
function mergeStats(existing: PurchaseStats, newStats: PurchaseStats): PurchaseStats {
  const totalPurchaseCount = existing.totalPurchaseCount + newStats.totalPurchaseCount;
  const totalSpentUSDCRaw = existing.totalSpentUSDCRaw + newStats.totalSpentUSDCRaw;
  const totalSpentAPERaw = existing.totalSpentAPERaw + newStats.totalSpentAPERaw;
  const totalSpentUSD = existing.totalSpentUSD + newStats.totalSpentUSD;
  const totalThrows = existing.totalThrows + newStats.totalThrows;
  const totalCaught = existing.totalCaught + newStats.totalCaught;
  const totalFailed = existing.totalFailed + newStats.totalFailed;
  const catchRate = totalThrows > 0 ? Math.round((totalCaught / totalThrows) * 100) : 0;

  return {
    totalPurchaseCount,
    totalSpentUSDCRaw,
    totalSpentAPERaw,
    totalSpentUSDC: formatUnits(totalSpentUSDCRaw, 6),
    totalSpentAPE: formatUnits(totalSpentAPERaw, 18),
    totalSpentUSD,
    totalThrows,
    totalCaught,
    totalFailed,
    catchRate,
    oldestBlockNumber: newStats.oldestBlockNumber, // Use the older block
    lastUpdated: Date.now(),
  };
}

// ============================================================
// MAIN HOOK
// ============================================================

export function useTransactionHistory(
  playerAddress?: `0x${string}`,
  options: UseTransactionHistoryOptions = {}
): UseTransactionHistoryReturn {
  const { pageSize = DEFAULT_PAGE_SIZE, fromBlock: initialFromBlock } = options;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oldestBlock, setOldestBlock] = useState<bigint | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // All-time purchase stats (persisted to localStorage)
  const [purchaseStats, setPurchaseStats] = useState<PurchaseStats>(() => {
    // Initialize from localStorage if available
    if (playerAddress) {
      const cached = loadStatsFromStorage(playerAddress);
      if (cached) {
        console.log('[useTransactionHistory] Loaded cached stats for', playerAddress.slice(0, 8));
        return cached;
      }
    }
    return DEFAULT_STATS;
  });
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  // Ref to prevent overlapping fetches
  const isFetchingRef = useRef(false);

  // Track all-time transaction count (not sliced)
  const allTimeTransactionCountRef = useRef(0);

  // Use wagmi's client for real-time events
  const wagmiClient = usePublicClient();
  const contractAddress = pokeballGameConfig.pokeballGameAddress;

  const isConfigured = isPokeballGameConfigured() && !!playerAddress && !!wagmiClient;

  // Debug logging on mount/config change
  useEffect(() => {
    if (DEBUG_TX_HISTORY) {
      console.log('[useTransactionHistory] Debug info:', {
        contractAddress,
        playerAddress: playerAddress ? `${playerAddress.slice(0, 8)}...` : 'undefined',
        isConfigured,
        hasWagmiClient: !!wagmiClient,
        rpcUrl: PUBLIC_RPC_URL,
        pokeballGameConfigured: isPokeballGameConfigured(),
      });
    }
  }, [contractAddress, playerAddress, isConfigured, wagmiClient]);

  // Reset and reload stats when playerAddress changes
  useEffect(() => {
    if (playerAddress) {
      const cached = loadStatsFromStorage(playerAddress);
      if (cached) {
        console.log('[useTransactionHistory] Address changed, loaded cached stats for', playerAddress.slice(0, 8));
        setPurchaseStats(cached);
        setIsStatsLoading(false);
      } else {
        setPurchaseStats(DEFAULT_STATS);
        setIsStatsLoading(true);
      }
    } else {
      setPurchaseStats(DEFAULT_STATS);
      setIsStatsLoading(true);
    }
  }, [playerAddress]);

  /**
   * Fetch all events for a player in one request using public RPC.
   * No block range limit with Caldera!
   */
  const fetchAllEvents = useCallback(
    async (
      from: bigint,
      to: bigint | 'latest'
    ): Promise<{ logs: (Log & { _eventType: string })[]; error?: string }> => {
      if (!contractAddress || !playerAddress) {
        return { logs: [] };
      }

      const allLogs: (Log & { _eventType: string })[] = [];

      console.log(`[useTransactionHistory] Fetching events from block ${from} to ${to}`);
      console.log(`[useTransactionHistory] Contract: ${contractAddress}`);
      console.log(`[useTransactionHistory] Player: ${playerAddress}`);

      // Fetch each event type
      const eventTypes = ['BallPurchased', 'ThrowAttempted', 'CaughtPokemon', 'FailedCatch'] as const;

      for (const eventType of eventTypes) {
        try {
          // Determine indexed arg
          let indexedArg: Record<string, `0x${string}`> = {};
          if (eventType === 'BallPurchased') {
            indexedArg = { buyer: playerAddress };
          } else if (eventType === 'ThrowAttempted' || eventType === 'FailedCatch') {
            indexedArg = { thrower: playerAddress };
          } else if (eventType === 'CaughtPokemon') {
            indexedArg = { catcher: playerAddress };
          }

          console.log(`[useTransactionHistory] Fetching ${eventType} with args:`, indexedArg);

          const logs = await publicRpcClient.getLogs({
            address: contractAddress,
            event: EVENT_ABIS[eventType] as any,
            args: indexedArg,
            fromBlock: from,
            toBlock: to,
          });

          console.log(`[useTransactionHistory] ${eventType}: found ${logs.length} logs`);

          // Tag logs with event type
          logs.forEach(log => {
            allLogs.push({ ...log, _eventType: eventType } as Log & { _eventType: string });
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[useTransactionHistory] Error fetching ${eventType}:`, errorMsg);

          // If it's a block range error, return early with error
          if (errorMsg.includes('block range') || errorMsg.includes('-32600')) {
            return { logs: allLogs, error: `Block range limit hit on ${eventType}` };
          }
        }
      }

      console.log(`[useTransactionHistory] Total logs found: ${allLogs.length}`);
      return { logs: allLogs };
    },
    [contractAddress, playerAddress]
  );

  /**
   * Parse logs into transactions
   */
  const parseLogsToTransactions = useCallback(
    async (logs: (Log & { _eventType: string })[]): Promise<Transaction[]> => {
      const txs: Transaction[] = [];
      const blockTimestamps = new Map<bigint, number>();

      for (const log of logs) {
        const baseData: Omit<BaseTransaction, 'type'> = {
          id: createTransactionId(log),
          timestamp: 0,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? '0x0',
        };

        // Get block timestamp (cache it to avoid duplicate calls)
        if (log.blockNumber) {
          if (blockTimestamps.has(log.blockNumber)) {
            baseData.timestamp = blockTimestamps.get(log.blockNumber)!;
          } else {
            try {
              const block = await publicRpcClient.getBlock({ blockNumber: log.blockNumber });
              const ts = Number(block.timestamp) * 1000;
              blockTimestamps.set(log.blockNumber, ts);
              baseData.timestamp = ts;
            } catch {
              baseData.timestamp = Date.now();
            }
          }
        }

        const args = ((log as unknown) as { args: Record<string, unknown> }).args || {};
        const eventType = log._eventType;

        switch (eventType) {
          case 'BallPurchased': {
            const ballType = Number(args.ballType ?? 0);
            const quantity = BigInt(args.quantity?.toString() ?? '0');
            const usedAPE = Boolean(args.usedAPE);
            const totalAmount = args.totalAmount ? BigInt(args.totalAmount.toString()) : null;
            txs.push({
              ...baseData,
              type: 'purchase',
              ballType,
              ballName: getBallConfig(ballType as 0 | 1 | 2 | 3)?.name ?? 'Unknown Ball',
              quantity,
              usedAPE,
              estimatedCost: totalAmount
                ? (usedAPE
                    ? `${formatUnits(totalAmount, 18)} APE`
                    : `${formatUnits(totalAmount, 6)} USDC`)
                : formatCost(ballType, quantity, usedAPE),
            } as PurchaseTransaction);
            break;
          }
          case 'ThrowAttempted': {
            const ballType = Number(args.ballTier ?? 0);
            txs.push({
              ...baseData,
              type: 'throw',
              pokemonId: BigInt(args.pokemonId?.toString() ?? '0'),
              ballType,
              ballName: getBallConfig(ballType as 0 | 1 | 2 | 3)?.name ?? 'Unknown Ball',
              // sequenceNumber is the Pyth Entropy sequence number (v1.6.0+)
              requestId: BigInt(args.sequenceNumber?.toString() ?? '0'),
            } as ThrowTransaction);
            break;
          }
          case 'CaughtPokemon': {
            txs.push({
              ...baseData,
              type: 'caught',
              pokemonId: BigInt(args.pokemonId?.toString() ?? '0'),
              nftTokenId: BigInt(args.nftTokenId?.toString() ?? '0'),
            } as CaughtTransaction);
            break;
          }
          case 'FailedCatch': {
            txs.push({
              ...baseData,
              type: 'failed',
              pokemonId: BigInt(args.pokemonId?.toString() ?? '0'),
              attemptsRemaining: Number(args.attemptsRemaining ?? 0),
            } as FailedTransaction);
            break;
          }
        }
      }

      // Sort by timestamp descending
      txs.sort((a, b) => b.timestamp - a.timestamp);
      return txs;
    },
    []
  );

  // Store in ref for useEffect
  const fetchAllEventsRef = useRef(fetchAllEvents);
  fetchAllEventsRef.current = fetchAllEvents;

  const parseLogsRef = useRef(parseLogsToTransactions);
  parseLogsRef.current = parseLogsToTransactions;

  // Track loaded state
  const [loadedForAddress, setLoadedForAddress] = useState<string | null>(null);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

  // Initial load
  useEffect(() => {
    if (!wagmiClient || !playerAddress || !contractAddress) {
      return;
    }

    if (hasAttemptedLoad && loadedForAddress === playerAddress) {
      return;
    }

    if (isLoading || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoading(true);
    setHasAttemptedLoad(true);
    setError(null);

    (async () => {
      try {
        if (DEBUG_TX_HISTORY) {
          console.log('[useTransactionHistory] Starting initial fetch for address:', playerAddress);
          console.log('[useTransactionHistory] Contract address:', contractAddress);
        }
        const currentBlock = await publicRpcClient.getBlockNumber();
        console.log(`[useTransactionHistory] Current block: ${currentBlock}`);

        const lookback = initialFromBlock
          ? currentBlock - initialFromBlock
          : DEFAULT_LOOKBACK_BLOCKS;

        const fromBlock = currentBlock > lookback ? currentBlock - lookback : BigInt(0);
        console.log(`[useTransactionHistory] Searching from block ${fromBlock} to ${currentBlock}`);

        const { logs, error: fetchError } = await fetchAllEventsRef.current(fromBlock, currentBlock);

        if (fetchError) {
          setError(fetchError);
        }

        const txs = await parseLogsRef.current(logs);
        console.log(`[useTransactionHistory] Parsed ${txs.length} transactions`);

        // Calculate stats from ALL transactions BEFORE slicing
        allTimeTransactionCountRef.current = txs.length;
        const newStats = calculateStatsFromTransactions(txs, fromBlock);
        console.log('[useTransactionHistory] Calculated all-time stats:', {
          purchases: newStats.totalPurchaseCount,
          spentUSD: newStats.totalSpentUSD.toFixed(2),
          throws: newStats.totalThrows,
          catches: newStats.totalCaught,
        });

        setPurchaseStats(newStats);
        setIsStatsLoading(false);

        // Save stats to localStorage for persistence across refreshes
        saveStatsToStorage(playerAddress, newStats);

        // NOW slice for display
        setTransactions(txs.slice(0, pageSize));
        setHasMore(txs.length > pageSize);
        setOldestBlock(fromBlock);
        setLoadedForAddress(playerAddress);
      } catch (err) {
        console.error('[useTransactionHistory] Load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load transaction history');
        setIsStatsLoading(false);
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerAddress, wagmiClient, contractAddress, initialFromBlock, pageSize, hasAttemptedLoad, loadedForAddress]);

  // Load more
  const loadMore = useCallback(async () => {
    if (!isConfigured || !oldestBlock || isLoadingMore || !hasMore || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    try {
      const newTo = oldestBlock - BigInt(1);
      const newFrom = newTo > DEFAULT_LOOKBACK_BLOCKS ? newTo - DEFAULT_LOOKBACK_BLOCKS : BigInt(0);

      if (newFrom >= newTo) {
        setHasMore(false);
        setIsLoadingMore(false);
        isFetchingRef.current = false;
        return;
      }

      const { logs } = await fetchAllEvents(newFrom, newTo);
      const txs = await parseLogsToTransactions(logs);

      if (txs.length === 0) {
        setHasMore(false);
      } else {
        // Calculate stats from the new transactions
        const newStats = calculateStatsFromTransactions(txs, newFrom);

        // Merge with existing stats
        setPurchaseStats((prevStats) => {
          const merged = mergeStats(prevStats, newStats);
          // Save updated stats to localStorage
          if (playerAddress) {
            saveStatsToStorage(playerAddress, merged);
          }
          console.log('[useTransactionHistory] Merged stats after loadMore:', {
            purchases: merged.totalPurchaseCount,
            spentUSD: merged.totalSpentUSD.toFixed(2),
          });
          return merged;
        });

        setTransactions((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const newTxs = txs.filter((t) => !existingIds.has(t.id));
          return [...prev, ...newTxs].sort((a, b) => b.timestamp - a.timestamp);
        });
        setOldestBlock(newFrom);
      }
    } catch (err) {
      console.error('[useTransactionHistory] Load more error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [isConfigured, oldestBlock, isLoadingMore, hasMore, fetchAllEvents, parseLogsToTransactions, playerAddress]);

  // Refresh
  const refresh = useCallback(async () => {
    if (!isConfigured || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const currentBlock = await publicRpcClient.getBlockNumber();
      const lookback = initialFromBlock
        ? currentBlock - initialFromBlock
        : DEFAULT_LOOKBACK_BLOCKS;

      const fromBlock = currentBlock > lookback ? currentBlock - lookback : BigInt(0);

      const { logs, error: fetchError } = await fetchAllEvents(fromBlock, currentBlock);

      if (fetchError) {
        setError(fetchError);
      }

      const txs = await parseLogsToTransactions(logs);

      // Recalculate stats from ALL transactions BEFORE slicing
      allTimeTransactionCountRef.current = txs.length;
      const newStats = calculateStatsFromTransactions(txs, fromBlock);
      console.log('[useTransactionHistory] Refreshed all-time stats:', {
        purchases: newStats.totalPurchaseCount,
        spentUSD: newStats.totalSpentUSD.toFixed(2),
      });

      setPurchaseStats(newStats);

      // Save updated stats to localStorage
      if (playerAddress) {
        saveStatsToStorage(playerAddress, newStats);
      }

      setTransactions(txs.slice(0, pageSize));
      setHasMore(txs.length > pageSize);
      setOldestBlock(fromBlock);
    } catch (err) {
      console.error('[useTransactionHistory] Refresh error:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [isConfigured, initialFromBlock, pageSize, fetchAllEvents, parseLogsToTransactions, playerAddress]);

  // Parse logs for real-time watchers (uses simpler format)
  const parseWatcherLogs = useCallback(
    async (logs: Log[], eventType: string): Promise<Transaction[]> => {
      const taggedLogs = logs.map(log => ({ ...log, _eventType: eventType })) as (Log & { _eventType: string })[];
      return parseLogsToTransactions(taggedLogs);
    },
    [parseLogsToTransactions]
  );

  // Helper to update stats when real-time events arrive
  const updateStatsWithNewTxs = useCallback((newTxs: Transaction[]) => {
    if (newTxs.length === 0 || !playerAddress) return;

    const newStats = calculateStatsFromTransactions(newTxs, BigInt(0));
    setPurchaseStats((prevStats) => {
      const merged = mergeStats(prevStats, newStats);
      saveStatsToStorage(playerAddress, merged);
      console.log('[useTransactionHistory] Updated stats from real-time event:', {
        purchases: merged.totalPurchaseCount,
        spentUSD: merged.totalSpentUSD.toFixed(2),
      });
      return merged;
    });
  }, [playerAddress]);

  // ============================================================
  // REAL-TIME EVENT POLLING (replaces useWatchContractEvent)
  // ============================================================
  // ApeChain public RPC doesn't support eth_newFilter, so we use manual polling
  // with eth_getLogs instead of wagmi's filter-based watching.

  const REALTIME_POLL_INTERVAL_MS = 2000;
  const lastPolledBlockRef = useRef<bigint | null>(null);
  const seenEventKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isConfigured || !playerAddress || !contractAddress) {
      return;
    }

    let isMounted = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const pollForNewEvents = async () => {
      if (!isMounted) return;

      try {
        const currentBlock = await publicRpcClient.getBlockNumber();

        // Determine fromBlock - either last polled block + 1 or current block (no lookback for real-time)
        let fromBlock: bigint;
        if (lastPolledBlockRef.current !== null) {
          fromBlock = lastPolledBlockRef.current + 1n;
        } else {
          // First poll - start from current block (historical is handled by initial fetch)
          fromBlock = currentBlock;
          lastPolledBlockRef.current = currentBlock;
          // Schedule next poll
          if (isMounted) {
            pollTimer = setTimeout(pollForNewEvents, REALTIME_POLL_INTERVAL_MS);
          }
          return;
        }

        // Skip if we're already caught up
        if (fromBlock > currentBlock) {
          if (isMounted) {
            pollTimer = setTimeout(pollForNewEvents, REALTIME_POLL_INTERVAL_MS);
          }
          return;
        }

        // Query all logs from the contract (we'll filter by event type after)
        const logs = await publicRpcClient.getLogs({
          address: contractAddress,
          fromBlock,
          toBlock: currentBlock,
        });

        // Update last polled block
        lastPolledBlockRef.current = currentBlock;

        if (logs.length > 0) {
          // Parse logs for each event type we care about
          const eventTypes = ['BallPurchased', 'ThrowAttempted', 'CaughtPokemon', 'FailedCatch'] as const;
          const allNewTxs: Transaction[] = [];

          for (const eventName of eventTypes) {
            try {
              const parsedEvents = parseEventLogs({
                abi: pokeballGameConfig.abi,
                logs,
                eventName,
              });

              if (parsedEvents.length > 0) {
                // Filter by player address based on event type
                const playerFilteredEvents = parsedEvents.filter((event) => {
                  const args = event.args as Record<string, unknown>;
                  if (eventName === 'BallPurchased') {
                    return (args.buyer as string)?.toLowerCase() === playerAddress.toLowerCase();
                  } else if (eventName === 'ThrowAttempted' || eventName === 'FailedCatch') {
                    return (args.thrower as string)?.toLowerCase() === playerAddress.toLowerCase();
                  } else if (eventName === 'CaughtPokemon') {
                    return (args.catcher as string)?.toLowerCase() === playerAddress.toLowerCase();
                  }
                  return false;
                });

                if (playerFilteredEvents.length > 0) {
                  // Deduplicate using txHash-logIndex
                  const newEvents = playerFilteredEvents.filter((event) => {
                    const eventKey = `${event.transactionHash}-${event.logIndex}`;
                    if (seenEventKeysRef.current.has(eventKey)) {
                      return false;
                    }
                    seenEventKeysRef.current.add(eventKey);
                    return true;
                  });

                  if (newEvents.length > 0) {
                    console.log(`[useTransactionHistory] Real-time poll found ${newEvents.length} new ${eventName} event(s)`);
                    const taggedLogs = newEvents.map(log => ({ ...log, _eventType: eventName })) as (Log & { _eventType: string })[];
                    const txs = await parseLogsToTransactions(taggedLogs);
                    allNewTxs.push(...txs);
                  }
                }
              }
            } catch (parseError) {
              // Expected - most logs won't match our specific event
              // Only log if it's an unexpected error
              if (!(parseError instanceof Error && parseError.message.includes('no matching event'))) {
                console.warn(`[useTransactionHistory] Parse warning for ${eventName}:`, parseError);
              }
            }
          }

          // Update state with all new transactions
          if (allNewTxs.length > 0) {
            // Update stats
            updateStatsWithNewTxs(allNewTxs);

            // Add to transactions (newest first)
            setTransactions((prev) => {
              const existingIds = new Set(prev.map((t) => t.id));
              const unique = allNewTxs.filter((t) => !existingIds.has(t.id));
              return [...unique, ...prev];
            });
          }
        }
      } catch (error) {
        console.error('[useTransactionHistory] Real-time poll error:', error);
        // Don't update lastPolledBlockRef on error - we'll retry from the same block
      }

      // Schedule next poll
      if (isMounted) {
        pollTimer = setTimeout(pollForNewEvents, REALTIME_POLL_INTERVAL_MS);
      }
    };

    // Start polling
    console.log(`[useTransactionHistory] Starting real-time event polling (interval: ${REALTIME_POLL_INTERVAL_MS}ms)`);
    pollForNewEvents();

    return () => {
      isMounted = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
      console.log('[useTransactionHistory] Stopped real-time event polling');
    };
  }, [isConfigured, playerAddress, contractAddress, parseLogsToTransactions, updateStatsWithNewTxs]);

  return {
    transactions,
    isLoading,
    error,
    hasMore,
    loadMore,
    isLoadingMore,
    refresh,
    totalCount: transactions.length,
    purchaseStats,
    isStatsLoading,
  };
}

// ============================================================
// UTILITY EXPORTS
// ============================================================

export { getTransactionUrl };

export function isPurchaseTransaction(tx: Transaction): tx is PurchaseTransaction {
  return tx.type === 'purchase';
}

export function isThrowTransaction(tx: Transaction): tx is ThrowTransaction {
  return tx.type === 'throw';
}

export function isCaughtTransaction(tx: Transaction): tx is CaughtTransaction {
  return tx.type === 'caught';
}

export function isFailedTransaction(tx: Transaction): tx is FailedTransaction {
  return tx.type === 'failed';
}
