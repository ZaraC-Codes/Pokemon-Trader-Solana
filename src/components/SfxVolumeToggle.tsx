import { useState, useEffect } from 'react';
import { getChiptuneSFX } from '../game/utils/chiptuneSFX';

// LocalStorage keys
const STORAGE_KEY_VOLUME = 'pokeballTrader_sfxVolume';
const STORAGE_KEY_MUTED = 'pokeballTrader_sfxMuted';

// Default values
const DEFAULT_VOLUME = 0.75;

/**
 * SfxVolumeToggle - Controls SFX volume independently from music.
 *
 * Features:
 * - Mute/unmute SFX (throw, impact, win, fail sounds)
 * - Volume slider when unmuted
 * - Persists settings to localStorage
 * - Pixel-art button style matching VolumeToggle
 * - FX icon to distinguish from music toggle
 */
export default function SfxVolumeToggle() {
  // Load initial state from localStorage
  const [volume, setVolume] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY_VOLUME);
    return stored ? parseFloat(stored) : DEFAULT_VOLUME;
  });

  const [isMuted, setIsMuted] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY_MUTED);
    return stored === 'true';
  });

  // Initialize SFX singleton with stored settings on mount
  useEffect(() => {
    const sfx = getChiptuneSFX();
    sfx.setVolume(volume);
    if (isMuted) {
      sfx.mute();
    } else {
      sfx.unmute();
    }
  }, []); // Only run on mount

  // Update SFX and localStorage when volume changes
  useEffect(() => {
    const sfx = getChiptuneSFX();
    sfx.setVolume(volume);
    localStorage.setItem(STORAGE_KEY_VOLUME, volume.toString());
  }, [volume]);

  // Update SFX and localStorage when mute state changes
  useEffect(() => {
    const sfx = getChiptuneSFX();
    if (isMuted) {
      sfx.mute();
    } else {
      sfx.unmute();
    }
    localStorage.setItem(STORAGE_KEY_MUTED, isMuted.toString());
  }, [isMuted]);

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
        right: '80px', // Position to the left of VolumeToggle
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        fontFamily: 'Courier New, monospace',
        imageRendering: 'pixelated',
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
        title={isMuted ? 'Unmute SFX' : 'Mute SFX'}
        style={{
          width: '48px',
          height: '48px',
          backgroundColor: isMuted ? '#a44' : '#44a',
          border: '3px solid #fff',
          color: '#fff',
          cursor: 'pointer',
          fontFamily: 'Courier New, monospace',
          fontSize: '10px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          imageRendering: 'pixelated',
          textTransform: 'uppercase',
          fontWeight: 'bold',
          gap: '2px',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = isMuted ? '#c66' : '#66c';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = isMuted ? '#a44' : '#44a';
        }}
      >
        {/* FX icon - speaker with sparkle/star */}
        <span style={{ fontSize: '16px', lineHeight: 1 }}>
          {isMuted ? '🔇' : '✨'}
        </span>
        <span style={{ fontSize: '8px', lineHeight: 1 }}>
          SFX
        </span>
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
          title={`SFX Volume: ${Math.round(volume * 100)}%`}
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
