/**
 * PokemonCard Component
 *
 * Displays a Slab NFT as a Pokemon card using metadata from the contract.
 * Shows the card image, name, and optionally attributes.
 *
 * Usage:
 * ```tsx
 * import { PokemonCard } from './components/PokemonCard';
 *
 * <PokemonCard tokenId={BigInt(300)} />
 * <PokemonCard tokenId={BigInt(300)} showAttributes compact />
 * ```
 */

import { useState } from 'react';
import { useSlabNFTMetadata, SLAB_NFT_ADDRESS, type NFTMetadata } from '../../hooks/useNFTMetadata';
import { getNftUrl } from '../../services/pokeballGameConfig';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface PokemonCardProps {
  /** NFT token ID to display */
  tokenId: bigint;
  /** Show loading skeleton while fetching */
  showLoading?: boolean;
  /** Show error state if fetch fails */
  showError?: boolean;
  /** Show card attributes (rarity, etc.) */
  showAttributes?: boolean;
  /** Compact mode - smaller size */
  compact?: boolean;
  /** Show token ID */
  showTokenId?: boolean;
  /** Custom class name */
  className?: string;
  /** Click handler */
  onClick?: () => void;
  /** Show link to view on Apescan */
  showViewLink?: boolean;
}

// ============================================================
// STYLES
// ============================================================

const createStyles = (compact: boolean) => ({
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    border: '3px solid #ffcc00',
    borderRadius: '8px',
    padding: compact ? '8px' : '12px',
    width: compact ? '140px' : '200px',
    fontFamily: "'Courier New', monospace",
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  containerHover: {
    transform: 'translateY(-4px)',
    boxShadow: '0 8px 20px rgba(255, 204, 0, 0.3)',
  },
  imageContainer: {
    width: '100%',
    aspectRatio: '1',
    backgroundColor: '#0a0a0a',
    borderRadius: '4px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: compact ? '6px' : '10px',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
  },
  loadingSkeleton: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a',
    animation: 'pokemonCardShimmer 1.5s infinite',
  },
  errorPlaceholder: {
    color: '#ff6666',
    fontSize: compact ? '24px' : '36px',
  },
  name: {
    fontSize: compact ? '11px' : '14px',
    fontWeight: 'bold',
    color: '#ffcc00',
    textAlign: 'center' as const,
    marginBottom: '4px',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  tokenId: {
    fontSize: compact ? '9px' : '11px',
    color: '#888',
    marginBottom: '6px',
  },
  attributesContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    justifyContent: 'center',
    marginTop: '4px',
  },
  attribute: {
    fontSize: compact ? '8px' : '10px',
    backgroundColor: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: '2px',
    padding: '2px 4px',
    color: '#aaa',
  },
  attributeValue: {
    color: '#00ff00',
    marginLeft: '4px',
  },
  viewLink: {
    fontSize: compact ? '9px' : '10px',
    color: '#4488ff',
    textDecoration: 'none',
    marginTop: '6px',
  },
});

// CSS animation for shimmer effect
const shimmerAnimation = `
  @keyframes pokemonCardShimmer {
    0% { background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%); background-size: 200% 100%; background-position: 200% 0; }
    100% { background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%); background-size: 200% 100%; background-position: -200% 0; }
  }
`;

// ============================================================
// SUB-COMPONENTS
// ============================================================

function CardImage({
  metadata,
  isLoading,
  error,
  compact,
}: {
  metadata: NFTMetadata | null;
  isLoading: boolean;
  error: string | null;
  compact: boolean;
}) {
  const styles = createStyles(compact);
  const [imgError, setImgError] = useState(false);

  if (isLoading) {
    return <div style={styles.loadingSkeleton} />;
  }

  if (error || imgError || !metadata?.image) {
    return <span style={styles.errorPlaceholder}>?</span>;
  }

  return (
    <img
      src={metadata.image}
      alt={metadata.name}
      style={styles.image}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  );
}

function CardAttributes({ attributes, compact }: { attributes: NFTMetadata['attributes']; compact: boolean }) {
  const styles = createStyles(compact);

  if (!attributes || attributes.length === 0) {
    return null;
  }

  // Show only the first 3 attributes in compact mode
  const displayAttributes = compact ? attributes.slice(0, 3) : attributes;

  return (
    <div style={styles.attributesContainer}>
      {displayAttributes.map((attr, index) => (
        <span key={index} style={styles.attribute}>
          {attr.trait_type}:
          <span style={styles.attributeValue}>{attr.value}</span>
        </span>
      ))}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function PokemonCard({
  tokenId,
  showLoading = true,
  showError = true,
  showAttributes = false,
  compact = false,
  showTokenId = true,
  className,
  onClick,
  showViewLink = false,
}: PokemonCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { metadata, isLoading, error } = useSlabNFTMetadata(tokenId);
  const styles = createStyles(compact);

  // Inject animation styles
  if (typeof document !== 'undefined') {
    const styleId = 'pokemon-card-styles';
    if (!document.getElementById(styleId)) {
      const styleTag = document.createElement('style');
      styleTag.id = styleId;
      styleTag.textContent = shimmerAnimation;
      document.head.appendChild(styleTag);
    }
  }

  // Determine display name
  const displayName = metadata?.name || `Pokemon Card #${tokenId.toString()}`;

  return (
    <div
      className={className}
      style={{
        ...styles.container,
        ...(isHovered ? styles.containerHover : {}),
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image */}
      <div style={styles.imageContainer}>
        <CardImage
          metadata={metadata}
          isLoading={showLoading && isLoading}
          error={showError ? error : null}
          compact={compact}
        />
      </div>

      {/* Name */}
      <div style={styles.name} title={displayName}>
        {isLoading ? 'Loading...' : displayName}
      </div>

      {/* Token ID */}
      {showTokenId && (
        <div style={styles.tokenId}>#{tokenId.toString()}</div>
      )}

      {/* Attributes */}
      {showAttributes && metadata?.attributes && (
        <CardAttributes attributes={metadata.attributes} compact={compact} />
      )}

      {/* View Link */}
      {showViewLink && (
        <a
          href={getNftUrl(SLAB_NFT_ADDRESS, tokenId)}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.viewLink}
          onClick={(e) => e.stopPropagation()}
        >
          View on Apescan
        </a>
      )}
    </div>
  );
}

export default PokemonCard;
