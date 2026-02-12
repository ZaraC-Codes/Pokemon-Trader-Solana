/**
 * useTransactionLog Hook
 *
 * Persists the transaction log per wallet in localStorage.
 * Key: `pokeball_tx_log:<walletPubkey>`
 *
 * Features:
 * - Versioned schema (auto-discards old/malformed data)
 * - Survives page refreshes and new frontend deployments
 * - Deduplicates events by eventKey
 * - Sorted newest-first
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// SCHEMA VERSION — bump this to discard old data on upgrade
// ============================================================

const SCHEMA_VERSION = 1;
const STORAGE_KEY_PREFIX = 'pokeball_tx_log:';
const MAX_LOG_ENTRIES = 500; // Cap to prevent unbounded growth

// ============================================================
// PERSISTED EVENT TYPES
// ============================================================

export type PersistedEventType = 'purchase' | 'throw' | 'caught' | 'escaped';

/**
 * A single persisted transaction log entry.
 * All fields are JSON-serializable (no BigInt — stored as string).
 */
export interface PersistedGameEvent {
  /** Unique deduplication key (from SolanaEvent.eventKey) */
  key: string;
  /** Event type */
  type: PersistedEventType;
  /** When the event was received (Date.now() ms) */
  timestamp: number;
  /** Solana slot number (if available) */
  slot?: number;
  /** Pokemon ID as string (BigInt serialized) */
  pokemonId?: string;
  /** Slot index on the PokemonSlots account */
  slotIndex?: number;
  /** Ball type index (0-3) */
  ballType?: number;
  /** Human-readable ball name */
  ballName?: string;
  /** Number of balls purchased */
  quantity?: number;
  /** Total cost in atomic SOLCATCH units (as string, BigInt serialized) */
  totalCost?: string;
  /** Attempts remaining after failed catch */
  attemptsRemaining?: number;
  /** NFT mint address (for caught events) */
  nftMint?: string;
}

/**
 * Top-level localStorage wrapper with version for safe migration.
 */
interface PersistedLogData {
  version: number;
  events: PersistedGameEvent[];
}

// ============================================================
// HELPERS
// ============================================================

function getStorageKey(walletAddress: string): string {
  return `${STORAGE_KEY_PREFIX}${walletAddress}`;
}

/**
 * Safely read and validate persisted log data from localStorage.
 * Returns empty array if data is missing, malformed, or wrong version.
 */
function loadFromStorage(walletAddress: string): PersistedGameEvent[] {
  try {
    const raw = localStorage.getItem(getStorageKey(walletAddress));
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    // Validate shape
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      !('events' in parsed)
    ) {
      console.warn('[useTransactionLog] Malformed data, discarding');
      localStorage.removeItem(getStorageKey(walletAddress));
      return [];
    }

    const data = parsed as PersistedLogData;

    // Version check — discard old versions
    if (data.version !== SCHEMA_VERSION) {
      console.warn(
        `[useTransactionLog] Schema version mismatch: stored=${data.version}, current=${SCHEMA_VERSION}. Discarding.`
      );
      localStorage.removeItem(getStorageKey(walletAddress));
      return [];
    }

    // Validate events is an array
    if (!Array.isArray(data.events)) {
      console.warn('[useTransactionLog] events is not an array, discarding');
      localStorage.removeItem(getStorageKey(walletAddress));
      return [];
    }

    // Basic validation of each event (ensure required fields exist)
    const validEvents = data.events.filter(
      (ev) =>
        typeof ev === 'object' &&
        ev !== null &&
        typeof ev.key === 'string' &&
        typeof ev.type === 'string' &&
        typeof ev.timestamp === 'number'
    );

    if (validEvents.length !== data.events.length) {
      console.warn(
        `[useTransactionLog] Filtered ${data.events.length - validEvents.length} invalid entries`
      );
    }

    return validEvents;
  } catch (err) {
    console.warn('[useTransactionLog] Failed to load from localStorage:', err);
    try {
      localStorage.removeItem(getStorageKey(walletAddress));
    } catch {
      // ignore
    }
    return [];
  }
}

/**
 * Persist events to localStorage.
 */
function saveToStorage(walletAddress: string, events: PersistedGameEvent[]): void {
  try {
    const data: PersistedLogData = {
      version: SCHEMA_VERSION,
      events,
    };
    localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(data));
  } catch (err) {
    console.warn('[useTransactionLog] Failed to save to localStorage:', err);
  }
}

// ============================================================
// HOOK
// ============================================================

export interface UseTransactionLogReturn {
  /** All persisted events, sorted newest-first */
  events: readonly PersistedGameEvent[];
  /** Append one or more events (deduplicates by key) */
  appendEvents: (newEvents: PersistedGameEvent[]) => void;
  /** Clear all persisted events for this wallet */
  clearLog: () => void;
  /** Whether the log has been loaded from localStorage */
  isLoaded: boolean;
}

export function useTransactionLog(walletAddress?: string): UseTransactionLogReturn {
  const [events, setEvents] = useState<PersistedGameEvent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  // Track seen keys for O(1) deduplication
  const seenKeysRef = useRef<Set<string>>(new Set());
  // Track current wallet to detect changes
  const currentWalletRef = useRef<string | undefined>(undefined);

  // Load from localStorage when wallet changes
  useEffect(() => {
    if (!walletAddress) {
      setEvents([]);
      setIsLoaded(false);
      seenKeysRef.current.clear();
      currentWalletRef.current = undefined;
      return;
    }

    // Load persisted data
    const loaded = loadFromStorage(walletAddress);
    // Build seen keys set
    const keys = new Set(loaded.map((ev) => ev.key));
    seenKeysRef.current = keys;
    currentWalletRef.current = walletAddress;

    // Sort newest first
    loaded.sort((a, b) => b.timestamp - a.timestamp);
    setEvents(loaded);
    setIsLoaded(true);

    console.log(
      `[useTransactionLog] Loaded ${loaded.length} events for wallet ${walletAddress.slice(0, 8)}...`
    );
  }, [walletAddress]);

  const appendEvents = useCallback(
    (newEvents: PersistedGameEvent[]) => {
      if (!walletAddress) return;

      setEvents((prev) => {
        // Deduplicate
        const toAdd: PersistedGameEvent[] = [];
        for (const ev of newEvents) {
          if (!seenKeysRef.current.has(ev.key)) {
            seenKeysRef.current.add(ev.key);
            toAdd.push(ev);
          }
        }

        if (toAdd.length === 0) return prev;

        // Merge and sort newest first
        let merged = [...toAdd, ...prev];

        // Cap at MAX_LOG_ENTRIES (drop oldest)
        if (merged.length > MAX_LOG_ENTRIES) {
          // Already sorted newest-first after spread, but re-sort to be safe
          merged.sort((a, b) => b.timestamp - a.timestamp);
          const dropped = merged.length - MAX_LOG_ENTRIES;
          merged = merged.slice(0, MAX_LOG_ENTRIES);
          // Remove dropped keys from seen set
          for (let i = MAX_LOG_ENTRIES; i < MAX_LOG_ENTRIES + dropped; i++) {
            // We already sliced, so we can't access dropped items
            // Instead, rebuild seenKeys from merged
          }
          seenKeysRef.current = new Set(merged.map((ev) => ev.key));
          console.log(`[useTransactionLog] Capped at ${MAX_LOG_ENTRIES}, dropped ${dropped} oldest`);
        } else {
          merged.sort((a, b) => b.timestamp - a.timestamp);
        }

        // Persist
        saveToStorage(walletAddress, merged);
        return merged;
      });
    },
    [walletAddress]
  );

  const clearLog = useCallback(() => {
    if (!walletAddress) return;

    setEvents([]);
    seenKeysRef.current.clear();
    try {
      localStorage.removeItem(getStorageKey(walletAddress));
    } catch {
      // ignore
    }
    console.log(`[useTransactionLog] Cleared log for wallet ${walletAddress.slice(0, 8)}...`);
  }, [walletAddress]);

  return {
    events,
    appendEvents,
    clearLog,
    isLoaded,
  };
}
