/**
 * Pokemon Entity
 *
 * Visual representation of a wild Pokemon in the game world.
 * Used by PokemonSpawnManager to display active spawns.
 *
 * Responsibilities:
 * - Render Pokemon sprite with idle bobbing animation
 * - Play spawn/despawn/catch/fail/relocation animations
 * - Handle click interactions for throw targeting
 * - Display attempt counter indicator
 *
 * Texture Requirements:
 * - 'pokemon-placeholder': 16x16 or 32x32 pixel art sprite
 * - Created in GameScene.preload() via createPlaceholderSprites()
 *
 * Usage:
 * ```typescript
 * // Created by PokemonSpawnManager:
 * const pokemon = new Pokemon(scene, x, y, pokemonId);
 * pokemon.playSpawnAnimation();
 *
 * // When caught:
 * await pokemon.playSuccessAnimation();
 * pokemon.destroy();
 *
 * // When escaped:
 * await pokemon.playFailAnimation();
 *
 * // When relocated:
 * await pokemon.playRelocateAnimation(newX, newY);
 * ```
 */

import type { GameScene } from '../scenes/GameScene';

// ============================================================
// CONFIGURATION
// ============================================================

const POKEMON_CONFIG = {
  /** Depth layer for Pokemon sprites */
  DEPTH: 10,
  /** Idle bobbing amplitude in pixels */
  IDLE_BOB_AMPLITUDE: 2,
  /** Idle bobbing speed in ms per cycle */
  IDLE_BOB_DURATION: 1200,
  /** Spawn animation duration in ms */
  SPAWN_DURATION: 400,
  /** Despawn animation duration in ms */
  DESPAWN_DURATION: 300,
  /** Success animation duration in ms */
  SUCCESS_DURATION: 600,
  /** Fail animation (shake) duration in ms */
  FAIL_DURATION: 400,
  /** Relocate fade out duration in ms */
  RELOCATE_FADE_OUT: 250,
  /** Relocate fade in duration in ms */
  RELOCATE_FADE_IN: 300,
  /** Shadow offset Y */
  SHADOW_OFFSET_Y: 12,
  /** Shadow alpha */
  SHADOW_ALPHA: 0.3,
} as const;

// ============================================================
// POKEMON CLASS
// ============================================================

export class Pokemon extends Phaser.GameObjects.Sprite {
  /** Unique Pokemon ID from the contract (uint256) */
  private _id: bigint;

  /** Public getter for the Pokemon ID */
  public get id(): bigint {
    return this._id;
  }

  /** Alias for id (for backwards compatibility) */
  public get pokemonId(): bigint {
    return this._id;
  }

  /**
   * Internal method to update the Pokemon ID.
   * Used by PokemonSpawnManager for object pooling.
   * @internal
   */
  public _setId(newId: bigint): void {
    this._id = newId;
  }

  /** Number of catch attempts made on this Pokemon (0-3) */
  public attemptCount: number = 0;

  /** Reference to the scene (typed) */
  private gameScene: GameScene;

  /** Shadow sprite beneath the Pokemon */
  private shadow?: Phaser.GameObjects.Ellipse;

  /** Idle bobbing tween */
  private idleTween?: Phaser.Tweens.Tween;

  /** Base Y position (before bobbing) */
  private baseY: number;

  /** Whether the entity is being destroyed */
  private isDestroying: boolean = false;

  constructor(scene: GameScene, x: number, y: number, pokemonId: bigint) {
    // Use placeholder texture - created in GameScene.preload()
    super(scene, x, y, 'pokemon-placeholder');

    this._id = pokemonId;
    this.gameScene = scene;
    this.baseY = y;

    // Add to scene
    scene.add.existing(this);

    // Set depth to render above ground but below UI
    this.setDepth(POKEMON_CONFIG.DEPTH);

    // Create shadow
    this.createShadow();

    // Make interactive for click targeting
    this.setInteractive({ useHandCursor: true });

    // Mark as Pokemon for touch input detection
    this.setData('isPokemon', true);
    this.setData('pokemonId', pokemonId);

    // Emit click event when clicked
    this.on('pointerdown', () => {
      if (!this.isDestroying) {
        this.gameScene.events.emit('pokemon-clicked', { pokemonId: this.id });
      }
    });

    // Start idle animation
    this.startIdleAnimation();

    console.log('[Pokemon] Created entity:', pokemonId.toString(), 'at', x, y);
  }

  // ============================================================
  // SHADOW MANAGEMENT
  // ============================================================

  /**
   * Create a shadow ellipse beneath the Pokemon.
   */
  private createShadow(): void {
    this.shadow = this.gameScene.add.ellipse(
      this.x,
      this.y + POKEMON_CONFIG.SHADOW_OFFSET_Y,
      16,
      6,
      0x000000,
      POKEMON_CONFIG.SHADOW_ALPHA
    );
    this.shadow.setDepth(POKEMON_CONFIG.DEPTH - 1);
  }

  /**
   * Update shadow position to follow Pokemon.
   */
  private updateShadowPosition(): void {
    if (this.shadow && !this.shadow.scene) return;
    if (this.shadow) {
      this.shadow.setPosition(this.x, this.baseY + POKEMON_CONFIG.SHADOW_OFFSET_Y);
    }
  }

  // ============================================================
  // IDLE ANIMATION
  // ============================================================

  /**
   * Start the idle bobbing animation.
   */
  private startIdleAnimation(): void {
    this.idleTween = this.gameScene.tweens.add({
      targets: this,
      y: this.baseY - POKEMON_CONFIG.IDLE_BOB_AMPLITUDE,
      duration: POKEMON_CONFIG.IDLE_BOB_DURATION / 2,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Stop the idle bobbing animation.
   */
  private stopIdleAnimation(): void {
    if (this.idleTween) {
      this.idleTween.stop();
      this.idleTween = undefined;
    }
  }

  // ============================================================
  // POSITION MANAGEMENT
  // ============================================================

  /**
   * Override setPosition to update shadow and base position.
   */
  setPosition(x: number, y?: number): this {
    super.setPosition(x, y);
    if (y !== undefined) {
      this.baseY = y;
    }
    this.updateShadowPosition();
    return this;
  }

  // ============================================================
  // SPAWN/DESPAWN ANIMATIONS
  // ============================================================

  /**
   * Play spawn animation (fade in with bounce).
   * Called when Pokemon first appears.
   *
   * @returns Promise that resolves when animation completes
   */
  playSpawnAnimation(): Promise<void> {
    return new Promise((resolve) => {
      // Start invisible and small
      this.setAlpha(0);
      this.setScale(0.5);
      if (this.shadow) {
        this.shadow.setAlpha(0);
        this.shadow.setScale(0.5);
      }

      // Animate in
      this.gameScene.tweens.add({
        targets: this,
        alpha: 1,
        scale: 1,
        duration: POKEMON_CONFIG.SPAWN_DURATION,
        ease: 'Back.easeOut',
        onComplete: () => resolve(),
      });

      // Animate shadow
      if (this.shadow) {
        this.gameScene.tweens.add({
          targets: this.shadow,
          alpha: POKEMON_CONFIG.SHADOW_ALPHA,
          scale: 1,
          duration: POKEMON_CONFIG.SPAWN_DURATION,
          ease: 'Back.easeOut',
        });
      }
    });
  }

  /**
   * Play despawn animation (fade out).
   * Called when Pokemon leaves (not caught, just removed).
   *
   * @returns Promise that resolves when animation completes
   */
  playDespawnAnimation(): Promise<void> {
    return new Promise((resolve) => {
      this.stopIdleAnimation();

      this.gameScene.tweens.add({
        targets: this,
        alpha: 0,
        scale: 0.5,
        duration: POKEMON_CONFIG.DESPAWN_DURATION,
        ease: 'Quad.easeIn',
        onComplete: () => resolve(),
      });

      if (this.shadow) {
        this.gameScene.tweens.add({
          targets: this.shadow,
          alpha: 0,
          scale: 0.5,
          duration: POKEMON_CONFIG.DESPAWN_DURATION,
          ease: 'Quad.easeIn',
        });
      }
    });
  }

  // ============================================================
  // CATCH RESULT ANIMATIONS
  // ============================================================

  /**
   * Play success animation (catch celebration).
   * Shows scale bounce, sparkle effect, and fade out.
   *
   * @returns Promise that resolves when animation completes
   */
  playSuccessAnimation(): Promise<void> {
    return new Promise((resolve) => {
      this.stopIdleAnimation();

      // Create sparkle particles around Pokemon
      this.createSparkles();

      // Bounce scale up then shrink into ball effect
      this.gameScene.tweens.add({
        targets: this,
        scale: { from: 1, to: 1.3 },
        duration: 150,
        ease: 'Quad.easeOut',
        yoyo: true,
        onComplete: () => {
          // Shrink and fade into "captured" effect
          this.gameScene.tweens.add({
            targets: this,
            scale: 0,
            alpha: 0,
            duration: POKEMON_CONFIG.SUCCESS_DURATION - 300,
            ease: 'Back.easeIn',
            onComplete: () => resolve(),
          });
        },
      });

      // Fade shadow
      if (this.shadow) {
        this.gameScene.tweens.add({
          targets: this.shadow,
          alpha: 0,
          scale: 0,
          duration: POKEMON_CONFIG.SUCCESS_DURATION,
          ease: 'Quad.easeIn',
        });
      }
    });
  }

  /**
   * Create sparkle particles for success animation.
   */
  private createSparkles(): void {
    const sparkleCount = 6;
    const colors = [0xffff00, 0xffffff, 0x00ffff];

    for (let i = 0; i < sparkleCount; i++) {
      const angle = (i / sparkleCount) * Math.PI * 2;
      const color = colors[i % colors.length];

      const sparkle = this.gameScene.add.star(
        this.x,
        this.y,
        4, // points
        2, // inner radius
        6, // outer radius
        color
      );
      sparkle.setDepth(POKEMON_CONFIG.DEPTH + 1);
      sparkle.setAlpha(0);

      // Animate sparkle outward
      this.gameScene.tweens.add({
        targets: sparkle,
        x: this.x + Math.cos(angle) * 30,
        y: this.y + Math.sin(angle) * 30,
        alpha: { from: 1, to: 0 },
        scale: { from: 1, to: 0.3 },
        rotation: Math.PI,
        duration: 400,
        ease: 'Quad.easeOut',
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  /**
   * Play fail animation (escape shake).
   * Shows quick shake and small escape movement.
   *
   * @returns Promise that resolves when animation completes
   */
  playFailAnimation(): Promise<void> {
    return new Promise((resolve) => {
      // Stop idle temporarily
      this.stopIdleAnimation();

      const originalX = this.x;

      // Quick shake effect
      this.gameScene.tweens.add({
        targets: this,
        x: { from: originalX - 4, to: originalX + 4 },
        duration: 50,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: 4,
        onComplete: () => {
          // Reset position
          this.x = originalX;

          // Small "escape" hop
          this.gameScene.tweens.add({
            targets: this,
            y: this.baseY - 8,
            duration: 100,
            ease: 'Quad.easeOut',
            yoyo: true,
            onComplete: () => {
              // Resume idle animation
              this.startIdleAnimation();
              resolve();
            },
          });
        },
      });

      // Flash tint briefly
      this.setTint(0xff8888);
      this.gameScene.time.delayedCall(200, () => {
        if (!this.isDestroying) {
          this.clearTint();
        }
      });
    });
  }

  // ============================================================
  // RELOCATION ANIMATION
  // ============================================================

  /**
   * Play relocation animation (teleport effect).
   * Fades out at current position, moves, fades in at new position.
   *
   * @param toX - Target X position
   * @param toY - Target Y position
   * @returns Promise that resolves when animation completes
   */
  playRelocateAnimation(toX: number, toY: number): Promise<void> {
    return new Promise((resolve) => {
      this.stopIdleAnimation();

      // Create departure effect (purple sparkles)
      this.createTeleportEffect(this.x, this.y, 0x8888ff);

      // Fade out
      this.gameScene.tweens.add({
        targets: this,
        alpha: 0,
        scale: 0.5,
        duration: POKEMON_CONFIG.RELOCATE_FADE_OUT,
        ease: 'Quad.easeIn',
        onComplete: () => {
          // Move to new position
          this.setPosition(toX, toY);

          // Create arrival effect
          this.createTeleportEffect(toX, toY, 0x88ff88);

          // Fade in at new location
          this.gameScene.tweens.add({
            targets: this,
            alpha: 1,
            scale: 1,
            duration: POKEMON_CONFIG.RELOCATE_FADE_IN,
            ease: 'Back.easeOut',
            onComplete: () => {
              // Resume idle animation
              this.startIdleAnimation();
              resolve();
            },
          });
        },
      });

      // Fade shadow
      if (this.shadow) {
        this.gameScene.tweens.add({
          targets: this.shadow,
          alpha: 0,
          duration: POKEMON_CONFIG.RELOCATE_FADE_OUT,
          ease: 'Quad.easeIn',
          onComplete: () => {
            this.updateShadowPosition();
            this.gameScene.tweens.add({
              targets: this.shadow,
              alpha: POKEMON_CONFIG.SHADOW_ALPHA,
              duration: POKEMON_CONFIG.RELOCATE_FADE_IN,
              ease: 'Quad.easeOut',
            });
          },
        });
      }
    });
  }

  /**
   * Create teleport sparkle effect at position.
   */
  private createTeleportEffect(x: number, y: number, color: number): void {
    const particleCount = 8;

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const particle = this.gameScene.add.circle(x, y, 3, color);
      particle.setDepth(POKEMON_CONFIG.DEPTH + 1);
      particle.setAlpha(0.8);

      this.gameScene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * 20,
        y: y + Math.sin(angle) * 20,
        alpha: 0,
        scale: 0.5,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  // ============================================================
  // UPDATE & CLEANUP
  // ============================================================

  /**
   * Update loop - called each frame by PokemonSpawnManager.
   * Currently handles shadow sync (bobbing handled by tween).
   *
   * @param _delta - Time since last frame in ms
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(_delta: number): void {
    // Shadow position syncs automatically via tween callbacks
    // This method can be extended for additional per-frame logic
  }

  /**
   * Reset the Pokemon for pooling reuse.
   * Restores default state without destroying the entity.
   * @internal Used by PokemonSpawnManager for object pooling.
   */
  public _resetForPool(): void {
    this.attemptCount = 0;
    this.isDestroying = false;

    // Stop any running tweens
    this.gameScene.tweens.killTweensOf(this);
    if (this.shadow) {
      this.gameScene.tweens.killTweensOf(this.shadow);
    }

    // Reset visual state
    this.setAlpha(1);
    this.setScale(1);
    this.clearTint();

    // Restart idle animation
    this.stopIdleAnimation();
    this.startIdleAnimation();

    // Recreate shadow if needed
    if (!this.shadow || !this.shadow.scene) {
      this.createShadow();
    } else {
      this.shadow.setAlpha(POKEMON_CONFIG.SHADOW_ALPHA);
      this.shadow.setScale(1);
    }

    this.updateShadowPosition();
  }

  /**
   * Cleanup when destroyed.
   * Removes shadow and stops all tweens.
   */
  destroy(fromScene?: boolean): void {
    this.isDestroying = true;

    // Stop idle animation (wrapped in try-catch for scene destruction safety)
    try {
      this.stopIdleAnimation();
    } catch {
      // Ignore - scene may already be destroyed
    }

    // Destroy shadow (wrapped in try-catch for scene destruction safety)
    try {
      if (this.shadow) {
        this.shadow.destroy();
        this.shadow = undefined;
      }
    } catch {
      // Ignore - shadow may already be destroyed
    }

    console.log('[Pokemon] Destroyed entity:', this.id.toString());
    super.destroy(fromScene);
  }
}

// Export config for external use
export { POKEMON_CONFIG };
