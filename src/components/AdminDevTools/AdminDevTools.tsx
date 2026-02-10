/**
 * AdminDevTools Component
 *
 * Admin panel for SlabNFTManager v2.3.0 operations.
 * Provides diagnostics and owner-only recovery functions.
 * Only visible when dev mode is enabled (?dev=1 or localStorage).
 *
 * v2.3.0 Changes:
 * - awardNFTToWinnerWithRandomness: Random NFT selection from inventory using
 *   (randomNumber >> 128) % inventorySize, called by PokeballGame v1.7.0
 * - All v2.2.0 admin functions preserved (NFT recovery, pending request clearing)
 *
 * Features:
 * - View current inventory and USDC balance
 * - View pending request count
 * - Find untracked NFTs (getUntrackedNFTs)
 * - Recover untracked NFTs (recoverUntrackedNFT, batchRecoverUntrackedNFTs)
 * - Clear stuck pending requests (clearPendingRequest, resetPendingRequestCount)
 * - Test Token 300 metadata
 *
 * Usage:
 * ```tsx
 * import { AdminDevTools } from './components/AdminDevTools';
 *
 * // Include in App.tsx with dev mode check
 * {isDevMode && <AdminDevTools ownerAddress={OWNER_ADDRESS} />}
 * ```
 */

import { useState, useCallback } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useSlabNFTMetadata, SLAB_NFT_ADDRESS } from '../../hooks/useNFTMetadata';
import { useContractDiagnostics } from '../../hooks/pokeballGame';
import { PokemonCard } from '../PokemonCard';
import { getNftUrl, getTransactionUrl } from '../../services/pokeballGameConfig';

// ============================================================
// CONSTANTS
// ============================================================

const SLAB_NFT_MANAGER_ADDRESS = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71' as `0x${string}`;
const OWNER_ADDRESS = '0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06' as `0x${string}`;
const APECHAIN_CHAIN_ID = 33139;

// ABI for admin functions
const ADMIN_ABI = [
  {
    inputs: [],
    name: 'getInventory',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'pendingRequestCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'startId', type: 'uint256' },
      { name: 'endId', type: 'uint256' },
    ],
    name: 'getUntrackedNFTs',
    outputs: [{ name: 'untrackedIds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'recoverUntrackedNFT',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenIds', type: 'uint256[]' }],
    name: 'batchRecoverUntrackedNFTs',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'requestId', type: 'uint256' }],
    name: 'clearPendingRequest',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'resetPendingRequestCount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface AdminDevToolsProps {
  /** Connected wallet address */
  connectedAddress?: `0x${string}`;
  /** Is the panel open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
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
    padding: '20px',
  },
  modal: {
    backgroundColor: '#1a0a1a',
    border: '3px solid #aa44ff',
    maxWidth: '700px',
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
    borderBottom: '2px solid #aa44ff',
    background: 'linear-gradient(180deg, rgba(170, 68, 255, 0.2) 0%, transparent 100%)',
  },
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#aa44ff',
    margin: 0,
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: '2px solid #ff4444',
    color: '#ff4444',
    cursor: 'pointer',
    padding: '4px 10px',
    fontSize: '14px',
    fontFamily: "'Courier New', monospace",
  },
  body: {
    padding: '20px',
  },
  section: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid #333',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#aa44ff',
    marginBottom: '12px',
    borderBottom: '1px solid #333',
    paddingBottom: '8px',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #222',
  },
  statLabel: {
    color: '#888',
    fontSize: '12px',
  },
  statValue: {
    color: '#00ff00',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  warningValue: {
    color: '#ffcc00',
  },
  errorValue: {
    color: '#ff4444',
  },
  inputRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '10px',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: '#0a0a0a',
    border: '2px solid #333',
    color: '#fff',
    fontSize: '12px',
    fontFamily: "'Courier New', monospace",
  },
  button: {
    padding: '8px 16px',
    border: '2px solid #aa44ff',
    backgroundColor: '#2a0a2a',
    color: '#aa44ff',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    fontWeight: 'bold',
    transition: 'all 0.15s',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  dangerButton: {
    borderColor: '#ff4444',
    backgroundColor: '#2a0a0a',
    color: '#ff4444',
  },
  successMessage: {
    padding: '8px 12px',
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    border: '1px solid #00ff00',
    color: '#00ff00',
    fontSize: '11px',
    marginTop: '10px',
  },
  errorMessage: {
    padding: '8px 12px',
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    border: '1px solid #ff4444',
    color: '#ff4444',
    fontSize: '11px',
    marginTop: '10px',
  },
  nftGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '10px',
    marginTop: '12px',
  },
  nftChip: {
    padding: '4px 10px',
    backgroundColor: '#0a1a0a',
    border: '1px solid #00ff00',
    color: '#00ff00',
    fontSize: '11px',
    borderRadius: '2px',
  },
  untrackedChip: {
    borderColor: '#ffcc00',
    color: '#ffcc00',
    backgroundColor: '#1a1a0a',
  },
  ownerBadge: {
    padding: '2px 8px',
    backgroundColor: 'rgba(0, 255, 0, 0.2)',
    border: '1px solid #00ff00',
    color: '#00ff00',
    fontSize: '10px',
    borderRadius: '2px',
  },
  notOwnerBadge: {
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    borderColor: '#ff4444',
    color: '#ff4444',
  },
  cardContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '16px',
  },
  txLink: {
    color: '#4488ff',
    textDecoration: 'none',
    fontSize: '11px',
  },
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export function AdminDevTools({
  connectedAddress,
  isOpen,
  onClose,
}: AdminDevToolsProps) {
  // State
  const [searchStartId, setSearchStartId] = useState('290');
  const [searchEndId, setSearchEndId] = useState('310');
  const [untrackedIds, setUntrackedIds] = useState<bigint[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [isGettingUntracked, setIsGettingUntracked] = useState(false);

  // Check if connected wallet is the owner
  const isOwner = connectedAddress?.toLowerCase() === OWNER_ADDRESS.toLowerCase();

  // Get diagnostics from the shared hook
  const diagnostics = useContractDiagnostics();

  // Read inventory
  const { data: inventory } = useReadContract({
    address: SLAB_NFT_MANAGER_ADDRESS,
    abi: ADMIN_ABI,
    functionName: 'getInventory',
    chainId: APECHAIN_CHAIN_ID,
    query: {
      enabled: isOpen,
      refetchInterval: 30_000,
    },
  });

  // Read pending request count
  const { data: pendingCount } = useReadContract({
    address: SLAB_NFT_MANAGER_ADDRESS,
    abi: ADMIN_ABI,
    functionName: 'pendingRequestCount',
    chainId: APECHAIN_CHAIN_ID,
    query: {
      enabled: isOpen,
      refetchInterval: 10_000,
    },
  });

  // Test Token 300 metadata
  const { metadata: token300Metadata, isLoading: token300Loading, error: token300Error } = useSlabNFTMetadata(BigInt(300), isOpen);

  // Write contract hooks
  // Note: getUntrackedNFTs is a view function, so we use direct RPC call instead
  const {
    writeContract: writeRecover,
    data: recoverHash,
    isPending: isRecovering,
  } = useWriteContract();

  const {
    writeContract: writeClearPending,
    data: clearPendingHash,
    isPending: isClearingPending,
    error: clearPendingError,
  } = useWriteContract();

  const {
    writeContract: writeResetPending,
    data: resetPendingHash,
    isPending: isResettingPending,
    error: resetPendingError,
  } = useWriteContract();

  // Wait for transaction receipts
  const { isLoading: isWaitingRecover, isSuccess: recoverSuccess } = useWaitForTransactionReceipt({
    hash: recoverHash,
  });

  const { isLoading: isWaitingClear, isSuccess: clearSuccess } = useWaitForTransactionReceipt({
    hash: clearPendingHash,
  });

  const { isLoading: isWaitingReset, isSuccess: resetSuccess } = useWaitForTransactionReceipt({
    hash: resetPendingHash,
  });

  // Read untracked NFTs (this is a view function, not a write)
  const handleSearchUntracked = useCallback(async () => {
    try {
      setLastError(null);
      setIsGettingUntracked(true);
      // For view functions, we use useReadContract data or call directly
      // Since getUntrackedNFTs is a view function, we need to use readContract
      const response = await fetch(`https://apechain.calderachain.xyz/http`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{
            to: SLAB_NFT_MANAGER_ADDRESS,
            data: `0x` +
              // getUntrackedNFTs(uint256,uint256) selector
              'f7b188a5' +
              // startId (padded to 32 bytes)
              BigInt(searchStartId).toString(16).padStart(64, '0') +
              // endId (padded to 32 bytes)
              BigInt(searchEndId).toString(16).padStart(64, '0'),
          }, 'latest'],
          id: 1,
        }),
      });

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }

      // Decode the result (dynamic array of uint256)
      const data = result.result;
      if (data && data !== '0x') {
        // Skip the offset (first 32 bytes) and length (next 32 bytes)
        const length = parseInt(data.slice(66, 130), 16);
        const ids: bigint[] = [];
        for (let i = 0; i < length; i++) {
          const start = 130 + i * 64;
          const id = BigInt('0x' + data.slice(start, start + 64));
          ids.push(id);
        }
        setUntrackedIds(ids);
        setLastSuccess(`Found ${ids.length} untracked NFT(s)`);
      } else {
        setUntrackedIds([]);
        setLastSuccess('No untracked NFTs found');
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Failed to search');
      setUntrackedIds([]);
    } finally {
      setIsGettingUntracked(false);
    }
  }, [searchStartId, searchEndId]);

  // Batch recover NFTs
  const handleBatchRecover = useCallback(() => {
    if (untrackedIds.length === 0) return;
    setLastError(null);
    setLastSuccess(null);
    writeRecover({
      address: SLAB_NFT_MANAGER_ADDRESS,
      abi: ADMIN_ABI,
      functionName: 'batchRecoverUntrackedNFTs',
      args: [untrackedIds],
      chainId: APECHAIN_CHAIN_ID,
    });
  }, [writeRecover, untrackedIds]);

  // Clear pending request
  const handleClearPending = useCallback(() => {
    setLastError(null);
    setLastSuccess(null);
    writeClearPending({
      address: SLAB_NFT_MANAGER_ADDRESS,
      abi: ADMIN_ABI,
      functionName: 'clearPendingRequest',
      args: [BigInt(0)],
      chainId: APECHAIN_CHAIN_ID,
    });
  }, [writeClearPending]);

  // Reset pending count
  const handleResetPending = useCallback(() => {
    setLastError(null);
    setLastSuccess(null);
    writeResetPending({
      address: SLAB_NFT_MANAGER_ADDRESS,
      abi: ADMIN_ABI,
      functionName: 'resetPendingRequestCount',
      args: [],
      chainId: APECHAIN_CHAIN_ID,
    });
  }, [writeResetPending]);

  if (!isOpen) return null;

  const inventoryIds = inventory as bigint[] | undefined;
  const pendingCountNum = Number(pendingCount ?? 0);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={styles.title}>SlabNFTManager Admin Tools</h2>
            <span style={{
              ...styles.ownerBadge,
              ...(isOwner ? {} : styles.notOwnerBadge),
            }}>
              {isOwner ? 'OWNER' : 'READ-ONLY'}
            </span>
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            CLOSE
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Contract Status Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Contract Status</h3>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>USDC.e Balance</span>
              <span style={styles.statValue}>
                ${diagnostics.slabNFTManagerBalanceFormatted.toFixed(2)}
              </span>
            </div>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>NFT Inventory</span>
              <span style={styles.statValue}>
                {diagnostics.inventoryCount}/{diagnostics.maxInventorySize}
              </span>
            </div>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>Pending Requests</span>
              <span style={{
                ...styles.statValue,
                ...(pendingCountNum > 0 ? styles.warningValue : {}),
              }}>
                {pendingCountNum}
              </span>
            </div>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>Can Auto-Purchase</span>
              <span style={{
                ...styles.statValue,
                ...(diagnostics.canAutoPurchase ? {} : styles.warningValue),
              }}>
                {diagnostics.canAutoPurchase ? 'YES' : 'NO'}
              </span>
            </div>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>Pull Price</span>
              <span style={styles.statValue}>
                ${diagnostics.pullPriceFormatted.toFixed(2)}
              </span>
            </div>

            {/* Inventory Token IDs */}
            {inventoryIds && inventoryIds.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <span style={{ ...styles.statLabel, display: 'block', marginBottom: '8px' }}>
                  Inventory Token IDs:
                </span>
                <div style={styles.nftGrid}>
                  {inventoryIds.map((id) => (
                    <a
                      key={id.toString()}
                      href={getNftUrl(SLAB_NFT_ADDRESS, id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...styles.nftChip, textDecoration: 'none' }}
                    >
                      #{id.toString()}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Token 300 Test Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Token 300 Metadata Test</h3>
            {token300Loading ? (
              <p style={styles.statLabel}>Loading metadata...</p>
            ) : token300Error ? (
              <p style={{ color: '#ff4444', fontSize: '12px' }}>
                Error: {token300Error}
              </p>
            ) : token300Metadata ? (
              <div style={styles.cardContainer}>
                <PokemonCard
                  tokenId={BigInt(300)}
                  showAttributes
                  showViewLink
                  compact={false}
                />
              </div>
            ) : (
              <p style={styles.statLabel}>No metadata available</p>
            )}
          </div>

          {/* Find Untracked NFTs Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Find Untracked NFTs</h3>
            <p style={{ ...styles.statLabel, marginBottom: '12px' }}>
              Search for NFTs owned by SlabNFTManager but not tracked in inventory.
            </p>
            <div style={styles.inputRow}>
              <span style={styles.statLabel}>Start ID:</span>
              <input
                type="number"
                value={searchStartId}
                onChange={(e) => setSearchStartId(e.target.value)}
                style={styles.input}
              />
              <span style={styles.statLabel}>End ID:</span>
              <input
                type="number"
                value={searchEndId}
                onChange={(e) => setSearchEndId(e.target.value)}
                style={styles.input}
              />
              <button
                style={styles.button}
                onClick={handleSearchUntracked}
                disabled={isGettingUntracked}
              >
                {isGettingUntracked ? 'Searching...' : 'Search'}
              </button>
            </div>

            {untrackedIds.length > 0 && (
              <div>
                <div style={styles.nftGrid}>
                  {untrackedIds.map((id) => (
                    <span key={id.toString()} style={{ ...styles.nftChip, ...styles.untrackedChip }}>
                      #{id.toString()}
                    </span>
                  ))}
                </div>
                {isOwner && (
                  <button
                    style={{ ...styles.button, marginTop: '12px' }}
                    onClick={handleBatchRecover}
                    disabled={isRecovering || isWaitingRecover}
                  >
                    {isRecovering || isWaitingRecover ? 'Recovering...' : `Recover All (${untrackedIds.length})`}
                  </button>
                )}
              </div>
            )}

            {lastSuccess && (
              <div style={styles.successMessage}>{lastSuccess}</div>
            )}
            {lastError && (
              <div style={styles.errorMessage}>{lastError}</div>
            )}
            {recoverSuccess && recoverHash && (
              <div style={styles.successMessage}>
                Recovery successful!{' '}
                <a href={getTransactionUrl(recoverHash)} target="_blank" rel="noopener noreferrer" style={styles.txLink}>
                  View Transaction
                </a>
              </div>
            )}
          </div>

          {/* Fix Stuck Pending Requests Section */}
          {isOwner && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Fix Stuck Pending Requests</h3>
              <p style={{ ...styles.statLabel, marginBottom: '12px' }}>
                If pendingRequestCount is stuck, use these to reset it.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  style={{ ...styles.button, ...styles.dangerButton }}
                  onClick={handleClearPending}
                  disabled={isClearingPending || isWaitingClear || pendingCountNum === 0}
                >
                  {isClearingPending || isWaitingClear ? 'Clearing...' : 'Clear Pending (0)'}
                </button>
                <button
                  style={{ ...styles.button, ...styles.dangerButton }}
                  onClick={handleResetPending}
                  disabled={isResettingPending || isWaitingReset || pendingCountNum === 0}
                >
                  {isResettingPending || isWaitingReset ? 'Resetting...' : 'Reset All Pending'}
                </button>
              </div>

              {(clearPendingError || resetPendingError) && (
                <div style={styles.errorMessage}>
                  {(clearPendingError || resetPendingError)?.message}
                </div>
              )}
              {(clearSuccess || resetSuccess) && (
                <div style={styles.successMessage}>
                  Pending request count updated!{' '}
                  <a
                    href={getTransactionUrl(clearPendingHash || resetPendingHash || '0x')}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.txLink}
                  >
                    View Transaction
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Warnings Section */}
          {diagnostics.hasWarnings && (
            <div style={{ ...styles.section, borderColor: '#ffcc00' }}>
              <h3 style={{ ...styles.sectionTitle, color: '#ffcc00' }}>Warnings</h3>
              {diagnostics.warnings.map((warning, index) => (
                <p key={index} style={{ color: '#ffcc00', fontSize: '12px', marginBottom: '4px' }}>
                  {warning}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDevTools;
