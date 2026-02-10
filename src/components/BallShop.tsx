/**
 * BallShop Component
 *
 * Test UI for the PokeballGame ball purchasing system.
 * Displays current inventory and allows purchasing balls.
 *
 * Usage:
 * ```tsx
 * <BallShop isOpen={showShop} onClose={() => setShowShop(false)} />
 * ```
 */

import { useState } from 'react';
import { usePokeballGame } from '../hooks/usePokeballGame';
import { getBallInventoryManager, type BallType } from '../game/managers/BallInventoryManager';

interface BallShopProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BallOption {
  type: BallType;
  name: string;
  price: number;
  catchChance: number;
  color: string;
}

const BALL_OPTIONS: BallOption[] = [
  { type: 0, name: 'Poke Ball', price: 1.0, catchChance: 2, color: '#ff4444' },
  { type: 1, name: 'Great Ball', price: 10.0, catchChance: 20, color: '#4488ff' },
  { type: 2, name: 'Ultra Ball', price: 25.0, catchChance: 50, color: '#ffcc00' },
  { type: 3, name: 'Master Ball', price: 49.9, catchChance: 99, color: '#aa44ff' },
];

export function BallShop({ isOpen, onClose }: BallShopProps) {
  const {
    isLoading,
    isPurchasing,
    error,
    purchaseBalls,
    isContractConfigured,
  } = usePokeballGame();

  const [selectedBall, setSelectedBall] = useState<BallType>(0);
  const [quantity, setQuantity] = useState(1);
  const [payWithAPE, setPayWithAPE] = useState(false);

  const inventoryManager = getBallInventoryManager();

  if (!isOpen) return null;

  const selectedOption = BALL_OPTIONS[selectedBall];
  const totalPrice = selectedOption.price * quantity;

  const handlePurchase = async () => {
    try {
      await purchaseBalls(selectedBall, quantity, payWithAPE);
    } catch (err) {
      console.error('Purchase failed:', err);
    }
  };

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
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        fontFamily: "'Courier New', monospace",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1a1a2e',
          border: '4px solid #ffcc00',
          borderRadius: '8px',
          padding: '24px',
          minWidth: '400px',
          maxWidth: '500px',
          color: '#ffffff',
          imageRendering: 'pixelated',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '2px solid #ffcc00',
            paddingBottom: '12px',
          }}
        >
          <h2 style={{ margin: 0, color: '#ffcc00', fontSize: '20px' }}>
            BALL SHOP
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '2px solid #ff4444',
              color: '#ff4444',
              padding: '4px 12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
          >
            X
          </button>
        </div>

        {/* Contract Status */}
        {!isContractConfigured && (
          <div
            style={{
              backgroundColor: '#442222',
              border: '2px solid #ff4444',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '12px',
            }}
          >
            Contract not configured. Set REACT_APP_POKEBALL_GAME_ADDRESS.
          </div>
        )}

        {/* Current Inventory */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaaaaa' }}>
            YOUR INVENTORY
          </h3>
          {isLoading ? (
            <div style={{ color: '#888888' }}>Loading...</div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
              }}
            >
              {BALL_OPTIONS.map((ball) => (
                <div
                  key={ball.type}
                  style={{
                    backgroundColor: '#2a2a4a',
                    padding: '8px',
                    textAlign: 'center',
                    borderRadius: '4px',
                    border: `2px solid ${ball.color}`,
                  }}
                >
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      backgroundColor: ball.color,
                      borderRadius: '50%',
                      margin: '0 auto 4px',
                      border: '2px solid #ffffff',
                    }}
                  />
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                    {inventoryManager.getBallCount(ball.type)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#888888' }}>
                    {ball.name.split(' ')[0]}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ball Selection */}
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaaaaa' }}>
            SELECT BALL TYPE
          </h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {BALL_OPTIONS.map((ball) => (
              <button
                key={ball.type}
                onClick={() => setSelectedBall(ball.type)}
                style={{
                  flex: '1 1 45%',
                  padding: '12px',
                  backgroundColor:
                    selectedBall === ball.type ? ball.color : '#2a2a4a',
                  color: selectedBall === ball.type ? '#000000' : '#ffffff',
                  border: `2px solid ${ball.color}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 'bold' }}>{ball.name}</div>
                <div style={{ fontSize: '10px', opacity: 0.8 }}>
                  ${ball.price.toFixed(2)} | {ball.catchChance}% catch
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Quantity Selection */}
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaaaaa' }}>
            QUANTITY
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: '#2a2a4a',
                border: '2px solid #ffcc00',
                color: '#ffcc00',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '20px',
              }}
            >
              -
            </button>
            <input
              type="number"
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, parseInt(e.target.value) || 1))
              }
              style={{
                width: '60px',
                height: '40px',
                backgroundColor: '#2a2a4a',
                border: '2px solid #ffcc00',
                color: '#ffffff',
                textAlign: 'center',
                fontFamily: 'inherit',
                fontSize: '18px',
              }}
            />
            <button
              onClick={() => setQuantity(quantity + 1)}
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: '#2a2a4a',
                border: '2px solid #ffcc00',
                color: '#ffcc00',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '20px',
              }}
            >
              +
            </button>
            <div style={{ marginLeft: 'auto', fontSize: '12px' }}>
              Quick:{' '}
              {[1, 5, 10, 25].map((q) => (
                <button
                  key={q}
                  onClick={() => setQuantity(q)}
                  style={{
                    marginLeft: '4px',
                    padding: '4px 8px',
                    backgroundColor: quantity === q ? '#ffcc00' : '#2a2a4a',
                    color: quantity === q ? '#000000' : '#ffffff',
                    border: '1px solid #ffcc00',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '10px',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaaaaa' }}>
            PAYMENT METHOD
          </h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setPayWithAPE(false)}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: !payWithAPE ? '#44aa44' : '#2a2a4a',
                color: '#ffffff',
                border: `2px solid ${!payWithAPE ? '#44aa44' : '#444444'}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontWeight: 'bold' }}>USDC.e</div>
              <div style={{ fontSize: '10px' }}>${totalPrice.toFixed(2)}</div>
            </button>
            <button
              onClick={() => setPayWithAPE(true)}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: payWithAPE ? '#4488ff' : '#2a2a4a',
                color: '#ffffff',
                border: `2px solid ${payWithAPE ? '#4488ff' : '#444444'}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontWeight: 'bold' }}>APE</div>
              <div style={{ fontSize: '10px' }}>~{(totalPrice / 1.5).toFixed(2)} APE</div>
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div
            style={{
              backgroundColor: '#442222',
              border: '2px solid #ff4444',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#ff8888',
            }}
          >
            {error}
          </div>
        )}

        {/* Purchase Button */}
        <button
          onClick={handlePurchase}
          disabled={isPurchasing || !isContractConfigured}
          style={{
            width: '100%',
            padding: '16px',
            backgroundColor: isPurchasing ? '#444444' : '#ffcc00',
            color: '#000000',
            border: 'none',
            cursor: isPurchasing ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: '16px',
            fontWeight: 'bold',
          }}
        >
          {isPurchasing
            ? 'PURCHASING...'
            : `BUY ${quantity} ${selectedOption.name.toUpperCase()}${quantity > 1 ? 'S' : ''}`}
        </button>

        {/* Total */}
        <div
          style={{
            marginTop: '12px',
            textAlign: 'center',
            fontSize: '14px',
            color: '#888888',
          }}
        >
          Total: ${totalPrice.toFixed(2)} {payWithAPE ? `(~${(totalPrice / 1.5).toFixed(2)} APE)` : 'USDC.e'}
        </div>
      </div>
    </div>
  );
}

export default BallShop;
