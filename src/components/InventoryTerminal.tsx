import { useState } from 'react';
import { useActiveWeb3React } from '../hooks/useActiveWeb3React';
import { CONTRACT_ADDRESSES } from '../services/apechainConfig';
import { apeChainMainnet } from '../services/apechainConfig';
import { useWriteContract, usePublicClient } from 'wagmi';
import useNotification from '../utilities/notificationUtils';
import { isUserRejectedError } from '../utilities/isUserRejectedError';
import { getAlchemyNFTsForOwner } from '../utils/alchemy';
import { useQuery } from '@tanstack/react-query';

// Standard ERC721 ABI for transfers
const ERC721_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'from', type: 'address' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'safeTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'from', type: 'address' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface InventoryTerminalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InventoryTerminal({ isOpen, onClose }: InventoryTerminalProps) {
  const { account, chainId } = useActiveWeb3React();
  const [selectedNFTs, setSelectedNFTs] = useState<Set<string>>(new Set());
  const [recipientAddress, setRecipientAddress] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const { showSuccess, showError } = useNotification();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const nftAddress = CONTRACT_ADDRESSES.NFT_COLLECTION;
  const currentChainId = chainId || apeChainMainnet.id;

  // Use Alchemy NFT API directly instead of contract calls
  const { data: ownedNFTs = [], isLoading, refetch, error } = useQuery({
    queryKey: ['alchemy-nfts', account, nftAddress, currentChainId, isOpen],
    queryFn: async () => {
      if (!account || !isOpen) return [];
      console.log('Fetching NFTs from Alchemy API for:', { account, nftAddress, currentChainId });
      const nfts = await getAlchemyNFTsForOwner(nftAddress, account, currentChainId);
      console.log('Alchemy API returned NFTs:', nfts.length);
      return nfts;
    },
    enabled: Boolean(account && isOpen && nftAddress),
    staleTime: 30_000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });


  const toggleSelectNFT = (tokenId: string) => {
    const newSelected = new Set(selectedNFTs);
    if (newSelected.has(tokenId)) {
      newSelected.delete(tokenId);
    } else {
      newSelected.add(tokenId);
    }
    setSelectedNFTs(newSelected);
  };

  const selectAll = () => {
    if (selectedNFTs.size === ownedNFTs.length) {
      setSelectedNFTs(new Set());
    } else {
      const allTokenIds = ownedNFTs.map((nft: any) => {
        // Handle different tokenId formats
        if (nft.tokenId !== undefined) {
          return typeof nft.tokenId === 'bigint' ? nft.tokenId.toString() : nft.tokenId.toString();
        }
        if (nft.id !== undefined) {
          return typeof nft.id === 'bigint' ? nft.id.toString() : nft.id.toString();
        }
        return '';
      }).filter((id: string) => id !== '');
      setSelectedNFTs(new Set(allTokenIds));
    }
  };

  const handleTransfer = async () => {
    if (!account || !recipientAddress) {
      showError('Please enter a recipient address');
      return;
    }

    if (selectedNFTs.size === 0) {
      showError('Please select at least one NFT to transfer');
      return;
    }

    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
      showError('Invalid recipient address');
      return;
    }

    setIsTransferring(true);

    try {
      const tokenIds = Array.from(selectedNFTs).map((id) => BigInt(id));

      // For bulk transfers, we'll do them sequentially (or could batch if contract supports it)
      for (let i = 0; i < tokenIds.length; i++) {
        const tokenId = tokenIds[i];
        try {
          const txHash = await writeContractAsync({
            address: nftAddress as `0x${string}`,
            abi: ERC721_ABI,
            functionName: 'safeTransferFrom',
            args: [account as `0x${string}`, recipientAddress as `0x${string}`, tokenId],
          });

          // Wait for transaction
          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash: txHash });
          }

          if (i === tokenIds.length - 1) {
            showSuccess(`Successfully transferred ${tokenIds.length} NFT(s) to ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`);
            setSelectedNFTs(new Set());
            setRecipientAddress('');
            refetch();
          }
        } catch (error: any) {
          if (isUserRejectedError(error)) {
            setIsTransferring(false);
            return;
          }
          throw error;
        }
      }
    } catch (error: any) {
      console.error('Transfer error:', error);
      showError(`Transfer failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsTransferring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000,
        fontFamily: 'Courier New, monospace',
        imageRendering: 'pixelated',
        pointerEvents: 'auto',
        // Prevent this from affecting the game canvas
        isolation: 'isolate',
      }}
      onClick={onClose}
      // Prevent any events from bubbling to game canvas
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          backgroundColor: 'rgba(26, 26, 26, 0.95)',
          border: '4px solid #00ff00',
          padding: '20px',
          maxWidth: '800px',
          maxHeight: '80vh',
          width: '90%',
          color: '#00ff00',
          imageRendering: 'pixelated',
          boxShadow: '0 0 20px rgba(0, 255, 0, 0.5)',
          overflow: 'auto',
          backdropFilter: 'blur(5px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Terminal Header */}
        <div style={{ marginBottom: '20px', borderBottom: '2px solid #00ff00', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '24px', textTransform: 'uppercase', letterSpacing: '2px' }}>
              <i className="fas fa-terminal" style={{ marginRight: '8px' }}></i>
              INVENTORY TERMINAL
              <i className="fas fa-terminal" style={{ marginLeft: '8px' }}></i>
            </h2>
            <button
              onClick={onClose}
              style={{
                backgroundColor: '#a44',
                color: '#fff',
                border: '2px solid #fff',
                padding: '8px 16px',
                cursor: 'pointer',
                fontFamily: 'Courier New, monospace',
                fontSize: '14px',
                textTransform: 'uppercase',
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
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#f44' }}>
            Error loading NFTs: {error instanceof Error ? error.message : 'Unknown error'}
            <br />
            <div style={{ fontSize: '10px', marginTop: '10px', color: '#888' }}>
              NFT Address: {nftAddress}
              <br />
              Chain ID: {currentChainId}
            </div>
          </div>
        ) : isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            Loading NFTs...
            <br />
            <div style={{ fontSize: '10px', marginTop: '10px' }}>
              Checking wallet: {account?.slice(0, 6)}...{account?.slice(-4)}
            </div>
          </div>
        ) : ownedNFTs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            No NFTs found in wallet
            <br />
            <div style={{ fontSize: '10px', marginTop: '10px' }}>
              Wallet: {account?.slice(0, 6)}...{account?.slice(-4)}
              <br />
              Collection: {nftAddress?.slice(0, 6)}...{nftAddress?.slice(-4)}
              <br />
              Chain: {currentChainId}
            </div>
          </div>
        ) : (
          <>
            {/* Transfer Section */}
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#0a0a0a', border: '2px solid #00ff00' }}>
              <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px' }}>TRANSFER NFTs</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
                    Recipient Address:
                  </label>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="0x..."
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#000',
                      border: '2px solid #00ff00',
                      color: '#00ff00',
                      fontFamily: 'Courier New, monospace',
                      fontSize: '14px',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    onClick={selectAll}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#4a4',
                      color: '#fff',
                      border: '2px solid #fff',
                      cursor: 'pointer',
                      fontFamily: 'Courier New, monospace',
                      fontSize: '12px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {selectedNFTs.size === ownedNFTs.length ? 'DESELECT ALL' : 'SELECT ALL'}
                  </button>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {selectedNFTs.size} selected
                  </span>
                </div>
                <button
                  onClick={handleTransfer}
                  disabled={isTransferring || selectedNFTs.size === 0 || !recipientAddress}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: isTransferring || selectedNFTs.size === 0 || !recipientAddress ? '#666' : '#4a4',
                    color: '#fff',
                    border: '2px solid #fff',
                    cursor: isTransferring || selectedNFTs.size === 0 || !recipientAddress ? 'not-allowed' : 'pointer',
                    fontFamily: 'Courier New, monospace',
                    fontSize: '14px',
                    textTransform: 'uppercase',
                    opacity: isTransferring || selectedNFTs.size === 0 || !recipientAddress ? 0.6 : 1,
                  }}
                >
                  {isTransferring ? 'TRANSFERRING...' : `TRANSFER ${selectedNFTs.size} NFT(S)`}
                </button>
              </div>
            </div>

            {/* NFT List */}
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px' }}>
                YOUR NFTs ({ownedNFTs.length})
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '15px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                }}
              >
                {ownedNFTs.map((nft: any, index: number) => {
                  // Handle different possible tokenId formats
                  const tokenId = nft.tokenId?.toString() || 
                                 nft.id?.toString() || 
                                 (typeof nft.tokenId === 'bigint' ? nft.tokenId.toString() : '') ||
                                 index.toString();
                  const isSelected = selectedNFTs.has(tokenId);
                  return (
                    <div
                      key={`${tokenId}-${index}`}
                      onClick={() => toggleSelectNFT(tokenId)}
                      style={{
                        border: isSelected ? '3px solid #00ff00' : '2px solid #333',
                        padding: '10px',
                        backgroundColor: isSelected ? '#0a2a0a' : '#0a0a0a',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      {nft.image && (
                        <img
                          src={nft.image}
                          alt={nft.name || `NFT #${tokenId}`}
                          style={{
                            width: '100%',
                            height: '120px',
                            objectFit: 'contain',
                            marginBottom: '8px',
                            imageRendering: 'pixelated',
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <div style={{ fontSize: '11px', color: '#00ff00', marginBottom: '4px', wordBreak: 'break-word' }}>
                        {nft.name || `Token #${tokenId}`}
                      </div>
                      <div style={{ fontSize: '10px', color: '#888' }}>ID: {tokenId}</div>
                      {isSelected && (
                        <div style={{ fontSize: '10px', color: '#00ff00', marginTop: '4px' }}>✓ SELECTED</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
