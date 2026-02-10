/**
 * PokeBallShop Component (Solana)
 *
 * Modal component for purchasing PokeBalls with SolBalls tokens.
 * Displays ball types, prices, catch rates, and player inventory.
 *
 * Solana version: Direct SPL token transfer via Anchor program (~$0.001 fee).
 * Replaces the EVM dual-currency (APE/USDC.e) flow with SolBalls-only payments.
 * No ERC-20 approval step — SPL token transfers are owner-signed.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  usePurchaseBalls,
  usePlayerInventory,
  useSolBallsBalance,
  getBallTypeName,
  getCatchRatePercent,
  DEFAULT_BALL_PRICES,
  SOLBALLS_DECIMALS,
  type BallType,
} from '../../hooks/solana';
import { SwapWidget } from '../SwapWidget';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface PokeBallShopProps {
  isOpen: boolean;
  onClose: () => void;
  playerAddress?: string;
}

// ============================================================
// STYLES (Inline pixel art aesthetic)
// ============================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1a1a1a', border: '4px solid #fff', padding: '16px',
    maxWidth: 'min(600px, calc(100vw - 32px))', width: '100%',
    maxHeight: '90vh', overflowY: 'auto' as const, overflowX: 'hidden' as const,
    fontFamily: "'Courier New', monospace", color: '#fff',
    imageRendering: 'pixelated' as const, boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '12px', borderBottom: '2px solid #444', paddingBottom: '10px',
    flexWrap: 'wrap' as const, gap: '8px',
  },
  title: { fontSize: '20px', fontWeight: 'bold', color: '#ffcc00', margin: 0 },
  closeButton: {
    background: 'none', border: '2px solid #ff4444', color: '#ff4444',
    padding: '6px 10px', cursor: 'pointer', fontFamily: "'Courier New', monospace",
    fontSize: '12px', flexShrink: 0,
  },
  balanceSection: {
    display: 'flex', gap: '12px', marginBottom: '12px', padding: '10px',
    backgroundColor: '#2a2a2a', border: '2px solid #444',
    flexWrap: 'wrap' as const, boxSizing: 'border-box' as const,
  },
  balanceItem: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  balanceLabel: { fontSize: '12px', color: '#888' },
  balanceValue: { fontSize: '16px', fontWeight: 'bold' },
  inventorySection: {
    marginBottom: '12px', padding: '10px', backgroundColor: '#2a2a2a',
    border: '2px solid #444', boxSizing: 'border-box' as const,
  },
  inventoryTitle: { fontSize: '14px', color: '#888', marginBottom: '8px' },
  inventoryGrid: { display: 'flex', gap: '16px', flexWrap: 'wrap' as const },
  inventoryItem: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '4px',
  },
  ballList: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  ballRow: {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px',
    backgroundColor: '#2a2a2a', border: '2px solid #444',
    flexWrap: 'wrap' as const, boxSizing: 'border-box' as const,
  },
  ballInfo: { flex: '1 1 80px', minWidth: '80px' },
  ballName: { fontSize: '14px', fontWeight: 'bold', marginBottom: '2px' },
  ballStats: { fontSize: '11px', color: '#888' },
  quantityInput: {
    width: '50px', padding: '6px', border: '2px solid #444',
    backgroundColor: '#1a1a1a', color: '#fff', fontFamily: "'Courier New', monospace",
    fontSize: '13px', textAlign: 'center' as const, flexShrink: 0,
    boxSizing: 'border-box' as const,
  },
  costDisplay: {
    width: '80px', minWidth: '80px', textAlign: 'right' as const,
    fontSize: '12px', flexShrink: 0,
  },
  buyButton: {
    padding: '8px 12px', border: '2px solid #00ff00', backgroundColor: '#1a3a1a',
    color: '#00ff00', cursor: 'pointer', fontFamily: "'Courier New', monospace",
    fontSize: '12px', minWidth: '70px', flexShrink: 0, boxSizing: 'border-box' as const,
  },
  buyButtonDisabled: {
    border: '2px solid #444', backgroundColor: '#2a2a2a', color: '#666', cursor: 'not-allowed',
  },
  insufficientBalance: { color: '#ff4444', fontSize: '11px', marginTop: '4px' },
  loadingOverlay: {
    padding: '12px', backgroundColor: '#2a2a2a', border: '2px solid #ffcc00',
    textAlign: 'center' as const, marginBottom: '12px', boxSizing: 'border-box' as const,
  },
  loadingText: { color: '#ffcc00', fontSize: '14px' },
  errorBox: {
    padding: '10px', backgroundColor: '#3a1a1a', border: '2px solid #ff4444',
    marginTop: '12px', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', flexWrap: 'wrap' as const, gap: '8px',
    boxSizing: 'border-box' as const,
  },
  errorText: {
    color: '#ff4444', fontSize: '11px', flex: '1 1 auto', wordBreak: 'break-word' as const,
  },
  dismissButton: {
    padding: '4px 8px', border: '2px solid #ff4444', backgroundColor: 'transparent',
    color: '#ff4444', cursor: 'pointer', fontFamily: "'Courier New', monospace",
    fontSize: '11px', flexShrink: 0,
  },
  successBox: {
    padding: '12px', backgroundColor: '#1a3a1a', border: '2px solid #00ff00',
    marginTop: '12px', boxSizing: 'border-box' as const,
  },
  successTitle: {
    color: '#00ff00', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px',
  },
  successDetails: { color: '#888', fontSize: '11px', marginTop: '4px' },
  successLink: { color: '#4488ff', textDecoration: 'none', fontSize: '11px' },
  getSolballsSection: {
    marginBottom: '12px', padding: '10px', backgroundColor: '#1a2a2a',
    border: '2px solid #00ff88', boxSizing: 'border-box' as const,
  },
  getSolballsTitle: { fontSize: '13px', color: '#00ff88', fontWeight: 'bold' },
  getSolballsHint: { fontSize: '11px', color: '#888', marginTop: '4px' },
};

const BALL_COLORS: Record<BallType, string> = {
  0: '#ff4444',
  1: '#4488ff',
  2: '#ffcc00',
  3: '#aa44ff',
};

// Add spinner animation
if (typeof document !== 'undefined' && !document.getElementById('pokeball-shop-spinner-styles')) {
  const styleTag = document.createElement('style');
  styleTag.id = 'pokeball-shop-spinner-styles';
  styleTag.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
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
  hasInsufficientBalance: boolean;
}

function BallRow({
  ballType, quantity, onQuantityChange, onBuy,
  isDisabled, isPurchasePending, hasInsufficientBalance,
}: BallRowProps) {
  const name = getBallTypeName(ballType);
  const pricePerBall = DEFAULT_BALL_PRICES[ballType] / Math.pow(10, SOLBALLS_DECIMALS);
  const catchRate = getCatchRatePercent(ballType);
  const safeQty = Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
  const totalCost = pricePerBall * safeQty;

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.trim();
    if (rawValue === '') { onQuantityChange(0); return; }
    const value = parseInt(rawValue, 10);
    const safeValue = Number.isFinite(value) && value >= 0 ? Math.min(value, 99) : 0;
    onQuantityChange(safeValue);
  };

  const canBuy = safeQty > 0 && !isDisabled && !isPurchasePending && !hasInsufficientBalance;

  const InlineSpinner = () => (
    <span style={{
      display: 'inline-block', width: '10px', height: '10px',
      border: '2px solid #00ff0033', borderTopColor: '#00ff00', borderRadius: '50%',
      animation: 'spin 0.8s linear infinite', marginRight: '4px', verticalAlign: 'middle',
    }} />
  );

  return (
    <div style={styles.ballRow}>
      <div style={{
        width: '16px', height: '16px', borderRadius: '50%',
        backgroundColor: BALL_COLORS[ballType], border: '2px solid #fff',
        flexShrink: 0, boxSizing: 'border-box',
      }} />
      <div style={styles.ballInfo}>
        <div style={{ ...styles.ballName, color: BALL_COLORS[ballType] }}>{name}</div>
        <div style={styles.ballStats}>
          {pricePerBall} SolBalls | {catchRate}% catch
        </div>
      </div>
      <input
        type="number" min="0"
        value={quantity === 0 ? '' : quantity}
        onFocus={(e) => { if (e.target.value === '0') e.target.select(); }}
        onChange={handleQuantityChange}
        disabled={isDisabled || isPurchasePending}
        style={{ ...styles.quantityInput, opacity: isDisabled || isPurchasePending ? 0.5 : 1 }}
      />
      <div style={styles.costDisplay}>
        <div style={{ color: safeQty > 0 ? '#00ff00' : '#666' }}>
          {totalCost > 0 ? `${totalCost.toLocaleString()} SB` : '—'}
        </div>
        {hasInsufficientBalance && safeQty > 0 && (
          <div style={styles.insufficientBalance}>Low balance</div>
        )}
      </div>
      <button
        onClick={onBuy} disabled={!canBuy}
        style={{ ...styles.buyButton, ...(canBuy ? {} : styles.buyButtonDisabled) }}
      >
        {isPurchasePending ? <><InlineSpinner />Buying…</> : 'Buy'}
      </button>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface SuccessDetails {
  ballType: BallType;
  quantity: number;
  txSignature: string;
}

export function PokeBallShop({ isOpen, onClose, playerAddress }: PokeBallShopProps) {
  const [quantities, setQuantities] = useState<Record<BallType, number>>({ 0: 0, 1: 0, 2: 0, 3: 0 });
  const [successDetails, setSuccessDetails] = useState<SuccessDetails | null>(null);
  const [showSwap, setShowSwap] = useState(false);
  const processedTxRef = useRef<string | null>(null);

  // Solana hooks
  const { purchaseBalls, isLoading, isPending, error, reset, txSignature } = usePurchaseBalls();
  const inventory = usePlayerInventory();
  const { balance: solBallsBalance, isLoading: isBalanceLoading } = useSolBallsBalance();

  // Check insufficient balance for a ball type
  const hasInsufficientBalance = useCallback(
    (ballType: BallType): boolean => {
      const qty = quantities[ballType];
      const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
      if (safeQty === 0) return false;
      const costAtomic = DEFAULT_BALL_PRICES[ballType] * safeQty;
      const costDisplay = costAtomic / Math.pow(10, SOLBALLS_DECIMALS);
      return solBallsBalance < costDisplay;
    },
    [quantities, solBallsBalance]
  );

  const handleQuantityChange = useCallback((ballType: BallType, qty: number) => {
    setQuantities(prev => ({ ...prev, [ballType]: qty }));
  }, []);

  const handleBuy = useCallback(
    async (ballType: BallType) => {
      const rawQty = quantities[ballType];
      const qty = Number.isFinite(rawQty) && rawQty > 0 ? Math.floor(rawQty) : 0;
      if (qty <= 0 || !purchaseBalls) return;
      if (hasInsufficientBalance(ballType)) return;

      setSuccessDetails(null);

      try {
        await purchaseBalls(ballType, qty);
      } catch (e) {
        console.error('[PokeBallShop] purchaseBalls error:', e);
      }
    },
    [quantities, purchaseBalls, hasInsufficientBalance]
  );

  const handleDismissError = useCallback(() => { reset(); }, [reset]);

  // Show success when tx completes
  useEffect(() => {
    if (txSignature && !error) {
      if (processedTxRef.current === txSignature) return;
      processedTxRef.current = txSignature;

      // Find which ball was being purchased (use the one with qty > 0)
      const purchasedBall = ([0, 1, 2, 3] as BallType[]).find(bt => quantities[bt] > 0);
      if (purchasedBall !== undefined) {
        setSuccessDetails({
          ballType: purchasedBall,
          quantity: quantities[purchasedBall],
          txSignature,
        });
        setQuantities({ 0: 0, 1: 0, 2: 0, 3: 0 });
      }
    }
  }, [txSignature, error, quantities]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      reset();
      setSuccessDetails(null);
      processedTxRef.current = null;
    }
  }, [isOpen, reset]);

  if (!isOpen) return null;

  const isTransactionPending = isLoading || isPending;

  return (
    <div className="modal-overlay" style={styles.overlay} onClick={onClose}>
      <div className="modal-inner modal-scroll" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>POKE BALL SHOP</h2>
          <button style={styles.closeButton} onClick={onClose} disabled={isTransactionPending}>
            CLOSE
          </button>
        </div>

        {/* Balance Section */}
        <div style={styles.balanceSection}>
          <div style={styles.balanceItem}>
            <span style={styles.balanceLabel}>SolBalls Balance</span>
            <span style={{ ...styles.balanceValue, color: '#00ff88' }}>
              {isBalanceLoading ? (
                <span style={{ opacity: 0.6 }}>...</span>
              ) : (
                `${solBallsBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} SB`
              )}
            </span>
          </div>
        </div>

        {/* Get SolBalls Section */}
        <div style={styles.getSolballsSection}>
          <span style={styles.getSolballsTitle}>NEED SOLBALLS?</span>
          <div style={styles.getSolballsHint}>
            Swap SOL or other tokens for SolBalls using Jupiter.
          </div>
          <button
            onClick={() => setShowSwap(true)}
            style={{
              marginTop: '8px',
              padding: '10px 20px',
              backgroundColor: '#1a2a1a',
              border: '2px solid #00ff88',
              color: '#00ff88',
              cursor: 'pointer',
              fontFamily: "'Courier New', monospace",
              fontSize: '13px',
              fontWeight: 'bold',
              width: '100%',
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#1a3a1a'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#1a2a1a'; }}
          >
            SWAP FOR SOLBALLS
          </button>
        </div>

        {/* Jupiter Swap Widget */}
        <SwapWidget isOpen={showSwap} onClose={() => setShowSwap(false)} />

        {/* Inventory Section */}
        <div style={styles.inventorySection}>
          <div style={styles.inventoryTitle}>YOUR INVENTORY</div>
          <div style={styles.inventoryGrid}>
            {([0, 1, 2, 3] as BallType[]).map((ballType) => {
              const count = ballType === 0 ? inventory.pokeBalls
                : ballType === 1 ? inventory.greatBalls
                : ballType === 2 ? inventory.ultraBalls
                : inventory.masterBalls;
              return (
                <div key={ballType} style={styles.inventoryItem}>
                  <div style={{
                    width: '14px', height: '14px', borderRadius: '50%',
                    backgroundColor: BALL_COLORS[ballType], border: '1px solid #fff',
                  }} />
                  <span style={{ color: BALL_COLORS[ballType], fontSize: '14px' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Info */}
        {!isTransactionPending && (
          <div style={{ ...styles.loadingOverlay, border: '2px solid #00ff88', backgroundColor: '#1a2a1a' }}>
            <div style={{ color: '#00ff88', fontSize: '12px', marginBottom: '4px' }}>
              Pay with SolBalls — no approval needed
            </div>
            <div style={{ color: '#888', fontSize: '10px' }}>
              Transactions cost ~0.001 SOL in network fees
            </div>
          </div>
        )}

        {/* Purchase Loading State */}
        {isTransactionPending && (
          <div style={styles.loadingOverlay}>
            <div style={{ ...styles.loadingText, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span style={{
                display: 'inline-block', width: '14px', height: '14px',
                border: '2px solid #ffcc0033', borderTopColor: '#ffcc00', borderRadius: '50%',
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
              isDisabled={!playerAddress || !purchaseBalls}
              isPurchasePending={isTransactionPending}
              hasInsufficientBalance={hasInsufficientBalance(ballType)}
            />
          ))}
        </div>

        {/* Success Message */}
        {successDetails && (
          <div style={styles.successBox}>
            <div style={styles.successTitle}>
              {getBallTypeName(successDetails.ballType)} x{successDetails.quantity} purchased!
            </div>
            <div style={styles.successDetails}>
              <a
                href={`https://explorer.solana.com/tx/${successDetails.txSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.successLink}
              >
                View on Solana Explorer →
              </a>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorText}>
              {error.message.length > 100 ? `${error.message.slice(0, 100)}...` : error.message}
            </span>
            <button style={styles.dismissButton} onClick={handleDismissError}>Dismiss</button>
          </div>
        )}

        {/* No wallet warning */}
        {!playerAddress && (
          <div style={{ ...styles.errorBox, border: '2px solid #ffcc00' }}>
            <span style={{ color: '#ffcc00', fontSize: '12px' }}>
              Connect your wallet to purchase balls
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default PokeBallShop;
