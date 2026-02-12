/**
 * InventoryTerminal Component (Solana)
 *
 * Shows player's NFT inventory from the Solana vault.
 * Solana version: Reads from on-chain NftVault PDA.
 *
 * TODO: Full Metaplex NFT enumeration for player's wallet.
 * For now, shows a placeholder with player stats from PlayerInventory.
 */

import { useState } from 'react';
import { useActiveWeb3React } from '../hooks/useActiveWeb3React';
import { usePlayerInventory, usePlayerNFTs, getBallTypeName, type BallType } from '../hooks/solana';

// Ball colors for visual display
const BALL_COLORS: Record<BallType, string> = {
  0: '#ff4444',
  1: '#4488ff',
  2: '#ffcc00',
  3: '#aa44ff',
};

interface InventoryTerminalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InventoryTerminal({ isOpen, onClose }: InventoryTerminalProps) {
  const { account } = useActiveWeb3React();
  const inventory = usePlayerInventory();
  const { nfts, isLoading: nftsLoading } = usePlayerNFTs();

  if (!isOpen) return null;

  const ballCounts = [
    { type: 0 as BallType, count: inventory.pokeBalls },
    { type: 1 as BallType, count: inventory.greatBalls },
    { type: 2 as BallType, count: inventory.ultraBalls },
    { type: 3 as BallType, count: inventory.masterBalls },
  ];

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: 2000, fontFamily: 'Courier New, monospace',
        imageRendering: 'pixelated', pointerEvents: 'auto', isolation: 'isolate',
      }}
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          backgroundColor: 'rgba(26, 26, 26, 0.95)',
          border: '4px solid #00ff00', padding: '20px',
          maxWidth: '600px', maxHeight: '80vh', width: '90%',
          color: '#00ff00', imageRendering: 'pixelated',
          boxShadow: '0 0 20px rgba(0, 255, 0, 0.5)',
          overflow: 'auto', backdropFilter: 'blur(5px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Terminal Header */}
        <div style={{ marginBottom: '20px', borderBottom: '2px solid #00ff00', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '24px', textTransform: 'uppercase', letterSpacing: '2px' }}>
              INVENTORY TERMINAL
            </h2>
            <button
              onClick={onClose}
              style={{
                backgroundColor: '#a44', color: '#fff', border: '2px solid #fff',
                padding: '8px 16px', cursor: 'pointer', fontFamily: 'Courier New, monospace',
                fontSize: '14px', textTransform: 'uppercase',
              }}
            >
              CLOSE [X]
            </button>
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#888' }}>
            {account ? (
              <>Wallet: {account.slice(0, 6)}...{account.slice(-4)}</>
            ) : (
              <>Please connect wallet</>
            )}
          </div>
        </div>

        {!account ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            Please connect your wallet to view inventory
          </div>
        ) : (
          <>
            {/* Ball Inventory */}
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#0a0a0a', border: '2px solid #00ff00' }}>
              <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px' }}>POKEBALL INVENTORY</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {ballCounts.map(({ type, count }) => (
                  <div key={type} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px', backgroundColor: '#1a1a1a', border: '1px solid #333',
                  }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      backgroundColor: BALL_COLORS[type], border: '2px solid #fff', flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontSize: '14px', color: BALL_COLORS[type], fontWeight: 'bold' }}>
                        {getBallTypeName(type)}
                      </div>
                      <div style={{ fontSize: '18px', color: '#fff' }}>{count}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Player Stats */}
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#0a0a0a', border: '2px solid #00ff00' }}>
              <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px' }}>PLAYER STATS</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888' }}>Total Purchased:</span>
                  <span>{inventory.totalPurchased}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888' }}>Total Throws:</span>
                  <span>{inventory.totalThrows}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888' }}>Total Catches:</span>
                  <span style={{ color: '#ffcc00' }}>{inventory.totalCatches}</span>
                </div>
              </div>
            </div>

            {/* NFT Collection */}
            <div style={{ padding: '15px', backgroundColor: '#0a0a0a', border: '2px solid #00ff00' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '18px' }}>
                NFT COLLECTION {nfts.length > 0 && <span style={{ color: '#ffcc00' }}>({nfts.length})</span>}
              </h3>
              {nftsLoading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#888', fontSize: '13px' }}>
                  Loading NFTs...
                </div>
              ) : nfts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontSize: '13px' }}>
                  No NFTs yet. Catch a Pokemon to win one!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {nfts.map((nft) => (
                    <div
                      key={nft.mint}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px', backgroundColor: '#1a1a1a', border: '1px solid #333',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '4px',
                          backgroundColor: '#ffcc00', border: '2px solid #fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 'bold', color: '#000',
                        }}>
                          N
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', color: '#fff', fontFamily: 'monospace' }}>
                            {nft.mint.slice(0, 6)}...{nft.mint.slice(-4)}
                          </div>
                          {nft.fromGame && (
                            <div style={{ fontSize: '10px', color: '#00ff88' }}>Catch Reward</div>
                          )}
                        </div>
                      </div>
                      <a
                        href={`https://explorer.solana.com/address/${nft.mint}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#4488ff', textDecoration: 'none', fontSize: '11px' }}
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '8px', textAlign: 'right', fontSize: '11px' }}>
                <a
                  href={`https://explorer.solana.com/address/${account}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#4488ff', textDecoration: 'none' }}
                >
                  View all on Explorer
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
