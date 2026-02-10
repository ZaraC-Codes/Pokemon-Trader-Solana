/**
 * AdminDevTools Component (Solana)
 *
 * Admin panel for on-chain game state inspection.
 * Only visible when dev mode is enabled (?dev=1 or localStorage).
 *
 * Solana version: Reads from Anchor program accounts (GameConfig, PokemonSlots, NftVault).
 */

import { useState, useCallback, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import {
  fetchGameConfig,
  fetchPokemonSlots,
  fetchNftVault,
  type GameConfig,
  type PokemonSlots,
  type NftVault,
} from '../../solana/programClient';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface AdminDevToolsProps {
  isOpen: boolean;
  onClose: () => void;
  connectedAddress?: string;
}

// ============================================================
// STYLES
// ============================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    zIndex: 1500, paddingTop: '40px',
  },
  panel: {
    backgroundColor: '#1a1a2a', border: '4px solid #ff44ff', padding: '16px',
    maxWidth: '700px', width: '95%', maxHeight: '85vh', overflowY: 'auto' as const,
    fontFamily: "'Courier New', monospace", color: '#fff',
    imageRendering: 'pixelated' as const, boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '16px', borderBottom: '2px solid #ff44ff', paddingBottom: '10px',
  },
  title: { fontSize: '18px', fontWeight: 'bold', color: '#ff44ff', margin: 0 },
  closeButton: {
    background: 'none', border: '2px solid #ff4444', color: '#ff4444',
    padding: '4px 8px', cursor: 'pointer', fontFamily: "'Courier New', monospace", fontSize: '11px',
  },
  section: {
    marginBottom: '16px', padding: '12px', backgroundColor: '#0a0a1a',
    border: '1px solid #444', fontSize: '12px',
  },
  sectionTitle: {
    fontSize: '13px', color: '#ff44ff', fontWeight: 'bold', marginBottom: '8px',
    textTransform: 'uppercase' as const, letterSpacing: '1px',
  },
  row: {
    display: 'flex', justifyContent: 'space-between', padding: '3px 0',
    borderBottom: '1px solid #222',
  },
  label: { color: '#888' },
  value: { color: '#00ff88', fontFamily: 'monospace' },
  refreshButton: {
    padding: '6px 12px', border: '2px solid #ff44ff', backgroundColor: 'transparent',
    color: '#ff44ff', cursor: 'pointer', fontFamily: "'Courier New', monospace",
    fontSize: '11px',
  },
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export function AdminDevTools({ isOpen, onClose, connectedAddress }: AdminDevToolsProps) {
  const { connection } = useConnection();
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [pokemonSlots, setPokemonSlots] = useState<PokemonSlots | null>(null);
  const [nftVault, setNftVault] = useState<NftVault | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refreshState = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [config, slots, vault] = await Promise.all([
        fetchGameConfig(connection),
        fetchPokemonSlots(connection),
        fetchNftVault(connection),
      ]);
      setGameConfig(config);
      setPokemonSlots(slots);
      setNftVault(vault);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[AdminDevTools] Refresh failed:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, [connection]);

  useEffect(() => {
    if (isOpen && !gameConfig) {
      refreshState();
    }
  }, [isOpen, gameConfig, refreshState]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>DEV TOOLS (Solana)</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={styles.refreshButton} onClick={refreshState} disabled={isRefreshing}>
              {isRefreshing ? 'Loading...' : 'Refresh'}
            </button>
            <button style={styles.closeButton} onClick={onClose}>X</button>
          </div>
        </div>

        {/* Connection Info */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Connection</div>
          <div style={styles.row}>
            <span style={styles.label}>Wallet:</span>
            <span style={styles.value}>{connectedAddress ? `${connectedAddress.slice(0, 8)}...${connectedAddress.slice(-6)}` : 'Not connected'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Cluster:</span>
            <span style={styles.value}>devnet</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Last Refresh:</span>
            <span style={styles.value}>{lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}</span>
          </div>
        </div>

        {/* Game Config */}
        {gameConfig && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Game Config</div>
            <div style={styles.row}>
              <span style={styles.label}>Authority:</span>
              <span style={styles.value}>{gameConfig.authority.toBase58().slice(0, 12)}...</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Pokemon ID Counter:</span>
              <span style={styles.value}>{gameConfig.pokemonIdCounter.toString()}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>VRF Counter:</span>
              <span style={styles.value}>{gameConfig.vrfCounter.toString()}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Max Active Pokemon:</span>
              <span style={styles.value}>{gameConfig.maxActivePokemon}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Total Revenue:</span>
              <span style={styles.value}>{gameConfig.totalRevenue.toString()}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Ball Prices:</span>
              <span style={styles.value}>
                [{gameConfig.ballPrices.map(p => p.toString()).join(', ')}]
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Catch Rates:</span>
              <span style={styles.value}>[{gameConfig.catchRates.join(', ')}]</span>
            </div>
          </div>
        )}

        {/* Pokemon Slots */}
        {pokemonSlots && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Pokemon Slots ({pokemonSlots.activeCount} active)</div>
            {pokemonSlots.slots.filter(s => s.isActive).map((slot, idx) => (
              <div key={idx} style={{ ...styles.row, flexDirection: 'column', padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={styles.label}>Slot {idx}:</span>
                  <span style={styles.value}>
                    ID#{slot.pokemonId.toString()} @ ({slot.posX}, {slot.posY})
                  </span>
                </div>
                <div style={{ color: '#666', fontSize: '10px' }}>
                  Throws: {slot.throwAttempts}/3
                </div>
              </div>
            ))}
            {pokemonSlots.activeCount === 0 && (
              <div style={{ color: '#666', textAlign: 'center', padding: '8px' }}>No active Pokemon</div>
            )}
          </div>
        )}

        {/* NFT Vault */}
        {nftVault && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>NFT Vault ({nftVault.count}/{nftVault.maxSize})</div>
            {nftVault.count === 0 ? (
              <div style={{ color: '#666', textAlign: 'center', padding: '8px' }}>Vault is empty</div>
            ) : (
              nftVault.mints.slice(0, nftVault.count).map((mint, idx) => (
                <div key={idx} style={styles.row}>
                  <span style={styles.label}>#{idx}:</span>
                  <span style={styles.value}>{mint.toBase58().slice(0, 16)}...</span>
                </div>
              ))
            )}
          </div>
        )}

        {!gameConfig && !isRefreshing && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            Game not initialized or unable to fetch state.
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDevTools;
