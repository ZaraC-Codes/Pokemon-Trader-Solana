/**
 * OperatorDashboard Component
 *
 * Owner-only dashboard for monitoring PokeballGame v1.8.0 and SlabNFTManager v2.4.0
 * operational health, APE reserves, and contract diagnostics.
 *
 * v1.8.0/v2.4.0 Features:
 * - APE reserve monitoring for both contracts (Entropy fees, gas costs)
 * - USDC.e pool status with auto-purchase eligibility
 * - Treasury accumulated fees tracking
 * - Health status indicators with warnings
 * - CLI command suggestions for common operations
 *
 * Access:
 * - Visible only when connected wallet is the owner
 * - Toggle via F4 key or "Operator" button in dev mode
 *
 * Usage:
 * ```tsx
 * import { OperatorDashboard } from './components/OperatorDashboard';
 *
 * {isOwner && (
 *   <OperatorDashboard
 *     isOpen={showDashboard}
 *     onClose={() => setShowDashboard(false)}
 *   />
 * )}
 * ```
 */

import React, { useCallback, useState } from 'react';
import { useContractDiagnostics, POKEBALL_GAME_ADDRESS } from '../../hooks/pokeballGame';
import { SLAB_NFT_MANAGER_ADDRESS } from '../../services/slabNFTManagerConfig';
import { getTransactionUrl, getAddressUrl } from '../../services/pokeballGameConfig';

// ============================================================
// TOAST NOTIFICATION FOR COPY FEEDBACK
// ============================================================

interface ToastState {
  visible: boolean;
  message: string;
}

function useToast() {
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '' });

  const showToast = useCallback((message: string) => {
    setToast({ visible: true, message });
    setTimeout(() => {
      setToast({ visible: false, message: '' });
    }, 2000);
  }, []);

  return { toast, showToast };
}

// ============================================================
// CONSTANTS
// ============================================================

const OWNER_ADDRESS = '0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06' as const;

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface OperatorDashboardProps {
  /** Is the dashboard open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Connected wallet address */
  connectedAddress?: `0x${string}`;
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
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: '20px',
  },
  modal: {
    backgroundColor: '#0a1a0a',
    border: '3px solid #00ff88',
    maxWidth: '800px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    fontFamily: "'Courier New', monospace",
    color: '#fff',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '2px solid #00ff88',
    background: 'linear-gradient(180deg, rgba(0, 255, 136, 0.15) 0%, transparent 100%)',
  },
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#00ff88',
    margin: 0,
  },
  subtitle: {
    fontSize: '11px',
    color: '#888',
    marginTop: '4px',
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: '2px solid #ff4444',
    color: '#ff4444',
    cursor: 'pointer',
    padding: '6px 12px',
    fontSize: '12px',
    fontFamily: "'Courier New', monospace",
  },
  body: {
    padding: '20px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: '16px',
  },
  section: {
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    border: '1px solid #333',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#00ff88',
    marginBottom: '12px',
    borderBottom: '1px solid #333',
    paddingBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusBadge: {
    padding: '2px 8px',
    fontSize: '10px',
    borderRadius: '2px',
    fontWeight: 'bold',
  },
  healthyBadge: {
    backgroundColor: 'rgba(0, 255, 0, 0.2)',
    border: '1px solid #00ff00',
    color: '#00ff00',
  },
  warningBadge: {
    backgroundColor: 'rgba(255, 204, 0, 0.2)',
    border: '1px solid #ffcc00',
    color: '#ffcc00',
  },
  criticalBadge: {
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    border: '1px solid #ff4444',
    color: '#ff4444',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #222',
  },
  statLabel: {
    color: '#888',
    fontSize: '12px',
  },
  statValue: {
    fontSize: '12px',
    fontWeight: 'bold',
  },
  healthyValue: {
    color: '#00ff00',
  },
  warningValue: {
    color: '#ffcc00',
  },
  criticalValue: {
    color: '#ff4444',
  },
  neutralValue: {
    color: '#00ccff',
  },
  cliSection: {
    marginTop: '20px',
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    border: '1px solid #444',
  },
  cliTitle: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '12px',
  },
  cliCommand: {
    padding: '8px 12px',
    backgroundColor: '#000',
    border: '1px solid #333',
    color: '#00ff88',
    fontSize: '11px',
    marginBottom: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    wordBreak: 'break-all' as const,
  },
  cliDescription: {
    color: '#666',
    fontSize: '10px',
    marginLeft: '8px',
  },
  copyIcon: {
    color: '#666',
    marginLeft: '8px',
    flexShrink: 0,
  },
  warningBox: {
    padding: '12px',
    backgroundColor: 'rgba(255, 204, 0, 0.1)',
    border: '1px solid #ffcc00',
    marginTop: '16px',
  },
  warningText: {
    color: '#ffcc00',
    fontSize: '11px',
    marginBottom: '4px',
  },
  addressLink: {
    color: '#00ccff',
    textDecoration: 'none',
    fontSize: '10px',
  },
  refreshButton: {
    padding: '4px 10px',
    backgroundColor: 'transparent',
    border: '1px solid #00ff88',
    color: '#00ff88',
    cursor: 'pointer',
    fontSize: '10px',
    fontFamily: "'Courier New', monospace",
  },
  toast: {
    position: 'fixed' as const,
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 20px',
    backgroundColor: 'rgba(0, 255, 136, 0.95)',
    color: '#000',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    zIndex: 9999,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  },
  loadingSpinner: {
    display: 'inline-block',
    width: '12px',
    height: '12px',
    border: '2px solid #00ff8833',
    borderTopColor: '#00ff88',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginRight: '6px',
    verticalAlign: 'middle',
  },
};

// Add keyframe animation for spinners (only once)
if (typeof document !== 'undefined' && !document.getElementById('operator-dashboard-spinner-styles')) {
  const styleTag = document.createElement('style');
  styleTag.id = 'operator-dashboard-spinner-styles';
  styleTag.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleTag);
}

// ============================================================
// HELPER COMPONENTS
// ============================================================

interface StatRowProps {
  label: string;
  value: string | number;
  status?: 'healthy' | 'warning' | 'critical' | 'neutral';
  suffix?: string;
}

function StatRow({ label, value, status = 'neutral', suffix }: StatRowProps) {
  const valueStyle = {
    ...styles.statValue,
    ...(status === 'healthy' ? styles.healthyValue :
       status === 'warning' ? styles.warningValue :
       status === 'critical' ? styles.criticalValue :
       styles.neutralValue),
  };

  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={valueStyle}>
        {value}{suffix && <span style={{ color: '#666', fontWeight: 'normal' }}> {suffix}</span>}
      </span>
    </div>
  );
}

interface CLICommandProps {
  command: string;
  description: string;
  onCopy?: (command: string) => void;
}

function CLICommand({ command, description, onCopy }: CLICommandProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopy?.(command);
  }, [command, onCopy]);

  return (
    <div
      style={{
        ...styles.cliCommand,
        ...(copied ? { borderColor: '#00ff88', backgroundColor: 'rgba(0, 255, 136, 0.1)' } : {}),
      }}
      onClick={handleCopy}
      title="Click to copy"
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <code style={{ wordBreak: 'break-all' }}>{command}</code>
        <span style={styles.cliDescription}>– {description}</span>
      </span>
      <span style={{ ...styles.copyIcon, color: copied ? '#00ff88' : '#666' }}>
        {copied ? '✓' : '📋'}
      </span>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function OperatorDashboard({
  isOpen,
  onClose,
  connectedAddress,
}: OperatorDashboardProps) {
  // Toast notification for copy feedback
  const { toast, showToast } = useToast();

  // Get diagnostics from the shared hook
  const diagnostics = useContractDiagnostics();

  // Check if connected wallet is the owner
  const isOwner = connectedAddress?.toLowerCase() === OWNER_ADDRESS.toLowerCase();

  if (!isOpen) return null;

  // Don't show if not owner
  if (!isOwner) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={{ ...styles.modal, maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            <h2 style={styles.title}>Access Denied</h2>
            <button style={styles.closeButton} onClick={onClose}>CLOSE</button>
          </div>
          <div style={styles.body}>
            <p style={{ color: '#ff4444', fontSize: '14px' }}>
              This dashboard is only accessible to the contract owner.
            </p>
            <p style={{ color: '#888', fontSize: '12px', marginTop: '12px' }}>
              Connected: {connectedAddress ? `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}` : 'Not connected'}
            </p>
            <p style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
              Required: {OWNER_ADDRESS.slice(0, 6)}...{OWNER_ADDRESS.slice(-4)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const {
    pokeballGameApeReserve,
    slabNFTManagerApeReserve,
    slabNFTManagerUsdcPool,
    treasuryUsdcFeesFormatted,
    apePriceFormatted,
    inventoryCount,
    maxInventorySize,
    canAutoPurchase,
    hasOperatorWarnings,
    operatorWarnings,
    isLoading,
    refetch,
  } = diagnostics;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Operator Dashboard</h2>
            <p style={styles.subtitle}>
              PokeballGame v1.8.0 | SlabNFTManager v2.4.0
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button style={styles.refreshButton} onClick={refetch} disabled={isLoading}>
              {isLoading ? (
                <>
                  <span style={styles.loadingSpinner} />
                  Refreshing…
                </>
              ) : 'Refresh'}
            </button>
            <button style={styles.closeButton} onClick={onClose}>CLOSE</button>
          </div>
        </div>

        {/* Body */}
        <div style={styles.body}>
          <div style={styles.grid}>
            {/* PokeballGame APE Reserve */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                PokeballGame APE Reserve
                <span style={{
                  ...styles.statusBadge,
                  ...(pokeballGameApeReserve.status === 'healthy' ? styles.healthyBadge :
                     pokeballGameApeReserve.status === 'low' ? styles.warningBadge :
                     styles.criticalBadge),
                }}>
                  {pokeballGameApeReserve.status.toUpperCase()}
                </span>
              </h3>
              <StatRow
                label="APE Balance"
                value={pokeballGameApeReserve.formatted}
                status={pokeballGameApeReserve.isHealthy ? 'healthy' : 'warning'}
                suffix="APE"
              />
              <StatRow
                label="Throws Remaining"
                value={pokeballGameApeReserve.throwsRemaining}
                status={pokeballGameApeReserve.throwsRemaining > 10 ? 'healthy' : 'warning'}
                suffix="@ ~0.073 APE/throw"
              />
              <StatRow
                label="Minimum Required"
                value="0.5000"
                status="neutral"
                suffix="APE"
              />
              <div style={{ marginTop: '8px' }}>
                <a
                  href={getAddressUrl(POKEBALL_GAME_ADDRESS || '')}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.addressLink}
                >
                  View on Apescan →
                </a>
              </div>
            </div>

            {/* SlabNFTManager APE Reserve */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                SlabNFTManager APE Reserve
                <span style={{
                  ...styles.statusBadge,
                  ...(slabNFTManagerApeReserve.status === 'healthy' ? styles.healthyBadge :
                     slabNFTManagerApeReserve.status === 'low' ? styles.warningBadge :
                     styles.criticalBadge),
                }}>
                  {slabNFTManagerApeReserve.status.toUpperCase()}
                </span>
              </h3>
              <StatRow
                label="APE Balance"
                value={slabNFTManagerApeReserve.formatted}
                status={slabNFTManagerApeReserve.isHealthy ? 'healthy' : 'warning'}
                suffix="APE"
              />
              <StatRow
                label="Auto-Purchases"
                value={slabNFTManagerApeReserve.throwsRemaining}
                status={slabNFTManagerApeReserve.throwsRemaining > 5 ? 'healthy' : 'warning'}
                suffix="available"
              />
              <StatRow
                label="Minimum Required"
                value="0.5000"
                status="neutral"
                suffix="APE"
              />
              <div style={{ marginTop: '8px' }}>
                <a
                  href={getAddressUrl(SLAB_NFT_MANAGER_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.addressLink}
                >
                  View on Apescan →
                </a>
              </div>
            </div>

            {/* USDC.e NFT Pool */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                USDC.e NFT Pool
                <span style={{
                  ...styles.statusBadge,
                  ...(slabNFTManagerUsdcPool.status === 'eligible' ? styles.healthyBadge : styles.warningBadge),
                }}>
                  {slabNFTManagerUsdcPool.canAutoPurchase ? 'AUTO-BUY READY' : 'BELOW THRESHOLD'}
                </span>
              </h3>
              <StatRow
                label="Pool Balance"
                value={`$${slabNFTManagerUsdcPool.formattedAmount}`}
                status={slabNFTManagerUsdcPool.canAutoPurchase ? 'healthy' : 'warning'}
              />
              <StatRow
                label="Auto-Purchase Threshold"
                value="$51.00"
                status="neutral"
              />
              <StatRow
                label="Purchases Available"
                value={slabNFTManagerUsdcPool.purchasesAvailable}
                status={slabNFTManagerUsdcPool.purchasesAvailable > 0 ? 'healthy' : 'warning'}
              />
            </div>

            {/* NFT Inventory & Treasury */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                Inventory & Treasury
                <span style={{
                  ...styles.statusBadge,
                  ...(inventoryCount > 0 && inventoryCount < maxInventorySize ? styles.healthyBadge :
                     inventoryCount === 0 ? styles.criticalBadge : styles.warningBadge),
                }}>
                  {inventoryCount}/{maxInventorySize} NFTs
                </span>
              </h3>
              <StatRow
                label="NFT Inventory"
                value={`${inventoryCount}/${maxInventorySize}`}
                status={inventoryCount > 0 ? (inventoryCount >= maxInventorySize ? 'warning' : 'healthy') : 'critical'}
              />
              <StatRow
                label="Can Auto-Purchase"
                value={canAutoPurchase ? 'YES' : 'NO'}
                status={canAutoPurchase ? 'healthy' : 'warning'}
              />
              <StatRow
                label="Treasury Fees (3%)"
                value={`$${treasuryUsdcFeesFormatted}`}
                status="neutral"
              />
              <StatRow
                label="APE Price (on-chain)"
                value={`$${apePriceFormatted.toFixed(4)}`}
                status="neutral"
              />
            </div>
          </div>

          {/* Operator Warnings */}
          {hasOperatorWarnings && (
            <div style={styles.warningBox}>
              <h4 style={{ color: '#ffcc00', fontSize: '12px', marginBottom: '8px' }}>
                ⚠️ Operator Warnings
              </h4>
              {operatorWarnings.map((warning, index) => (
                <p key={index} style={styles.warningText}>• {warning}</p>
              ))}
            </div>
          )}

          {/* CLI Commands Section */}
          <div style={styles.cliSection}>
            <h4 style={styles.cliTitle}>Hardhat Task Commands (click to copy)</h4>
            <CLICommand
              command="npx hardhat checkReserves --network apechain"
              description="View all reserves with health status"
              onCopy={() => showToast('Copied!')}
            />
            <CLICommand
              command="npx hardhat withdrawApeReserve --contract PokeballGame --keep-minimum 0.5 --network apechain"
              description="Withdraw APE keeping minimum"
              onCopy={() => showToast('Copied!')}
            />
            <CLICommand
              command="npx hardhat withdrawUsdceReserve --keep-buffer 100 --network apechain"
              description="Withdraw USDC.e keeping buffer"
              onCopy={() => showToast('Copied!')}
            />
            <CLICommand
              command="npx hardhat withdrawTreasuryFunds --all --network apechain"
              description="Withdraw 3% platform fees"
              onCopy={() => showToast('Copied!')}
            />
            <CLICommand
              command="node scripts/update_ape_price.cjs"
              description="Update on-chain APE price from CoinGecko"
              onCopy={() => showToast('Copied!')}
            />
            <CLICommand
              command="node scripts/fund_ape_reserves.cjs"
              description="Fund APE reserves for both contracts"
              onCopy={() => showToast('Copied!')}
            />
          </div>
        </div>

        {/* Toast notification */}
        {toast.visible && (
          <div style={styles.toast}>
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default OperatorDashboard;
