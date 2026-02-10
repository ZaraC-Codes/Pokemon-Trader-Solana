/**
 * WalletConnector Component (Solana)
 *
 * Custom-styled Solana wallet connect button matching the game's pixel-art HUD.
 * Uses @solana/wallet-adapter-react-ui's WalletMultiButton under the hood
 * with custom pixel-art styling overrides.
 *
 * Features:
 * - Yellow pixel-art border style matching SHOP button and HUD
 * - Dark background with monospace font
 * - Shows truncated address when connected
 * - SOL balance display
 * - Hover effects consistent with game UI
 */

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSolBalance } from '../hooks/solana/useSolBallsBalance';
import { useMemo } from 'react';

export default function WalletConnector() {
  const { publicKey, connected } = useWallet();
  const { balance: solBalance } = useSolBalance();

  const truncatedAddress = useMemo(() => {
    if (!publicKey) return '';
    const base58 = publicKey.toBase58();
    return `${base58.slice(0, 4)}…${base58.slice(-4)}`;
  }, [publicKey]);

  return (
    <div className="wallet-connector">
      {/* Inject pixel-art override styles for wallet-adapter-react-ui */}
      <style>{`
        .wallet-connector .wallet-adapter-button {
          padding: 10px 14px !important;
          background-color: rgba(0, 0, 0, 0.85) !important;
          border: 2px solid #ffcc00 !important;
          color: #ffcc00 !important;
          font-family: 'Courier New', monospace !important;
          font-size: 12px !important;
          font-weight: bold !important;
          border-radius: 0 !important;
          height: auto !important;
          line-height: 1.2 !important;
          transition: all 0.1s !important;
        }
        .wallet-connector .wallet-adapter-button:hover {
          background-color: rgba(40, 40, 0, 0.9) !important;
          border-color: #ffdd44 !important;
        }
        .wallet-connector .wallet-adapter-button-trigger {
          background-color: rgba(0, 0, 0, 0.85) !important;
        }
        .wallet-connector .wallet-adapter-button i,
        .wallet-connector .wallet-adapter-button-start-icon {
          margin-right: 6px !important;
        }
        .wallet-connector .wallet-adapter-button-start-icon img {
          width: 16px !important;
          height: 16px !important;
        }
        .wallet-connector .wallet-adapter-dropdown {
          z-index: 1001;
        }
        .wallet-adapter-modal-wrapper {
          font-family: 'Courier New', monospace !important;
        }
      `}</style>

      {connected && publicKey ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {/* SOL balance indicator */}
          <div style={{
            padding: '8px 10px',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            border: '2px solid #ffcc00',
            color: '#aaa',
            fontFamily: "'Courier New', monospace",
            fontSize: '11px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <span style={{ color: '#9945FF' }}>◎</span>
            <span>{solBalance.toFixed(3)}</span>
          </div>

          {/* Wallet multi-button (shows address, click for dropdown) */}
          <WalletMultiButton />
        </div>
      ) : (
        <WalletMultiButton />
      )}
    </div>
  );
}
