/**
 * CatchWinModal Component (Solana)
 *
 * Celebratory modal displayed when a player successfully catches a Pokemon.
 * Shows confetti animation and NFT info.
 *
 * Solana version: Links to Solana Explorer instead of Apescan.
 * NFT metadata fetching simplified — Metaplex NFTs use on-chain metadata.
 */

import { useEffect, useState } from 'react';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface CatchWinModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId: bigint;
  txHash?: string;
  pokemonId?: bigint;
}

// ============================================================
// STYLES
// ============================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1200,
  },
  modal: {
    backgroundColor: '#0a1a0a',
    border: '4px solid #00ff00',
    boxShadow: '0 0 40px rgba(0, 255, 0, 0.4), inset 0 0 20px rgba(0, 255, 0, 0.1)',
    padding: '0', maxWidth: '440px', width: '90%', maxHeight: '90vh',
    overflowY: 'auto' as const,
    fontFamily: "'Courier New', monospace", color: '#fff',
    imageRendering: 'pixelated' as const, position: 'relative' as const,
  },
  header: {
    textAlign: 'center' as const, padding: '24px 24px 16px',
    background: 'linear-gradient(180deg, rgba(0, 255, 0, 0.15) 0%, transparent 100%)',
    borderBottom: '2px solid #00ff00',
  },
  celebrationIcon: { fontSize: '56px', marginBottom: '12px', display: 'block' },
  title: {
    fontSize: '28px', fontWeight: 'bold', color: '#00ff00', margin: 0,
    textShadow: '0 0 10px rgba(0, 255, 0, 0.5)', letterSpacing: '2px',
  },
  subtitle: { fontSize: '14px', color: '#88ff88', marginTop: '8px' },
  body: { padding: '24px' },
  nftImageContainer: { display: 'flex', justifyContent: 'center', marginBottom: '20px' },
  imagePlaceholder: {
    width: '200px', height: '200px', border: '4px solid #00ff00',
    boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)', backgroundColor: '#1a2a1a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#00ff00', fontSize: '48px',
  },
  nftInfoSection: {
    backgroundColor: '#0a200a', border: '2px solid #004400', padding: '16px', marginBottom: '16px',
  },
  infoRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 0', borderBottom: '1px solid #003300',
  },
  infoLabel: {
    fontSize: '12px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '1px',
  },
  infoValue: { fontSize: '14px', color: '#00ff00', fontWeight: 'bold' },
  message: {
    textAlign: 'center' as const, fontSize: '14px', color: '#88ff88',
    marginBottom: '20px', lineHeight: '1.5',
  },
  txInfo: { fontSize: '12px', color: '#666', textAlign: 'center' as const, marginBottom: '16px' },
  txLink: { color: '#4488ff', textDecoration: 'none' },
  footer: { display: 'flex', flexDirection: 'column' as const, gap: '10px', padding: '0 24px 24px' },
  button: {
    padding: '14px 20px', border: '2px solid #444', backgroundColor: '#2a2a2a',
    color: '#fff', cursor: 'pointer', fontFamily: "'Courier New', monospace",
    fontSize: '13px', fontWeight: 'bold', textAlign: 'center' as const,
    textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', gap: '6px', flex: 1, minWidth: 0,
  },
  closeButton: {
    border: '2px solid #00ff00', backgroundColor: '#0a2a0a', color: '#00ff00', width: '100%',
  },
  confettiContainer: {
    position: 'fixed' as const, top: 0, left: 0, width: '100%', height: '100%',
    pointerEvents: 'none' as const, zIndex: 1201, overflow: 'hidden',
  },
};

// ============================================================
// CSS ANIMATIONS
// ============================================================

const animationStyles = `
  @keyframes catchWinFadeIn {
    from { opacity: 0; transform: scale(0.8) translateY(20px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes catchWinPulse {
    0%, 100% { box-shadow: 0 0 40px rgba(0, 255, 0, 0.4), inset 0 0 20px rgba(0, 255, 0, 0.1); }
    50% { box-shadow: 0 0 60px rgba(0, 255, 0, 0.6), inset 0 0 30px rgba(0, 255, 0, 0.15); }
  }
  @keyframes catchWinBounce {
    0%, 100% { transform: translateY(0); }
    25% { transform: translateY(-8px); }
    50% { transform: translateY(0); }
    75% { transform: translateY(-4px); }
  }
  @keyframes catchWinGlow {
    0%, 100% { text-shadow: 0 0 10px rgba(0, 255, 0, 0.5); }
    50% { text-shadow: 0 0 20px rgba(0, 255, 0, 0.8), 0 0 30px rgba(0, 255, 0, 0.4); }
  }
  @keyframes catchWinConfetti {
    0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }
  .catch-win-modal { animation: catchWinFadeIn 0.4s ease-out forwards, catchWinPulse 2s ease-in-out infinite; }
  .catch-win-icon { animation: catchWinBounce 1s ease-in-out infinite; }
  .catch-win-title { animation: catchWinGlow 2s ease-in-out infinite; }
  .catch-win-confetti-piece {
    position: absolute; width: 12px; height: 12px;
    animation: catchWinConfetti 4s linear forwards;
  }
  .catch-win-button:hover { filter: brightness(1.2); transform: translateY(-2px); }
`;

// ============================================================
// SUB-COMPONENTS
// ============================================================

function CelebrationConfetti() {
  const [pieces, setPieces] = useState<
    Array<{ id: number; left: number; color: string; delay: number; size: number; shape: string }>
  >([]);

  useEffect(() => {
    const colors = ['#00ff00', '#ffcc00', '#ff4444', '#4488ff', '#aa44ff', '#ff88ff', '#00ffff'];
    const shapes = ['square', 'circle', 'triangle'];
    const newPieces = Array.from({ length: 80 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 2,
      size: 8 + Math.random() * 8,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    }));
    setPieces(newPieces);
  }, []);

  return (
    <div style={styles.confettiContainer}>
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="catch-win-confetti-piece"
          style={{
            left: `${piece.left}%`,
            width: `${piece.size}px`, height: `${piece.size}px`,
            backgroundColor: piece.color,
            borderRadius: piece.shape === 'circle' ? '50%' : piece.shape === 'triangle' ? '0' : '2px',
            animationDelay: `${piece.delay}s`,
            clipPath: piece.shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CatchWinModal({
  isOpen, onClose, tokenId, txHash, pokemonId,
}: CatchWinModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  // Inject animation styles on mount
  useEffect(() => {
    const styleId = 'catch-win-modal-styles';
    if (!document.getElementById(styleId)) {
      const styleTag = document.createElement('style');
      styleTag.id = styleId;
      styleTag.textContent = animationStyles;
      document.head.appendChild(styleTag);
    }
  }, []);

  // Show confetti when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(timer);
    } else {
      setShowConfetti(false);
    }
  }, [isOpen]);

  const formatTxHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  if (!isOpen) return null;

  return (
    <>
      {showConfetti && <CelebrationConfetti />}

      <div className="modal-overlay" style={styles.overlay} onClick={onClose}>
        <div
          className="modal-inner modal-scroll catch-win-modal"
          style={styles.modal}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={styles.header}>
            <span style={styles.celebrationIcon} className="catch-win-icon">
              🎉
            </span>
            <h2 style={styles.title} className="catch-win-title">
              CONGRATULATIONS!
            </h2>
            <p style={styles.subtitle}>
              You caught a Pokemon and received an NFT!
            </p>
          </div>

          {/* Body */}
          <div style={styles.body}>
            {/* NFT Image placeholder */}
            <div style={styles.nftImageContainer}>
              <div style={styles.imagePlaceholder}>🎴</div>
            </div>

            {/* NFT Info */}
            <div style={styles.nftInfoSection}>
              {pokemonId !== undefined && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Pokemon ID</span>
                  <span style={styles.infoValue}>#{pokemonId.toString()}</span>
                </div>
              )}
            </div>

            {/* Success message */}
            <p style={styles.message}>
              The NFT has been transferred to your wallet.
              <br />
              View it in your inventory!
            </p>

            {/* Transaction hash */}
            {txHash && (
              <div style={styles.txInfo}>
                Transaction:{' '}
                <a
                  href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.txLink}
                >
                  {formatTxHash(txHash)}
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <button
              style={{ ...styles.button, ...styles.closeButton }}
              className="catch-win-button"
              onClick={onClose}
            >
              AWESOME!
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default CatchWinModal;
