/**
 * TransactionHistory Component (Solana)
 *
 * Displays game events from a persisted transaction log.
 * Layout restored 1:1 from the original ApeChain version.
 *
 * Events are persisted in localStorage per wallet and survive
 * page refreshes and new frontend deployments.
 */

import { useState, useMemo, useCallback } from 'react';
import { SOLBALLS_DECIMALS } from '../../hooks/solana';
import type { PersistedGameEvent } from '../../hooks/solana';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface TransactionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  playerAddress?: string;
  /** Persisted events from useTransactionLog (already sorted newest-first) */
  events: readonly PersistedGameEvent[];
  /** Callback to clear the persisted log */
  onClearLog?: () => void;
}

// Note: 'throw' kept for backward compat with old persisted data (not created anymore)
type EventType = 'purchase' | 'throw' | 'caught' | 'escaped';

// ============================================================
// CONSTANTS
// ============================================================

const BALL_NAMES = ['Poke Ball', 'Great Ball', 'Ultra Ball', 'Master Ball'];
const BALL_COLORS: Record<number, string> = {
  0: '#ff4444',
  1: '#4488ff',
  2: '#ffcc00',
  3: '#aa44ff',
};

const BADGE_COLORS: Record<EventType, string> = {
  purchase: '#ffcc00',
  throw: '#ffcc00',
  caught: '#00ff00',
  escaped: '#ff4444',
};

const BADGE_BG: Record<EventType, string> = {
  purchase: '#3a3a1a',
  throw: '#3a3a1a',
  caught: '#1a3a1a',
  escaped: '#3a1a1a',
};

const PAGE_SIZE = 20;

// ============================================================
// HELPERS
// ============================================================

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;

  if (diff < 5_000) return 'Just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function _getSolanaExplorerUrl(txSig?: string): string | null {
  if (!txSig) return null;
  const cluster = import.meta.env.VITE_SOLANA_NETWORK || 'devnet';
  const clusterParam = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${txSig}${clusterParam}`;
}

// ============================================================
// STYLES (matching ApeChain layout)
// ============================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    border: '4px solid #00ff88',
    padding: '0',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
    fontFamily: "'Courier New', monospace",
    color: '#fff',
    imageRendering: 'pixelated' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '2px solid #333',
    flexShrink: 0,
  },
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#00ff88',
    margin: 0,
    letterSpacing: '1px',
  },
  headerButtons: {
    display: 'flex',
    gap: '8px',
  },
  refreshButton: {
    background: 'none',
    border: '2px solid #00ff88',
    color: '#00ff88',
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
  },
  clearButton: {
    background: 'none',
    border: '2px solid #ff8800',
    color: '#ff8800',
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
  },
  closeButton: {
    background: 'none',
    border: '2px solid #ff4444',
    color: '#ff4444',
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
  },
  statsBar: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '10px 16px',
    backgroundColor: '#111',
    borderBottom: '2px solid #333',
    flexShrink: 0,
  },
  statItem: {
    textAlign: 'center' as const,
    fontSize: '11px',
  },
  statLabel: {
    color: '#666',
    marginBottom: '2px',
  },
  statValue: {
    fontWeight: 'bold',
    color: '#fff',
    fontSize: '14px',
  },
  spendingBar: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '8px 16px',
    backgroundColor: '#0d0d0d',
    borderBottom: '2px solid #333',
    fontSize: '11px',
    flexShrink: 0,
  },
  spendingItem: {
    textAlign: 'center' as const,
  },
  spendingLabel: {
    color: '#555',
    marginBottom: '2px',
  },
  spendingValue: {
    color: '#00ff88',
    fontWeight: 'bold',
  },
  eventList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '0',
  },
  eventCard: {
    padding: '12px 16px',
    borderBottom: '1px solid #2a2a2a',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  badge: {
    padding: '3px 8px',
    fontSize: '10px',
    fontWeight: 'bold',
    letterSpacing: '0.5px',
    flexShrink: 0,
    minWidth: '70px',
    textAlign: 'center' as const,
  },
  eventBody: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '3px',
  },
  eventMeta: {
    fontSize: '11px',
    color: '#888',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  ballDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  eventTime: {
    fontSize: '10px',
    color: '#555',
    flexShrink: 0,
    textAlign: 'right' as const,
    minWidth: '60px',
  },
  emptyMessage: {
    textAlign: 'center' as const,
    color: '#666',
    padding: '40px 20px',
    fontSize: '14px',
  },
  footer: {
    padding: '10px 16px',
    borderTop: '2px solid #333',
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  loadMoreButton: {
    background: 'none',
    border: '2px solid #444',
    color: '#888',
    padding: '6px 16px',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
    width: '100%',
  },
  sessionNote: {
    fontSize: '10px',
    color: '#444',
    marginTop: '6px',
  },
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

function PurchaseCard({ event, now }: { event: PersistedGameEvent; now: number }) {
  const ballName = event.ballName || 'Ball';
  const qty = event.quantity || 0;
  const cost = event.totalCost !== undefined
    ? (Number(BigInt(event.totalCost)) / Math.pow(10, SOLBALLS_DECIMALS)).toFixed(1)
    : '?';

  return (
    <div style={styles.eventCard}>
      <div style={{ ...styles.badge, color: BADGE_COLORS.purchase, backgroundColor: BADGE_BG.purchase, border: `1px solid ${BADGE_COLORS.purchase}` }}>
        PURCHASED
      </div>
      <div style={styles.eventBody}>
        <div style={styles.eventTitle}>{qty}x {ballName}</div>
        <div style={styles.eventMeta}>
          {event.ballType !== undefined && (
            <span style={{ ...styles.ballDot, backgroundColor: BALL_COLORS[event.ballType] || '#888' }} />
          )}
          <span>{cost} SOLCATCH</span>
        </div>
      </div>
      <div style={styles.eventTime}>{formatTimestamp(event.timestamp)}</div>
    </div>
  );
}

function CaughtCard({ event, now }: { event: PersistedGameEvent; now: number }) {
  return (
    <div style={styles.eventCard}>
      <div style={{ ...styles.badge, color: BADGE_COLORS.caught, backgroundColor: BADGE_BG.caught, border: `1px solid ${BADGE_COLORS.caught}` }}>
        CAUGHT!
      </div>
      <div style={styles.eventBody}>
        <div style={styles.eventTitle}>Pokemon #{event.pokemonId}</div>
        <div style={styles.eventMeta}>
          <span style={{ color: '#00ff88' }}>NFT Won!</span>
        </div>
      </div>
      <div style={styles.eventTime}>{formatTimestamp(event.timestamp)}</div>
    </div>
  );
}

function EscapedCard({ event, now }: { event: PersistedGameEvent; now: number }) {
  return (
    <div style={styles.eventCard}>
      <div style={{ ...styles.badge, color: BADGE_COLORS.escaped, backgroundColor: BADGE_BG.escaped, border: `1px solid ${BADGE_COLORS.escaped}` }}>
        ESCAPED
      </div>
      <div style={styles.eventBody}>
        <div style={styles.eventTitle}>Pokemon #{event.pokemonId}</div>
        <div style={styles.eventMeta}>
          <span>Attempts Left: {event.attemptsRemaining ?? 0}</span>
        </div>
      </div>
      <div style={styles.eventTime}>{formatTimestamp(event.timestamp)}</div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function TransactionHistory({ isOpen, onClose, playerAddress, events: persistedEvents, onClearLog }: TransactionHistoryProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [now, setNow] = useState(Date.now());
  const [confirmClear, setConfirmClear] = useState(false);

  // Events are already sorted newest-first from useTransactionLog
  const allEvents = persistedEvents;

  // Compute stats
  // Throws = caught + escaped (each attempt results in exactly one outcome).
  // ThrowAttempted events are NOT persisted — only the consume_randomness
  // outcome (CaughtPokemon / FailedCatch) represents a real attempt.
  const stats = useMemo(() => {
    const purchases = allEvents.filter(e => e.type === 'purchase').length;
    const caught = allEvents.filter(e => e.type === 'caught').length;
    const escaped = allEvents.filter(e => e.type === 'escaped').length;
    const throws = caught + escaped;
    const catchRate = throws > 0 ? Math.round((caught / throws) * 100) : 0;

    // Total SOLCATCH spent
    let totalSolCatch = BigInt(0);
    for (const ev of allEvents) {
      if (ev.type === 'purchase' && ev.totalCost !== undefined) {
        try {
          totalSolCatch += BigInt(ev.totalCost);
        } catch {
          // ignore malformed totalCost
        }
      }
    }
    const totalSolCatchDisplay = (Number(totalSolCatch) / Math.pow(10, SOLBALLS_DECIMALS)).toFixed(2);

    return { purchases, throws, caught, escaped, catchRate, totalSolCatchDisplay };
  }, [allEvents]);

  const visibleEvents = allEvents.slice(0, visibleCount);
  const hasMore = visibleCount < allEvents.length;

  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => prev + PAGE_SIZE);
  }, []);

  const handleRefresh = useCallback(() => {
    setNow(Date.now());
  }, []);

  const handleClearClick = useCallback(() => {
    if (confirmClear) {
      onClearLog?.();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      // Auto-reset confirm state after 3 seconds
      setTimeout(() => setConfirmClear(false), 3000);
    }
  }, [confirmClear, onClearLog]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>TRANSACTION LOG</h2>
          <div style={styles.headerButtons}>
            <button style={styles.refreshButton} onClick={handleRefresh}>REFRESH</button>
            {onClearLog && allEvents.length > 0 && (
              <button style={styles.clearButton} onClick={handleClearClick}>
                {confirmClear ? 'CONFIRM?' : 'CLEAR'}
              </button>
            )}
            <button style={styles.closeButton} onClick={onClose}>CLOSE</button>
          </div>
        </div>

        {/* Stats Bar */}
        <div style={styles.statsBar}>
          <div style={styles.statItem}>
            <div style={styles.statLabel}>Purchases</div>
            <div style={styles.statValue}>{stats.purchases}</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statLabel}>Throws</div>
            <div style={styles.statValue}>{stats.throws}</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statLabel}>Caught</div>
            <div style={{ ...styles.statValue, color: '#00ff00' }}>{stats.caught}</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statLabel}>Escaped</div>
            <div style={{ ...styles.statValue, color: '#ff4444' }}>{stats.escaped}</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statLabel}>Catch Rate</div>
            <div style={{ ...styles.statValue, color: '#ffcc00' }}>{stats.catchRate}%</div>
          </div>
        </div>

        {/* Spending Bar */}
        <div style={styles.spendingBar}>
          <div style={styles.spendingItem}>
            <div style={styles.spendingLabel}>SOLCATCH Used</div>
            <div style={styles.spendingValue}>{stats.totalSolCatchDisplay}</div>
          </div>
          <div style={styles.spendingItem}>
            <div style={styles.spendingLabel}>Total Events</div>
            <div style={styles.spendingValue}>{allEvents.length}</div>
          </div>
        </div>

        {/* Event List */}
        <div style={styles.eventList}>
          {visibleEvents.length === 0 ? (
            <div style={styles.emptyMessage}>
              No transactions recorded yet.
              <br />
              <span style={{ fontSize: '12px', color: '#555' }}>
                Events are saved automatically as you play.
              </span>
            </div>
          ) : (
            visibleEvents.map((ev) => {
              switch (ev.type) {
                case 'purchase':
                  return <PurchaseCard key={ev.key} event={ev} now={now} />;
                case 'caught':
                  return <CaughtCard key={ev.key} event={ev} now={now} />;
                case 'escaped':
                  return <EscapedCard key={ev.key} event={ev} now={now} />;
                default:
                  // Skip legacy 'throw' entries and unknown types
                  return null;
              }
            })
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          {hasMore ? (
            <button style={styles.loadMoreButton} onClick={handleLoadMore}>
              LOAD MORE ({allEvents.length - visibleCount} remaining)
            </button>
          ) : allEvents.length > 0 ? (
            <div style={{ fontSize: '11px', color: '#555' }}>
              Showing all {allEvents.length} events
            </div>
          ) : null}
          <div style={styles.sessionNote}>
            Persisted log • Saved to browser storage per wallet
          </div>
        </div>
      </div>
    </div>
  );
}

export default TransactionHistory;
