/**
 * PokeBallShop Component
 *
 * Modal component for purchasing PokeBalls with APE or USDC.e.
 * Displays ball types, prices, catch rates, and player inventory.
 * Includes ThirdWeb Checkout integration for buying crypto directly.
 *
 * Usage:
 * ```tsx
 * import { PokeBallShop } from './components/PokeBallShop/PokeBallShop';
 *
 * function GameHUD() {
 *   const [shopOpen, setShopOpen] = useState(false);
 *   const { account } = useActiveWeb3React();
 *
 *   return (
 *     <>
 *       <button onClick={() => setShopOpen(true)}>Open Shop</button>
 *       <PokeBallShop
 *         isOpen={shopOpen}
 *         onClose={() => setShopOpen(false)}
 *         playerAddress={account}
 *       />
 *     </>
 *   );
 * }
 * ```
 */

import React, { useState, useCallback, useMemo, useEffect, useRef, Component, Suspense, lazy, type ReactNode } from 'react';
import {
  usePurchaseBalls,
  usePlayerBallInventory,
  useTokenApproval,
  useApePriceFromContract,
  useContractDiagnostics,
  calculateTotalCost,
  getBallTypeName,
  getBallPriceUSD,
  getCatchRatePercent,
  POKEBALL_GAME_ADDRESS,
  type BallType,
  type TokenType,
} from '../../hooks/pokeballGame';
import { useApeBalanceWithUsd, useUsdcBalance, useApeUsdPrice } from '../../hooks/useTokenBalances';
import {
  thirdwebClient,
  apechain,
  APECHAIN_TOKENS,
  isThirdwebConfigured,
} from '../../services/thirdwebConfig';
import { FundingWidget, type FundingToken } from '../FundingWidget';
import { isEthereumPhoneAvailable, getDGen1Diagnostic, type DGen1Diagnostic } from '../../utils/walletDetection';

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
    console.error('[ThirdwebErrorBoundary] Caught error:', error, errorInfo);
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

// Lazy load thirdweb components only when needed
const LazyPayEmbed = lazy(async () => {
  if (!isThirdwebConfigured()) {
    throw new Error('ThirdWeb not configured');
  }
  const module = await import('thirdweb/react');
  // Return as default export for lazy()
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
// TYPE DEFINITIONS
// ============================================================

export interface PokeBallShopProps {
  isOpen: boolean;
  onClose: () => void;
  playerAddress?: `0x${string}`;
}

type PaymentToken = 'APE' | 'USDC';

// ============================================================
// STYLES (Inline pixel art aesthetic)
// ============================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    border: '4px solid #fff',
    padding: '16px',
    maxWidth: 'min(600px, calc(100vw - 32px))',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    fontFamily: "'Courier New', monospace",
    color: '#fff',
    imageRendering: 'pixelated' as const,
    boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    borderBottom: '2px solid #444',
    paddingBottom: '10px',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#ffcc00',
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
    flexShrink: 0,
  },
  balanceSection: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
    padding: '10px',
    backgroundColor: '#2a2a2a',
    border: '2px solid #444',
    flexWrap: 'wrap' as const,
    boxSizing: 'border-box' as const,
  },
  balanceItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  balanceLabel: {
    fontSize: '12px',
    color: '#888',
  },
  balanceValue: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  usdEstimate: {
    fontSize: '12px',
    color: '#aaa',
    fontWeight: 'normal',
  },
  inventorySection: {
    marginBottom: '12px',
    padding: '10px',
    backgroundColor: '#2a2a2a',
    border: '2px solid #444',
    boxSizing: 'border-box' as const,
  },
  inventoryTitle: {
    fontSize: '14px',
    color: '#888',
    marginBottom: '8px',
  },
  inventoryGrid: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  inventoryItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },
  paymentToggle: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
  },
  toggleButton: {
    flex: '1 1 auto',
    minWidth: '100px',
    padding: '10px',
    border: '2px solid #444',
    backgroundColor: '#2a2a2a',
    color: '#888',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '13px',
    transition: 'all 0.1s',
    boxSizing: 'border-box' as const,
  },
  toggleButtonActive: {
    border: '2px solid #00ff00',
    backgroundColor: '#1a3a1a',
    color: '#00ff00',
  },
  ballList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  ballRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px',
    backgroundColor: '#2a2a2a',
    border: '2px solid #444',
    flexWrap: 'wrap' as const,
    boxSizing: 'border-box' as const,
  },
  ballInfo: {
    flex: '1 1 80px',
    minWidth: '80px',
  },
  ballName: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '2px',
  },
  ballStats: {
    fontSize: '11px',
    color: '#888',
  },
  quantityInput: {
    width: '50px',
    padding: '6px',
    border: '2px solid #444',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontFamily: "'Courier New', monospace",
    fontSize: '13px',
    textAlign: 'center' as const,
    flexShrink: 0,
    boxSizing: 'border-box' as const,
  },
  costDisplay: {
    width: '70px',
    minWidth: '70px',
    textAlign: 'right' as const,
    fontSize: '12px',
    flexShrink: 0,
  },
  buyButton: {
    padding: '8px 12px',
    border: '2px solid #00ff00',
    backgroundColor: '#1a3a1a',
    color: '#00ff00',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    minWidth: '70px',
    flexShrink: 0,
    boxSizing: 'border-box' as const,
  },
  buyButtonDisabled: {
    border: '2px solid #444',
    backgroundColor: '#2a2a2a',
    color: '#666',
    cursor: 'not-allowed',
  },
  insufficientBalance: {
    color: '#ff4444',
    fontSize: '11px',
    marginTop: '4px',
  },
  loadingOverlay: {
    padding: '12px',
    backgroundColor: '#2a2a2a',
    border: '2px solid #ffcc00',
    textAlign: 'center' as const,
    marginBottom: '12px',
    boxSizing: 'border-box' as const,
    wordWrap: 'break-word' as const,
    overflowWrap: 'break-word' as const,
  },
  loadingText: {
    color: '#ffcc00',
    fontSize: '14px',
  },
  errorBox: {
    padding: '10px',
    backgroundColor: '#3a1a1a',
    border: '2px solid #ff4444',
    marginTop: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '8px',
    boxSizing: 'border-box' as const,
  },
  errorText: {
    color: '#ff4444',
    fontSize: '11px',
    flex: '1 1 auto',
    wordBreak: 'break-word' as const,
  },
  dismissButton: {
    padding: '4px 8px',
    border: '2px solid #ff4444',
    backgroundColor: 'transparent',
    color: '#ff4444',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
    flexShrink: 0,
  },
  successBox: {
    padding: '10px',
    backgroundColor: '#1a3a1a',
    border: '2px solid #00ff00',
    marginTop: '12px',
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
  },
  successText: {
    color: '#00ff00',
    fontSize: '13px',
  },
  // Fund Wallet Section Styles
  fundWalletSection: {
    marginBottom: '12px',
    padding: '10px',
    backgroundColor: '#1a2a2a',
    border: '2px solid #00ff88',
    boxSizing: 'border-box' as const,
  },
  fundWalletHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  fundWalletTitle: {
    fontSize: '13px',
    color: '#00ff88',
    fontWeight: 'bold',
  },
  fundWalletButtons: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap' as const,
  },
  fundWalletButton: {
    padding: '6px 12px',
    border: '2px solid #00ff88',
    backgroundColor: 'transparent',
    color: '#00ff88',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
    transition: 'all 0.1s',
  },
  fundWalletHint: {
    fontSize: '11px',
    color: '#888',
    marginTop: '4px',
  },
  // Legacy Buy Crypto Section Styles (kept for BuyCryptoModal)
  buyCryptoSection: {
    marginBottom: '20px',
    padding: '12px',
    backgroundColor: '#1a2a3a',
    border: '2px solid #4488ff',
  },
  buyCryptoHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  buyCryptoTitle: {
    fontSize: '14px',
    color: '#4488ff',
    fontWeight: 'bold',
  },
  buyCryptoButtons: {
    display: 'flex',
    gap: '8px',
  },
  buyCryptoButton: {
    padding: '8px 16px',
    border: '2px solid #4488ff',
    backgroundColor: 'transparent',
    color: '#4488ff',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    transition: 'all 0.1s',
  },
  buyCryptoButtonHover: {
    backgroundColor: '#1a3a5a',
  },
  buyCryptoHint: {
    fontSize: '11px',
    color: '#888',
    marginTop: '4px',
  },
  buyCryptoModal: {
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
  buyCryptoModalContent: {
    backgroundColor: '#1a1a1a',
    border: '4px solid #4488ff',
    padding: '24px',
    maxWidth: '450px',
    width: '95%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
  },
  buyCryptoModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    borderBottom: '2px solid #444',
    paddingBottom: '12px',
  },
  buyCryptoModalTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#4488ff',
    margin: 0,
  },
  buyCryptoCloseButton: {
    background: 'none',
    border: '2px solid #ff4444',
    color: '#ff4444',
    padding: '6px 10px',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
  },
  notConfiguredBox: {
    padding: '16px',
    backgroundColor: '#2a2a2a',
    border: '2px solid #666',
    textAlign: 'center' as const,
  },
  notConfiguredText: {
    color: '#888',
    fontSize: '12px',
  },
  // Environment Warning Banner
  warningBanner: {
    padding: '10px',
    backgroundColor: '#3a2a1a',
    border: '2px solid #ff8800',
    marginBottom: '12px',
    boxSizing: 'border-box' as const,
  },
  warningTitle: {
    color: '#ff8800',
    fontSize: '12px',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  warningText: {
    color: '#ffaa44',
    fontSize: '11px',
    margin: '2px 0',
  },
  // Enhanced Success Box
  successBoxEnhanced: {
    padding: '12px',
    backgroundColor: '#1a3a1a',
    border: '2px solid #00ff00',
    marginTop: '12px',
    boxSizing: 'border-box' as const,
  },
  successTitle: {
    color: '#00ff00',
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  successDetails: {
    color: '#888',
    fontSize: '11px',
    marginTop: '4px',
  },
  successLink: {
    color: '#4488ff',
    textDecoration: 'none',
    fontSize: '11px',
  },
};

// Ball type colors for visual distinction
const BALL_COLORS: Record<BallType, string> = {
  0: '#ff4444', // Poke Ball - Red
  1: '#4488ff', // Great Ball - Blue
  2: '#ffcc00', // Ultra Ball - Yellow
  3: '#aa44ff', // Master Ball - Purple
};

// Add keyframe animation for spinners (only once)
if (typeof document !== 'undefined' && !document.getElementById('pokeball-shop-spinner-styles')) {
  const styleTag = document.createElement('style');
  styleTag.id = 'pokeball-shop-spinner-styles';
  styleTag.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleTag);
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

interface BallRowProps {
  ballType: BallType;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onBuy: () => void;
  isDisabled: boolean;
  isPurchasePending: boolean;
  isApprovalPending: boolean;
  hasInsufficientBalance: boolean;
  paymentToken: PaymentToken;
  needsApproval: boolean;
  apePriceUSD: bigint; // APE price from contract (8 decimals)
}

function BallRow({
  ballType,
  quantity,
  onQuantityChange,
  onBuy,
  isDisabled,
  isPurchasePending,
  isApprovalPending,
  hasInsufficientBalance,
  paymentToken,
  needsApproval,
  apePriceUSD,
}: BallRowProps) {
  const name = getBallTypeName(ballType);
  const price = getBallPriceUSD(ballType);
  const catchRate = getCatchRatePercent(ballType);
  // Safe calculation: ensure quantity is a valid number
  const safeQty = Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
  const totalCostUSD = price * safeQty;

  // Contract enforces $49.90 max per transaction (MAX_PURCHASE_USD)
  const MAX_PURCHASE_USD = 49.90;
  const exceedsCap = totalCostUSD > MAX_PURCHASE_USD;

  // Calculate APE equivalent using on-chain price
  const apeAmount = useMemo(() => {
    if (safeQty === 0 || paymentToken !== 'APE') return null;
    try {
      const costWei = calculateTotalCost(ballType, safeQty, true, apePriceUSD);
      // Convert from wei (18 decimals) to human-readable
      return Number(costWei) / 1e18;
    } catch {
      return null;
    }
  }, [ballType, safeQty, paymentToken, apePriceUSD]);

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.trim();
    // Handle empty input gracefully
    if (rawValue === '') {
      onQuantityChange(0);
      return;
    }
    const value = parseInt(rawValue, 10);
    // Clamp to 0-99 range, default to 0 for invalid input
    const safeValue = Number.isFinite(value) && value >= 0
      ? Math.min(value, 99)
      : 0;
    onQuantityChange(safeValue);
  };

  const isPending = isPurchasePending || isApprovalPending;
  const canBuy = safeQty > 0 && !isDisabled && !isPending && !hasInsufficientBalance && !exceedsCap;

  // Inline spinner component for buttons
  const InlineSpinner = ({ color = '#666' }: { color?: string }) => (
    <span
      style={{
        display: 'inline-block',
        width: '10px',
        height: '10px',
        border: `2px solid ${color}33`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        marginRight: '4px',
        verticalAlign: 'middle',
      }}
    />
  );

  // Determine button content based on state
  const getButtonContent = () => {
    if (exceedsCap) {
      return 'Over Cap';
    }
    if (isApprovalPending) {
      return <><InlineSpinner color="#ff8800" />Approving…</>;
    }
    if (isPurchasePending) {
      return <><InlineSpinner color="#00ff00" />Buying…</>;
    }
    if (needsApproval && safeQty > 0) {
      return 'Approve';
    }
    return 'Buy';
  };

  return (
    <div style={styles.ballRow}>
      {/* Ball color indicator */}
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: BALL_COLORS[ballType],
          border: '2px solid #fff',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      />

      {/* Ball info */}
      <div style={styles.ballInfo}>
        <div style={{ ...styles.ballName, color: BALL_COLORS[ballType] }}>{name}</div>
        <div style={styles.ballStats}>
          ${price.toFixed(2)} | {catchRate}% catch
        </div>
      </div>

      {/* Quantity input - shows empty string when 0 for easier editing */}
      <input
        type="number"
        min="0"
        value={quantity === 0 ? '' : quantity}
        onFocus={(e) => {
          // Auto-select if value is 0 so user can just type new number
          if (e.target.value === '0') e.target.select();
        }}
        onChange={handleQuantityChange}
        disabled={isDisabled || isPending}
        style={{
          ...styles.quantityInput,
          opacity: isDisabled || isPending ? 0.5 : 1,
        }}
      />

      {/* Cost display - shows APE amount when using APE, USD when using USDC */}
      <div style={styles.costDisplay}>
        {paymentToken === 'APE' && apeAmount !== null ? (
          <>
            <div style={{ color: exceedsCap ? '#ff4444' : (safeQty > 0 ? '#ffcc00' : '#666') }}>
              ~{apeAmount.toFixed(2)} APE
            </div>
            <div style={{ fontSize: '10px', color: exceedsCap ? '#ff6666' : '#888' }}>
              ≈${totalCostUSD.toFixed(2)}
            </div>
          </>
        ) : (
          <div style={{ color: exceedsCap ? '#ff4444' : (safeQty > 0 ? '#00ff00' : '#666') }}>
            ${totalCostUSD.toFixed(2)}
          </div>
        )}
        {exceedsCap && safeQty > 0 && (
          <div style={{ ...styles.insufficientBalance, color: '#ff4444' }}>
            Max $49.90/tx
          </div>
        )}
        {hasInsufficientBalance && safeQty > 0 && !exceedsCap && (
          <div style={styles.insufficientBalance}>
            Low {paymentToken}
          </div>
        )}
      </div>

      {/* Buy button */}
      <button
        onClick={onBuy}
        disabled={!canBuy}
        style={{
          ...styles.buyButton,
          ...(canBuy ? {} : styles.buyButtonDisabled),
          // Red style for "Over Cap"
          ...(exceedsCap && safeQty > 0
            ? { border: '2px solid #ff4444', color: '#ff4444', backgroundColor: '#2a1515' }
            : {}),
          // Orange style for "Approve" or "Approving..."
          ...((needsApproval || isApprovalPending) && safeQty > 0 && !exceedsCap
            ? { border: '2px solid #ff8800', color: '#ff8800', backgroundColor: '#2a2510' }
            : {}),
        }}
      >
        {getButtonContent()}
      </button>
    </div>
  );
}

// ============================================================
// BUY CRYPTO MODAL SUB-COMPONENT
// ============================================================

type BuyCryptoToken = 'USDC' | 'APE';

interface BuyCryptoModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedToken: BuyCryptoToken;
}

/** Loading fallback for ThirdWeb widget */
function ThirdwebLoadingFallback() {
  return (
    <div style={styles.loadingOverlay}>
      <div style={styles.loadingText}>Loading payment widget...</div>
    </div>
  );
}

/** Error fallback for ThirdWeb widget */
function ThirdwebErrorFallback({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <div style={styles.errorBox}>
      <span style={styles.errorText}>
        {error || 'Failed to load payment widget. Please try again.'}
      </span>
      {onRetry && (
        <button style={styles.dismissButton} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

/** Inner PayEmbed wrapper that requires ThirdwebProvider context */
function PayEmbedWithProvider({
  tokenAddress,
  title,
}: {
  tokenAddress?: string;
  title: string;
}) {
  if (!thirdwebClient) {
    return <ThirdwebErrorFallback error="ThirdWeb client not initialized" />;
  }

  return (
    <LazyThirdwebProvider>
      <LazyPayEmbed
        client={thirdwebClient}
        theme="dark"
        payOptions={{
          mode: 'fund_wallet',
          metadata: {
            name: title,
          },
          prefillBuy: {
            chain: apechain,
            token: tokenAddress
              ? { address: tokenAddress, symbol: 'USDC.e', name: 'USDC.e' }
              : undefined,
          },
        }}
      />
    </LazyThirdwebProvider>
  );
}

function BuyCryptoModal({ isOpen, onClose, selectedToken }: BuyCryptoModalProps) {
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Reset error state when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setWidgetError(null);
    }
  }, [isOpen]);

  const handleError = useCallback((error: Error) => {
    console.error('[BuyCryptoModal] Widget error:', error);
    setWidgetError(error.message || 'Failed to load payment widget');
  }, []);

  const handleRetry = useCallback(() => {
    setWidgetError(null);
    setRetryKey((k) => k + 1);
  }, []);

  if (!isOpen) return null;

  const tokenAddress = selectedToken === 'USDC' ? APECHAIN_TOKENS.USDC : undefined;
  const title = selectedToken === 'USDC' ? 'Buy USDC.e on ApeChain' : 'Buy APE on ApeChain';

  return (
    <div style={styles.buyCryptoModal} onClick={onClose}>
      <div style={styles.buyCryptoModalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.buyCryptoModalHeader}>
          <h3 style={styles.buyCryptoModalTitle}>{title}</h3>
          <button style={styles.buyCryptoCloseButton} onClick={onClose}>
            X
          </button>
        </div>

        {!isThirdwebConfigured() && (
          <div style={styles.notConfiguredBox}>
            <div style={styles.notConfiguredText}>
              ThirdWeb not configured.<br />
              Set VITE_THIRDWEB_CLIENT_ID in .env to enable crypto purchases.
            </div>
          </div>
        )}

        {isThirdwebConfigured() && widgetError && (
          <ThirdwebErrorFallback error={widgetError} onRetry={handleRetry} />
        )}

        {isThirdwebConfigured() && !widgetError && (
          <ThirdwebErrorBoundary
            key={retryKey}
            fallback={<ThirdwebErrorFallback onRetry={handleRetry} />}
            onError={handleError}
          >
            <Suspense fallback={<ThirdwebLoadingFallback />}>
              <PayEmbedWithProvider tokenAddress={tokenAddress} title={title} />
            </Suspense>
          </ThirdwebErrorBoundary>
        )}

        <div style={{ marginTop: '12px', textAlign: 'center' as const }}>
          <div style={{ color: '#888', fontSize: '11px' }}>
            Powered by ThirdWeb Pay
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

// Purchase attempt tracking for diagnostics
interface PurchaseAttempt {
  timestamp: number;
  ballType: BallType;
  quantity: number;
  paymentToken: PaymentToken;
  costUSD: number;
  costAPE?: number;
  error?: string;
  txHash?: string;
}

export function PokeBallShop({ isOpen, onClose, playerAddress }: PokeBallShopProps) {
  // Local state
  const [paymentToken, setPaymentToken] = useState<PaymentToken>('USDC');
  const [quantities, setQuantities] = useState<Record<BallType, number>>({
    0: 0,
    1: 0,
    2: 0,
    3: 0,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [buyCryptoModal, setBuyCryptoModal] = useState<{ isOpen: boolean; token: BuyCryptoToken }>({
    isOpen: false,
    token: 'USDC',
  });
  // New FundingWidget state
  const [fundingModal, setFundingModal] = useState<{ isOpen: boolean; token: FundingToken }>({
    isOpen: false,
    token: 'APE',
  });

  // Purchase tracking for diagnostics (used by AdminDevTools panel)
  const [lastPurchaseAttempt, setLastPurchaseAttempt] = useState<PurchaseAttempt | null>(null);

  // Success state for displaying purchase confirmation
  const [successDetails, setSuccessDetails] = useState<{
    ballType: BallType;
    quantity: number;
    paymentToken: PaymentToken;
    txHash: string;
    costUSD: number;
  } | null>(null);

  // Track processed receipts to prevent duplicate processing
  const processedReceiptRef = useRef<string | null>(null);

  // Hooks
  const { write, isLoading, isPending, error, receipt, reset } = usePurchaseBalls();
  const inventory = usePlayerBallInventory(playerAddress);
  const apeBalance = useApeBalanceWithUsd(playerAddress);
  const usdcBalance = useUsdcBalance(playerAddress);

  // Get APE price from contract for accurate cost calculation (used for tx amounts)
  const { price: apePriceUSD } = useApePriceFromContract();

  // Get real-time APE price from CoinGecko for display purposes
  // The contract's apePriceUSD may be stale, so we show the live market price to users
  const { price: liveApePrice } = useApeUsdPrice();

  // Contract diagnostics for environment sanity checks
  const diagnostics = useContractDiagnostics();

  // dGen1 (EthereumPhone) detection and diagnostics
  const [dgen1Diagnostic, setDgen1Diagnostic] = useState<DGen1Diagnostic | null>(null);
  const isDGen1 = isEthereumPhoneAvailable();

  // Fetch dGen1 diagnostic on mount if on dGen1 device
  useEffect(() => {
    if (isDGen1 && isOpen) {
      getDGen1Diagnostic().then((diag) => {
        setDgen1Diagnostic(diag);
        console.log('[PokeBallShop] dGen1 diagnostic:', diag);
      }).catch((err) => {
        console.error('[PokeBallShop] Failed to get dGen1 diagnostic:', err);
      });
    }
  }, [isDGen1, isOpen]);

  // Calculate required amount for current selection
  // We sum all quantities to get max possible cost for approval
  // Safe: filter out NaN/undefined values before summing
  const totalQuantity = Object.values(quantities).reduce((sum, q) => {
    const safeQ = Number.isFinite(q) ? q : 0;
    return sum + safeQ;
  }, 0);

  const requiredAmount = React.useMemo(() => {
    if (totalQuantity === 0) return BigInt(0);
    // Calculate for the most expensive possible selection to ensure enough approval
    // In practice, we could calculate exact amounts per ball type
    try {
      let total = BigInt(0);
      for (let i = 0; i <= 3; i++) {
        const qty = quantities[i as BallType];
        // Skip invalid quantities - calculateTotalCost also guards, but we skip the call entirely
        if (!Number.isFinite(qty) || qty <= 0) continue;
        total += calculateTotalCost(i as BallType, qty, paymentToken === 'APE', apePriceUSD);
      }
      return total;
    } catch (e) {
      console.error('[PokeBallShop] Error calculating required amount:', e);
      return BigInt(0);
    }
  }, [quantities, paymentToken, apePriceUSD, totalQuantity]);

  // Token approval hooks - check if we need approval before purchase
  const tokenType: TokenType = paymentToken === 'APE' ? 'APE' : 'USDC';
  const {
    allowance,
    isApproved,
    approve,
    isApproving,
    isConfirming: isApprovalConfirming,
    isConfirmed: isApprovalConfirmed,
    error: approvalError,
    refetch: _refetchAllowance,
    dgen1Debug,
  } = useTokenApproval(tokenType, requiredAmount);

  // Debug logging for approval state in shop
  React.useEffect(() => {
    console.log('[PokeBallShop] Approval state:', {
      tokenType,
      requiredAmount: requiredAmount.toString(),
      allowance: allowance.toString(),
      isApproved,
      isApproving,
      isApprovalConfirming,
      isApprovalConfirmed,
    });
  }, [tokenType, requiredAmount, allowance, isApproved, isApproving, isApprovalConfirming, isApprovalConfirmed]);

  // Check if a purchase has sufficient balance
  const hasInsufficientBalance = useCallback(
    (ballType: BallType): boolean => {
      const qty = quantities[ballType];
      // Guard against NaN/invalid quantities
      const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
      if (safeQty === 0) return false;

      const costUsd = getBallPriceUSD(ballType) * safeQty;
      if (costUsd <= 0) return false;

      // For APE, convert USD cost to APE using current price
      if (paymentToken === 'APE') {
        // Use APE USD value if available, otherwise fall back to raw balance comparison
        if (apeBalance.usdValue !== null) {
          return apeBalance.usdValue < costUsd;
        }
        // Fallback: if price not available, use 1:1 estimate
        return apeBalance.balance < costUsd;
      }

      // For USDC, it's direct USD comparison
      return usdcBalance.balance < costUsd;
    },
    [quantities, paymentToken, apeBalance.balance, apeBalance.usdValue, usdcBalance.balance]
  );

  // Handle quantity change
  const handleQuantityChange = useCallback((ballType: BallType, qty: number) => {
    setQuantities((prev) => ({ ...prev, [ballType]: qty }));
  }, []);

  // Handle buy - checks approval for USDC.e only (APE uses native currency, no approval)
  const handleBuy = useCallback(
    (ballType: BallType) => {
      try {
        const rawQty = quantities[ballType];
        // Guard against NaN/invalid quantities
        const qty = Number.isFinite(rawQty) && rawQty > 0 ? Math.floor(rawQty) : 0;
        if (qty <= 0 || !write) return;

        if (hasInsufficientBalance(ballType)) {
          return;
        }

        const useAPE = paymentToken === 'APE';

        // Calculate cost for this specific purchase
        const costForThisPurchase = calculateTotalCost(
          ballType,
          qty,
          useAPE,
          apePriceUSD
        );

        console.log('[PokeBallShop] handleBuy:', {
          ballType,
          qty,
          paymentToken,
          costWei: costForThisPurchase.toString(),
          costFormatted: useAPE
            ? `${Number(costForThisPurchase) / 1e18} APE`
            : `$${Number(costForThisPurchase) / 1e6}`,
          currentAllowance: allowance.toString(),
          isApproved,
          spender: POKEBALL_GAME_ADDRESS,
          note: useAPE ? 'APE uses native currency - no approval needed' : 'USDC.e requires ERC-20 approval',
        });

        // v1.4.0: APE payments use native currency via msg.value - NO approval needed!
        // Only USDC.e requires ERC-20 approval
        if (!useAPE && (!isApproved || allowance < costForThisPurchase)) {
          console.log('[PokeBallShop] USDC.e approval needed! Requesting approval first...');
          approve();
          return;
        }

        // Calculate USD cost for tracking
        const costUSD = getBallPriceUSD(ballType) * qty;
        const costAPE = useAPE ? Number(costForThisPurchase) / 1e18 : undefined;

        // Track purchase attempt for diagnostics
        setLastPurchaseAttempt({
          timestamp: Date.now(),
          ballType,
          quantity: qty,
          paymentToken: paymentToken,
          costUSD,
          costAPE,
        });

        setShowSuccess(false);
        setSuccessDetails(null);
        // Pass APE price for accurate msg.value calculation
        write(ballType, qty, useAPE, apePriceUSD);
      } catch (e) {
        console.error('[PokeBallShop] Error in handleBuy:', e);
      }
    },
    [quantities, write, paymentToken, hasInsufficientBalance, apePriceUSD, allowance, isApproved, approve]
  );

  // Handle dismiss error
  const handleDismissError = useCallback(() => {
    reset();
  }, [reset]);

  // Handle close buy crypto modal (legacy - kept for backward compatibility)
  const handleCloseBuyCrypto = useCallback(() => {
    setBuyCryptoModal((prev) => ({ ...prev, isOpen: false }));
    // Refresh balances after potentially buying crypto
    apeBalance.refetch();
    usdcBalance.refetch();
  }, [apeBalance, usdcBalance]);

  // Handle open funding modal (Bridge/Swap/Buy)
  const handleOpenFunding = useCallback((token: FundingToken) => {
    setFundingModal({ isOpen: true, token });
  }, []);

  // Handle close funding modal
  const handleCloseFunding = useCallback(() => {
    setFundingModal((prev) => ({ ...prev, isOpen: false }));
    // Refresh balances after potentially funding wallet
    apeBalance.refetch();
    usdcBalance.refetch();
  }, [apeBalance, usdcBalance]);

  // Handle funding complete callback
  const handleFundingComplete = useCallback(() => {
    // Refresh balances when user completes a funding transaction
    apeBalance.refetch();
    usdcBalance.refetch();
  }, [apeBalance, usdcBalance]);

  // Show success message when receipt arrives
  useEffect(() => {
    if (receipt && lastPurchaseAttempt) {
      // Guard: Don't process the same receipt twice
      // This prevents quantity reset when user changes other state
      const receiptHash = receipt.transactionHash;
      if (processedReceiptRef.current === receiptHash) {
        return; // Already processed this receipt
      }
      processedReceiptRef.current = receiptHash;

      setShowSuccess(true);

      // Build success details
      setSuccessDetails({
        ballType: lastPurchaseAttempt.ballType,
        quantity: lastPurchaseAttempt.quantity,
        paymentToken: lastPurchaseAttempt.paymentToken,
        txHash: receipt.transactionHash,
        costUSD: lastPurchaseAttempt.costUSD,
      });

      // Update last attempt with result
      setLastPurchaseAttempt(prev => prev ? {
        ...prev,
        txHash: receipt.transactionHash,
      } : null);

      // Reset quantities after successful purchase
      setQuantities({ 0: 0, 1: 0, 2: 0, 3: 0 });
      // Refresh balances, inventory, and diagnostics
      apeBalance.refetch();
      usdcBalance.refetch();
      inventory.refetch(); // Refresh ball inventory so CatchAttemptModal shows updated counts
      diagnostics.refetch();
    }
  }, [receipt, lastPurchaseAttempt, apeBalance, usdcBalance, inventory, diagnostics]);

  // Track errors in purchase attempts
  useEffect(() => {
    if (error && lastPurchaseAttempt) {
      setLastPurchaseAttempt(prev => prev ? {
        ...prev,
        error: error.message,
      } : null);
    }
  }, [error, lastPurchaseAttempt]);

  // Don't render if not open
  if (!isOpen) return null;

  const isTransactionPending = isLoading || isPending;
  const isApprovalPending = isApproving || isApprovalConfirming;
  const isAnyPending = isTransactionPending || isApprovalPending;

  return (
    <div className="modal-overlay" style={styles.overlay} onClick={onClose}>
      <div className="modal-inner modal-scroll" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>POKE BALL SHOP</h2>
          <button
            style={styles.closeButton}
            onClick={onClose}
            disabled={isAnyPending}
          >
            CLOSE
          </button>
        </div>

        {/* Balance Section */}
        <div style={styles.balanceSection}>
          <div style={styles.balanceItem}>
            <span style={styles.balanceLabel}>APE Balance</span>
            <span style={{ ...styles.balanceValue, color: '#ffcc00' }}>
              {apeBalance.isLoading ? (
                <span style={{ opacity: 0.6 }}>...</span>
              ) : apeBalance.isError ? (
                <span style={{ color: '#ff6666' }}>—</span>
              ) : (
                <>
                  {apeBalance.balance.toFixed(2)}
                  {apeBalance.usdValue !== null && (
                    <span style={styles.usdEstimate}>
                      {' '}(~${apeBalance.usdValue.toFixed(2)})
                    </span>
                  )}
                  {apeBalance.isUsdLoading && apeBalance.usdValue === null && (
                    <span style={{ ...styles.usdEstimate, opacity: 0.5 }}> (~$...)</span>
                  )}
                </>
              )}
            </span>
          </div>
          <div style={styles.balanceItem}>
            <span style={styles.balanceLabel}>USDC.e Balance</span>
            <span style={{ ...styles.balanceValue, color: '#00ff00' }}>
              {usdcBalance.isLoading ? (
                <span style={{ opacity: 0.6 }}>...</span>
              ) : usdcBalance.isError ? (
                <span style={{ color: '#ff6666' }}>—</span>
              ) : (
                `$${usdcBalance.balance.toFixed(2)}`
              )}
            </span>
          </div>
        </div>

        {/* Environment Warning Banner - shown when contract config looks unusual */}
        {diagnostics.hasWarnings && !diagnostics.isLoading && (
          <div style={styles.warningBanner}>
            <div style={styles.warningTitle}>⚠️ CONTRACT CONFIG WARNING</div>
            {diagnostics.warnings.map((warning, i) => (
              <div key={i} style={styles.warningText}>• {warning}</div>
            ))}
            <div style={{ ...styles.warningText, color: '#888', marginTop: '4px' }}>
              Purchases may fail. Contact devs if issues persist.
            </div>
          </div>
        )}

        {/* dGen1 Warning Banner - shown when on dGen1 without bundler URL */}
        {isDGen1 && dgen1Diagnostic && !dgen1Diagnostic.hasBundlerUrl && (
          <div style={{
            ...styles.warningBanner,
            backgroundColor: 'rgba(255, 100, 50, 0.15)',
            borderColor: '#ff6432',
          }}>
            <div style={{ ...styles.warningTitle, color: '#ff6432' }}>
              📱 dGen1 CONFIGURATION NEEDED
            </div>
            <div style={styles.warningText}>
              • Bundler RPC URL not configured for ApeChain
            </div>
            <div style={styles.warningText}>
              • Transactions may fail without proper ERC-4337 bundler
            </div>
            <div style={{ ...styles.warningText, color: '#888', marginTop: '4px' }}>
              ChainId: {dgen1Diagnostic.chainId ?? 'unknown'} |
              Provider: {dgen1Diagnostic.providerFlags.isEthereumPhone ? 'ethOS' : 'standard'}
            </div>
          </div>
        )}

        {/* dGen1 Info Banner - shown when on dGen1 with proper config */}
        {isDGen1 && dgen1Diagnostic?.hasBundlerUrl && (
          <div style={{
            backgroundColor: 'rgba(50, 150, 255, 0.1)',
            border: '1px solid #3296ff',
            borderRadius: '4px',
            padding: '8px 12px',
            marginBottom: '12px',
            fontFamily: "'Courier New', monospace",
            fontSize: '10px',
          }}>
            <span style={{ color: '#3296ff' }}>📱 dGen1 detected</span>
            <span style={{ color: '#666', marginLeft: '8px' }}>
              ChainId: {dgen1Diagnostic.chainId} | Bundler: ✓
            </span>
          </div>
        )}

        {/* Fund Wallet Section - Bridge/Swap/Buy */}
        <div style={styles.fundWalletSection}>
          <div style={styles.fundWalletHeader}>
            <span style={styles.fundWalletTitle}>NEED CRYPTO?</span>
            <div style={styles.fundWalletButtons}>
              <button
                style={styles.fundWalletButton}
                onClick={() => handleOpenFunding('APE')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1a3a2a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Get APE
              </button>
              <button
                style={styles.fundWalletButton}
                onClick={() => handleOpenFunding('USDC')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1a3a2a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Get USDC.e
              </button>
            </div>
          </div>
          <div style={styles.fundWalletHint}>
            Bridge from other chains, swap tokens, or buy with card
          </div>
        </div>

        {/* Inventory Section */}
        <div style={styles.inventorySection}>
          <div style={styles.inventoryTitle}>YOUR INVENTORY</div>
          <div style={styles.inventoryGrid}>
            {([0, 1, 2, 3] as BallType[]).map((ballType) => {
              const count =
                ballType === 0
                  ? inventory.pokeBalls
                  : ballType === 1
                  ? inventory.greatBalls
                  : ballType === 2
                  ? inventory.ultraBalls
                  : inventory.masterBalls;

              return (
                <div key={ballType} style={styles.inventoryItem}>
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      backgroundColor: BALL_COLORS[ballType],
                      border: '1px solid #fff',
                    }}
                  />
                  <span style={{ color: BALL_COLORS[ballType], fontSize: '14px' }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Toggle - Clear APE vs USDC.e selection */}
        <div style={styles.paymentToggle}>
          <button
            style={{
              ...styles.toggleButton,
              ...(paymentToken === 'USDC' ? styles.toggleButtonActive : {}),
            }}
            onClick={() => setPaymentToken('USDC')}
            disabled={isAnyPending}
          >
            <span style={{
              display: 'inline-block',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: paymentToken === 'USDC' ? '#00aa00' : '#444',
              marginRight: '6px',
              fontSize: '10px',
            }}>
              USDC.e
            </span>
            {paymentToken === 'USDC' ? '✓ Selected' : 'Stablecoin'}
          </button>
          <button
            style={{
              ...styles.toggleButton,
              ...(paymentToken === 'APE' ? styles.toggleButtonActive : {}),
            }}
            onClick={() => setPaymentToken('APE')}
            disabled={isAnyPending}
          >
            <span style={{
              display: 'inline-block',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: paymentToken === 'APE' ? '#00aa00' : '#444',
              marginRight: '6px',
              fontSize: '10px',
            }}>
              APE
            </span>
            {paymentToken === 'APE' ? '✓ Selected' : 'Native token'}
          </button>
        </div>

        {/* APE Payment Info - v1.4.0 uses native APE with dynamic pricing */}
        {paymentToken === 'APE' && (
          <div style={{ ...styles.loadingOverlay, border: '2px solid #ffcc00', backgroundColor: '#1a2a1a' }}>
            <div style={{ color: '#ffcc00', fontSize: '12px', marginBottom: '4px' }}>
              ✓ APE: No approval needed – pay directly from your wallet
            </div>
            {liveApePrice && (
              <div style={{ color: '#888', fontSize: '10px' }}>
                1 APE ≈ ${liveApePrice.toFixed(4)} USD (live rate)
              </div>
            )}
          </div>
        )}

        {/* USDC.e Payment Info - Show approval requirement upfront */}
        {paymentToken === 'USDC' && !isApprovalPending && !isTransactionPending && (
          <div style={{ ...styles.loadingOverlay, border: '2px solid #00ff00', backgroundColor: '#1a2a1a' }}>
            <div style={{ color: '#00ff00', fontSize: '12px', marginBottom: '4px' }}>
              {isApproved ? '✓ USDC.e approved – ready to purchase' : 'USDC.e: Requires one-time approval first'}
            </div>
            <div style={{ color: '#888', fontSize: '10px' }}>
              {isApproved
                ? 'Click Buy to complete your purchase'
                : 'Click Approve when prompted, then Buy'}
            </div>
          </div>
        )}

        {/* Approval Loading State */}
        {isApprovalPending && (
          <div style={{ ...styles.loadingOverlay, border: '2px solid #4488ff' }}>
            <div style={{ ...styles.loadingText, color: '#4488ff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                border: '2px solid #4488ff33',
                borderTopColor: '#4488ff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              {isApproving ? 'Approving USDC.e…' : 'Confirming approval…'}
            </div>
            <div style={{ color: '#888', fontSize: '11px', marginTop: '6px' }}>
              Check your wallet for the approval request
            </div>
          </div>
        )}

        {/* dGen1 Debug Panel - Visible on-screen debugging since console isn't accessible on device */}
        {isDGen1 && dgen1Debug && (
          <div style={{
            padding: '8px',
            marginBottom: '8px',
            backgroundColor: '#1a1a2e',
            border: '2px solid #ff6600',
            borderRadius: '4px',
            fontSize: '10px',
            fontFamily: 'monospace',
          }}>
            <div style={{ color: '#ff6600', fontWeight: 'bold', marginBottom: '4px' }}>
              dGen1 Debug Panel
            </div>
            <div style={{ color: '#ccc' }}>
              Step: <span style={{ color: '#ffcc00' }}>{dgen1Debug.lastStep}</span>
            </div>
            <div style={{ color: '#ccc' }}>
              Approving: <span style={{ color: dgen1Debug.isApproving ? '#ff4444' : '#44ff44' }}>
                {dgen1Debug.isApproving ? 'YES' : 'NO'}
              </span>
            </div>
            {dgen1Debug.hash && (
              <div style={{ color: '#ccc' }}>
                Hash: <span style={{ color: '#44ff44' }}>{dgen1Debug.hash.slice(0, 10)}...{dgen1Debug.hash.slice(-6)}</span>
              </div>
            )}
            {dgen1Debug.error && (
              <div style={{ color: '#ff4444', wordBreak: 'break-word' }}>
                Error: {dgen1Debug.error}
              </div>
            )}
            {dgen1Debug.providerMethods && (
              <div style={{ color: '#888', marginTop: '4px', fontSize: '9px' }}>
                Provider: {dgen1Debug.providerMethods}
              </div>
            )}
            {dgen1Debug.txParams && (
              <div style={{ color: '#888', marginTop: '4px', fontSize: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '80px', overflow: 'auto' }}>
                <span style={{ color: '#ff6600' }}>txParams:</span> {dgen1Debug.txParams}
              </div>
            )}
            <div style={{ color: '#888', marginTop: '4px', fontSize: '9px' }}>
              isApproved: {isApproved ? 'YES' : 'NO'} | isApprovalConfirming: {isApprovalConfirming ? 'YES' : 'NO'}
            </div>
          </div>
        )}

        {/* Purchase Loading State */}
        {isTransactionPending && !isApprovalPending && (
          <div style={styles.loadingOverlay}>
            <div style={{ ...styles.loadingText, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                border: '2px solid #ffcc0033',
                borderTopColor: '#ffcc00',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              Purchasing balls…
            </div>
            <div style={{ color: '#888', fontSize: '11px', marginTop: '6px' }}>
              Confirm the transaction in your wallet
            </div>
          </div>
        )}

        {/* Ball List */}
        <div style={styles.ballList}>
          {([0, 1, 2, 3] as BallType[]).map((ballType) => (
            <BallRow
              key={ballType}
              ballType={ballType}
              quantity={quantities[ballType]}
              onQuantityChange={(qty) => handleQuantityChange(ballType, qty)}
              onBuy={() => handleBuy(ballType)}
              isDisabled={!playerAddress || !write}
              isPurchasePending={isTransactionPending}
              isApprovalPending={isApprovalPending}
              hasInsufficientBalance={hasInsufficientBalance(ballType)}
              paymentToken={paymentToken}
              needsApproval={paymentToken === 'USDC' && !isApproved && quantities[ballType] > 0}
              apePriceUSD={apePriceUSD}
            />
          ))}
        </div>

        {/* Enhanced Success Message */}
        {showSuccess && successDetails && (
          <div style={styles.successBoxEnhanced}>
            <div style={styles.successTitle}>
              ✓ {getBallTypeName(successDetails.ballType)} x{successDetails.quantity} purchased with {successDetails.paymentToken}!
            </div>
            <div style={styles.successDetails}>
              Cost: ${successDetails.costUSD.toFixed(2)}
            </div>
            <div style={styles.successDetails}>
              <a
                href={`https://apescan.io/tx/${successDetails.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.successLink}
              >
                View on Apescan →
              </a>
            </div>
          </div>
        )}
        {/* Fallback for legacy success without details */}
        {showSuccess && !successDetails && receipt && (
          <div style={styles.successBox}>
            <div style={styles.successText}>Purchase successful!</div>
            <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
              TX: {receipt.transactionHash.slice(0, 10)}...
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorText}>
              {error.message.length > 100
                ? `${error.message.slice(0, 100)}...`
                : error.message}
            </span>
            <button style={styles.dismissButton} onClick={handleDismissError}>
              Dismiss
            </button>
          </div>
        )}

        {/* Approval Error Display */}
        {approvalError && (
          <div style={styles.errorBox}>
            <span style={styles.errorText}>
              Approval failed: {approvalError.message.length > 80
                ? `${approvalError.message.slice(0, 80)}...`
                : approvalError.message}
            </span>
          </div>
        )}

        {/* No wallet connected warning */}
        {!playerAddress && (
          <div style={{ ...styles.errorBox, border: '2px solid #ffcc00' }}>
            <span style={{ color: '#ffcc00', fontSize: '12px' }}>
              Connect your wallet to purchase balls
            </span>
          </div>
        )}
      </div>

      {/* Buy Crypto Modal (legacy - kept for backward compatibility) */}
      <BuyCryptoModal
        isOpen={buyCryptoModal.isOpen}
        onClose={handleCloseBuyCrypto}
        selectedToken={buyCryptoModal.token}
      />

      {/* Funding Widget - Bridge/Swap/Buy */}
      <FundingWidget
        isOpen={fundingModal.isOpen}
        onClose={handleCloseFunding}
        defaultToken={fundingModal.token}
        onFundingComplete={handleFundingComplete}
      />
    </div>
  );
}

export default PokeBallShop;
