import { Types } from 'phaser';
import type { TouchControlMode } from '../managers/TouchInputManager';

// GameBoy Pokemon Red/Blue resolution (scaled up)
export const GAME_WIDTH = 160 * 4; // 640px
export const GAME_HEIGHT = 144 * 4; // 576px

export const TILE_SIZE = 16; // 16x16 pixel tiles
export const MAP_WIDTH = 150; // tiles (increased by 50% from 100)
export const MAP_HEIGHT = 150; // tiles (increased by 50% from 100)

/**
 * Touch control configuration
 *
 * Environment variables:
 * - VITE_TOUCH_CONTROL_MODE: 'tap' | 'dpad' | 'auto' (default: 'tap')
 * - VITE_FORCE_TOUCH_CONTROLS: 'true' to force touch controls on desktop (for testing)
 */
export const TOUCH_CONTROL_CONFIG = {
  /** Control mode: 'tap' for tap-to-move, 'dpad' for virtual D-Pad, 'auto' for auto-detect */
  mode: (import.meta.env.VITE_TOUCH_CONTROL_MODE as TouchControlMode) || 'tap',
  /** Force touch controls even on desktop (for testing) */
  forceEnabled: import.meta.env.VITE_FORCE_TOUCH_CONTROLS === 'true',
  /** D-Pad size in pixels */
  dpadSize: 120,
  /** D-Pad opacity (0-1) */
  dpadOpacity: 0.5,
  /** Margin from screen edge (left side) */
  dpadMargin: 20,
  /** Distance threshold to consider tap target reached */
  tapMoveThreshold: 8,
  /** Show tap indicator when moving */
  showTapIndicator: true,
  /** Height of bottom UI elements (Inventory button: ~44px height + 20px bottom margin = 64px, plus buffer) */
  bottomUIHeight: 70,
  /** Minimum vertical gap between D-Pad bottom and Inventory button top */
  bottomUIPadding: 12,
  /** Minimum margin from top of screen */
  topMargin: 8,
};

// Get viewport dimensions
const getViewportSize = () => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 1920,
  height: typeof window !== 'undefined' ? window.innerHeight : 1080,
});

export const gameConfig: Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: getViewportSize().width,
  height: getViewportSize().height,
  parent: 'game-container',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
    resizeInterval: 100,
  },
  scene: [],
  render: {
    antialias: false,
    pixelArt: true,
  },
};
