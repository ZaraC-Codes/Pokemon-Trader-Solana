/**
 * GameHUD Component
 *
 * Heads-up display overlay for the game, showing:
 * - Player's ball inventory (counts for each type)
 * - Quick shop button
 *
 * Features:
 * - Real-time updates via polling hooks (10s for inventory)
 * - Mobile-responsive layout (stacks vertically on small screens)
 * - Positioned to the left of wallet connect button
 *
 * Usage:
 * ```tsx
 * import { GameHUD } from './components/PokeBallShop';
 *
 * function AppContent() {
 *   const { account } = useActiveWeb3React();
 *
 *   return (
 *     <div>
 *       <GameCanvas />
 *       <GameHUD playerAddress={account} />
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useRef } from 'react';
import {
  usePlayerInventory,
  getBallTypeName,
  useBallPurchasedEvents,
  useCaughtPokemonEvents,
  useFailedCatchEvents,
  useTransactionLog,
  type BallType,
  type PersistedGameEvent,
} from '../../hooks/solana';
import { PokeBallShop } from './PokeBallShop';
import { TransactionHistory } from '../TransactionHistory';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface GameHUDProps {
  playerAddress?: string;
  /** Callback to open the Help modal */
  onShowHelp?: () => void;
}

// ============================================================
// CONSTANTS
// ============================================================

// Ball type colors
const BALL_COLORS: Record<BallType, string> = {
  0: '#ff4444', // Poke Ball - Red
  1: '#4488ff', // Great Ball - Blue
  2: '#ffcc00', // Ultra Ball - Yellow
  3: '#aa44ff', // Master Ball - Purple
};

// ============================================================
// RESPONSIVE STYLES (injected as style tag)
// ============================================================

const responsiveStyles = `
  /* ============================================================
   * TOP BAR LAYOUT - Wallet + HUD coordination
   * ============================================================ */

  /* Wallet connector - always top-right */
  .wallet-connector {
    position: fixed;
    top: 20px;
    right: 12px;
    z-index: 1000;
  }

  /* Game HUD - positioned to the left of wallet */
  .game-hud-container {
    position: fixed;
    top: 20px;
    right: 280px; /* Leave space for RainbowKit wallet button (~260px) + margin */
    z-index: 100;
    font-family: 'Courier New', monospace;
    image-rendering: pixelated;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
  }

  /* ============================================================
   * DESKTOP STYLES (default)
   * ============================================================ */
  @media (min-width: 769px) {
    .game-hud-container {
      flex-direction: row;
    }
  }

  /* ============================================================
   * TABLET / SMALLER DESKTOP - HUD moves down below wallet
   * ============================================================ */
  @media (max-width: 900px) {
    .game-hud-container {
      top: 78px; /* Move below wallet row */
      right: 12px; /* Align with wallet */
      flex-direction: row;
    }
  }

  /* ============================================================
   * MOBILE STYLES - Stack vertically
   * ============================================================ */
  @media (max-width: 768px) {
    .wallet-connector {
      top: 16px;
      right: 8px;
    }

    .game-hud-container {
      top: 68px; /* Below wallet */
      right: 8px;
      flex-direction: column !important;
      align-items: flex-end !important;
      gap: 6px !important;
    }

    .game-hud-container > div,
    .game-hud-container > button {
      min-width: 140px !important;
    }

    .game-hud-ball-grid {
      grid-template-columns: repeat(4, 1fr) !important;
    }
  }

  /* ============================================================
   * VERY SMALL MOBILE - Compact layout
   * ============================================================ */
  @media (max-width: 480px) {
    .wallet-connector {
      top: 12px;
      right: 6px;
    }

    .game-hud-container {
      top: 60px;
      right: 6px;
      gap: 4px !important;
    }

    .game-hud-container > div,
    .game-hud-container > button {
      min-width: 120px !important;
      padding: 6px !important;
    }
  }

  /* ============================================================
   * HELP BUTTON - Shrink on mobile to be secondary to SHOP
   * ============================================================ */
  @media (max-width: 768px) {
    .help-button {
      transform: scale(0.85);
      padding: 6px 8px !important;
      font-size: 11px !important;
      min-width: 36px !important;
      min-height: 36px !important;
    }
  }

  @media (max-width: 480px) {
    .help-button {
      transform: scale(0.75);
      padding: 4px 6px !important;
      font-size: 10px !important;
      min-width: 32px !important;
      min-height: 32px !important;
    }
  }

  /* ============================================================
   * ANIMATIONS
   * ============================================================ */
  @keyframes hudPulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }

  .game-hud-loading-dot {
    animation: hudPulse 1s infinite;
  }
`;

// ============================================================
// INLINE STYLES
// ============================================================

const styles = {
  // Container styles are now handled by CSS class .game-hud-container
  // Only fallback/base styles here that CSS may override
  container: {
    // Position and layout handled by CSS for responsive coordination with wallet
  },
  section: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    border: '2px solid #fff',
    padding: '10px',
  },
  sectionTitle: {
    fontSize: '10px',
    color: '#888',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  // Ball inventory styles
  ballGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
  },
  ballItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  ballDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    border: '1px solid #fff',
    flexShrink: 0,
  },
  ballCount: {
    fontSize: '12px',
    fontWeight: 'bold',
  },
  // Shop button styles
  shopButton: {
    padding: '10px 14px',
    backgroundColor: '#1a3a1a',
    border: '2px solid #00ff00',
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.1s',
    whiteSpace: 'nowrap' as const,
  },
  shopButtonHover: {
    backgroundColor: '#2a4a2a',
    borderColor: '#00ff66',
  },
  // Help button styles
  helpButton: {
    padding: '10px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    border: '2px solid #ffcc00',
    color: '#ffcc00',
    fontFamily: "'Courier New', monospace",
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.1s',
    whiteSpace: 'nowrap' as const,
    lineHeight: 1,
  },
  helpButtonHover: {
    backgroundColor: 'rgba(255, 204, 0, 0.15)',
    borderColor: '#ffdd44',
  },
  // Loading indicator
  loadingDot: {
    display: 'inline-block',
    width: '4px',
    height: '4px',
    backgroundColor: '#888',
    marginLeft: '4px',
  },
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Ball inventory section */
function BallInventorySection({
  inventory,
  onClick,
}: {
  inventory: ReturnType<typeof usePlayerInventory>;
  onClick?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const balls: { type: BallType; count: number }[] = [
    { type: 0, count: inventory.pokeBalls },
    { type: 1, count: inventory.greatBalls },
    { type: 2, count: inventory.ultraBalls },
    { type: 3, count: inventory.masterBalls },
  ];

  return (
    <div
      style={{
        ...styles.section,
        cursor: onClick ? 'pointer' : 'default',
        borderColor: isHovered && onClick ? '#00ffff' : '#fff',
        transition: 'border-color 0.1s',
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="Click to view transaction history"
    >
      <div style={{
        ...styles.sectionTitle,
        color: isHovered && onClick ? '#00ffff' : '#888',
      }}>
        Balls
      </div>
      <div style={styles.ballGrid} className="game-hud-ball-grid">
        {balls.map(({ type, count }) => (
          <div key={type} style={styles.ballItem} title={getBallTypeName(type)}>
            <div
              style={{
                ...styles.ballDot,
                backgroundColor: BALL_COLORS[type],
              }}
            />
            <span
              style={{
                ...styles.ballCount,
                color: count > 0 ? BALL_COLORS[type] : '#444',
              }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ============================================================
// MAIN COMPONENT
// ============================================================

const BALL_NAMES_MAP = ['Poke Ball', 'Great Ball', 'Ultra Ball', 'Master Ball'];

export function GameHUD({ playerAddress, onShowHelp }: GameHUDProps) {
  const [shopOpen, setShopOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shopButtonHover, setShopButtonHover] = useState(false);
  const [helpButtonHover, setHelpButtonHover] = useState(false);

  // Inject responsive styles on mount
  useEffect(() => {
    const styleId = 'game-hud-responsive-styles';
    if (!document.getElementById(styleId)) {
      const styleTag = document.createElement('style');
      styleTag.id = styleId;
      styleTag.textContent = responsiveStyles;
      document.head.appendChild(styleTag);
    }
  }, []);

  // Solana hook reads connected wallet internally — no address arg needed
  const inventory = usePlayerInventory();

  // ============================================================
  // PERSISTED TRANSACTION LOG
  // ============================================================

  const { events: persistedEvents, appendEvents, clearLog } = useTransactionLog(playerAddress);

  // Subscribe to WebSocket events and pipe into persisted log
  // Note: ThrowAttempted events are NOT persisted — they fire on the initial
  // throw_ball tx (1st wallet popup). The actual attempt is represented by
  // CaughtPokemon or FailedCatch from consume_randomness (2nd wallet popup).
  // This ensures each catch attempt = exactly 1 log entry + 1 Throws count.
  const { events: purchaseEvents } = useBallPurchasedEvents();
  const { events: caughtEvents } = useCaughtPokemonEvents();
  const { events: failedEvents } = useFailedCatchEvents();

  // Track how many events we've already processed to avoid re-processing
  const processedCountRef = useRef({
    purchases: 0,
    caught: 0,
    failed: 0,
  });

  // Pipe new purchase events into persisted log
  useEffect(() => {
    if (!playerAddress) return;
    const prev = processedCountRef.current.purchases;
    if (purchaseEvents.length <= prev) return;

    const newEvents: PersistedGameEvent[] = [];
    for (let i = prev; i < purchaseEvents.length; i++) {
      const ev = purchaseEvents[i];
      if (ev.args.buyer !== playerAddress) continue;
      newEvents.push({
        key: ev.eventKey,
        type: 'purchase',
        timestamp: ev.receivedAt,
        slot: ev.slot,
        ballType: ev.args.ballType,
        ballName: BALL_NAMES_MAP[ev.args.ballType] || 'Ball',
        quantity: ev.args.quantity,
        totalCost: ev.args.totalCost.toString(),
      });
    }
    processedCountRef.current.purchases = purchaseEvents.length;
    if (newEvents.length > 0) appendEvents(newEvents);
  }, [purchaseEvents, playerAddress, appendEvents]);

  // Pipe new caught events
  useEffect(() => {
    if (!playerAddress) return;
    const prev = processedCountRef.current.caught;
    if (caughtEvents.length <= prev) return;

    const newEvents: PersistedGameEvent[] = [];
    for (let i = prev; i < caughtEvents.length; i++) {
      const ev = caughtEvents[i];
      if (ev.args.catcher !== playerAddress) continue;
      newEvents.push({
        key: ev.eventKey,
        type: 'caught',
        timestamp: ev.receivedAt,
        slot: ev.slot,
        pokemonId: ev.args.pokemonId.toString(),
        slotIndex: ev.args.slotIndex,
        nftMint: ev.args.nftMint,
      });
    }
    processedCountRef.current.caught = caughtEvents.length;
    if (newEvents.length > 0) appendEvents(newEvents);
  }, [caughtEvents, playerAddress, appendEvents]);

  // Pipe new failed catch events
  useEffect(() => {
    if (!playerAddress) return;
    const prev = processedCountRef.current.failed;
    if (failedEvents.length <= prev) return;

    const newEvents: PersistedGameEvent[] = [];
    for (let i = prev; i < failedEvents.length; i++) {
      const ev = failedEvents[i];
      if (ev.args.thrower !== playerAddress) continue;
      newEvents.push({
        key: ev.eventKey,
        type: 'escaped',
        timestamp: ev.receivedAt,
        slot: ev.slot,
        pokemonId: ev.args.pokemonId.toString(),
        slotIndex: ev.args.slotIndex,
        attemptsRemaining: ev.args.attemptsRemaining,
      });
    }
    processedCountRef.current.failed = failedEvents.length;
    if (newEvents.length > 0) appendEvents(newEvents);
  }, [failedEvents, playerAddress, appendEvents]);

  // No wallet connected - don't show HUD, let the styled RainbowKit button handle connection
  if (!playerAddress) {
    return null;
  }

  return (
    <>
      <div className="game-hud-container">
        {/* Ball Inventory - Click to open Transaction History */}
        <BallInventorySection
          inventory={inventory}
          onClick={() => setHistoryOpen(true)}
        />

        {/* Shop Button */}
        <button
          style={{
            ...styles.shopButton,
            ...(shopButtonHover ? styles.shopButtonHover : {}),
          }}
          onClick={() => setShopOpen(true)}
          onMouseEnter={() => setShopButtonHover(true)}
          onMouseLeave={() => setShopButtonHover(false)}
        >
          SHOP
        </button>

        {/* Help Button */}
        {onShowHelp && (
          <button
            className="help-button"
            style={{
              ...styles.helpButton,
              ...(helpButtonHover ? styles.helpButtonHover : {}),
            }}
            onClick={onShowHelp}
            onMouseEnter={() => setHelpButtonHover(true)}
            onMouseLeave={() => setHelpButtonHover(false)}
            title="How to Play"
          >
            ?
          </button>
        )}
      </div>

      {/* Shop Modal */}
      <PokeBallShop
        isOpen={shopOpen}
        onClose={() => setShopOpen(false)}
        playerAddress={playerAddress}
      />

      {/* Transaction History Modal */}
      <TransactionHistory
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        playerAddress={playerAddress}
        events={persistedEvents}
        onClearLog={clearLog}
      />
    </>
  );
}

export default GameHUD;
