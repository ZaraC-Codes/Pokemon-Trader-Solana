/**
 * GrassRustle Entity
 *
 * Visual effect showing grass shards bursting from the ground beneath a wild Pokemon.
 * Creates a "grass confetti" effect with small shards that shoot up and fall back.
 *
 * Responsibilities:
 * - Render particle-based grass shard confetti
 * - Follow a target Pokemon entity
 * - Play burst animation on spawn, gentle flutter in idle
 * - Clean up when Pokemon is caught/removed
 *
 * Visual Effect:
 * - Small rectangular/triangular shards in various greens
 * - Upward velocity with slight horizontal spread
 * - Quick gravity/fall and fade-out
 * - Burst on spawn (~400-600ms), gentle idle flutter
 *
 * Usage:
 * ```typescript
 * // Created by PokemonSpawnManager when Pokemon spawns:
 * const pokemon = new Pokemon(scene, x, y, pokemonId);
 * const rustle = new GrassRustle(scene, pokemon);
 * rustle.playRustle();
 *
 * // When Pokemon caught or removed:
 * rustle.stopRustle();
 * rustle.destroy();
 * ```
 */

import type { GameScene } from '../scenes/GameScene';
import type { Pokemon } from './Pokemon';

// ============================================================
// CONFIGURATION
// ============================================================

const GRASS_RUSTLE_CONFIG = {
  /** Depth layer (below Pokemon but above ground) */
  DEPTH: 9,
  /** Y offset from Pokemon position (grass appears at feet) */
  Y_OFFSET: 6,
  /** Animation frame rate */
  FRAME_RATE: 10,
  /** Fade in duration when starting */
  FADE_IN_DURATION: 150,
  /** Fade out duration when stopping */
  FADE_OUT_DURATION: 100,
  /** Scale of the rustle effect */
  SCALE: 1.0,
  /** Alpha when fully visible (fully opaque for better visibility) */
  VISIBLE_ALPHA: 1.0,
} as const;

/** Grass shard particle configuration */
const SHARD_CONFIG = {
  /** Number of shards in initial burst */
  BURST_COUNT: 12,
  /** Number of shards in idle flutter */
  IDLE_COUNT: 3,
  /** Grass colors (various greens) - tall thin blades */
  GRASS_COLORS: [0x228B22, 0x32CD32, 0x3CB371, 0x2E8B57, 0x90EE90, 0x006400],
  /** Dirt colors (browns) - short wide clumps */
  DIRT_COLORS: [0x5D4037, 0x8B7355, 0xD2B48C], // dark soil, medium earth, light tan
  /** Probability of a shard being dirt (0-1) */
  DIRT_PROBABILITY: 0.30,
  /** Grass shard dimensions (tall and thin) */
  GRASS_WIDTH_MIN: 2,
  GRASS_WIDTH_MAX: 3,
  GRASS_HEIGHT_MIN: 5,
  GRASS_HEIGHT_MAX: 9,
  /** Dirt shard dimensions (short and wide) */
  DIRT_WIDTH_MIN: 3,
  DIRT_WIDTH_MAX: 5,
  DIRT_HEIGHT_MIN: 2,
  DIRT_HEIGHT_MAX: 4,
  /** Initial upward velocity range */
  VELOCITY_Y_MIN: -120,
  VELOCITY_Y_MAX: -200,
  /** Horizontal spread velocity */
  VELOCITY_X_RANGE: 60,
  /** Gravity pulling shards down */
  GRAVITY: 300,
  /** How long shards live (ms) */
  LIFESPAN_BURST: 500,
  LIFESPAN_IDLE: 400,
  /** Spawn area radius */
  SPAWN_RADIUS: 12,
  /** Burst duration to match Pokemon spawn */
  BURST_DURATION: 500,
  /** Idle flutter interval */
  IDLE_INTERVAL: 800,
  /** Idle flutter intensity (multiplier for velocities) */
  IDLE_INTENSITY: 0.3,
} as const;

/** Single grass shard particle */
interface GrassShard {
  graphics: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  color: number;
  rotation: number;
  rotationSpeed: number;
  alpha: number;
  lifetime: number;
  maxLifetime: number;
}

// ============================================================
// GRASS RUSTLE CLASS
// ============================================================

export class GrassRustle extends Phaser.GameObjects.Container {
  /** Pokemon ID this rustle is associated with */
  public pokemonId: bigint;

  /** Reference to the Pokemon entity being followed */
  public followTarget: Pokemon | null;

  /** Reference to the scene (typed) */
  private gameScene: GameScene;

  /** Whether the rustle animation is currently playing */
  private isPlaying: boolean = false;

  /** Whether the entity is being destroyed */
  private isDestroying: boolean = false;

  /** Scene update event listener reference */
  private updateListener?: () => void;

  /** Active grass shard particles */
  private shards: GrassShard[] = [];

  /** Timer for idle flutter */
  private idleTimer?: Phaser.Time.TimerEvent;

  /** Whether we're in burst or idle mode */
  private isBurstPhase: boolean = false;

  constructor(scene: GameScene, pokemon: Pokemon) {
    super(
      scene,
      pokemon.x,
      pokemon.y + GRASS_RUSTLE_CONFIG.Y_OFFSET
    );

    this.pokemonId = pokemon.id;
    this.followTarget = pokemon;
    this.gameScene = scene;

    // Add to scene
    scene.add.existing(this);

    // Set depth below Pokemon
    this.setDepth(GRASS_RUSTLE_CONFIG.DEPTH);

    // Start invisible
    this.setAlpha(0);
    this.setVisible(false);

    // Set up update listener to follow Pokemon and animate shards
    this.setupUpdateListener();

    console.log('[GrassRustle] Created for Pokemon:', pokemon.id.toString());
  }

  // ============================================================
  // UPDATE LISTENER
  // ============================================================

  /**
   * Set up scene update listener to follow the Pokemon and animate shards.
   */
  private setupUpdateListener(): void {
    this.updateListener = () => {
      if (!this.isDestroying && this.followTarget && this.followTarget.active) {
        this.updatePosition();
      }
      // Always update shards if playing
      if (this.isPlaying && !this.isDestroying) {
        this.updateShards();
      }
    };

    // Listen to scene update event
    this.gameScene.events.on('update', this.updateListener);
  }

  /**
   * Remove the update listener.
   */
  private removeUpdateListener(): void {
    if (this.updateListener) {
      this.gameScene.events.off('update', this.updateListener);
      this.updateListener = undefined;
    }
  }

  /**
   * Update position to follow the Pokemon.
   */
  private updatePosition(): void {
    if (this.followTarget) {
      this.setPosition(
        this.followTarget.x,
        this.followTarget.y + GRASS_RUSTLE_CONFIG.Y_OFFSET
      );
    }
  }

  // ============================================================
  // SHARD MANAGEMENT
  // ============================================================

  /**
   * Create a single grass or dirt shard particle.
   * Grass shards are tall and thin (green), dirt shards are short and wide (brown).
   */
  private createShard(intensity: number = 1.0): GrassShard {
    const graphics = this.gameScene.add.graphics();

    // Determine if this shard is dirt or grass
    const isDirt = Math.random() < SHARD_CONFIG.DIRT_PROBABILITY;

    // Pick color based on type
    const colorPalette = isDirt ? SHARD_CONFIG.DIRT_COLORS : SHARD_CONFIG.GRASS_COLORS;
    const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];

    // Pick dimensions based on type (dirt = short/wide, grass = tall/thin)
    let width: number;
    let height: number;
    if (isDirt) {
      width = SHARD_CONFIG.DIRT_WIDTH_MIN + Math.random() * (SHARD_CONFIG.DIRT_WIDTH_MAX - SHARD_CONFIG.DIRT_WIDTH_MIN);
      height = SHARD_CONFIG.DIRT_HEIGHT_MIN + Math.random() * (SHARD_CONFIG.DIRT_HEIGHT_MAX - SHARD_CONFIG.DIRT_HEIGHT_MIN);
    } else {
      width = SHARD_CONFIG.GRASS_WIDTH_MIN + Math.random() * (SHARD_CONFIG.GRASS_WIDTH_MAX - SHARD_CONFIG.GRASS_WIDTH_MIN);
      height = SHARD_CONFIG.GRASS_HEIGHT_MIN + Math.random() * (SHARD_CONFIG.GRASS_HEIGHT_MAX - SHARD_CONFIG.GRASS_HEIGHT_MIN);
    }

    // Random spawn position within radius
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * SHARD_CONFIG.SPAWN_RADIUS;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * 0.5; // Flatten vertically

    // Random velocity (upward with horizontal spread)
    const vy = (SHARD_CONFIG.VELOCITY_Y_MIN + Math.random() * (SHARD_CONFIG.VELOCITY_Y_MAX - SHARD_CONFIG.VELOCITY_Y_MIN)) * intensity;
    const vx = (Math.random() - 0.5) * SHARD_CONFIG.VELOCITY_X_RANGE * intensity;

    // Random rotation
    const rotation = Math.random() * Math.PI * 2;
    const rotationSpeed = (Math.random() - 0.5) * 8;

    // Lifespan based on intensity
    const maxLifetime = intensity >= 1.0 ? SHARD_CONFIG.LIFESPAN_BURST : SHARD_CONFIG.LIFESPAN_IDLE;

    // Draw the shard (small rectangle/parallelogram)
    graphics.fillStyle(color, 1);
    graphics.fillRect(-width / 2, -height / 2, width, height);
    graphics.setDepth(GRASS_RUSTLE_CONFIG.DEPTH);

    // Add to container so it follows position
    this.add(graphics);

    return {
      graphics,
      x,
      y,
      vx,
      vy,
      width,
      height,
      color,
      rotation,
      rotationSpeed,
      alpha: 1,
      lifetime: 0,
      maxLifetime,
    };
  }

  /**
   * Spawn a burst of shards.
   */
  private spawnBurst(): void {
    for (let i = 0; i < SHARD_CONFIG.BURST_COUNT; i++) {
      this.shards.push(this.createShard(1.0));
    }
  }

  /**
   * Spawn gentle idle shards.
   */
  private spawnIdleShards(): void {
    if (!this.isPlaying || this.isDestroying) return;

    for (let i = 0; i < SHARD_CONFIG.IDLE_COUNT; i++) {
      this.shards.push(this.createShard(SHARD_CONFIG.IDLE_INTENSITY));
    }
  }

  /**
   * Update all active shards (physics and rendering).
   */
  private updateShards(): void {
    const delta = this.gameScene.game.loop.delta / 1000; // Convert to seconds

    for (let i = this.shards.length - 1; i >= 0; i--) {
      const shard = this.shards[i];

      // Update lifetime
      shard.lifetime += this.gameScene.game.loop.delta;

      // Check if shard should be removed
      if (shard.lifetime >= shard.maxLifetime) {
        shard.graphics.destroy();
        this.shards.splice(i, 1);
        continue;
      }

      // Apply gravity
      shard.vy += SHARD_CONFIG.GRAVITY * delta;

      // Update position
      shard.x += shard.vx * delta;
      shard.y += shard.vy * delta;

      // Update rotation
      shard.rotation += shard.rotationSpeed * delta;

      // Calculate alpha (fade out in last 30% of lifetime)
      const lifeProgress = shard.lifetime / shard.maxLifetime;
      if (lifeProgress > 0.7) {
        shard.alpha = 1 - ((lifeProgress - 0.7) / 0.3);
      }

      // Update graphics
      shard.graphics.setPosition(shard.x, shard.y);
      shard.graphics.setRotation(shard.rotation);
      shard.graphics.setAlpha(shard.alpha);
    }
  }

  /**
   * Clear all active shards.
   */
  private clearShards(): void {
    for (const shard of this.shards) {
      shard.graphics.destroy();
    }
    this.shards = [];
  }

  // ============================================================
  // ANIMATION CONTROL
  // ============================================================

  /**
   * Start the grass rustle animation.
   * Plays initial burst then transitions to gentle idle flutter.
   */
  playRustle(): void {
    if (this.isPlaying || this.isDestroying) return;

    this.isPlaying = true;
    this.isBurstPhase = true;
    this.setVisible(true);

    // Fade in the container
    this.gameScene.tweens.add({
      targets: this,
      alpha: GRASS_RUSTLE_CONFIG.VISIBLE_ALPHA,
      duration: GRASS_RUSTLE_CONFIG.FADE_IN_DURATION,
      ease: 'Quad.easeOut',
    });

    // Spawn initial burst
    this.spawnBurst();

    // Transition to idle after burst duration
    this.gameScene.time.delayedCall(SHARD_CONFIG.BURST_DURATION, () => {
      if (this.isPlaying && !this.isDestroying) {
        this.isBurstPhase = false;
        this.startIdleFlutter();
      }
    });

    console.log('[GrassRustle] Started animation for Pokemon:', this.pokemonId.toString());
  }

  /**
   * Start the gentle idle flutter effect.
   */
  private startIdleFlutter(): void {
    // Clear any existing timer
    if (this.idleTimer) {
      this.idleTimer.destroy();
    }

    // Create repeating timer for idle shards
    this.idleTimer = this.gameScene.time.addEvent({
      delay: SHARD_CONFIG.IDLE_INTERVAL,
      callback: () => this.spawnIdleShards(),
      loop: true,
    });

    // Spawn first idle batch immediately
    this.spawnIdleShards();
  }

  /**
   * Stop the grass rustle animation.
   * Fades out and stops spawning new shards.
   *
   * @param immediate - If true, stops immediately without fade
   */
  stopRustle(immediate: boolean = false): void {
    if (!this.isPlaying || this.isDestroying) return;

    this.isPlaying = false;
    this.isBurstPhase = false;

    // Stop idle timer
    if (this.idleTimer) {
      this.idleTimer.destroy();
      this.idleTimer = undefined;
    }

    if (immediate) {
      this.setAlpha(0);
      this.setVisible(false);
      this.clearShards();
      this.gameScene.tweens.killTweensOf(this);
    } else {
      // Fade out then hide
      this.gameScene.tweens.add({
        targets: this,
        alpha: 0,
        duration: GRASS_RUSTLE_CONFIG.FADE_OUT_DURATION,
        ease: 'Quad.easeIn',
        onComplete: () => {
          if (!this.isDestroying) {
            this.setVisible(false);
            this.clearShards();
            this.gameScene.tweens.killTweensOf(this);
          }
        },
      });
    }

    console.log('[GrassRustle] Stopped animation for Pokemon:', this.pokemonId.toString());
  }

  /**
   * Pause the animation temporarily.
   */
  pause(): void {
    if (this.idleTimer) {
      this.idleTimer.paused = true;
    }
  }

  /**
   * Resume a paused animation.
   */
  resume(): void {
    if (this.idleTimer) {
      this.idleTimer.paused = false;
    }
  }

  // ============================================================
  // TARGET MANAGEMENT
  // ============================================================

  /**
   * Set a new Pokemon to follow.
   *
   * @param pokemon - New Pokemon target, or null to clear
   */
  setFollowTarget(pokemon: Pokemon | null): void {
    this.followTarget = pokemon;

    if (pokemon) {
      // Update pokemonId when target changes (for pooling)
      this.pokemonId = pokemon.id;
      this.updatePosition();
    }
  }

  /**
   * Check if the rustle is currently following a valid target.
   */
  hasValidTarget(): boolean {
    return this.followTarget !== null && this.followTarget.active;
  }

  /**
   * Reset the GrassRustle for pooling reuse.
   * Restores default state without destroying the entity.
   * @internal Used by PokemonSpawnManager for object pooling.
   */
  public _resetForPool(): void {
    this.isPlaying = false;
    this.isDestroying = false;
    this.isBurstPhase = false;

    // Stop idle timer
    if (this.idleTimer) {
      this.idleTimer.destroy();
      this.idleTimer = undefined;
    }

    // Clear all shards
    this.clearShards();

    // Stop any running tweens
    this.gameScene.tweens.killTweensOf(this);

    // Reset visual state
    this.setAlpha(0);
    this.setVisible(false);
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  /**
   * Cleanup when destroyed.
   * Removes event listeners and stops animations.
   */
  destroy(fromScene?: boolean): void {
    this.isDestroying = true;

    // Remove update listener
    this.removeUpdateListener();

    // Stop idle timer
    if (this.idleTimer) {
      this.idleTimer.destroy();
      this.idleTimer = undefined;
    }

    // Clear all shards
    try {
      this.clearShards();
    } catch {
      // Ignore - scene may already be destroyed
    }

    // Kill any tweens (guard against undefined scene/tweens)
    try {
      if (this.gameScene?.tweens) {
        this.gameScene.tweens.killTweensOf(this);
      }
    } catch {
      // Ignore - scene may already be destroyed
    }

    // Clear target reference
    this.followTarget = null;

    console.log('[GrassRustle] Destroyed for Pokemon:', this.pokemonId.toString());
    super.destroy(fromScene);
  }
}

// Export config for external use
export { GRASS_RUSTLE_CONFIG };
