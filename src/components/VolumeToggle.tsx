import { useState, useEffect, useRef } from 'react';

interface VolumeToggleProps {
  onVolumeChange: (volume: number) => void;
  initialVolume?: number;
}

export default function VolumeToggle({ onVolumeChange, initialVolume = 0.5 }: VolumeToggleProps) {
  const [volume, setVolume] = useState(initialVolume);
  const [isMuted, setIsMuted] = useState(false);
  const onVolumeChangeRef = useRef(onVolumeChange);

  // Keep the callback ref updated without causing re-renders
  useEffect(() => {
    onVolumeChangeRef.current = onVolumeChange;
  }, [onVolumeChange]);

  // Update volume when it changes, using ref to avoid dependency issues
  useEffect(() => {
    const currentVolume = isMuted ? 0 : volume;
    onVolumeChangeRef.current(currentVolume);
  }, [volume, isMuted]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        fontFamily: 'Courier New, monospace',
        imageRendering: 'pixelated',
        // Prevent this from affecting the game canvas
        isolation: 'isolate',
        pointerEvents: 'auto',
      }}
      // Prevent events from bubbling to game canvas
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleMute();
        }}
        style={{
          width: '48px',
          height: '48px',
          backgroundColor: isMuted ? '#a44' : '#4a4',
          border: '3px solid #fff',
          color: '#fff',
          cursor: 'pointer',
          fontFamily: 'Courier New, monospace',
          fontSize: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          imageRendering: 'pixelated',
          textTransform: 'uppercase',
          fontWeight: 'bold',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = isMuted ? '#c66' : '#6a6';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = isMuted ? '#a44' : '#4a4';
        }}
      >
        {isMuted ? (
          <i className="fas fa-volume-mute"></i>
        ) : (
          <i className="fas fa-volume-up"></i>
        )}
      </button>
      {!isMuted && (
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={(e) => {
            e.stopPropagation();
            handleVolumeChange(e);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          style={{
            width: '48px',
            writingMode: 'bt-lr',
            direction: 'rtl',
            cursor: 'pointer',
          }}
        />
      )}
    </div>
  );
}
