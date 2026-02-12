/**
 * CatchAttemptModal Component (Solana)
 *
 * Modal component for selecting and throwing a PokeBall at a specific Pokemon.
 * Displays available balls, catch rates, and handles the on-chain throw flow.
 *
 * Solana version: Direct transactions via Anchor program (~$0.001 fee).
 * VRF result is awaited via useThrowBall's lastResult lifecycle.
 */

import React, { useCallback, useEffect } from 'react';
import {
  useThrowBall,
  usePlayerInventory,
  getBallTypeName,
  getCatchRatePercent,
  DEFAULT_BALL_PRICES,
  SOLBALLS_DECIMALS,
  type BallType,
  type ThrowStatus,
  type ThrowResult,
} from '../../hooks/solana';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface CatchAttemptModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerAddress?: string;
  pokemonId: bigint;
  slotIndex: number;
  attemptsRemaining: number;
  onVisualThrow?: (pokemonId: bigint, ballType: BallType) => void;
  onResult?: (result: ThrowResult) => void;
}

// ============================================================
// USER-FACING COPY
// ============================================================

const THROW_STATUS_MESSAGES: Record<ThrowStatus, string> = {
  idle: '',
  sending: 'Sending transaction…',
  confirming: 'Waiting for confirmation…',
  waiting_vrf: 'Waiting for catch result…',
  caught: 'Caught!',
  missed: 'Missed!',
  error: '',
};

function getFriendlyErrorMessage(rawError: string | null): string {
  if (!rawError) return '';
  const errorLower = rawError.toLowerCase();

  if (errorLower.includes('rejected') || errorLower.includes('denied') || errorLower.includes('cancelled')) {
    return 'Transaction cancelled. Tap Throw to try again.';
  }
  if (errorLower.includes('insufficientballs') || errorLower.includes("don't have any")) {
    return 'Not enough balls! Visit the shop to buy more.';
  }
  if (errorLower.includes('slotnotactive') || errorLower.includes('caught or despawned')) {
    return 'This Pokemon is no longer here. Try another one!';
  }
  if (errorLower.includes('maxattemptsreached') || errorLower.includes('no attempts remaining')) {
    return 'No attempts remaining for this Pokemon.';
  }
  if (errorLower.includes('insufficient sol') || errorLower.includes('0x1')) {
    return 'Need more SOL for transaction fee (~0.001 SOL).';
  }
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return 'Request timed out. Please try again.';
  }
  if (errorLower.includes('network') || errorLower.includes('fetch') || errorLower.includes('connection')) {
    return 'Network error. Check your connection and try again.';
  }
  if (errorLower.includes('wallet') || errorLower.includes('not connected')) {
    return 'Wallet not connected. Please connect your wallet.';
  }
  if (errorLower.includes('blockhash') || errorLower.includes('congestion')) {
    return 'Network busy. Please try again in a moment.';
  }
  if (errorLower.includes('vrf timeout')) {
    return 'Catch result timed out. It may still process on-chain — check back soon.';
  }
  return 'Something went wrong. Please try again.';
}

// ============================================================
// STYLES (preserved pixel art aesthetic)
// ============================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1a1a1a', border: '4px solid #fff', padding: '24px',
    maxWidth: '450px', width: '90%', maxHeight: '90vh', overflowY: 'auto' as const,
    fontFamily: "'Courier New', monospace", color: '#fff', imageRendering: 'pixelated' as const,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '16px', borderBottom: '2px solid #444', paddingBottom: '12px',
  },
  title: { fontSize: '20px', fontWeight: 'bold', color: '#ffcc00', margin: 0 },
  closeButton: {
    background: 'none', border: '2px solid #ff4444', color: '#ff4444',
    padding: '8px 12px', cursor: 'pointer', fontFamily: "'Courier New', monospace", fontSize: '14px',
  },
  pokemonInfo: {
    backgroundColor: '#2a2a2a', border: '2px solid #444', padding: '12px',
    marginBottom: '16px', textAlign: 'center' as const,
  },
  pokemonId: { fontSize: '18px', fontWeight: 'bold', color: '#00ccff', marginBottom: '8px' },
  attemptsSection: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' },
  attemptsLabel: { fontSize: '14px', color: '#888' },
  attemptsValue: { fontSize: '18px', fontWeight: 'bold' },
  attemptsHigh: { color: '#00ff00' },
  attemptsMedium: { color: '#ffcc00' },
  attemptsLow: { color: '#ff4444' },
  sectionTitle: {
    fontSize: '14px', color: '#888', marginBottom: '12px',
    textTransform: 'uppercase' as const, letterSpacing: '1px',
  },
  ballList: { display: 'flex', flexDirection: 'column' as const, gap: '10px', marginBottom: '16px' },
  ballRow: {
    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
    backgroundColor: '#2a2a2a', border: '2px solid #444',
  },
  ballRowDisabled: { opacity: 0.4, backgroundColor: '#1a1a1a' },
  ballColorDot: {
    width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #fff', flexShrink: 0,
  },
  ballInfo: { flex: 1, minWidth: 0 },
  ballName: { fontSize: '16px', fontWeight: 'bold', marginBottom: '2px' },
  ballStats: { fontSize: '12px', color: '#888' },
  ballOwned: { fontSize: '14px', textAlign: 'right' as const, minWidth: '70px' },
  throwButton: {
    padding: '10px 16px', border: '2px solid #00ff00', backgroundColor: '#1a3a1a',
    color: '#00ff00', cursor: 'pointer', fontFamily: "'Courier New', monospace",
    fontSize: '14px', fontWeight: 'bold', minWidth: '90px',
  },
  throwButtonDisabled: {
    border: '2px solid #444', backgroundColor: '#2a2a2a', color: '#666', cursor: 'not-allowed',
  },
  loadingOverlay: {
    padding: '16px', backgroundColor: '#2a2a2a', border: '2px solid #ffcc00',
    textAlign: 'center' as const, marginBottom: '16px',
  },
  loadingText: { color: '#ffcc00', fontSize: '14px', marginBottom: '4px' },
  loadingSubtext: { color: '#888', fontSize: '12px' },
  errorBox: {
    padding: '12px', backgroundColor: '#3a1a1a', border: '2px solid #ff4444',
    marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  errorText: { color: '#ff4444', fontSize: '12px', flex: 1, wordBreak: 'break-word' as const },
  dismissButton: {
    padding: '6px 12px', border: '2px solid #ff4444', backgroundColor: 'transparent',
    color: '#ff4444', cursor: 'pointer', fontFamily: "'Courier New', monospace",
    fontSize: '12px', marginLeft: '12px', flexShrink: 0,
  },
  warningBox: {
    padding: '12px', backgroundColor: '#3a3a1a', border: '2px solid #ffcc00',
    marginBottom: '16px', textAlign: 'center' as const,
  },
  warningText: { color: '#ffcc00', fontSize: '12px' },
  noBallsMessage: {
    padding: '20px', backgroundColor: '#2a2a2a', border: '2px solid #444',
    textAlign: 'center' as const, color: '#888', fontSize: '14px',
  },
  footer: {
    marginTop: '16px', paddingTop: '12px', borderTop: '2px solid #444',
    textAlign: 'center' as const, fontSize: '12px', color: '#666',
  },
};

const BALL_COLORS: Record<BallType, string> = {
  0: '#ff4444',
  1: '#4488ff',
  2: '#ffcc00',
  3: '#aa44ff',
};

const ALL_BALL_TYPES: BallType[] = [0, 1, 2, 3];

// ============================================================
// SUB-COMPONENTS
// ============================================================

function InlineSpinner() {
  return (
    <span style={{
      display: 'inline-block', width: '12px', height: '12px',
      border: '2px solid #666', borderTopColor: '#00ff00', borderRadius: '50%',
      animation: 'spin 0.8s linear infinite', marginRight: '6px', verticalAlign: 'middle',
    }} />
  );
}

if (typeof document !== 'undefined' && !document.getElementById('catch-modal-spinner-styles')) {
  const styleTag = document.createElement('style');
  styleTag.id = 'catch-modal-spinner-styles';
  styleTag.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(styleTag);
}

interface BallOptionProps {
  ballType: BallType;
  ownedCount: number;
  onThrow: () => void;
  isDisabled: boolean;
  isThrowInProgress: boolean;
  isThrowingThis: boolean;
}

function BallOption({ ballType, ownedCount, onThrow, isDisabled, isThrowInProgress, isThrowingThis }: BallOptionProps) {
  const name = getBallTypeName(ballType);
  const priceDisplay = DEFAULT_BALL_PRICES[ballType] / Math.pow(10, SOLBALLS_DECIMALS);
  const catchRate = getCatchRatePercent(ballType);
  const hasBalls = ownedCount > 0;
  const canThrow = hasBalls && !isDisabled && !isThrowInProgress;

  const getButtonLabel = () => {
    if (!hasBalls) return 'None';
    if (isThrowingThis) return (<><InlineSpinner />Throwing…</>);
    if (isThrowInProgress) return 'Wait…';
    return 'Throw';
  };

  return (
    <div style={{ ...styles.ballRow, ...(hasBalls ? {} : styles.ballRowDisabled) }}>
      <div style={{ ...styles.ballColorDot, backgroundColor: BALL_COLORS[ballType] }} />
      <div style={styles.ballInfo}>
        <div style={{ ...styles.ballName, color: BALL_COLORS[ballType] }}>{name}</div>
        <div style={styles.ballStats}>
          {priceDisplay} SolBalls | {catchRate}% catch
        </div>
      </div>
      <div style={styles.ballOwned}>
        <span style={{ color: hasBalls ? '#fff' : '#666' }}>Owned: {ownedCount}</span>
      </div>
      <button
        onClick={onThrow}
        disabled={!canThrow}
        style={{ ...styles.throwButton, ...(canThrow ? {} : styles.throwButtonDisabled) }}
      >
        {getButtonLabel()}
      </button>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CatchAttemptModal({
  isOpen,
  onClose,
  playerAddress,
  pokemonId,
  slotIndex,
  attemptsRemaining,
  onVisualThrow,
  onResult,
}: CatchAttemptModalProps) {
  const [throwingBallType, setThrowingBallType] = React.useState<BallType | null>(null);

  const {
    throwBall: throwBallFn,
    throwStatus,
    isLoading,
    error,
    reset,
    txSignature,
    lastResult,
  } = useThrowBall();

  const inventory = usePlayerInventory();

  const getBallCount = useCallback(
    (ballType: BallType): number => {
      switch (ballType) {
        case 0: return inventory.pokeBalls;
        case 1: return inventory.greatBalls;
        case 2: return inventory.ultraBalls;
        case 3: return inventory.masterBalls;
        default: return 0;
      }
    },
    [inventory]
  );

  const hasAnyBalls =
    inventory.pokeBalls > 0 || inventory.greatBalls > 0 ||
    inventory.ultraBalls > 0 || inventory.masterBalls > 0;

  const isThrowInProgress = throwStatus !== 'idle' && throwStatus !== 'error' && throwStatus !== 'caught' && throwStatus !== 'missed';
  const statusMessage = THROW_STATUS_MESSAGES[throwStatus] || '';

  // ---- When lastResult arrives, fire callbacks and close for ANY terminal result ----
  useEffect(() => {
    if (!lastResult) return;

    console.log('[CatchAttemptModal] lastResult received:', lastResult.status, lastResult);

    // Trigger visual throw animation for caught/missed (not error)
    if ((lastResult.status === 'caught' || lastResult.status === 'missed') && onVisualThrow && throwingBallType !== null) {
      onVisualThrow(pokemonId, throwingBallType);
    }

    // Bubble result to parent (for all statuses including error)
    if (onResult) {
      onResult(lastResult);
    }

    // Close this modal for ANY terminal status — caught, missed, or error.
    // The parent handles showing CatchWin/CatchResult/error modals.
    onClose();

    // Reset hook for next throw
    reset();
  }, [lastResult]); // Minimal deps — we only want this to fire when lastResult changes

  const handleThrow = useCallback(
    async (ballType: BallType) => {
      console.log('[CatchAttemptModal] handleThrow called:', { ballType, slotIndex, pokemonId: pokemonId.toString() });

      if (!throwBallFn) {
        console.warn('[CatchAttemptModal] throwBallFn is undefined — wallet not connected?');
        return;
      }

      if (getBallCount(ballType) <= 0) {
        console.warn('[CatchAttemptModal] no balls of this type:', { ballType, count: getBallCount(ballType) });
        return;
      }

      if (slotIndex == null) {
        console.warn('[CatchAttemptModal] slotIndex is null/undefined');
        return;
      }

      setThrowingBallType(ballType);

      try {
        console.log('[CatchAttemptModal] calling throwBallFn(', slotIndex, ',', ballType, ')');
        const success = await throwBallFn(slotIndex, ballType);
        console.log('[CatchAttemptModal] throwBallFn returned:', success);

        if (!success) {
          setThrowingBallType(null);
        }
        // On success, we stay open and wait for VRF result via lastResult
      } catch (err) {
        console.error('[CatchAttemptModal] throwBall error:', err);
        setThrowingBallType(null);
      }
    },
    [slotIndex, pokemonId, getBallCount, throwBallFn]
  );

  const handleDismissError = useCallback(() => {
    reset();
    setThrowingBallType(null);
  }, [reset]);

  useEffect(() => {
    if (!isOpen) {
      reset();
      setThrowingBallType(null);
    }
  }, [isOpen, reset]);

  const getAttemptsColor = () => {
    if (attemptsRemaining >= 3) return styles.attemptsHigh;
    if (attemptsRemaining === 2) return styles.attemptsMedium;
    return styles.attemptsLow;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={styles.overlay} onClick={onClose}>
      <div className="modal-inner modal-scroll" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>CATCH POKEMON</h2>
          <button style={styles.closeButton} onClick={onClose} disabled={isThrowInProgress}>
            CLOSE
          </button>
        </div>

        {/* Pokemon Info */}
        <div style={styles.pokemonInfo}>
          <div style={styles.pokemonId}>Pokemon #{pokemonId.toString()}</div>
          <div style={styles.attemptsSection}>
            <span style={styles.attemptsLabel}>Attempts remaining:</span>
            <span style={{ ...styles.attemptsValue, ...getAttemptsColor() }}>{attemptsRemaining}</span>
          </div>
        </div>

        {/* No wallet warning */}
        {!playerAddress && (
          <div style={styles.warningBox}>
            <span style={styles.warningText}>Connect your wallet to throw a ball.</span>
          </div>
        )}

        {/* Loading state */}
        {isThrowInProgress && statusMessage && (
          <div style={styles.loadingOverlay}>
            <div style={styles.loadingText}>{statusMessage}</div>
            <div style={styles.loadingSubtext}>
              {throwStatus === 'sending'
                ? 'Please approve the transaction in your wallet…'
                : throwStatus === 'waiting_vrf'
                ? 'VRF randomness is being resolved on-chain…'
                : 'This may take a few seconds…'}
            </div>
          </div>
        )}

        {/* Ball Selection */}
        {playerAddress && (
          <>
            <div style={styles.sectionTitle}>Select a Ball</div>
            {hasAnyBalls ? (
              <div style={styles.ballList}>
                {ALL_BALL_TYPES.map((ballType) => {
                  const count = getBallCount(ballType);
                  if (count === 0) return null;
                  return (
                    <BallOption
                      key={ballType}
                      ballType={ballType}
                      ownedCount={count}
                      onThrow={() => handleThrow(ballType)}
                      isDisabled={false}
                      isThrowInProgress={isThrowInProgress}
                      isThrowingThis={isThrowInProgress && throwingBallType === ballType}
                    />
                  );
                })}
              </div>
            ) : (
              <div style={styles.noBallsMessage}>
                You don't have any PokeBalls!<br />
                <span style={{ color: '#ffcc00' }}>Visit the shop to buy some.</span>
              </div>
            )}
          </>
        )}

        {/* Error Display */}
        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorText}>{getFriendlyErrorMessage(error.message)}</span>
            <button style={styles.dismissButton} onClick={handleDismissError}>Dismiss</button>
          </div>
        )}

        {/* No attempts warning — informational only, on-chain program is the source of truth */}
        {attemptsRemaining <= 0 && (
          <div style={styles.errorBox}>
            <span style={styles.errorText}>Attempts may have been reset — try throwing!</span>
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <div style={{ color: '#888', marginBottom: '6px' }}>
            Slot #{slotIndex} • Higher tier balls = better catch rates
          </div>
          <div style={{ color: '#00ff88', fontSize: '11px' }}>
            Transactions cost ~0.001 SOL. You pay when buying balls + throwing.
          </div>
          {txSignature && (
            <div style={{ marginTop: '6px', color: '#666', fontSize: '10px' }}>
              TX: {txSignature.slice(0, 10)}…{txSignature.slice(-6)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CatchAttemptModal;
