import Phaser from 'phaser';

/**
 * Touch control modes:
 * - 'tap': Tap/click anywhere to move toward that position
 * - 'dpad': Virtual D-Pad overlay for directional input
 * - 'auto': Automatically choose based on device (tap for phones, dpad for tablets)
 */
export type TouchControlMode = 'tap' | 'dpad' | 'auto';

/**
 * Movement direction from touch input
 */
export interface TouchMovementState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Target position for tap-to-move mode */
  targetX?: number;
  targetY?: number;
  /** Whether player has reached target (for tap-to-move) */
  reachedTarget: boolean;
}

/**
 * Configuration for touch controls
 */
interface TouchInputConfig {
  /** Control mode: 'tap', 'dpad', or 'auto' */
  mode: TouchControlMode;
  /** D-Pad size in pixels (default: 120) */
  dpadSize: number;
  /** D-Pad opacity (0-1, default: 0.5) */
  dpadOpacity: number;
  /** Margin from screen edge (default: 20) */
  dpadMargin: number;
  /** Distance threshold to consider target reached (default: 8) */
  tapMoveThreshold: number;
  /** Show tap indicator when moving (default: true) */
  showTapIndicator: boolean;
  /** Height of bottom UI elements (Inventory button) to avoid overlap (default: 60) */
  bottomUIHeight: number;
  /** Minimum vertical padding between D-Pad bottom and Inventory button top (default: 10) */
  bottomUIPadding: number;
  /** Minimum margin from top of screen (default: 10) */
  topMargin: number;
}

const DEFAULT_CONFIG: TouchInputConfig = {
  mode: 'auto',
  dpadSize: 120,
  dpadOpacity: 0.5,
  dpadMargin: 20,
  tapMoveThreshold: 8,
  showTapIndicator: true,
  bottomUIHeight: 50,    // Reduced: Inventory button now positioned to the right on square screens
  bottomUIPadding: 10,   // Minimum gap between D-Pad bottom and screen edge
  topMargin: 8,          // Minimum margin from top of screen
};

/**
 * TouchInputManager - Handles mobile/touch input for player movement
 *
 * Supports two modes:
 * 1. Tap-to-move: Tap anywhere on the map to walk toward that position
 * 2. Virtual D-Pad: On-screen directional buttons
 *
 * Automatically detects touch devices and shows controls only when needed.
 */
export class TouchInputManager {
  private scene: Phaser.Scene;
  private config: TouchInputConfig;
  private isTouchDevice: boolean;
  private isEnabled: boolean = true;

  // Movement state
  private movementState: TouchMovementState = {
    left: false,
    right: false,
    up: false,
    down: false,
    reachedTarget: true,
  };

  // D-Pad elements
  private dpadContainer?: Phaser.GameObjects.Container;
  private dpadBackground?: Phaser.GameObjects.Graphics;
  private dpadButtons: Map<string, Phaser.GameObjects.Arc> = new Map();
  private dpadActiveButton?: string;

  // Tap-to-move elements
  private tapIndicator?: Phaser.GameObjects.Graphics;
  private tapIndicatorTween?: Phaser.Tweens.Tween;

  // Touch tracking
  private activeTouchId?: number;
  private lastTouchTime: number = 0;
  private touchStartPos?: { x: number; y: number };

  constructor(scene: Phaser.Scene, config?: Partial<TouchInputConfig>) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Detect touch capability
    this.isTouchDevice = this.detectTouchDevice();

    // Log detection result
    console.log('[TouchInputManager] Touch device detected:', this.isTouchDevice);
    console.log('[TouchInputManager] Control mode:', this.config.mode);

    // Initialize based on mode
    this.initialize();
  }

  /**
   * Detect if running on a touch-capable device
   */
  private detectTouchDevice(): boolean {
    // Check for touch support
    const hasTouch = 'ontouchstart' in window ||
                     navigator.maxTouchPoints > 0 ||
                     (navigator as any).msMaxTouchPoints > 0;

    // Check for mobile user agent (as backup)
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|dGen1/i
      .test(navigator.userAgent);

    // Check for pointer: coarse (touch screens typically have coarse pointers)
    const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;

    // Consider it a touch device if any of these are true
    return hasTouch || isMobileUA || hasCoarsePointer;
  }

  /**
   * Get the effective control mode based on config and device
   */
  private getEffectiveMode(): 'tap' | 'dpad' {
    if (this.config.mode === 'auto') {
      // Auto mode: use tap for phones, could use dpad for larger screens
      // For simplicity, default to tap-to-move (less screen clutter)
      return 'tap';
    }
    return this.config.mode;
  }

  /**
   * Initialize touch input system
   */
  private initialize(): void {
    if (!this.isTouchDevice && this.config.mode === 'auto') {
      console.log('[TouchInputManager] Desktop detected, touch controls disabled');
      return;
    }

    const mode = this.getEffectiveMode();

    if (mode === 'dpad') {
      this.createDPad();
    } else {
      this.createTapToMove();
    }

    console.log('[TouchInputManager] Initialized with mode:', mode);
  }

  /**
   * Create tap-to-move input handler
   */
  private createTapToMove(): void {
    // Create tap indicator (pulsing circle at target position)
    if (this.config.showTapIndicator) {
      this.tapIndicator = this.scene.add.graphics();
      this.tapIndicator.setDepth(1000);
      this.tapIndicator.setVisible(false);
    }

    // Listen for pointer events on the game canvas
    this.scene.input.on('pointerdown', this.handleTapStart, this);
    this.scene.input.on('pointerup', this.handleTapEnd, this);
  }

  /**
   * Handle tap/click start
   */
  private handleTapStart = (pointer: Phaser.Input.Pointer): void => {
    if (!this.isEnabled) return;

    // IMPORTANT: Only handle actual touch events, not mouse clicks
    // This allows mouse clicks to be handled by GameScene for Pokemon interaction
    // On desktop with touchscreen, this lets mouse override touch behavior
    if (pointer.wasTouch === false) {
      // This is a mouse click, not a touch - let other handlers deal with it
      return;
    }

    // Check if pointer is over an interactive game object (like a Pokemon)
    // If so, let the object handle the click instead of moving
    const objectsUnderPointer = this.scene.input.hitTestPointer(pointer);
    if (objectsUnderPointer.length > 0) {
      // Check if any object is a Pokemon or other interactive entity
      for (const obj of objectsUnderPointer) {
        // Skip UI elements like D-Pad buttons
        if (this.dpadButtons.has((obj as any).key)) continue;

        // Check for Pokemon entities (marked with isPokemon data)
        const gameObj = obj as Phaser.GameObjects.GameObject;
        if (gameObj.getData && gameObj.getData('isPokemon')) {
          console.log('[TouchInputManager] Tap on Pokemon entity, skipping movement');
          return; // Don't move, let the Pokemon handle the click
        }

        // Check for other interactive game objects (NPCs, etc.)
        if (obj.input?.enabled) {
          console.log('[TouchInputManager] Tap on interactive object, skipping movement');
          return; // Don't move, let the object handle the click
        }
      }
    }

    // Get world coordinates
    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);

    // Store touch info
    this.activeTouchId = pointer.id;
    this.touchStartPos = { x: pointer.x, y: pointer.y };
    this.lastTouchTime = Date.now();

    // Set target position (in world coordinates)
    this.movementState.targetX = worldPoint.x;
    this.movementState.targetY = worldPoint.y;
    this.movementState.reachedTarget = false;

    // Show tap indicator
    this.showTapIndicator(worldPoint.x, worldPoint.y);

    console.log('[TouchInputManager] Touch at world position:', worldPoint.x, worldPoint.y);
  };

  /**
   * Handle tap/click end
   */
  private handleTapEnd = (pointer: Phaser.Input.Pointer): void => {
    // Only handle touch events, not mouse
    if (pointer.wasTouch === false) return;
    if (pointer.id !== this.activeTouchId) return;

    // Check if it was a quick tap (< 200ms) vs a hold
    const tapDuration = Date.now() - this.lastTouchTime;

    // For tap-to-move, we keep moving even after releasing
    // The target is set on tap down, and we continue until reached

    this.activeTouchId = undefined;
    this.touchStartPos = undefined;
  };

  /**
   * Show tap indicator at target position
   */
  private showTapIndicator(x: number, y: number): void {
    if (!this.tapIndicator || !this.config.showTapIndicator) return;

    // Clear previous
    this.tapIndicator.clear();

    // Draw pulsing circle
    this.tapIndicator.lineStyle(2, 0x00ff00, 0.8);
    this.tapIndicator.strokeCircle(x, y, 12);
    this.tapIndicator.fillStyle(0x00ff00, 0.3);
    this.tapIndicator.fillCircle(x, y, 8);
    this.tapIndicator.setVisible(true);

    // Cancel previous tween
    if (this.tapIndicatorTween) {
      this.tapIndicatorTween.stop();
    }

    // Create pulse animation
    this.tapIndicator.setScale(1);
    this.tapIndicator.setAlpha(1);
    this.tapIndicatorTween = this.scene.tweens.add({
      targets: this.tapIndicator,
      scale: 1.5,
      alpha: 0,
      duration: 600,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tapIndicator?.setVisible(false);
      },
    });
  }

  /**
   * Hide tap indicator
   */
  private hideTapIndicator(): void {
    if (this.tapIndicatorTween) {
      this.tapIndicatorTween.stop();
    }
    this.tapIndicator?.setVisible(false);
  }

  /**
   * Create virtual D-Pad overlay
   */
  private createDPad(): void {
    const { dpadSize, dpadOpacity, dpadMargin, bottomUIHeight, bottomUIPadding, topMargin } = this.config;
    const camera = this.scene.cameras.main;

    // Create container (fixed to camera, bottom-left)
    this.dpadContainer = this.scene.add.container(0, 0);
    this.dpadContainer.setScrollFactor(0);
    this.dpadContainer.setDepth(2000);

    // D-Pad radius for calculations
    const dpadRadius = dpadSize / 2;

    // Calculate the Y position of the top of the Inventory button
    // Inventory button: bottom: 20px margin, ~40px height = top edge at (screenHeight - 60px)
    const inventoryTopY = camera.height - bottomUIHeight;

    // Desired D-Pad center Y: place D-Pad so its bottom edge is `bottomUIPadding` above Inventory button top
    // D-Pad bottom edge = centerY + radius
    // We want: centerY + radius + bottomUIPadding = inventoryTopY
    // So: centerY = inventoryTopY - bottomUIPadding - radius
    const desiredCenterY = inventoryTopY - bottomUIPadding - dpadRadius;

    // Calculate min/max bounds for D-Pad center
    // minY: D-Pad must not go above the screen (top edge at topMargin)
    const minCenterY = topMargin + dpadRadius;
    // maxY: D-Pad bottom must stay above Inventory button with padding
    const maxCenterY = inventoryTopY - bottomUIPadding - dpadRadius;

    // Clamp the center Y position
    // If screen is too short, minCenterY may exceed maxCenterY - in that case, prioritize keeping D-Pad on screen
    const finalCenterY = Math.max(minCenterY, Math.min(desiredCenterY, maxCenterY));

    // X position: left side with margin
    const centerX = dpadMargin + dpadRadius;

    // Log positioning for debugging
    console.log('[TouchInputManager] D-Pad positioning:', {
      screenHeight: camera.height,
      inventoryTopY,
      desiredCenterY,
      minCenterY,
      maxCenterY,
      finalCenterY,
      dpadBottomEdge: finalCenterY + dpadRadius,
      clearanceAboveInventory: inventoryTopY - (finalCenterY + dpadRadius),
    });

    // Background circle
    this.dpadBackground = this.scene.add.graphics();
    this.dpadBackground.fillStyle(0x000000, dpadOpacity * 0.5);
    this.dpadBackground.fillCircle(centerX, finalCenterY, dpadSize / 2);
    this.dpadBackground.lineStyle(2, 0xffffff, dpadOpacity);
    this.dpadBackground.strokeCircle(centerX, finalCenterY, dpadSize / 2);
    this.dpadContainer.add(this.dpadBackground);

    // Button size and positions
    const buttonRadius = dpadSize / 6;
    const buttonOffset = dpadSize / 3;

    // Create directional buttons
    const directions = [
      { key: 'up', x: centerX, y: finalCenterY - buttonOffset },
      { key: 'down', x: centerX, y: finalCenterY + buttonOffset },
      { key: 'left', x: centerX - buttonOffset, y: finalCenterY },
      { key: 'right', x: centerX + buttonOffset, y: finalCenterY },
    ];

    for (const dir of directions) {
      const button = this.scene.add.circle(dir.x, dir.y, buttonRadius, 0x444444, dpadOpacity);
      button.setStrokeStyle(2, 0xffffff, dpadOpacity * 0.8);
      button.setInteractive();

      // Store reference
      this.dpadButtons.set(dir.key, button);
      this.dpadContainer.add(button);

      // Add arrow indicator
      const arrow = this.createArrowGraphic(dir.key, dir.x, dir.y, buttonRadius * 0.6);
      if (arrow) {
        this.dpadContainer.add(arrow);
      }
    }

    // Set up touch events for D-Pad
    this.scene.input.on('pointerdown', this.handleDPadStart, this);
    this.scene.input.on('pointermove', this.handleDPadMove, this);
    this.scene.input.on('pointerup', this.handleDPadEnd, this);
  }

  /**
   * Create arrow graphic for D-Pad button
   */
  private createArrowGraphic(direction: string, x: number, y: number, size: number): Phaser.GameObjects.Graphics | null {
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0xffffff, 0.8);

    const half = size / 2;

    switch (direction) {
      case 'up':
        graphics.fillTriangle(x, y - half, x - half, y + half, x + half, y + half);
        break;
      case 'down':
        graphics.fillTriangle(x, y + half, x - half, y - half, x + half, y - half);
        break;
      case 'left':
        graphics.fillTriangle(x - half, y, x + half, y - half, x + half, y + half);
        break;
      case 'right':
        graphics.fillTriangle(x + half, y, x - half, y - half, x - half, y + half);
        break;
      default:
        return null;
    }

    return graphics;
  }

  /**
   * Handle D-Pad touch start
   */
  private handleDPadStart = (pointer: Phaser.Input.Pointer): void => {
    if (!this.isEnabled || !this.dpadContainer) return;
    // D-Pad works with both mouse and touch for accessibility

    const button = this.getDPadButtonAt(pointer.x, pointer.y);
    if (button) {
      this.activeTouchId = pointer.id;
      this.setDPadDirection(button);
    }
  };

  /**
   * Handle D-Pad touch move
   */
  private handleDPadMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.isEnabled || pointer.id !== this.activeTouchId) return;

    const button = this.getDPadButtonAt(pointer.x, pointer.y);
    if (button !== this.dpadActiveButton) {
      this.setDPadDirection(button);
    }
  };

  /**
   * Handle D-Pad touch end
   */
  private handleDPadEnd = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.activeTouchId) return;

    this.clearDPadDirection();
    this.activeTouchId = undefined;
  };

  /**
   * Get which D-Pad button is at the given screen position
   */
  private getDPadButtonAt(x: number, y: number): string | null {
    for (const [key, button] of this.dpadButtons) {
      const bounds = button.getBounds();
      if (bounds.contains(x, y)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Set active D-Pad direction
   */
  private setDPadDirection(direction: string | null): void {
    // Reset all
    this.movementState.up = false;
    this.movementState.down = false;
    this.movementState.left = false;
    this.movementState.right = false;

    // Reset button colors
    for (const [key, button] of this.dpadButtons) {
      button.setFillStyle(0x444444, this.config.dpadOpacity);
    }

    this.dpadActiveButton = direction ?? undefined;

    if (direction) {
      // Set direction
      (this.movementState as any)[direction] = true;

      // Highlight active button
      const button = this.dpadButtons.get(direction);
      if (button) {
        button.setFillStyle(0x00ff00, this.config.dpadOpacity + 0.2);
      }
    }
  }

  /**
   * Clear D-Pad direction
   */
  private clearDPadDirection(): void {
    this.setDPadDirection(null);
  }

  /**
   * Update touch input state (call this every frame)
   * Returns the current movement state
   */
  update(playerX: number, playerY: number): TouchMovementState {
    const mode = this.getEffectiveMode();

    if (mode === 'tap' && !this.movementState.reachedTarget) {
      // Calculate direction toward target
      const targetX = this.movementState.targetX;
      const targetY = this.movementState.targetY;

      if (targetX !== undefined && targetY !== undefined) {
        const dx = targetX - playerX;
        const dy = targetY - playerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.config.tapMoveThreshold) {
          // Reached target
          this.movementState.reachedTarget = true;
          this.movementState.left = false;
          this.movementState.right = false;
          this.movementState.up = false;
          this.movementState.down = false;
          this.hideTapIndicator();
        } else {
          // Move toward target (4-directional, prioritize larger axis)
          if (Math.abs(dx) > Math.abs(dy)) {
            // Move horizontally
            this.movementState.left = dx < 0;
            this.movementState.right = dx > 0;
            this.movementState.up = false;
            this.movementState.down = false;
          } else {
            // Move vertically
            this.movementState.up = dy < 0;
            this.movementState.down = dy > 0;
            this.movementState.left = false;
            this.movementState.right = false;
          }
        }
      }
    }

    return this.movementState;
  }

  /**
   * Get current movement state without updating
   */
  getMovementState(): TouchMovementState {
    return this.movementState;
  }

  /**
   * Check if touch controls are active
   */
  isTouchActive(): boolean {
    return this.isTouchDevice && this.isEnabled;
  }

  /**
   * Check if any touch movement input is active
   */
  hasMovementInput(): boolean {
    return this.movementState.left ||
           this.movementState.right ||
           this.movementState.up ||
           this.movementState.down;
  }

  /**
   * Enable/disable touch input
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;

    if (!enabled) {
      this.clearDPadDirection();
      this.movementState.reachedTarget = true;
      this.hideTapIndicator();
    }

    if (this.dpadContainer) {
      this.dpadContainer.setVisible(enabled);
    }
  }

  /**
   * Cancel current movement (e.g., when UI opens)
   */
  cancelMovement(): void {
    this.movementState.reachedTarget = true;
    this.movementState.left = false;
    this.movementState.right = false;
    this.movementState.up = false;
    this.movementState.down = false;
    this.hideTapIndicator();
    this.clearDPadDirection();
  }

  /**
   * Change control mode at runtime
   */
  setMode(mode: TouchControlMode): void {
    if (mode === this.config.mode) return;

    // Clean up current mode
    this.destroy();

    // Set new mode and reinitialize
    this.config.mode = mode;
    this.initialize();
  }

  /**
   * Force show touch controls (for testing on desktop)
   */
  forceEnable(): void {
    this.isTouchDevice = true;
    this.initialize();
  }

  /**
   * Check if device is detected as touch-capable
   */
  getIsTouchDevice(): boolean {
    return this.isTouchDevice;
  }

  /**
   * Get current control mode
   */
  getMode(): TouchControlMode {
    return this.config.mode;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Remove event listeners
    this.scene.input.off('pointerdown', this.handleTapStart, this);
    this.scene.input.off('pointerup', this.handleTapEnd, this);
    this.scene.input.off('pointerdown', this.handleDPadStart, this);
    this.scene.input.off('pointermove', this.handleDPadMove, this);
    this.scene.input.off('pointerup', this.handleDPadEnd, this);

    // Destroy UI elements
    this.tapIndicatorTween?.stop();
    this.tapIndicator?.destroy();
    this.dpadContainer?.destroy();
    this.dpadButtons.clear();

    console.log('[TouchInputManager] Destroyed');
  }
}

/**
 * Singleton instance for global access
 */
let touchInputManagerInstance: TouchInputManager | null = null;

/**
 * Get the global TouchInputManager instance
 */
export function getTouchInputManager(): TouchInputManager | null {
  return touchInputManagerInstance;
}

/**
 * Set the global TouchInputManager instance
 */
export function setTouchInputManager(manager: TouchInputManager | null): void {
  touchInputManagerInstance = manager;
}
