/**
 * Solana Wallet Provider
 *
 * Replaces WagmiProvider + RainbowKitProvider with Solana Wallet Adapter.
 * Supports Phantom, Solflare, Backpack, and other Solana wallets.
 */

import { type ReactNode, useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Default styles for wallet adapter UI
import '@solana/wallet-adapter-react-ui/styles.css';

// ============================================================
// CONFIGURATION
// ============================================================

const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet');
const SOLANA_NETWORK = import.meta.env.VITE_SOLANA_NETWORK || 'devnet';

// ============================================================
// PROVIDER COMPONENT
// ============================================================

interface SolanaWalletProviderProps {
  children: ReactNode;
}

export function SolanaWalletProvider({ children }: SolanaWalletProviderProps) {
  // Configure supported wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new CoinbaseWalletAdapter(),
      // Backpack and other Wallet Standard wallets auto-register
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

// ============================================================
// CUSTOM WALLET MODAL THEME STYLES
// ============================================================

// Inject pixel-art dark theme overrides for the wallet adapter modal
const walletThemeStyles = `
  /* Wallet Adapter Modal - Pixel Art Dark Theme */
  .wallet-adapter-modal-wrapper {
    background-color: #1a1a1a !important;
    border: 4px solid #fff !important;
    font-family: 'Courier New', monospace !important;
  }

  .wallet-adapter-modal-title {
    color: #ffcc00 !important;
    font-family: 'Courier New', monospace !important;
    font-weight: bold !important;
  }

  .wallet-adapter-modal-list li {
    background-color: #2a2a2a !important;
    border: 2px solid #444 !important;
    margin-bottom: 4px !important;
  }

  .wallet-adapter-modal-list li:hover {
    background-color: #1a3a1a !important;
    border-color: #00ff88 !important;
  }

  .wallet-adapter-modal-list .wallet-adapter-button {
    color: #fff !important;
    font-family: 'Courier New', monospace !important;
  }

  .wallet-adapter-modal-button-close {
    background-color: transparent !important;
    color: #ff4444 !important;
  }

  .wallet-adapter-modal-button-close:hover {
    background-color: rgba(255, 68, 68, 0.1) !important;
  }

  /* Wallet Adapter Button Styles */
  .wallet-adapter-button {
    background-color: rgba(0, 0, 0, 0.85) !important;
    border: 2px solid #ffcc00 !important;
    color: #ffcc00 !important;
    font-family: 'Courier New', monospace !important;
    font-weight: bold !important;
    font-size: 12px !important;
    cursor: pointer !important;
    transition: all 0.1s !important;
  }

  .wallet-adapter-button:hover {
    background-color: rgba(40, 40, 0, 0.9) !important;
    border-color: #ffdd44 !important;
  }

  .wallet-adapter-button-trigger {
    background-color: rgba(0, 0, 0, 0.85) !important;
  }

  /* Dropdown menu */
  .wallet-adapter-dropdown-list {
    background-color: #1a1a1a !important;
    border: 2px solid #ffcc00 !important;
    font-family: 'Courier New', monospace !important;
  }

  .wallet-adapter-dropdown-list-item {
    color: #ffcc00 !important;
    font-family: 'Courier New', monospace !important;
  }

  .wallet-adapter-dropdown-list-item:hover {
    background-color: #2a2a2a !important;
  }

  /* Collapsed button */
  .wallet-adapter-button[data-state="connected"] {
    background-color: rgba(0, 0, 0, 0.85) !important;
  }
`;

// Inject theme styles on module load
if (typeof document !== 'undefined') {
  const styleId = 'solana-wallet-theme';
  if (!document.getElementById(styleId)) {
    const styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.textContent = walletThemeStyles;
    document.head.appendChild(styleTag);
  }
}

export { SOLANA_RPC_URL, SOLANA_NETWORK };
