/**
 * FundingWidget Component
 *
 * Comprehensive widget for funding wallets with APE or USDC.e on ApeChain.
 * Supports:
 * - Bridge from other chains (Ethereum, Arbitrum, Base, etc.)
 * - Swap tokens on any chain into APE/USDC.e
 * - Buy with fiat (card, bank transfer)
 * - Onramp from any supported source
 *
 * Uses ThirdWeb Universal Bridge (PayEmbed) for seamless cross-chain transactions.
 *
 * IMPORTANT: This widget uses the existing RainbowKit/Wagmi connected wallet.
 * It does NOT show a separate wallet connection UI - the player must already be connected.
 *
 * Destination is LOCKED to either APE or USDC.e on ApeChain - users cannot change this.
 *
 * Usage:
 * ```tsx
 * import { FundingWidget } from './components/FundingWidget';
 *
 * <FundingWidget
 *   isOpen={showFunding}
 *   onClose={() => setShowFunding(false)}
 *   defaultToken="APE"  // or "USDC" - this LOCKS the destination
 * />
 * ```
 */

import React, { useState, useCallback, useEffect, Component, Suspense, lazy, type ReactNode } from 'react';
import { useAccount, useWalletClient, useSwitchChain, useDisconnect } from 'wagmi';
import {
  thirdwebClient,
  apechain,
  APECHAIN_TOKEN_METADATA,
  isThirdwebConfigured,
} from '../../services/thirdwebConfig';

// ============================================================
// ERROR BOUNDARY FOR THIRDWEB COMPONENTS
// ============================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ThirdwebErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[FundingWidget] ThirdWeb error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// ============================================================
// LAZY LOADED THIRDWEB COMPONENTS
// ============================================================

const LazyPayEmbed = lazy(async () => {
  if (!isThirdwebConfigured()) {
    throw new Error('ThirdWeb not configured');
  }
  const module = await import('thirdweb/react');
  return { default: module.PayEmbed };
});

const LazyThirdwebProvider = lazy(async () => {
  if (!isThirdwebConfigured()) {
    throw new Error('ThirdWeb not configured');
  }
  const module = await import('thirdweb/react');
  return { default: module.ThirdwebProvider };
});

// ============================================================
// CUSTOM THEME - Pixel art style matching game UI
// ============================================================

/**
 * Custom ThirdWeb theme matching the Pokemon Trader pixel-art aesthetic.
 * Dark background, green accents, monospace font.
 */
const pokemonTraderTheme = {
  type: 'dark' as const,
  fontFamily: "'Courier New', Courier, monospace",
  colors: {
    modalBg: '#1a1a1a',
    modalOverlayBg: 'rgba(0, 0, 0, 0.9)',
    primaryText: '#e0e0e0',
    secondaryText: '#888888',
    accentText: '#00ff88',
    accentButtonBg: '#00ff88',
    accentButtonText: '#000000',
    primaryButtonBg: '#00ff88',
    primaryButtonText: '#000000',
    secondaryButtonBg: '#2a2a2a',
    secondaryButtonHoverBg: '#3a3a3a',
    secondaryButtonText: '#e0e0e0',
    connectedButtonBg: '#2a2a2a',
    connectedButtonBgHover: '#3a3a3a',
    borderColor: '#444444',
    separatorLine: '#333333',
    tertiaryBg: '#2a2a2a',
    skeletonBg: '#333333',
    selectedTextBg: '#00ff88',
    selectedTextColor: '#000000',
    scrollbarBg: '#333333',
    danger: '#ff4444',
    success: '#00ff88',
    tooltipBg: '#2a2a2a',
    tooltipText: '#e0e0e0',
    inputAutofillBg: '#2a2a2a',
    secondaryIconColor: '#888888',
    secondaryIconHoverBg: '#3a3a3a',
    secondaryIconHoverColor: '#00ff88',
  },
};

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type FundingToken = 'APE' | 'USDC';

export interface FundingWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Token to fund (APE or USDC.e) - this LOCKS the destination.
   * Users cannot change the destination token in the widget.
   */
  defaultToken?: FundingToken;
  /** Optional callback when funding completes */
  onFundingComplete?: () => void;
}

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
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    border: '4px solid #00ff88',
    padding: '24px',
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
    marginBottom: '16px',
    borderBottom: '2px solid #444',
    paddingBottom: '12px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#00ff88',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: '2px solid #ff4444',
    color: '#ff4444',
    padding: '6px 10px',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
  },
  description: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '16px',
    lineHeight: '1.5',
  },
  tokenBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '16px',
  },
  tokenBadgeApe: {
    backgroundColor: '#3a3a1a',
    border: '2px solid #ffcc00',
    color: '#ffcc00',
  },
  tokenBadgeUsdc: {
    backgroundColor: '#1a3a1a',
    border: '2px solid #00ff00',
    color: '#00ff00',
  },
  featureList: {
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#2a2a2a',
    border: '2px solid #444',
  },
  featureTitle: {
    fontSize: '12px',
    color: '#00ff88',
    marginBottom: '8px',
    fontWeight: 'bold',
  },
  featureItem: {
    fontSize: '11px',
    color: '#aaa',
    marginBottom: '4px',
    paddingLeft: '12px',
  },
  loadingOverlay: {
    padding: '24px',
    backgroundColor: '#2a2a2a',
    border: '2px solid #00ff88',
    textAlign: 'center' as const,
  },
  loadingText: {
    color: '#00ff88',
    fontSize: '14px',
  },
  errorBox: {
    padding: '12px',
    backgroundColor: '#3a1a1a',
    border: '2px solid #ff4444',
    marginTop: '16px',
  },
  errorText: {
    color: '#ff4444',
    fontSize: '12px',
  },
  retryButton: {
    marginTop: '8px',
    padding: '8px 16px',
    border: '2px solid #ff4444',
    backgroundColor: 'transparent',
    color: '#ff4444',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
  },
  notConfiguredBox: {
    padding: '24px',
    backgroundColor: '#2a2a2a',
    border: '2px solid #666',
    textAlign: 'center' as const,
  },
  notConfiguredText: {
    color: '#888',
    fontSize: '12px',
    lineHeight: '1.6',
  },
  walletRequiredBox: {
    padding: '24px',
    backgroundColor: '#2a2a1a',
    border: '2px solid #ffcc00',
    textAlign: 'center' as const,
    marginBottom: '16px',
  },
  walletRequiredText: {
    color: '#ffcc00',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  poweredBy: {
    marginTop: '12px',
    textAlign: 'center' as const,
    color: '#666',
    fontSize: '10px',
  },
  widgetContainer: {
    minHeight: '400px',
    backgroundColor: '#1a1a1a',
  },
  infoBox: {
    padding: '10px 12px',
    backgroundColor: '#1a2a3a',
    border: '2px solid #4488ff',
    marginBottom: '16px',
    fontSize: '11px',
    color: '#88aaff',
    lineHeight: '1.5',
  },
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Loading fallback for ThirdWeb widget */
function LoadingFallback() {
  return (
    <div style={styles.loadingOverlay}>
      <div style={styles.loadingText}>Loading funding widget...</div>
      <div style={{ color: '#888', fontSize: '11px', marginTop: '8px' }}>
        Connecting to Universal Bridge...
      </div>
    </div>
  );
}

/** Error fallback for ThirdWeb widget */
function ErrorFallback({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <div style={styles.errorBox}>
      <div style={styles.errorText}>
        {error || 'Failed to load funding widget. Please try again.'}
      </div>
      {onRetry && (
        <button style={styles.retryButton} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Inner PayEmbed wrapper with ThirdwebProvider and wallet adapter
 *
 * This component:
 * 1. Uses the existing wagmi wallet (no separate connect UI)
 * 2. Adapts it to thirdweb's wallet format via EIP1193
 * 3. Locks the destination token (no user selection)
 */
function PayEmbedWithProvider({
  selectedToken,
  onComplete,
}: {
  selectedToken: FundingToken;
  onComplete?: () => void;
}) {
  const { address, connector } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { disconnectAsync } = useDisconnect();
  const [activeWallet, setActiveWallet] = useState<unknown>(null);
  const [isAdapting, setIsAdapting] = useState(true);
  const [adapterError, setAdapterError] = useState<string | null>(null);

  // Adapt wagmi wallet to thirdweb wallet format
  useEffect(() => {
    const adaptWallet = async () => {
      if (!thirdwebClient || !walletClient || !connector || !address) {
        setIsAdapting(false);
        return;
      }

      try {
        setIsAdapting(true);
        setAdapterError(null);

        // Dynamic import of thirdweb wallet adapters
        const [{ viemAdapter }, { createWalletAdapter }, { defineChain }] = await Promise.all([
          import('thirdweb/adapters/viem'),
          import('thirdweb/wallets'),
          import('thirdweb/chains'),
        ]);

        // Convert viem wallet client to thirdweb adapted account
        const adaptedAccount = viemAdapter.walletClient.fromViem({
          walletClient: walletClient as any,
        });

        // Get current chain ID from wallet
        const chainId = await walletClient.getChainId();

        // Create the wallet adapter with callbacks for disconnect and chain switching
        const thirdwebWallet = createWalletAdapter({
          adaptedAccount,
          chain: defineChain(chainId),
          client: thirdwebClient,
          onDisconnect: async () => {
            await disconnectAsync();
          },
          switchChain: async (chain) => {
            await switchChainAsync({ chainId: chain.id as any });
          },
        });

        setActiveWallet(thirdwebWallet);
        console.log('[FundingWidget] Wallet adapted successfully for address:', address);
      } catch (err) {
        console.error('[FundingWidget] Wallet adapter error:', err);
        setAdapterError(err instanceof Error ? err.message : 'Failed to adapt wallet');
      } finally {
        setIsAdapting(false);
      }
    };

    adaptWallet();
  }, [walletClient, connector, address, disconnectAsync, switchChainAsync]);

  if (!thirdwebClient) {
    return <ErrorFallback error="ThirdWeb client not initialized" />;
  }

  if (!address) {
    return (
      <div style={styles.walletRequiredBox}>
        <div style={styles.walletRequiredText}>
          Please connect your wallet first
        </div>
        <div style={{ color: '#888', fontSize: '11px', marginTop: '8px' }}>
          Use the "Connect Wallet" button above
        </div>
      </div>
    );
  }

  if (isAdapting) {
    return <LoadingFallback />;
  }

  if (adapterError) {
    return <ErrorFallback error={`Wallet adapter error: ${adapterError}`} />;
  }

  // Configure prefillBuy based on selected token
  // For APE (native), we don't pass a token - just the chain
  // For USDC.e, we pass the token address
  // CRITICAL: allowEdits.token = false to LOCK the destination
  const prefillBuyConfig = selectedToken === 'USDC'
    ? {
        chain: apechain,
        token: {
          address: APECHAIN_TOKEN_METADATA.USDC.address,
          symbol: APECHAIN_TOKEN_METADATA.USDC.symbol,
          name: APECHAIN_TOKEN_METADATA.USDC.name,
        },
        allowEdits: {
          amount: true,   // User can change amount
          token: false,   // LOCKED - user cannot change destination token
          chain: false,   // LOCKED - user cannot change destination chain
        },
      }
    : {
        // Native APE - no token address, just chain
        chain: apechain,
        allowEdits: {
          amount: true,   // User can change amount
          token: false,   // LOCKED - user cannot change destination token
          chain: false,   // LOCKED - user cannot change destination chain
        },
      };

  return (
    <LazyThirdwebProvider>
      <Suspense fallback={<LoadingFallback />}>
        <LazyWalletActivator wallet={activeWallet}>
          <div style={styles.widgetContainer}>
            <LazyPayEmbed
            client={thirdwebClient}
            theme={pokemonTraderTheme}
            payOptions={{
              mode: 'fund_wallet',
              metadata: {
                name: `Get ${selectedToken} on ApeChain`,
              },
              prefillBuy: prefillBuyConfig,
              // Enable crypto purchases (bridge/swap)
              buyWithCrypto: {
                // Allow user to select source chain/token (but NOT destination)
                prefillSource: undefined,
              },
              // Enable fiat purchases
              buyWithFiat: {
                // Use default fiat providers
                prefillSource: undefined,
              },
              // Callback when transaction completes
              onPurchaseSuccess: () => {
                console.log('[FundingWidget] Purchase successful');
                onComplete?.();
              },
            }}
          />
          </div>
        </LazyWalletActivator>
      </Suspense>
    </LazyThirdwebProvider>
  );
}

/**
 * Component that activates the adapted wallet in ThirdwebProvider context.
 * This is a separate component so we can use the useSetActiveWallet hook
 * which requires being inside ThirdwebProvider.
 */
const LazyWalletActivator = lazy(async () => {
  const { useSetActiveWallet } = await import('thirdweb/react');

  // Define the component
  function WalletActivatorInner({
    wallet,
    children,
  }: {
    wallet: unknown;
    children: ReactNode;
  }) {
    const setActiveWallet = useSetActiveWallet();
    const [isActivated, setIsActivated] = useState(false);

    useEffect(() => {
      if (!wallet) {
        setIsActivated(true);
        return;
      }

      try {
        // Set the adapted wallet as the active wallet in thirdweb context
        setActiveWallet(wallet as any);
        console.log('[FundingWidget] Wallet set as active in ThirdwebProvider');
        setIsActivated(true);
      } catch (err) {
        console.error('[FundingWidget] Failed to set active wallet:', err);
        setIsActivated(true); // Proceed anyway, PayEmbed may still work
      }
    }, [wallet, setActiveWallet]);

    if (!isActivated) {
      return <LoadingFallback />;
    }

    return <>{children}</>;
  }

  return { default: WalletActivatorInner };
});

// ============================================================
// MAIN COMPONENT
// ============================================================

export function FundingWidget({
  isOpen,
  onClose,
  defaultToken = 'APE',
  onFundingComplete,
}: FundingWidgetProps) {
  // The selected token is LOCKED to the defaultToken - no user selection
  const selectedToken = defaultToken;
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const { address } = useAccount();

  // Reset error state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setWidgetError(null);
    }
  }, [isOpen]);

  // Reset on token change (in case parent changes defaultToken)
  useEffect(() => {
    setWidgetError(null);
    setRetryKey((k) => k + 1);
  }, [defaultToken]);

  const handleError = useCallback((error: Error) => {
    console.error('[FundingWidget] Widget error:', error);
    setWidgetError(error.message || 'Failed to load funding widget');
  }, []);

  const handleRetry = useCallback(() => {
    setWidgetError(null);
    setRetryKey((k) => k + 1);
  }, []);

  const handleComplete = useCallback(() => {
    onFundingComplete?.();
  }, [onFundingComplete]);

  if (!isOpen) return null;

  const tokenDisplayName = selectedToken === 'APE' ? 'APE' : 'USDC.e';
  const tokenBadgeStyle = selectedToken === 'APE'
    ? { ...styles.tokenBadge, ...styles.tokenBadgeApe }
    : { ...styles.tokenBadge, ...styles.tokenBadgeUsdc };

  return (
    <div className="modal-overlay" style={styles.overlay} onClick={onClose}>
      <div className="modal-inner modal-scroll" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>GET {tokenDisplayName}</h3>
          <button style={styles.closeButton} onClick={onClose}>
            X
          </button>
        </div>

        {/* Token Badge - shows locked destination */}
        <div style={tokenBadgeStyle}>
          Destination: {tokenDisplayName} on ApeChain
        </div>

        {/* Description */}
        <div style={styles.description}>
          Bridge, swap, or buy crypto to get {tokenDisplayName} on ApeChain.
          Use any token on any chain - the destination is locked to {tokenDisplayName}.
        </div>

        {/* Info box about wallet usage */}
        {address && (
          <div style={styles.infoBox}>
            Using your connected wallet: {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        )}

        {/* Features List */}
        <div style={styles.featureList}>
          <div style={styles.featureTitle}>SUPPORTED METHODS:</div>
          <div style={styles.featureItem}>+ Bridge from Ethereum, Arbitrum, Base, Optimism, etc.</div>
          <div style={styles.featureItem}>+ Swap any token (ETH, USDC, USDT, etc.)</div>
          <div style={styles.featureItem}>+ Buy with card or bank transfer</div>
          <div style={styles.featureItem}>+ Cross-chain swap+bridge in one step</div>
        </div>

        {/* ThirdWeb Widget */}
        {!isThirdwebConfigured() && (
          <div style={styles.notConfiguredBox}>
            <div style={styles.notConfiguredText}>
              ThirdWeb not configured.<br /><br />
              Set VITE_THIRDWEB_CLIENT_ID in .env to enable<br />
              bridging, swapping, and fiat purchases.
            </div>
          </div>
        )}

        {isThirdwebConfigured() && widgetError && (
          <ErrorFallback error={widgetError} onRetry={handleRetry} />
        )}

        {isThirdwebConfigured() && !widgetError && (
          <ThirdwebErrorBoundary
            key={`${selectedToken}-${retryKey}`}
            fallback={<ErrorFallback onRetry={handleRetry} />}
            onError={handleError}
          >
            <Suspense fallback={<LoadingFallback />}>
              <PayEmbedWithProvider
                selectedToken={selectedToken}
                onComplete={handleComplete}
              />
            </Suspense>
          </ThirdwebErrorBoundary>
        )}

        {/* Powered By */}
        <div style={styles.poweredBy}>
          Powered by ThirdWeb Universal Bridge
        </div>
      </div>
    </div>
  );
}

export default FundingWidget;
