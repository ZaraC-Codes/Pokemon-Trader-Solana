import { useState } from 'react';
import { formatEther } from 'viem';
import type { TradeListing } from '../services/contractService';
import { useManageListing } from '../hooks/useManageListing';
import { useAllListings } from '../hooks/useAllListings';

interface TradeModalProps {
  listing: TradeListing | null;
  onClose: () => void;
}

export default function TradeModal({ listing, onClose }: TradeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { refetch } = useAllListings();
  const otcListing = listing?.otcListing;

  if (!listing || !otcListing) return null;

  const { claimListing } = useManageListing(
    otcListing,
    setIsLoading,
    onClose,
    refetch
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000,
        fontFamily: 'Courier New, monospace',
        imageRendering: 'pixelated',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#2a2a2a',
          border: '4px solid #fff',
          padding: '20px',
          maxWidth: '500px',
          color: '#fff',
          imageRendering: 'pixelated',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: '20px',
            fontSize: '24px',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          Trade Offer
        </h2>

        <div style={{ marginBottom: '15px' }}>
          <strong>Listing ID:</strong> {listing.id.toString()}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <strong>Seller:</strong>{' '}
          <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
            {listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}
          </span>
        </div>

        {otcListing && (
          <>
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#1a1a1a', borderRadius: '4px' }}>
              <strong style={{ color: '#4a4' }}>Offering:</strong>
              <div style={{ marginTop: '5px', marginLeft: '10px' }}>
                {otcListing.tokensForSale?.map((token, idx) => (
                  <div key={idx} style={{ marginBottom: '5px' }}>
                    <div>Contract: {token.contractAddress.slice(0, 6)}...{token.contractAddress.slice(-4)}</div>
                    <div>Token ID: {token.value.toString()}</div>
                  </div>
                ))}
              </div>
            </div>
            
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#1a1a1a', borderRadius: '4px' }}>
              <strong style={{ color: '#a44' }}>Requesting:</strong>
              <div style={{ marginTop: '5px', marginLeft: '10px' }}>
                {otcListing.tokensToReceive?.map((token, idx) => (
                  <div key={idx} style={{ marginBottom: '5px' }}>
                    <div>Contract: {token.contractAddress.slice(0, 6)}...{token.contractAddress.slice(-4)}</div>
                    <div>Amount/ID: {token.value.toString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!otcListing && (
          <>
            <div style={{ marginBottom: '15px' }}>
              <strong>NFT Contract:</strong>{' '}
              <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                {listing.nftContract.slice(0, 6)}...{listing.nftContract.slice(-4)}
              </span>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <strong>Token ID:</strong> {listing.tokenId.toString()}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <strong>Price:</strong> {formatEther(listing.price)} APE
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={claimListing}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              backgroundColor: isLoading ? '#666' : '#4a4',
              color: '#fff',
              border: '2px solid #fff',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'Courier New, monospace',
              fontSize: '16px',
              textTransform: 'uppercase',
              imageRendering: 'pixelated',
              opacity: isLoading ? 0.6 : 1,
            }}
            onMouseOver={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = '#6a6';
              }
            }}
            onMouseOut={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = '#4a4';
              }
            }}
          >
            {isLoading ? 'Processing...' : 'Claim Listing'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#a44',
              color: '#fff',
              border: '2px solid #fff',
              cursor: 'pointer',
              fontFamily: 'Courier New, monospace',
              fontSize: '16px',
              textTransform: 'uppercase',
              imageRendering: 'pixelated',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#c66';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#a44';
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
