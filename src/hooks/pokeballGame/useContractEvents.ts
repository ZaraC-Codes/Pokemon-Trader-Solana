/**
 * useContractEvents Hook
 *
 * Hook for subscribing to PokeballGame contract events.
 * Accumulates events into a local state array for the current session.
 *
 * IMPORTANT: Uses manual eth_getLogs polling instead of eth_newFilter because
 * the ApeChain public RPC does not support stateful filters (filter not found errors).
 *
 * Usage:
 * ```tsx
 * // Subscribe to BallPurchased events
 * const {
 *   events,
 *   isLoading,
 *   clearEvents,
 * } = useContractEvents('BallPurchased');
 *
 * // Display purchase history
 * {events.map((event, i) => (
 *   <div key={i}>
 *     Purchased {event.args.quantity} balls of type {event.args.ballType}
 *   </div>
 * ))}
 *
 * // Subscribe to catch results
 * const catches = useContractEvents('CaughtPokemon');
 * const failures = useContractEvents('FailedCatch');
 *
 * // Combined event listener for all game events
 * const allEvents = useAllGameEvents();
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import { parseEventLogs, type Log } from 'viem';
import {
  POKEBALL_GAME_ADDRESS,
  POKEBALL_GAME_ABI,
  POKEBALL_GAME_CHAIN_ID,
  usePokeballGameAddress,
  type PokeballGameEventName,
} from './pokeballGameConfig';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/**
 * Typed event args for each event type.
 */
export interface BallPurchasedArgs {
  buyer: `0x${string}`;
  ballType: number;
  quantity: bigint;
  usedAPE: boolean;
}

export interface CaughtPokemonArgs {
  catcher: `0x${string}`;
  pokemonId: bigint;
  nftTokenId: bigint;
}

export interface FailedCatchArgs {
  thrower: `0x${string}`;
  pokemonId: bigint;
  attemptsRemaining: number;
}

export interface PokemonRelocatedArgs {
  pokemonId: bigint;
  newX: bigint;
  newY: bigint;
}

export interface PokemonSpawnedArgs {
  pokemonId: bigint;
  positionX: bigint;
  positionY: bigint;
  slotIndex: number;
}

export interface ThrowAttemptedArgs {
  thrower: `0x${string}`;
  pokemonId: bigint;
  ballTier: number;
  requestId: bigint;
}

export interface WalletUpdatedArgs {
  walletType: string;
  oldAddress: `0x${string}`;
  newAddress: `0x${string}`;
}

export interface RevenueSentToManagerArgs {
  amount: bigint;
}

/**
 * Map of event names to their typed args.
 */
export type EventArgsMap = {
  BallPurchased: BallPurchasedArgs;
  CaughtPokemon: CaughtPokemonArgs;
  FailedCatch: FailedCatchArgs;
  PokemonRelocated: PokemonRelocatedArgs;
  PokemonSpawned: PokemonSpawnedArgs;
  ThrowAttempted: ThrowAttemptedArgs;
  WalletUpdated: WalletUpdatedArgs;
  RevenueSentToManager: RevenueSentToManagerArgs;
};

/**
 * Typed event with parsed args.
 */
export interface TypedContractEvent<T extends PokeballGameEventName> extends Log {
  eventName: T;
  args: EventArgsMap[T];
}

export interface UseContractEventsReturn<T extends PokeballGameEventName> {
  /**
   * Array of accumulated events for this session.
   */
  events: readonly TypedContractEvent<T>[];

  /**
   * Whether the subscription is active.
   */
  isLoading: boolean;

  /**
   * Clear all accumulated events.
   */
  clearEvents: () => void;

  /**
   * Number of events received.
   */
  eventCount: number;
}

// ============================================================
// CONFIGURATION
// ============================================================

// Poll every 2 seconds (ApeChain has ~0.25s blocks, so this catches events quickly)
const POLL_INTERVAL_MS = 2000;

// How many blocks to look back on initial load (about 10 seconds of history)
const INITIAL_LOOKBACK_BLOCKS = 40n;

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

/**
 * Hook for subscribing to a specific PokeballGame contract event.
 * Uses manual eth_getLogs polling instead of filters (which ApeChain RPC doesn't support).
 *
 * @param eventName - The event name to subscribe to
 * @param onEvent - Optional callback for each new event
 * @returns Object with events array, loading state, and clear function
 */
export function useContractEvents<T extends PokeballGameEventName>(
  eventName: T,
  onEvent?: (event: TypedContractEvent<T>) => void
): UseContractEventsReturn<T> {
  const { isConfigured } = usePokeballGameAddress();
  const publicClient = usePublicClient({ chainId: POKEBALL_GAME_CHAIN_ID });
  const [events, setEvents] = useState<TypedContractEvent<T>[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Track the last block we queried to avoid duplicate events
  const lastBlockRef = useRef<bigint | null>(null);
  // Track seen event keys to dedupe
  const seenEventsRef = useRef<Set<string>>(new Set());
  // Store onEvent callback in ref to avoid effect dependency issues
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Log on mount to verify hook is initialized
  useEffect(() => {
    console.log(`[useContractEvents] ${eventName} hook MOUNTED. Address:`, POKEBALL_GAME_ADDRESS, 'ChainId:', POKEBALL_GAME_CHAIN_ID, 'Enabled:', isConfigured);
    return () => {
      console.log(`[useContractEvents] ${eventName} hook UNMOUNTED`);
    };
  }, [eventName, isConfigured]);

  // Manual polling for events using eth_getLogs
  useEffect(() => {
    if (!isConfigured || !publicClient || !POKEBALL_GAME_ADDRESS) {
      console.log(`[useContractEvents] ${eventName} - Not starting poll: configured=${isConfigured}, client=${!!publicClient}, address=${POKEBALL_GAME_ADDRESS}`);
      return;
    }

    let isMounted = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const pollForEvents = async () => {
      if (!isMounted) return;

      try {
        // Get current block number
        const currentBlock = await publicClient.getBlockNumber();

        // Determine fromBlock - either last queried block + 1 or lookback from current
        let fromBlock: bigint;
        if (lastBlockRef.current !== null) {
          fromBlock = lastBlockRef.current + 1n;
        } else {
          // First poll - look back a bit to catch recent events
          fromBlock = currentBlock > INITIAL_LOOKBACK_BLOCKS ? currentBlock - INITIAL_LOOKBACK_BLOCKS : 0n;
          console.log(`[useContractEvents] ${eventName} - Initial poll from block ${fromBlock} to ${currentBlock}`);
        }

        // Skip if we're already caught up
        if (fromBlock > currentBlock) {
          // Schedule next poll
          if (isMounted) {
            pollTimer = setTimeout(pollForEvents, POLL_INTERVAL_MS);
          }
          return;
        }

        // Query logs using eth_getLogs (no filter required)
        const logs = await publicClient.getLogs({
          address: POKEBALL_GAME_ADDRESS,
          fromBlock,
          toBlock: currentBlock,
        });

        // Update last block
        lastBlockRef.current = currentBlock;

        if (logs.length > 0) {
          // Parse logs to get typed events
          try {
            const parsedEvents = parseEventLogs({
              abi: POKEBALL_GAME_ABI,
              logs,
              eventName,
            });

            if (parsedEvents.length > 0) {
              console.log(`[useContractEvents] ${eventName} received ${parsedEvents.length} log(s) at`, new Date().toISOString());

              const newEvents: TypedContractEvent<T>[] = [];

              for (const log of parsedEvents) {
                // Create unique key for deduplication
                const eventKey = `${log.transactionHash}-${log.logIndex}`;

                // Skip if we've already seen this event
                if (seenEventsRef.current.has(eventKey)) {
                  continue;
                }
                seenEventsRef.current.add(eventKey);

                const typedEvent = log as unknown as TypedContractEvent<T>;
                typedEvent.eventName = eventName;

                console.log(`[useContractEvents] ${eventName} event:`, {
                  eventKey,
                  args: typedEvent.args,
                  blockNumber: typedEvent.blockNumber?.toString(),
                  transactionHash: typedEvent.transactionHash,
                });

                newEvents.push(typedEvent);

                // Call optional callback
                if (onEventRef.current) {
                  onEventRef.current(typedEvent);
                }
              }

              if (newEvents.length > 0) {
                setEvents((prev) => [...prev, ...newEvents]);
              }
            }
          } catch (parseError) {
            // This is expected - most logs won't match our specific event
            // Only log if it's an unexpected error
            if (!(parseError instanceof Error && parseError.message.includes('no matching event'))) {
              console.warn(`[useContractEvents] ${eventName} parse warning:`, parseError);
            }
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error(`[useContractEvents] ${eventName} poll error:`, error);
        // Don't update lastBlockRef on error - we'll retry from the same block
      }

      // Schedule next poll
      if (isMounted) {
        pollTimer = setTimeout(pollForEvents, POLL_INTERVAL_MS);
      }
    };

    // Start polling
    console.log(`[useContractEvents] ${eventName} - Starting manual eth_getLogs polling (interval: ${POLL_INTERVAL_MS}ms)`);
    pollForEvents();

    return () => {
      isMounted = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
      console.log(`[useContractEvents] ${eventName} - Stopped polling`);
    };
  }, [eventName, isConfigured, publicClient]);

  // Clear events function
  const clearEvents = useCallback(() => {
    setEvents([]);
    seenEventsRef.current.clear();
  }, []);

  // Return safe defaults if contract not configured
  if (!isConfigured) {
    return {
      events: [],
      isLoading: false,
      clearEvents: () => {},
      eventCount: 0,
    };
  }

  return {
    events,
    isLoading,
    clearEvents,
    eventCount: events.length,
  };
}

// ============================================================
// SPECIALIZED EVENT HOOKS
// ============================================================

/**
 * Hook specifically for ball purchase events.
 */
export function useBallPurchasedEvents(
  onPurchase?: (event: TypedContractEvent<'BallPurchased'>) => void
) {
  return useContractEvents('BallPurchased', onPurchase);
}

/**
 * Hook specifically for successful catch events.
 */
export function useCaughtPokemonEvents(
  onCatch?: (event: TypedContractEvent<'CaughtPokemon'>) => void
) {
  return useContractEvents('CaughtPokemon', onCatch);
}

/**
 * Hook specifically for failed catch events.
 */
export function useFailedCatchEvents(
  onFail?: (event: TypedContractEvent<'FailedCatch'>) => void
) {
  return useContractEvents('FailedCatch', onFail);
}

/**
 * Hook specifically for Pokemon relocation events.
 */
export function usePokemonRelocatedEvents(
  onRelocate?: (event: TypedContractEvent<'PokemonRelocated'>) => void
) {
  return useContractEvents('PokemonRelocated', onRelocate);
}

/**
 * Hook specifically for Pokemon spawn events.
 */
export function usePokemonSpawnedEvents(
  onSpawn?: (event: TypedContractEvent<'PokemonSpawned'>) => void
) {
  return useContractEvents('PokemonSpawned', onSpawn);
}

/**
 * Hook specifically for throw attempt events.
 */
export function useThrowAttemptedEvents(
  onThrow?: (event: TypedContractEvent<'ThrowAttempted'>) => void
) {
  return useContractEvents('ThrowAttempted', onThrow);
}

// ============================================================
// COMBINED EVENT HOOK
// ============================================================

export interface AllGameEventsReturn {
  ballPurchases: readonly TypedContractEvent<'BallPurchased'>[];
  catches: readonly TypedContractEvent<'CaughtPokemon'>[];
  failures: readonly TypedContractEvent<'FailedCatch'>[];
  relocations: readonly TypedContractEvent<'PokemonRelocated'>[];
  spawns: readonly TypedContractEvent<'PokemonSpawned'>[];
  throws: readonly TypedContractEvent<'ThrowAttempted'>[];
  clearAll: () => void;
}

/**
 * Hook that subscribes to all game-relevant events.
 * Useful for a comprehensive game event log.
 */
export function useAllGameEvents(): AllGameEventsReturn {
  const ballPurchases = useContractEvents('BallPurchased');
  const catches = useContractEvents('CaughtPokemon');
  const failures = useContractEvents('FailedCatch');
  const relocations = useContractEvents('PokemonRelocated');
  const spawns = useContractEvents('PokemonSpawned');
  const throws = useContractEvents('ThrowAttempted');

  const clearAll = useCallback(() => {
    ballPurchases.clearEvents();
    catches.clearEvents();
    failures.clearEvents();
    relocations.clearEvents();
    spawns.clearEvents();
    throws.clearEvents();
  }, [ballPurchases, catches, failures, relocations, spawns, throws]);

  return {
    ballPurchases: ballPurchases.events,
    catches: catches.events,
    failures: failures.events,
    relocations: relocations.events,
    spawns: spawns.events,
    throws: throws.events,
    clearAll,
  };
}

export default useContractEvents;
