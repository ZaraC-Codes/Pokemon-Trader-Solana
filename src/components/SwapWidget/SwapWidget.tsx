/**
 * SwapWidget Component (Solana)
 *
 * Jupiter Terminal integration for swapping SOL/tokens into SolBalls.
 * Uses the CDN-loaded Jupiter Terminal v3 script.
 *
 * Features:
 * - Integrated swap UI inside a modal
 * - Output token locked to SolBalls mint
 * - Dark pixel-art theme matching the game
 * - Devnet/mainnet cluster auto-detection
 */

import { useEffect, useRef, useCallback } from 'react';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

declare global {
  interface Window {
    Jupiter?: {
      init: (config: JupiterTerminalConfig) => Promise<void>;
      close: () => void;
      resume: () => void;
    };
  }
}

interface JupiterTerminalConfig {
  displayMode: 'modal' | 'integrated' | 'widget';
  integratedTargetId?: string;
  endpoint: string;
  formProps?: {
    initialOutputMint?: string;
    initialInputMint?: string;
    initialAmount?: string;
    fixedOutputMint?: boolean;
    fixedInputMint?: boolean;
    fixedAmount?: boolean;
    swapMode?: 'ExactInOrOut' | 'ExactIn' | 'ExactOut';
    initialSlippageBps?: number;
  };
  containerClassName?: string;
  containerStyles?: Record<string, string>;
  defaultExplorer?: 'Solana Explorer' | 'Solscan' | 'Solana Beach' | 'SolanaFM';
}

export interface SwapWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================
// CONSTANTS
// ============================================================

const SOLBALLS_MINT = import.meta.env.VITE_SOLBALLS_MINT || '';
const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

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
    backgroundColor: '#0a0a0a',
    border: '4px solid #ffcc00',
    boxShadow: '0 0 30px rgba(255, 204, 0, 0.2)',
    maxWidth: '480px',
    width: '95%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    fontFamily: "'Courier New', monospace",
    color: '#fff',
    imageRendering: 'pixelated' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '2px solid #333',
  },
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#ffcc00',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: '2px solid #ff4444',
    color: '#ff4444',
    padding: '6px 12px',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
  },
  body: {
    padding: '16px 20px',
    minHeight: '400px',
  },
  jupiterContainer: {
    width: '100%',
    minHeight: '380px',
    backgroundColor: '#111',
    borderRadius: '4px',
  },
  loadingMessage: {
    textAlign: 'center' as const,
    color: '#888',
    padding: '60px 20px',
    fontSize: '14px',
  },
  noMintWarning: {
    textAlign: 'center' as const,
    color: '#ffcc00',
    padding: '40px 20px',
    fontSize: '13px',
    border: '2px solid #ffcc00',
    backgroundColor: '#1a1a00',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '2px solid #333',
    textAlign: 'center' as const,
    fontSize: '11px',
    color: '#555',
  },
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export function SwapWidget({ isOpen, onClose }: SwapWidgetProps) {
  const hasInitialized = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initJupiter = useCallback(async () => {
    if (hasInitialized.current) return;
    if (!window.Jupiter) {
      console.warn('[SwapWidget] Jupiter Terminal not loaded yet');
      return;
    }
    if (!SOLBALLS_MINT) {
      console.warn('[SwapWidget] VITE_SOLBALLS_MINT not configured');
      return;
    }

    hasInitialized.current = true;

    try {
      await window.Jupiter.init({
        displayMode: 'integrated',
        integratedTargetId: 'jupiter-swap-target',
        endpoint: SOLANA_RPC_URL,
        formProps: {
          initialOutputMint: SOLBALLS_MINT,
          fixedOutputMint: true,
          initialSlippageBps: 100, // 1%
          swapMode: 'ExactInOrOut',
        },
        defaultExplorer: 'Solana Explorer',
      });

      console.log('[SwapWidget] Jupiter Terminal initialized');
    } catch (err) {
      console.error('[SwapWidget] Failed to init Jupiter:', err);
      hasInitialized.current = false;
    }
  }, []);

  useEffect(() => {
    if (isOpen && !hasInitialized.current) {
      // Try immediately, then retry with backoff if Jupiter CDN hasn't loaded yet
      const tryInit = (attempt: number) => {
        if (hasInitialized.current) return;
        if (window.Jupiter) {
          initJupiter();
        } else if (attempt < 10) {
          setTimeout(() => tryInit(attempt + 1), 500);
        }
      };
      const timer = setTimeout(() => tryInit(0), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initJupiter]);

  // Resume Jupiter when reopening
  useEffect(() => {
    if (isOpen && hasInitialized.current && window.Jupiter?.resume) {
      window.Jupiter.resume();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>GET SOLBALLS</h2>
          <button style={styles.closeButton} onClick={onClose}>CLOSE</button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {!SOLBALLS_MINT ? (
            <div style={styles.noMintWarning}>
              SolBalls mint not configured.
              <br />
              Set <code>VITE_SOLBALLS_MINT</code> in your .env file.
            </div>
          ) : !window.Jupiter ? (
            <div style={styles.loadingMessage}>
              Loading Jupiter swap widget...
              <br />
              <span style={{ fontSize: '11px', color: '#555' }}>
                If this persists, check your network connection.
              </span>
            </div>
          ) : (
            <div
              id="jupiter-swap-target"
              ref={containerRef}
              style={styles.jupiterContainer}
            />
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          Powered by Jupiter Aggregator
        </div>
      </div>
    </div>
  );
}

export default SwapWidget;
