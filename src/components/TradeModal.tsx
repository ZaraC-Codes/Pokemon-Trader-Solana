/**
 * TradeModal — STUBBED for Solana port.
 *
 * The OTC trade/listing system was EVM-specific (ApeChain OTC contract).
 * This modal is kept as a placeholder so App.tsx doesn't break.
 * Trading will be re-implemented when a Solana marketplace is integrated.
 */

import type { TradeListing } from '../services/types';

interface TradeModalProps {
  listing: TradeListing | null;
  onClose: () => void;
}

export default function TradeModal({ listing, onClose }: TradeModalProps) {
  if (!listing) return null;

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
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          color: '#fff',
          imageRendering: 'pixelated',
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: '16px',
            fontSize: '20px',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            color: '#ffcc00',
          }}
        >
          Trading
        </h2>

        <p style={{ color: '#888', fontSize: '14px', marginBottom: '20px' }}>
          OTC trading is not yet available on Solana.
          <br />
          This feature will be added in a future update.
        </p>

        <button
          onClick={onClose}
          style={{
            padding: '10px 20px',
            backgroundColor: '#a44',
            color: '#fff',
            border: '2px solid #fff',
            cursor: 'pointer',
            fontFamily: 'Courier New, monospace',
            fontSize: '14px',
            textTransform: 'uppercase',
            fontWeight: 'bold',
          }}
          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#c66'; }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#a44'; }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
