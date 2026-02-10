/**
 * CatchWinModal Component
 *
 * Celebratory modal displayed when a player successfully catches a Pokemon.
 * Shows NFT details including image, name, and token ID with confetti animation.
 *
 * Features:
 * - Automatic NFT metadata fetching via tokenURI
 * - Loading skeleton while fetching
 * - Fallback display if metadata fails to load
 * - Confetti celebration animation
 * - Links to view NFT on Apescan and Magic Eden
 * - Transaction hash link
 *
 * Usage:
 * ```tsx
 * import { CatchWinModal } from './components/CatchWinModal';
 *
 * <CatchWinModal
 *   isOpen={showWinModal}
 *   onClose={() => setShowWinModal(false)}
 *   tokenId={BigInt(123)}
 *   txHash="0x..."
 * />
 * ```
 */

import { useEffect, useState } from 'react';
import { useSlabNFTMetadata, SLAB_NFT_ADDRESS } from '../../hooks/useNFTMetadata';
import { getTransactionUrl, getNftUrl } from '../../services/pokeballGameConfig';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface CatchWinModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** NFT token ID awarded to the player */
  tokenId: bigint;
  /** Optional transaction hash for the catch */
  txHash?: `0x${string}`;
  /** Optional Pokemon ID that was caught */
  pokemonId?: bigint;
}

// ============================================================
// CONSTANTS
// ============================================================

/** Magic Eden collection URL for Slab NFTs */
const MAGIC_EDEN_URL = `https://magiceden.io/item-details/apechain/${SLAB_NFT_ADDRESS}`;

// ============================================================
// STYLES
// ============================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200, // Higher than other modals
  },
  modal: {
    backgroundColor: '#0a1a0a',
    border: '4px solid #00ff00',
    boxShadow: '0 0 40px rgba(0, 255, 0, 0.4), inset 0 0 20px rgba(0, 255, 0, 0.1)',
    padding: '0',
    maxWidth: '440px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    fontFamily: "'Courier New', monospace",
    color: '#fff',
    imageRendering: 'pixelated' as const,
    position: 'relative' as const,
  },
  header: {
    textAlign: 'center' as const,
    padding: '24px 24px 16px',
    background: 'linear-gradient(180deg, rgba(0, 255, 0, 0.15) 0%, transparent 100%)',
    borderBottom: '2px solid #00ff00',
  },
  celebrationIcon: {
    fontSize: '56px',
    marginBottom: '12px',
    display: 'block',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#00ff00',
    margin: 0,
    textShadow: '0 0 10px rgba(0, 255, 0, 0.5)',
    letterSpacing: '2px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#88ff88',
    marginTop: '8px',
  },
  body: {
    padding: '24px',
  },
  nftImageContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  nftImage: {
    maxWidth: '200px',
    maxHeight: '200px',
    border: '4px solid #00ff00',
    boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)',
    imageRendering: 'auto' as const, // Better for actual images
    backgroundColor: '#1a1a1a',
  },
  imagePlaceholder: {
    width: '200px',
    height: '200px',
    border: '4px solid #00ff00',
    boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)',
    backgroundColor: '#1a2a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#00ff00',
    fontSize: '48px',
  },
  loadingSkeleton: {
    width: '200px',
    height: '200px',
    border: '4px solid #004400',
    backgroundColor: '#0a1a0a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#00ff00',
    fontSize: '14px',
  },
  nftInfoSection: {
    backgroundColor: '#0a200a',
    border: '2px solid #004400',
    padding: '16px',
    marginBottom: '16px',
  },
  nftName: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#ffcc00',
    textAlign: 'center' as const,
    marginBottom: '12px',
    wordBreak: 'break-word' as const,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #003300',
  },
  infoLabel: {
    fontSize: '12px',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  infoValue: {
    fontSize: '14px',
    color: '#00ff00',
    fontWeight: 'bold',
  },
  tokenIdValue: {
    fontSize: '16px',
    color: '#00ccff',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  attributesSection: {
    marginTop: '16px',
    borderTop: '2px solid #004400',
    paddingTop: '16px',
  },
  attributesTitle: {
    fontSize: '12px',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    marginBottom: '12px',
    textAlign: 'center' as const,
  },
  attributesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  attributeChip: {
    backgroundColor: '#0a1a0a',
    border: '1px solid #004400',
    padding: '8px',
    textAlign: 'center' as const,
  },
  attributeLabel: {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  attributeValue: {
    fontSize: '12px',
    color: '#ffcc00',
    fontWeight: 'bold',
    wordBreak: 'break-word' as const,
  },
  message: {
    textAlign: 'center' as const,
    fontSize: '14px',
    color: '#88ff88',
    marginBottom: '20px',
    lineHeight: '1.5',
  },
  txInfo: {
    fontSize: '12px',
    color: '#666',
    textAlign: 'center' as const,
    marginBottom: '16px',
  },
  txLink: {
    color: '#4488ff',
    textDecoration: 'none',
  },
  footer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    padding: '0 24px 24px',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
  },
  button: {
    padding: '14px 20px',
    border: '2px solid #444',
    backgroundColor: '#2a2a2a',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '13px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.15s',
    flex: 1,
    minWidth: 0,
  },
  viewNftButton: {
    border: '2px solid #00ccff',
    backgroundColor: '#0a1a2a',
    color: '#00ccff',
  },
  marketplaceButton: {
    border: '2px solid #ff88ff',
    backgroundColor: '#2a0a2a',
    color: '#ff88ff',
  },
  closeButton: {
    border: '2px solid #00ff00',
    backgroundColor: '#0a2a0a',
    color: '#00ff00',
    width: '100%',
  },
  // Confetti container
  confettiContainer: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none' as const,
    zIndex: 1201,
    overflow: 'hidden',
  },
  // Loading state
  loadingText: {
    color: '#00ff00',
    fontSize: '14px',
    textAlign: 'center' as const,
  },
  errorText: {
    color: '#ff8888',
    fontSize: '12px',
    textAlign: 'center' as const,
    marginTop: '8px',
  },
};

// ============================================================
// CSS ANIMATIONS
// ============================================================

const animationStyles = `
  @keyframes catchWinFadeIn {
    from {
      opacity: 0;
      transform: scale(0.8) translateY(20px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes catchWinPulse {
    0%, 100% {
      box-shadow: 0 0 40px rgba(0, 255, 0, 0.4), inset 0 0 20px rgba(0, 255, 0, 0.1);
    }
    50% {
      box-shadow: 0 0 60px rgba(0, 255, 0, 0.6), inset 0 0 30px rgba(0, 255, 0, 0.15);
    }
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
    0% {
      transform: translateY(-100vh) rotate(0deg);
      opacity: 1;
    }
    100% {
      transform: translateY(100vh) rotate(720deg);
      opacity: 0;
    }
  }

  @keyframes catchWinShimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  @keyframes catchWinSpin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .catch-win-modal {
    animation: catchWinFadeIn 0.4s ease-out forwards, catchWinPulse 2s ease-in-out infinite;
  }

  .catch-win-icon {
    animation: catchWinBounce 1s ease-in-out infinite;
  }

  .catch-win-title {
    animation: catchWinGlow 2s ease-in-out infinite;
  }

  .catch-win-confetti-piece {
    position: absolute;
    width: 12px;
    height: 12px;
    animation: catchWinConfetti 4s linear forwards;
  }

  .catch-win-image-loading {
    background: linear-gradient(90deg, #0a1a0a 25%, #1a3a1a 50%, #0a1a0a 75%);
    background-size: 200% 100%;
    animation: catchWinShimmer 1.5s infinite;
  }

  .catch-win-spinner {
    animation: catchWinSpin 1s linear infinite;
  }

  .catch-win-button:hover {
    filter: brightness(1.2);
    transform: translateY(-2px);
  }
`;

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Confetti celebration effect */
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
            width: `${piece.size}px`,
            height: `${piece.size}px`,
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

/** Loading spinner */
function LoadingSpinner() {
  return (
    <div className="catch-win-spinner" style={{ fontSize: '24px' }}>
      ⟳
    </div>
  );
}

/** NFT Image with loading and error states */
function NFTImage({
  imageUrl,
  name,
  isLoading,
  error,
}: {
  imageUrl?: string;
  name: string;
  isLoading: boolean;
  error: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  if (isLoading) {
    return (
      <div style={styles.loadingSkeleton} className="catch-win-image-loading">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || imgError || !imageUrl) {
    return (
      <div style={styles.imagePlaceholder}>
        🎴
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={name}
      style={styles.nftImage}
      onError={() => setImgError(true)}
      loading="eager"
    />
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CatchWinModal({
  isOpen,
  onClose,
  tokenId,
  txHash,
  pokemonId,
}: CatchWinModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  // Fetch NFT metadata
  const { metadata, isLoading, error } = useSlabNFTMetadata(tokenId, isOpen);

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

  // Format token ID for display
  const formatTokenId = (id: bigint) => {
    const str = id.toString();
    if (str.length > 10) {
      return `${str.slice(0, 6)}...${str.slice(-4)}`;
    }
    return str;
  };

  // Format transaction hash
  const formatTxHash = (hash: string) => {
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  if (!isOpen) return null;

  const nftName = metadata?.name || `Slab NFT #${tokenId.toString()}`;
  const nftImage = metadata?.image;

  return (
    <>
      {/* Confetti */}
      {showConfetti && <CelebrationConfetti />}

      {/* Modal Overlay */}
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
            {/* NFT Image */}
            <div style={styles.nftImageContainer}>
              <NFTImage
                imageUrl={nftImage}
                name={nftName}
                isLoading={isLoading}
                error={!!error}
              />
            </div>

            {/* NFT Info */}
            <div style={styles.nftInfoSection}>
              {/* NFT Name */}
              <div style={styles.nftName}>
                {isLoading ? (
                  <span style={styles.loadingText}>Loading NFT details...</span>
                ) : (
                  nftName
                )}
              </div>

              {/* Token ID */}
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Token ID</span>
                <span style={styles.tokenIdValue}>#{formatTokenId(tokenId)}</span>
              </div>

              {/* Pokemon ID if provided */}
              {pokemonId !== undefined && (
                <div style={{ ...styles.infoRow, borderBottom: metadata?.attributes?.length ? '1px solid #003300' : 'none' }}>
                  <span style={styles.infoLabel}>Pokemon ID</span>
                  <span style={styles.infoValue}>#{pokemonId.toString()}</span>
                </div>
              )}

              {/* Card Attributes from metadata */}
              {metadata?.attributes && metadata.attributes.length > 0 && (
                <div style={styles.attributesSection}>
                  <div style={styles.attributesTitle}>Card Details</div>
                  <div style={styles.attributesGrid}>
                    {metadata.attributes.map((attr, index) => (
                      <div key={index} style={styles.attributeChip}>
                        <div style={styles.attributeLabel}>{attr.trait_type}</div>
                        <div style={styles.attributeValue}>{attr.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error message if metadata failed */}
              {error && (
                <p style={styles.errorText}>
                  Could not load full NFT details
                </p>
              )}
            </div>

            {/* Success message */}
            <p style={styles.message}>
              The NFT has been transferred to your wallet.
              <br />
              View it in your inventory or on the marketplace!
            </p>

            {/* Transaction hash */}
            {txHash && (
              <div style={styles.txInfo}>
                Transaction:{' '}
                <a
                  href={getTransactionUrl(txHash)}
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
            {/* View buttons row */}
            <div style={styles.buttonRow}>
              <a
                href={getNftUrl(SLAB_NFT_ADDRESS, tokenId)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...styles.button, ...styles.viewNftButton }}
                className="catch-win-button"
              >
                📋 Apescan
              </a>
              <a
                href={`${MAGIC_EDEN_URL}/${tokenId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...styles.button, ...styles.marketplaceButton }}
                className="catch-win-button"
              >
                🛒 Magic Eden
              </a>
            </div>

            {/* Close button */}
            <button
              style={{ ...styles.button, ...styles.closeButton }}
              className="catch-win-button"
              onClick={onClose}
            >
              ✓ AWESOME!
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default CatchWinModal;
