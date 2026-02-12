/**
 * useSolanaEvents Hook
 *
 * Subscribes to on-chain Anchor program events via WebSocket.
 * Replaces the EVM useContractEvents hook that used eth_getLogs polling.
 *
 * On Solana, Anchor programs emit events via Program.addEventListener().
 * These events are received in real-time via WebSocket subscription.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { getReadOnlyProgram } from '../../solana/programClient';

// ============================================================
// TYPE DEFINITIONS (compatible with existing event args)
// ============================================================

export interface BallPurchasedArgs {
  buyer: string; // PublicKey.toBase58()
  ballType: number;
  quantity: number;
  totalCost: bigint;
}

export interface CaughtPokemonArgs {
  catcher: string;
  pokemonId: bigint;
  slotIndex: number;
  nftMint: string;
}

export interface FailedCatchArgs {
  thrower: string;
  pokemonId: bigint;
  slotIndex: number;
  attemptsRemaining: number;
}

export interface PokemonSpawnedArgs {
  pokemonId: bigint;
  slotIndex: number;
  posX: number;
  posY: number;
}

export interface PokemonDespawnedArgs {
  pokemonId: bigint;
  slotIndex: number;
}

export interface PokemonRelocatedArgs {
  pokemonId: bigint;
  slotIndex: number;
  oldX: number;
  oldY: number;
  newX: number;
  newY: number;
}

export interface ThrowAttemptedArgs {
  thrower: string;
  pokemonId: bigint;
  ballType: number;
  slotIndex: number;
  vrfSeed: number[];
}

export interface NftAwardedArgs {
  winner: string;
  nftMint: string;
  vaultRemaining: number;
}

export type SolanaEventName =
  | 'BallPurchased'
  | 'CaughtPokemon'
  | 'FailedCatch'
  | 'PokemonSpawned'
  | 'PokemonDespawned'
  | 'PokemonRelocated'
  | 'ThrowAttempted'
  | 'NftAwarded';

export type EventArgsMap = {
  BallPurchased: BallPurchasedArgs;
  CaughtPokemon: CaughtPokemonArgs;
  FailedCatch: FailedCatchArgs;
  PokemonSpawned: PokemonSpawnedArgs;
  PokemonDespawned: PokemonDespawnedArgs;
  PokemonRelocated: PokemonRelocatedArgs;
  ThrowAttempted: ThrowAttemptedArgs;
  NftAwarded: NftAwardedArgs;
};

export interface SolanaEvent<T extends SolanaEventName> {
  eventName: T;
  args: EventArgsMap[T];
  /** Slot number when the event was emitted */
  slot?: number;
  /** Unique key for deduplication */
  eventKey: string;
  /** Timestamp when the event was received (Date.now()) */
  receivedAt: number;
}

export interface UseSolanaEventsReturn<T extends SolanaEventName> {
  events: readonly SolanaEvent<T>[];
  isLoading: boolean;
  clearEvents: () => void;
  eventCount: number;
}

// ============================================================
// ANCHOR EVENT NAME MAPPING
// ============================================================

// Anchor event names in the IDL are camelCase, map from our PascalCase
const ANCHOR_EVENT_NAMES: Record<SolanaEventName, string> = {
  BallPurchased: 'ballPurchased',
  CaughtPokemon: 'caughtPokemon',
  FailedCatch: 'failedCatch',
  PokemonSpawned: 'pokemonSpawned',
  PokemonDespawned: 'pokemonDespawned',
  PokemonRelocated: 'pokemonRelocated',
  ThrowAttempted: 'throwAttempted',
  NftAwarded: 'nftAwarded',
};

// ============================================================
// EVENT NORMALIZER
// ============================================================

function normalizeEventArgs<T extends SolanaEventName>(
  eventName: T,
  rawArgs: any
): EventArgsMap[T] {
  switch (eventName) {
    case 'BallPurchased':
      return {
        buyer: rawArgs.buyer?.toBase58?.() ?? rawArgs.buyer?.toString() ?? '',
        ballType: rawArgs.ballType ?? 0,
        quantity: rawArgs.quantity ?? 0,
        totalCost: BigInt(rawArgs.totalCost?.toString() ?? '0'),
      } as EventArgsMap[T];

    case 'CaughtPokemon':
      return {
        catcher: rawArgs.catcher?.toBase58?.() ?? rawArgs.catcher?.toString() ?? '',
        pokemonId: BigInt(rawArgs.pokemonId?.toString() ?? '0'),
        slotIndex: rawArgs.slotIndex ?? 0,
        nftMint: rawArgs.nftMint?.toBase58?.() ?? rawArgs.nftMint?.toString() ?? '',
      } as EventArgsMap[T];

    case 'FailedCatch':
      return {
        thrower: rawArgs.thrower?.toBase58?.() ?? rawArgs.thrower?.toString() ?? '',
        pokemonId: BigInt(rawArgs.pokemonId?.toString() ?? '0'),
        slotIndex: rawArgs.slotIndex ?? 0,
        attemptsRemaining: rawArgs.attemptsRemaining ?? 0,
      } as EventArgsMap[T];

    case 'PokemonSpawned':
      return {
        pokemonId: BigInt(rawArgs.pokemonId?.toString() ?? '0'),
        slotIndex: rawArgs.slotIndex ?? 0,
        posX: rawArgs.posX ?? 0,
        posY: rawArgs.posY ?? 0,
      } as EventArgsMap[T];

    case 'PokemonDespawned':
      return {
        pokemonId: BigInt(rawArgs.pokemonId?.toString() ?? '0'),
        slotIndex: rawArgs.slotIndex ?? 0,
      } as EventArgsMap[T];

    case 'PokemonRelocated':
      return {
        pokemonId: BigInt(rawArgs.pokemonId?.toString() ?? '0'),
        slotIndex: rawArgs.slotIndex ?? 0,
        oldX: rawArgs.oldX ?? 0,
        oldY: rawArgs.oldY ?? 0,
        newX: rawArgs.newX ?? 0,
        newY: rawArgs.newY ?? 0,
      } as EventArgsMap[T];

    case 'ThrowAttempted':
      return {
        thrower: rawArgs.thrower?.toBase58?.() ?? rawArgs.thrower?.toString() ?? '',
        pokemonId: BigInt(rawArgs.pokemonId?.toString() ?? '0'),
        ballType: rawArgs.ballType ?? 0,
        slotIndex: rawArgs.slotIndex ?? 0,
        vrfSeed: rawArgs.vrfSeed ?? [],
      } as EventArgsMap[T];

    case 'NftAwarded':
      return {
        winner: rawArgs.winner?.toBase58?.() ?? rawArgs.winner?.toString() ?? '',
        nftMint: rawArgs.nftMint?.toBase58?.() ?? rawArgs.nftMint?.toString() ?? '',
        vaultRemaining: rawArgs.vaultRemaining ?? 0,
      } as EventArgsMap[T];

    default:
      return rawArgs as EventArgsMap[T];
  }
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

let eventCounter = 0;

export function useSolanaEvents<T extends SolanaEventName>(
  eventName: T,
  onEvent?: (event: SolanaEvent<T>) => void
): UseSolanaEventsReturn<T> {
  const { connection } = useConnection();
  const [events, setEvents] = useState<SolanaEvent<T>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const seenEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let listenerId: number | null = null;
    let isMounted = true;

    const subscribe = () => {
      try {
        const program = getReadOnlyProgram(connection);
        const anchorEventName = ANCHOR_EVENT_NAMES[eventName];

        listenerId = program.addEventListener(anchorEventName, (rawArgs, slot) => {
          if (!isMounted) return;

          const eventKey = `${eventName}-${slot}-${++eventCounter}`;

          if (seenEventsRef.current.has(eventKey)) return;
          seenEventsRef.current.add(eventKey);

          const normalizedArgs = normalizeEventArgs(eventName, rawArgs);
          const event: SolanaEvent<T> = {
            eventName,
            args: normalizedArgs,
            slot,
            eventKey,
            receivedAt: Date.now(),
          };

          console.log(`[useSolanaEvents] ${eventName} event:`, event);

          setEvents((prev) => [...prev, event]);

          if (onEventRef.current) {
            onEventRef.current(event);
          }
        });

        console.log(`[useSolanaEvents] ${eventName} - Subscribed (listener ${listenerId})`);
        setIsLoading(false);
      } catch (e) {
        console.error(`[useSolanaEvents] ${eventName} - Failed to subscribe:`, e);
        setIsLoading(false);
      }
    };

    subscribe();

    return () => {
      isMounted = false;
      if (listenerId !== null) {
        try {
          const program = getReadOnlyProgram(connection);
          program.removeEventListener(listenerId);
          console.log(`[useSolanaEvents] ${eventName} - Unsubscribed (listener ${listenerId})`);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [eventName, connection]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    seenEventsRef.current.clear();
  }, []);

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

export function useBallPurchasedEvents(
  onPurchase?: (event: SolanaEvent<'BallPurchased'>) => void
) {
  return useSolanaEvents('BallPurchased', onPurchase);
}

export function useCaughtPokemonEvents(
  onCatch?: (event: SolanaEvent<'CaughtPokemon'>) => void
) {
  return useSolanaEvents('CaughtPokemon', onCatch);
}

export function useFailedCatchEvents(
  onFail?: (event: SolanaEvent<'FailedCatch'>) => void
) {
  return useSolanaEvents('FailedCatch', onFail);
}

export function usePokemonSpawnedEvents(
  onSpawn?: (event: SolanaEvent<'PokemonSpawned'>) => void
) {
  return useSolanaEvents('PokemonSpawned', onSpawn);
}

export function useThrowAttemptedEvents(
  onThrow?: (event: SolanaEvent<'ThrowAttempted'>) => void
) {
  return useSolanaEvents('ThrowAttempted', onThrow);
}

export function usePokemonRelocatedEvents(
  onRelocate?: (event: SolanaEvent<'PokemonRelocated'>) => void
) {
  return useSolanaEvents('PokemonRelocated', onRelocate);
}

// ============================================================
// COMBINED EVENT HOOK
// ============================================================

export interface AllGameEventsReturn {
  ballPurchases: readonly SolanaEvent<'BallPurchased'>[];
  catches: readonly SolanaEvent<'CaughtPokemon'>[];
  failures: readonly SolanaEvent<'FailedCatch'>[];
  spawns: readonly SolanaEvent<'PokemonSpawned'>[];
  relocations: readonly SolanaEvent<'PokemonRelocated'>[];
  throws: readonly SolanaEvent<'ThrowAttempted'>[];
  clearAll: () => void;
}

export function useAllGameEvents(): AllGameEventsReturn {
  const ballPurchases = useSolanaEvents('BallPurchased');
  const catches = useSolanaEvents('CaughtPokemon');
  const failures = useSolanaEvents('FailedCatch');
  const spawns = useSolanaEvents('PokemonSpawned');
  const relocations = useSolanaEvents('PokemonRelocated');
  const throws = useSolanaEvents('ThrowAttempted');

  const clearAll = useCallback(() => {
    ballPurchases.clearEvents();
    catches.clearEvents();
    failures.clearEvents();
    spawns.clearEvents();
    relocations.clearEvents();
    throws.clearEvents();
  }, [ballPurchases, catches, failures, spawns, relocations, throws]);

  return {
    ballPurchases: ballPurchases.events,
    catches: catches.events,
    failures: failures.events,
    spawns: spawns.events,
    relocations: relocations.events,
    throws: throws.events,
    clearAll,
  };
}
