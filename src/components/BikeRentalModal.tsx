interface BikeRentalModalProps {
  onRent: () => void;
  onClose: () => void;
}

export default function BikeRentalModal({ onRent, onClose }: BikeRentalModalProps) {
  return (
    <div
      className="modal-overlay modal--compact"
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
        className="modal-inner"
        style={{
          backgroundColor: '#2a2a2a',
          border: '4px solid #fff',
          padding: '20px',
          maxWidth: '400px',
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
          Bike Shop
        </h2>

        <p style={{ marginBottom: '15px', textAlign: 'center', fontSize: '18px', lineHeight: '1.4' }}>
          Would you like to rent a bicycle?
        </p>

        <p style={{ marginBottom: '30px', textAlign: 'center', fontSize: '14px', color: '#aaa', lineHeight: '1.4' }}>
          Bicycles allow you to move 2x faster!
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
          <button
            onClick={onRent}
            style={{
              padding: '10px 20px',
              backgroundColor: '#4a4',
              color: '#fff',
              border: '2px solid #fff',
              cursor: 'pointer',
              fontFamily: 'Courier New, monospace',
              fontSize: '16px',
              textTransform: 'uppercase',
              imageRendering: 'pixelated',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#6a6';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#4a4';
            }}
          >
            Yes
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
            No
          </button>
        </div>
      </div>
    </div>
  );
}
