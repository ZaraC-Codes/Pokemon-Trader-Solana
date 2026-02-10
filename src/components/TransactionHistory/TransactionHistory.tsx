/**
 * TransactionHistory Component (Solana)
 *
 * Displays recent game events from Anchor program event subscriptions.
 * Replaces the EVM version which used wagmi usePublicClient for log parsing.
 *
 * Currently shows events from the current session only (WebSocket subscription).
 * Historical log parsing from Solana can be added later.
 */

import { useMemo } from 'react';
import {
  useCaughtPokemonEvents,
  useFailedCatchEvents,
  useBallPurchasedEvents,
} from '../../hooks/solana';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface TransactionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  playerAddress?: string;
}

// ============================================================
// STYLES
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
    backgroundColor: '#1a1a1a', border: '4px solid #fff', padding: '24px',
    maxWidth: '500px', width: '90%', maxHeight: '80vh', overflowY: 'auto' as const,
    fontFamily: "'Courier New', monospace", color: '#fff', imageRendering: 'pixelated' as const,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '16px', borderBottom: '2px solid #444', paddingBottom: '12px',
  },
  title: { fontSize: '18px', fontWeight: 'bold', color: '#ffcc00', margin: 0 },
  closeButton: {
    background: 'none', border: '2px solid #ff4444', color: '#ff4444',
    padding: '6px 12px', cursor: 'pointer', fontFamily: "'Courier New', monospace", fontSize: '12px',
  },
  eventRow: {
    padding: '10px 12px', borderBottom: '1px solid #333',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  eventType: { fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' as const },
  eventDetail: { fontSize: '11px', color: '#888', marginTop: '2px' },
  emptyMessage: { textAlign: 'center' as const, color: '#666', padding: '30px 0', fontSize: '14px' },
};

const EVENT_COLORS: Record<string, string> = {
  catch: '#00ff00',
  miss: '#ff4444',
  purchase: '#ffcc00',
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export function TransactionHistory({ isOpen, onClose, playerAddress }: TransactionHistoryProps) {
  const { events: caughtEvents } = useCaughtPokemonEvents();
  const { events: failedEvents } = useFailedCatchEvents();
  const { events: purchaseEvents } = useBallPurchasedEvents();

  const allEvents = useMemo(() => {
    const events: Array<{
      type: string;
      color: string;
      label: string;
      detail: string;
      timestamp: number;
      key: string;
    }> = [];

    for (const ev of caughtEvents) {
      const isCurrentUser = playerAddress && ev.args.catcher === playerAddress;
      if (!isCurrentUser) continue;
      events.push({
        type: 'catch',
        color: EVENT_COLORS.catch,
        label: 'CAUGHT!',
        detail: `Pokemon #${ev.args.pokemonId} in slot ${ev.args.slotIndex}`,
        timestamp: ev.receivedAt,
        key: ev.eventKey,
      });
    }

    for (const ev of failedEvents) {
      const isCurrentUser = playerAddress && ev.args.thrower === playerAddress;
      if (!isCurrentUser) continue;
      events.push({
        type: 'miss',
        color: EVENT_COLORS.miss,
        label: 'MISSED',
        detail: `Pokemon #${ev.args.pokemonId} — ${ev.args.attemptsRemaining} attempts left`,
        timestamp: ev.receivedAt,
        key: ev.eventKey,
      });
    }

    for (const ev of purchaseEvents) {
      const isCurrentUser = playerAddress && ev.args.buyer === playerAddress;
      if (!isCurrentUser) continue;
      const ballNames = ['Poke Ball', 'Great Ball', 'Ultra Ball', 'Master Ball'];
      const ballName = ballNames[ev.args.ballType] || 'Ball';
      events.push({
        type: 'purchase',
        color: EVENT_COLORS.purchase,
        label: 'PURCHASED',
        detail: `${ev.args.quantity}x ${ballName}`,
        timestamp: ev.receivedAt,
        key: ev.eventKey,
      });
    }

    // Sort newest first
    events.sort((a, b) => b.timestamp - a.timestamp);
    return events;
  }, [caughtEvents, failedEvents, purchaseEvents, playerAddress]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>TRANSACTION LOG</h2>
          <button style={styles.closeButton} onClick={onClose}>CLOSE</button>
        </div>

        {allEvents.length === 0 ? (
          <div style={styles.emptyMessage}>
            No transactions this session.
            <br />
            <span style={{ fontSize: '12px', color: '#555' }}>
              Events are tracked from when you connected.
            </span>
          </div>
        ) : (
          allEvents.map((ev) => (
            <div key={ev.key} style={styles.eventRow}>
              <div>
                <div style={{ ...styles.eventType, color: ev.color }}>{ev.label}</div>
                <div style={styles.eventDetail}>{ev.detail}</div>
              </div>
              <div style={{ fontSize: '10px', color: '#555' }}>
                {new Date(ev.receivedAt).toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TransactionHistory;
