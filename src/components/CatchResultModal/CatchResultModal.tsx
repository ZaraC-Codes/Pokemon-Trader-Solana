/**
 * CatchResultModal Component (Solana)
 *
 * Modal for displaying catch attempt results (failure only — success uses CatchWinModal).
 * Shows shake animation, attempts remaining, and retry options.
 *
 * Solana version: Uses Solana Explorer links instead of Apescan.
 */

import { useEffect, useState } from 'react';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface CatchSuccessResult {
  type: 'success';
  pokemonId: bigint;
  tokenId: bigint;
  imageUrl?: string;
  txHash?: string;
}

interface CatchFailureResult {
  type: 'failure';
  pokemonId: bigint;
  attemptsRemaining: number;
  relocated?: boolean;
  txHash?: string;
}

export type CatchResultState = CatchSuccessResult | CatchFailureResult;

export interface CatchResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTryAgain?: () => void;
  result: CatchResultState | null;
}

// ============================================================
// CONSTANTS
// ============================================================

const MAX_ATTEMPTS = 3;
const SOLANA_EXPLORER_TX_URL = 'https://explorer.solana.com/tx/';

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
    maxWidth: '420px', width: '90%', maxHeight: '90vh', overflowY: 'auto' as const,
    fontFamily: "'Courier New', monospace", color: '#fff',
    imageRendering: 'pixelated' as const, position: 'relative' as const,
  },
  successModal: { borderColor: '#00ff00' },
  failureModal: { borderColor: '#ff4444' },
  header: {
    textAlign: 'center' as const, marginBottom: '20px',
    paddingBottom: '16px', borderBottom: '2px solid #444',
  },
  successHeader: { borderBottomColor: '#00ff00' },
  failureHeader: { borderBottomColor: '#ff4444' },
  icon: { fontSize: '48px', marginBottom: '12px' },
  title: { fontSize: '24px', fontWeight: 'bold', margin: 0 },
  successTitle: { color: '#00ff00' },
  failureTitle: { color: '#ff4444' },
  body: { textAlign: 'center' as const, marginBottom: '20px' },
  pokemonId: { fontSize: '18px', color: '#00ccff', marginBottom: '12px' },
  nftInfo: {
    backgroundColor: '#2a2a2a', border: '2px solid #444', padding: '12px', marginBottom: '16px',
  },
  nftLabel: { fontSize: '12px', color: '#888', marginBottom: '4px' },
  nftValue: { fontSize: '16px', color: '#ffcc00', fontWeight: 'bold' },
  failureMessage: { fontSize: '16px', color: '#ff8888', marginBottom: '16px' },
  attemptsSection: { marginBottom: '16px' },
  attemptsLabel: { fontSize: '14px', color: '#888', marginBottom: '8px' },
  attemptsValue: { fontSize: '20px', fontWeight: 'bold' },
  attemptsHigh: { color: '#00ff00' },
  attemptsMedium: { color: '#ffcc00' },
  attemptsLow: { color: '#ff4444' },
  progressBarContainer: { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' },
  progressSegment: { width: '40px', height: '12px', border: '2px solid #444', backgroundColor: '#2a2a2a' },
  progressSegmentUsed: { backgroundColor: '#ff4444', borderColor: '#ff6666' },
  progressSegmentRemaining: { backgroundColor: '#00ff00', borderColor: '#00ff66' },
  txInfo: { fontSize: '12px', color: '#666', marginTop: '12px' },
  txLink: { color: '#4488ff', textDecoration: 'none' },
  footer: {
    display: 'flex', gap: '12px', justifyContent: 'center',
    paddingTop: '16px', borderTop: '2px solid #444',
  },
  button: {
    padding: '12px 24px', border: '2px solid #444', backgroundColor: '#2a2a2a',
    color: '#fff', cursor: 'pointer', fontFamily: "'Courier New', monospace",
    fontSize: '14px', fontWeight: 'bold', minWidth: '100px',
  },
  primaryButton: { border: '2px solid #00ff00', backgroundColor: '#1a3a1a', color: '#00ff00' },
  tryAgainButton: { border: '2px solid #ffcc00', backgroundColor: '#3a3a1a', color: '#ffcc00' },
  buttonDisabled: { border: '2px solid #444', backgroundColor: '#1a1a1a', color: '#666', cursor: 'not-allowed' },
  closeButton: { border: '2px solid #888', backgroundColor: '#2a2a2a', color: '#888' },
  confettiContainer: {
    position: 'fixed' as const, top: 0, left: 0, width: '100%', height: '100%',
    pointerEvents: 'none' as const, zIndex: 1101,
  },
};

// ============================================================
// CSS ANIMATIONS
// ============================================================

const animationStyles = `
  @keyframes fadeIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
    20%, 40%, 60%, 80% { transform: translateX(8px); }
  }
  @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
  @keyframes confettiFall {
    0% { transform: translateY(-100%) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }
  .catch-result-fade-in { animation: fadeIn 0.3s ease-out forwards; }
  .catch-result-shake { animation: shake 0.5s ease-in-out; }
  .catch-result-bounce { animation: bounce 0.6s ease-in-out infinite; }
  .confetti-piece { position: absolute; width: 10px; height: 10px; animation: confettiFall 3s linear forwards; }
`;

// ============================================================
// SUB-COMPONENTS
// ============================================================

function AttemptsProgressBar({ attemptsRemaining }: { attemptsRemaining: number }) {
  const attemptsUsed = MAX_ATTEMPTS - attemptsRemaining;
  return (
    <div style={styles.progressBarContainer}>
      {Array.from({ length: MAX_ATTEMPTS }).map((_, index) => {
        const isUsed = index < attemptsUsed;
        return (
          <div
            key={index}
            style={{
              ...styles.progressSegment,
              ...(isUsed ? styles.progressSegmentUsed : styles.progressSegmentRemaining),
            }}
            title={isUsed ? 'Used' : 'Remaining'}
          />
        );
      })}
    </div>
  );
}

function SimpleConfetti() {
  const [pieces, setPieces] = useState<Array<{ id: number; left: number; color: string; delay: number }>>([]);

  useEffect(() => {
    const colors = ['#ff4444', '#00ff00', '#ffcc00', '#4488ff', '#aa44ff', '#ff88ff'];
    const newPieces = Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 2,
    }));
    setPieces(newPieces);
  }, []);

  return (
    <div style={styles.confettiContainer}>
      {pieces.map((piece) => (
        <div
          key={piece.id} className="confetti-piece"
          style={{ left: `${piece.left}%`, backgroundColor: piece.color, animationDelay: `${piece.delay}s` }}
        />
      ))}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CatchResultModal({ isOpen, onClose, onTryAgain, result }: CatchResultModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [animationClass, setAnimationClass] = useState('');

  useEffect(() => {
    const styleId = 'catch-result-modal-styles';
    if (!document.getElementById(styleId)) {
      const styleTag = document.createElement('style');
      styleTag.id = styleId;
      styleTag.textContent = animationStyles;
      document.head.appendChild(styleTag);
    }
  }, []);

  useEffect(() => {
    if (isOpen && result) {
      setAnimationClass('catch-result-fade-in');
      if (result.type === 'success') {
        setShowConfetti(true);
        const timer = setTimeout(() => setShowConfetti(false), 3000);
        return () => clearTimeout(timer);
      } else {
        setAnimationClass('catch-result-fade-in catch-result-shake');
      }
    } else {
      setAnimationClass('');
      setShowConfetti(false);
    }
  }, [isOpen, result]);

  const getAttemptsColor = (remaining: number) => {
    if (remaining >= 2) return styles.attemptsHigh;
    if (remaining === 1) return styles.attemptsMedium;
    return styles.attemptsLow;
  };

  const formatTxHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  if (!isOpen || !result) return null;

  const isSuccess = result.type === 'success';

  return (
    <>
      {showConfetti && <SimpleConfetti />}

      <div className="modal-overlay modal--compact" style={styles.overlay} onClick={onClose}>
        <div
          className={`modal-inner ${animationClass}`}
          style={{ ...styles.modal, ...(isSuccess ? styles.successModal : styles.failureModal) }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ ...styles.header, ...(isSuccess ? styles.successHeader : styles.failureHeader) }}>
            <div style={styles.icon} className={isSuccess ? 'catch-result-bounce' : ''}>
              {isSuccess ? '🎉' : '💨'}
            </div>
            <h2 style={{ ...styles.title, ...(isSuccess ? styles.successTitle : styles.failureTitle) }}>
              {isSuccess ? 'CAUGHT!' : 'ESCAPED!'}
            </h2>
          </div>

          {/* Body */}
          <div style={styles.body}>
            <div style={styles.pokemonId}>Pokemon #{result.pokemonId.toString()}</div>

            {isSuccess ? (
              <>
                <p style={{ color: '#00ff00', marginBottom: '16px' }}>
                  Congratulations! You caught the Pokemon!
                </p>
                <div style={styles.nftInfo}>
                  <div style={styles.nftLabel}>NFT Awarded</div>
                  <div style={styles.nftValue}>Check your wallet!</div>
                </div>
              </>
            ) : (
              <>
                <p style={styles.failureMessage}>
                  {result.relocated ? 'The Pokemon broke free and relocated!' : 'The Pokemon broke free!'}
                </p>
                {result.relocated ? (
                  <div style={styles.attemptsSection}>
                    <p style={{ color: '#ffcc00', fontSize: '14px', marginBottom: '8px' }}>
                      The Pokemon moved to a new position with fresh attempts.
                    </p>
                    <div style={styles.attemptsLabel}>Attempts Reset</div>
                    <div style={{ ...styles.attemptsValue, ...styles.attemptsHigh }}>
                      3
                    </div>
                    <AttemptsProgressBar attemptsRemaining={3} />
                  </div>
                ) : (
                  <div style={styles.attemptsSection}>
                    <div style={styles.attemptsLabel}>Attempts Remaining</div>
                    <div style={{ ...styles.attemptsValue, ...getAttemptsColor(result.attemptsRemaining) }}>
                      {result.attemptsRemaining}
                    </div>
                    <AttemptsProgressBar attemptsRemaining={result.attemptsRemaining} />
                  </div>
                )}
              </>
            )}

            {result.txHash && (
              <div style={styles.txInfo}>
                TX:{' '}
                <a
                  href={`${SOLANA_EXPLORER_TX_URL}${result.txHash}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.txLink}
                >
                  {formatTxHash(result.txHash)}
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            {isSuccess ? (
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={onClose}>
                Close
              </button>
            ) : (
              <>
                <button
                  style={{
                    ...styles.button, ...styles.tryAgainButton,
                    ...(result.attemptsRemaining <= 0 && !result.relocated ? styles.buttonDisabled : {}),
                  }}
                  onClick={onTryAgain}
                  disabled={(result.attemptsRemaining <= 0 && !result.relocated) || !onTryAgain}
                >
                  Try Again
                </button>
                <button style={{ ...styles.button, ...styles.closeButton }} onClick={onClose}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default CatchResultModal;
