import type { GameScene } from '../scenes/GameScene';
import { Pokemon } from '../entities/Pokemon';
import { GrassRustle } from '../entities/GrassRustle';

/**
 * Represents a Pokemon spawn in the game world.
 * Maps directly to on-chain Pokemon data from the PokeballGame contract.
 */
export interface PokemonSpawn {
  /** Unique Pokemon ID from the contract (uint256) */
  id: bigint;
  /** Slot index in the contract (0-19) */
  slotIndex: number;
  /** X position in pixels (world coordinates) */
  x: number;
  /** Y position in pixels (world coordinates) */
  y: number;
  /** Number of throw attempts made against this Pokemon (0-3) */
  attemptCount: number;
  /** Timestamp when Pokemon was spawned (ms since epoch) */
  timestamp: number;
  /** Visual Phaser entity (created when spawn is added) */
  entity?: Pokemon;
  /** Grass rustle effect following the Pokemon */
  grassRustle?: GrassRustle;
}

/**
 * Configuration constants for Pokemon spawn management.
 * Easily adjustable for game balancing.
 *
 * To change the max spawn limit:
 * 1. Update MAX_ACTIVE_SPAWNS here
 * 2. Ensure contract also supports the new limit
 * 3. Consider ENTITY_POOL_SIZE if using pooling (should be >= MAX_ACTIVE_SPAWNS)
 */
const SPAWN_CONFIG = {
  /** Maximum number of Pokemon that can be active at once (matches contract) */
  MAX_ACTIVE_SPAWNS: 20,
  /** Maximum throw attempts before Pokemon relocates */
  MAX_ATTEMPTS: 3,
  /** Catch interaction radius in pixels (how close player must be) */
  CATCH_RANGE_PIXELS: 96,
  /** Distance threshold for getSpawnAt queries in pixels */
  SPAWN_QUERY_RADIUS: 32,
  /** Size of the entity pool for reuse (should be >= MAX_ACTIVE_SPAWNS) */
  ENTITY_POOL_SIZE: 24,
  /** Whether to use object pooling for Pokemon entities */
  USE_POOLING: true,
  /** Minimum distance between Pokemon spawns (for distribution checking) */
  MIN_SPAWN_DISTANCE: 64,
  /** Grid cell size for spatial partitioning (performance optimization) */
  SPATIAL_GRID_CELL_SIZE: 128,
} as const;

/**
 * Pooled entity wrapper for reuse.
 */
interface PooledEntity {
  pokemon: Pokemon;
  grassRustle: GrassRustle;
  inUse: boolean;
}

/**
 * Spatial grid cell for efficient proximity queries.
 */
interface SpatialGridCell {
  spawns: Set<bigint>;
}

/**
 * PokemonSpawnManager
 *
 * Manages up to 20 active Pokemon spawns in the game world.
 * Syncs state with the on-chain PokeballGame contract via event-driven methods.
 *
 * Performance Features:
 * - Object pooling for Pokemon and GrassRustle entities (reduces GC pressure)
 * - Spatial partitioning grid for efficient proximity queries
 * - Map-based lookups for O(1) spawn retrieval by ID
 *
 * Why 20 sprites is safe:
 * - Phaser 3 WebGL renderer efficiently batches sprites
 * - Each Pokemon is a single sprite + shadow ellipse + grass rustle = 3 draw calls
 * - 20 Pokemon = ~60 simple objects, well within Phaser's capabilities
 * - Simple tile-based world has low overall draw call count
 * - Modern browsers easily handle 1000+ sprites at 60fps
 *
 * Integration points:
 * - React hooks call sync methods when contract events fire
 * - Visual Pokemon entities are created/destroyed automatically
 * - Emits Phaser events for UI layer to react to state changes
 *
 * Usage:
 * ```ts
 * // In GameScene.create():
 * this.pokemonSpawnManager = new PokemonSpawnManager(this);
 *
 * // From React Web3 event listener:
 * pokemonSpawnManager.onSpawnAdded(newSpawn);
 * pokemonSpawnManager.onCaughtPokemon(pokemonId);
 * ```
 */
export class PokemonSpawnManager {
  /** Reference to the Phaser scene */
  private scene: GameScene;

  /** Map of Pokemon ID to spawn data for O(1) lookups */
  private spawnsById: Map<bigint, PokemonSpawn> = new Map();

  /** Map of slot index to Pokemon ID for contract slot mapping */
  private slotToId: Map<number, bigint> = new Map();

  /** Entity pool for reuse (reduces garbage collection) */
  private entityPool: PooledEntity[] = [];

  /** Spatial grid for efficient proximity queries */
  private spatialGrid: Map<string, SpatialGridCell> = new Map();

  /** World bounds for spatial grid (set during sync) */
  private worldBounds = { width: 2000, height: 2000 };

  /** Flag to prevent duplicate initialization */
  private isInitialized: boolean = false;

  /** Debug mode flag - when true, shows slot labels and logs spawn activity */
  private debugMode: boolean = false;

  /** Debug labels displayed above Pokemon when debug mode is enabled */
  private debugLabels: Map<bigint, Phaser.GameObjects.Text> = new Map();

  /** Debug overlay container for stats display */
  private debugOverlay?: Phaser.GameObjects.Container;

  /** Debug beacon markers (always visible circles at spawn positions) */
  private debugBeacons: Map<bigint, Phaser.GameObjects.Arc> = new Map();

  /** Debug catch range circles (shown when debug mode is enabled) */
  private debugRangeCircles: Map<bigint, Phaser.GameObjects.Arc> = new Map();

  constructor(scene: GameScene) {
    this.scene = scene;

    // Pre-allocate entity pool if pooling is enabled
    if (SPAWN_CONFIG.USE_POOLING) {
      this.initializeEntityPool();
    }

    console.log('[PokemonSpawnManager] Initialized with max', SPAWN_CONFIG.MAX_ACTIVE_SPAWNS, 'spawns');
  }

  // ============================================================
  // ENTITY POOLING
  // ============================================================

  /**
   * Initialize the entity pool with pre-created but hidden entities.
   * This reduces allocation during gameplay.
   */
  private initializeEntityPool(): void {
    console.log('[PokemonSpawnManager] Initializing entity pool of size', SPAWN_CONFIG.ENTITY_POOL_SIZE);

    for (let i = 0; i < SPAWN_CONFIG.ENTITY_POOL_SIZE; i++) {
      // Create Pokemon at origin, hidden
      const pokemon = new Pokemon(this.scene, -1000, -1000, BigInt(-1 - i));
      pokemon.setVisible(false);
      pokemon.setActive(false);

      // Create GrassRustle for this Pokemon
      const grassRustle = new GrassRustle(this.scene, pokemon);
      grassRustle.setVisible(false);
      grassRustle.setActive(false);

      this.entityPool.push({
        pokemon,
        grassRustle,
        inUse: false,
      });
    }

    console.log('[PokemonSpawnManager] Entity pool ready');
  }

  /**
   * Get an entity from the pool, or create a new one if pool is exhausted.
   */
  private acquireEntityFromPool(spawn: PokemonSpawn): { pokemon: Pokemon; grassRustle: GrassRustle } {
    if (!SPAWN_CONFIG.USE_POOLING) {
      // No pooling - create new entities
      const pokemon = new Pokemon(this.scene, spawn.x, spawn.y, spawn.id);
      const grassRustle = new GrassRustle(this.scene, pokemon);
      return { pokemon, grassRustle };
    }

    // Find available pooled entity
    const available = this.entityPool.find(e => !e.inUse);

    if (available) {
      // Reuse pooled entity
      available.inUse = true;

      // Update the ID first
      available.pokemon._setId(spawn.id);

      // Reconfigure Pokemon
      available.pokemon.setPosition(spawn.x, spawn.y);
      available.pokemon.setVisible(true);
      available.pokemon.setActive(true);

      // Reset Pokemon state for reuse
      available.pokemon._resetForPool();

      // Reconfigure GrassRustle
      available.grassRustle._resetForPool();
      available.grassRustle.setFollowTarget(available.pokemon);
      available.grassRustle.setVisible(true);
      available.grassRustle.setActive(true);

      return { pokemon: available.pokemon, grassRustle: available.grassRustle };
    }

    // Pool exhausted - create new entities (this shouldn't happen often)
    console.warn('[PokemonSpawnManager] Entity pool exhausted, creating new entity');
    const pokemon = new Pokemon(this.scene, spawn.x, spawn.y, spawn.id);
    const grassRustle = new GrassRustle(this.scene, pokemon);
    return { pokemon, grassRustle };
  }

  /**
   * Return an entity to the pool for reuse.
   */
  private releaseEntityToPool(pokemon: Pokemon, grassRustle: GrassRustle): void {
    if (!SPAWN_CONFIG.USE_POOLING) {
      // No pooling - destroy entities
      grassRustle.stopRustle(true);
      grassRustle.destroy();
      pokemon.destroy();
      return;
    }

    // Find matching pooled entity
    const pooled = this.entityPool.find(
      e => e.pokemon === pokemon || e.grassRustle === grassRustle
    );

    if (pooled) {
      // Return to pool
      pooled.inUse = false;

      // Hide and deactivate
      pooled.pokemon.setVisible(false);
      pooled.pokemon.setActive(false);
      pooled.pokemon.setPosition(-1000, -1000);

      pooled.grassRustle.stopRustle(true);
      pooled.grassRustle.setVisible(false);
      pooled.grassRustle.setActive(false);
      pooled.grassRustle.setFollowTarget(null);
    } else {
      // Not from pool - destroy
      grassRustle.stopRustle(true);
      grassRustle.destroy();
      pokemon.destroy();
    }
  }

  // ============================================================
  // SPATIAL PARTITIONING
  // ============================================================

  /**
   * Get the grid cell key for a position.
   */
  private getGridKey(x: number, y: number): string {
    const cellX = Math.floor(x / SPAWN_CONFIG.SPATIAL_GRID_CELL_SIZE);
    const cellY = Math.floor(y / SPAWN_CONFIG.SPATIAL_GRID_CELL_SIZE);
    return `${cellX},${cellY}`;
  }

  /**
   * Add a spawn to the spatial grid.
   */
  private addToSpatialGrid(spawn: PokemonSpawn): void {
    const key = this.getGridKey(spawn.x, spawn.y);
    let cell = this.spatialGrid.get(key);

    if (!cell) {
      cell = { spawns: new Set() };
      this.spatialGrid.set(key, cell);
    }

    cell.spawns.add(spawn.id);
  }

  /**
   * Remove a spawn from the spatial grid.
   */
  private removeFromSpatialGrid(spawn: PokemonSpawn): void {
    const key = this.getGridKey(spawn.x, spawn.y);
    const cell = this.spatialGrid.get(key);

    if (cell) {
      cell.spawns.delete(spawn.id);
      if (cell.spawns.size === 0) {
        this.spatialGrid.delete(key);
      }
    }
  }

  /**
   * Update a spawn's position in the spatial grid.
   */
  private updateSpatialGridPosition(spawn: PokemonSpawn, oldX: number, oldY: number): void {
    const oldKey = this.getGridKey(oldX, oldY);
    const newKey = this.getGridKey(spawn.x, spawn.y);

    if (oldKey !== newKey) {
      // Remove from old cell
      const oldCell = this.spatialGrid.get(oldKey);
      if (oldCell) {
        oldCell.spawns.delete(spawn.id);
        if (oldCell.spawns.size === 0) {
          this.spatialGrid.delete(oldKey);
        }
      }

      // Add to new cell
      this.addToSpatialGrid(spawn);
    }
  }

  /**
   * Get nearby spawn IDs from the spatial grid.
   * Checks the target cell and all adjacent cells.
   */
  private getNearbySpawnIds(x: number, y: number): bigint[] {
    const cellX = Math.floor(x / SPAWN_CONFIG.SPATIAL_GRID_CELL_SIZE);
    const cellY = Math.floor(y / SPAWN_CONFIG.SPATIAL_GRID_CELL_SIZE);
    const nearbyIds: bigint[] = [];

    // Check 3x3 grid of cells around the position
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx},${cellY + dy}`;
        const cell = this.spatialGrid.get(key);
        if (cell) {
          nearbyIds.push(...cell.spawns);
        }
      }
    }

    return nearbyIds;
  }

  // ============================================================
  // CONTRACT SYNC METHODS
  // Called from external layers (React hooks, Web3 event listeners)
  // ============================================================

  /**
   * Initialize spawns from current on-chain state.
   * Called once when the scene starts to sync with existing Pokemon.
   *
   * @param initialSpawns - Array of Pokemon spawns from contract query
   * @param worldBounds - Optional world dimensions for spatial grid optimization
   */
  syncFromContract(
    initialSpawns: PokemonSpawn[],
    worldBounds?: { width: number; height: number }
  ): void {
    // === DIAGNOSTIC LOGGING START ===
    console.log('[PokemonSpawnManager] ========== SYNC FROM CONTRACT ==========');
    console.log('[PokemonSpawnManager] Received array length:', initialSpawns?.length ?? 'undefined/null');
    console.log('[PokemonSpawnManager] Array type:', typeof initialSpawns, Array.isArray(initialSpawns));

    if (!initialSpawns) {
      console.error('[PokemonSpawnManager] ERROR: initialSpawns is null/undefined!');
      return;
    }

    if (!Array.isArray(initialSpawns)) {
      console.error('[PokemonSpawnManager] ERROR: initialSpawns is not an array!', initialSpawns);
      return;
    }

    if (initialSpawns.length === 0) {
      console.warn('[PokemonSpawnManager] WARNING: initialSpawns array is empty!');
      console.warn('[PokemonSpawnManager] This could mean: (1) No active Pokemon on-chain, (2) Hook data not ready, (3) Type conversion issue');
    }

    // Log first 5 spawns for debugging
    const previewCount = Math.min(5, initialSpawns.length);
    for (let i = 0; i < previewCount; i++) {
      const spawn = initialSpawns[i];
      console.log(`[PokemonSpawnManager] Spawn[${i}]:`, {
        id: spawn?.id?.toString() ?? 'undefined',
        slotIndex: spawn?.slotIndex,
        x: spawn?.x,
        y: spawn?.y,
        attemptCount: spawn?.attemptCount,
        timestamp: spawn?.timestamp,
        hasEntity: !!spawn?.entity,
      });
    }
    // === DIAGNOSTIC LOGGING END ===

    // Update world bounds if provided
    if (worldBounds) {
      this.worldBounds = worldBounds;
      console.log('[PokemonSpawnManager] World bounds set to:', worldBounds);
    }

    // Clear any existing spawns (cleanup on re-sync)
    this.clearAllSpawns();

    // Add each spawn (respecting max limit)
    const spawnsToAdd = initialSpawns.slice(0, SPAWN_CONFIG.MAX_ACTIVE_SPAWNS);
    console.log('[PokemonSpawnManager] Adding', spawnsToAdd.length, 'spawns (after slice)');

    for (const spawn of spawnsToAdd) {
      this.addSpawn(spawn);
    }

    this.isInitialized = true;

    // === POST-SYNC DIAGNOSTIC ===
    console.log('[PokemonSpawnManager] ===== POST-SYNC STATE =====');
    console.log('[PokemonSpawnManager] spawnsById.size:', this.spawnsById.size);
    console.log('[PokemonSpawnManager] slotToId.size:', this.slotToId.size);
    console.log('[PokemonSpawnManager] spatialGrid.size:', this.spatialGrid.size);
    if (this.spawnsById.size > 0) {
      console.log('[PokemonSpawnManager] First spawn in map:',
        Array.from(this.spawnsById.values())[0]);
    }
    console.log('[PokemonSpawnManager] ========================================');

    // Emit event for UI layer
    this.scene.events.emit('pokemon-spawns-synced', {
      count: this.spawnsById.size,
      spawns: this.getAllSpawns(),
    });
  }

  /**
   * Handle a new Pokemon spawn event from the contract.
   * Called when PokemonSpawned event is emitted on-chain.
   *
   * @param spawn - New Pokemon spawn data
   */
  onSpawnAdded(spawn: PokemonSpawn): void {
    console.log('[PokemonSpawnManager] onSpawnAdded:', spawn.id.toString(), 'slot:', spawn.slotIndex);

    // Check if we already have this spawn (prevent duplicates)
    if (this.spawnsById.has(spawn.id)) {
      console.warn('[PokemonSpawnManager] Spawn already exists:', spawn.id.toString());
      return;
    }

    // Check if we're at max capacity
    if (this.spawnsById.size >= SPAWN_CONFIG.MAX_ACTIVE_SPAWNS) {
      console.warn('[PokemonSpawnManager] At max capacity, cannot add spawn');
      return;
    }

    this.addSpawn(spawn);

    // Emit event for UI layer
    this.scene.events.emit('pokemon-spawn-added', {
      pokemonId: spawn.id,
      slotIndex: spawn.slotIndex,
      x: spawn.x,
      y: spawn.y,
      totalActive: this.spawnsById.size,
    });
  }

  /**
   * Handle Pokemon relocation event from the contract.
   * Called when PokemonRelocated event is emitted on-chain.
   *
   * @param pokemonId - ID of the Pokemon that relocated
   * @param newX - New X position in pixels
   * @param newY - New Y position in pixels
   */
  onPokemonRelocated(pokemonId: bigint, newX: number, newY: number): void {
    console.log('[PokemonSpawnManager] onPokemonRelocated:', pokemonId.toString(), 'to', newX, newY);

    const spawn = this.spawnsById.get(pokemonId);
    if (!spawn) {
      console.warn('[PokemonSpawnManager] Cannot relocate unknown Pokemon:', pokemonId.toString());
      return;
    }

    // Store old position for animation and spatial grid update
    const oldX = spawn.x;
    const oldY = spawn.y;

    // Update position
    this.updateSpawnPosition(pokemonId, newX, newY, oldX, oldY);

    // Reset attempt count on relocation
    spawn.attemptCount = 0;

    // Emit event for UI layer (can trigger relocation animation)
    this.scene.events.emit('pokemon-relocated', {
      pokemonId,
      oldX,
      oldY,
      newX,
      newY,
    });
  }

  /**
   * Handle successful Pokemon catch event from the contract.
   * Called when CaughtPokemon event is emitted on-chain.
   *
   * @param pokemonId - ID of the Pokemon that was caught
   */
  onCaughtPokemon(pokemonId: bigint): void {
    console.log('[PokemonSpawnManager] onCaughtPokemon:', pokemonId.toString());

    const spawn = this.spawnsById.get(pokemonId);
    if (!spawn) {
      console.warn('[PokemonSpawnManager] Cannot catch unknown Pokemon:', pokemonId.toString());
      return;
    }

    // Store spawn data before removal (for catch animation)
    const catchData = {
      pokemonId,
      slotIndex: spawn.slotIndex,
      x: spawn.x,
      y: spawn.y,
    };

    // Remove the spawn
    this.removeSpawn(pokemonId);

    // Emit event for UI layer (trigger catch celebration)
    this.scene.events.emit('pokemon-caught', catchData);
  }

  /**
   * Handle failed catch attempt event from the contract.
   * Called when FailedCatch event is emitted on-chain.
   *
   * @param pokemonId - ID of the Pokemon that dodged
   * @param attemptsRemaining - Number of attempts remaining (0-2)
   */
  onFailedCatch(pokemonId: bigint, attemptsRemaining: number): void {
    console.log('[PokemonSpawnManager] onFailedCatch:', pokemonId.toString(), 'remaining:', attemptsRemaining);

    const spawn = this.spawnsById.get(pokemonId);
    if (!spawn) {
      console.warn('[PokemonSpawnManager] Cannot fail catch on unknown Pokemon:', pokemonId.toString());
      return;
    }

    // Update attempt count (contract sends remaining, we track count)
    const newAttemptCount = SPAWN_CONFIG.MAX_ATTEMPTS - attemptsRemaining;
    spawn.attemptCount = newAttemptCount;

    // Emit event for UI layer (trigger shake animation, update counter)
    this.scene.events.emit('pokemon-catch-failed', {
      pokemonId,
      slotIndex: spawn.slotIndex,
      attemptCount: newAttemptCount,
      attemptsRemaining,
      x: spawn.x,
      y: spawn.y,
    });

    // Note: If attemptsRemaining === 0, the contract will emit a PokemonRelocated event
    // which will be handled by onPokemonRelocated()
  }

  // ============================================================
  // SPAWN MANAGEMENT HELPERS
  // Core methods for manipulating the spawn collection
  // ============================================================

  /**
   * Add a new Pokemon spawn to the active list.
   * Creates the visual entity and plays spawn effects.
   *
   * @param spawn - Pokemon spawn data to add
   */
  addSpawn(spawn: PokemonSpawn): void {
    // Enforce max spawns
    if (this.spawnsById.size >= SPAWN_CONFIG.MAX_ACTIVE_SPAWNS) {
      console.warn('[PokemonSpawnManager] Cannot add spawn: at max capacity');
      return;
    }

    // Prevent duplicates
    if (this.spawnsById.has(spawn.id)) {
      console.warn('[PokemonSpawnManager] Spawn already exists:', spawn.id.toString());
      return;
    }

    // Ensure timestamp is set
    if (!spawn.timestamp) {
      spawn.timestamp = Date.now();
    }

    // Ensure slotIndex is set (default to -1 if not provided)
    if (spawn.slotIndex === undefined) {
      spawn.slotIndex = -1;
    }

    // Create visual entity (from pool if available)
    const { pokemon, grassRustle } = this.acquireEntityFromPool(spawn);
    spawn.entity = pokemon;
    spawn.grassRustle = grassRustle;

    // Add to collections
    this.spawnsById.set(spawn.id, spawn);
    if (spawn.slotIndex >= 0) {
      this.slotToId.set(spawn.slotIndex, spawn.id);
    }

    // Add to spatial grid
    this.addToSpatialGrid(spawn);

    // Play spawn visual effects
    this.playSpawnEffects(spawn);

    // Create debug visuals if debug mode is enabled
    if (this.debugMode) {
      this.createDebugLabel(spawn);
      this.createDebugBeacon(spawn);
      this.createDebugRangeCircle(spawn);
    }

    console.log('[PokemonSpawnManager] Added spawn:', spawn.id.toString(), 'at', spawn.x, spawn.y, '(slot:', spawn.slotIndex, ')');
  }

  /**
   * Remove a Pokemon spawn from the active list.
   * Returns entity to pool or destroys it.
   *
   * @param pokemonId - ID of the Pokemon to remove
   */
  removeSpawn(pokemonId: bigint): void {
    const spawn = this.spawnsById.get(pokemonId);
    if (!spawn) {
      console.warn('[PokemonSpawnManager] Cannot remove unknown spawn:', pokemonId.toString());
      return;
    }

    // Remove from spatial grid
    this.removeFromSpatialGrid(spawn);

    // Remove from slot mapping
    if (spawn.slotIndex >= 0) {
      this.slotToId.delete(spawn.slotIndex);
    }

    // Return entity to pool or destroy
    if (spawn.entity && spawn.grassRustle) {
      this.releaseEntityToPool(spawn.entity, spawn.grassRustle);
    } else if (spawn.entity) {
      spawn.entity.destroy();
    }

    spawn.entity = undefined;
    spawn.grassRustle = undefined;

    // Remove debug visuals if debug mode is enabled
    if (this.debugMode) {
      this.destroyDebugLabel(pokemonId);
      this.destroyDebugBeacon(pokemonId);
      this.destroyDebugRangeCircle(pokemonId);
    }

    // Remove from main map
    this.spawnsById.delete(pokemonId);

    console.log('[PokemonSpawnManager] Removed spawn:', pokemonId.toString());
  }

  /**
   * Update a Pokemon's position (for relocation).
   * Moves the visual entity to the new position.
   *
   * @param pokemonId - ID of the Pokemon to move
   * @param newX - New X position in pixels
   * @param newY - New Y position in pixels
   * @param oldX - Old X position (for spatial grid update)
   * @param oldY - Old Y position (for spatial grid update)
   */
  updateSpawnPosition(pokemonId: bigint, newX: number, newY: number, oldX?: number, oldY?: number): void {
    const spawn = this.spawnsById.get(pokemonId);
    if (!spawn) {
      console.warn('[PokemonSpawnManager] Cannot update position of unknown spawn:', pokemonId.toString());
      return;
    }

    // Store old position if not provided
    const prevX = oldX ?? spawn.x;
    const prevY = oldY ?? spawn.y;

    // Update data
    spawn.x = newX;
    spawn.y = newY;

    // Update spatial grid
    this.updateSpatialGridPosition(spawn, prevX, prevY);

    // Move visual entity with animation
    if (spawn.entity) {
      this.animateEntityRelocation(spawn, newX, newY);
    }

    console.log('[PokemonSpawnManager] Updated position:', pokemonId.toString(), 'to', newX, newY);
  }

  /**
   * Increment the attempt count for a Pokemon.
   * Called internally when tracking throw attempts.
   *
   * @param pokemonId - ID of the Pokemon
   */
  incrementAttemptCount(pokemonId: bigint): void {
    const spawn = this.spawnsById.get(pokemonId);
    if (!spawn) {
      console.warn('[PokemonSpawnManager] Cannot increment attempts on unknown spawn:', pokemonId.toString());
      return;
    }

    spawn.attemptCount = Math.min(spawn.attemptCount + 1, SPAWN_CONFIG.MAX_ATTEMPTS);

    console.log('[PokemonSpawnManager] Incremented attempts:', pokemonId.toString(), 'now at', spawn.attemptCount);
  }

  // ============================================================
  // QUERY METHODS
  // For game logic and UI to query spawn state
  // ============================================================

  /**
   * Get a spawn by its unique ID.
   * O(1) lookup using Map.
   *
   * @param pokemonId - ID to search for
   * @returns The spawn if found, undefined otherwise
   */
  getSpawnById(pokemonId: bigint): PokemonSpawn | undefined {
    return this.spawnsById.get(pokemonId);
  }

  /**
   * Get a spawn by its contract slot index.
   *
   * @param slotIndex - Slot index (0-19)
   * @returns The spawn if found, undefined otherwise
   */
  getSpawnBySlot(slotIndex: number): PokemonSpawn | undefined {
    const id = this.slotToId.get(slotIndex);
    if (id !== undefined) {
      return this.spawnsById.get(id);
    }
    return undefined;
  }

  /**
   * Get a spawn near a given position.
   * Uses spatial partitioning for efficient proximity queries.
   *
   * @param x - X position to query
   * @param y - Y position to query
   * @returns The nearest spawn if within radius, null otherwise
   */
  getSpawnAt(x: number, y: number): PokemonSpawn | null {
    // Get candidates from spatial grid
    const nearbyIds = this.getNearbySpawnIds(x, y);

    let nearestSpawn: PokemonSpawn | null = null;
    let nearestDistance: number = SPAWN_CONFIG.SPAWN_QUERY_RADIUS;

    for (const id of nearbyIds) {
      const spawn = this.spawnsById.get(id);
      if (spawn) {
        const distance = this.calculateDistance(x, y, spawn.x, spawn.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestSpawn = spawn;
        }
      }
    }

    return nearestSpawn;
  }

  /**
   * Get all currently active spawns.
   * Returns an array copy to prevent external mutation.
   *
   * @returns Array of all active spawns
   */
  getAllSpawns(): PokemonSpawn[] {
    return Array.from(this.spawnsById.values());
  }

  /**
   * Get the number of active spawns.
   *
   * @returns Number of active spawns (0-20)
   */
  getActiveSpawnCount(): number {
    return this.spawnsById.size;
  }

  /**
   * Check if the player is within catch range of a Pokemon.
   * Used to enable/disable throw interaction.
   *
   * @param playerX - Player's X position
   * @param playerY - Player's Y position
   * @param pokemonX - Pokemon's X position
   * @param pokemonY - Pokemon's Y position
   * @returns True if player can attempt a catch
   */
  isPlayerInCatchRange(playerX: number, playerY: number, pokemonX: number, pokemonY: number): boolean {
    const distance = this.calculateDistance(playerX, playerY, pokemonX, pokemonY);
    return distance <= SPAWN_CONFIG.CATCH_RANGE_PIXELS;
  }

  /**
   * Get the catch range in pixels.
   * Useful for UI display and debug visualization.
   */
  getCatchRange(): number {
    return SPAWN_CONFIG.CATCH_RANGE_PIXELS;
  }

  /**
   * Check if player is in range of any active Pokemon.
   * Returns the nearest Pokemon in range, or null if none.
   * Uses spatial partitioning for efficiency with 20 spawns.
   *
   * @param playerX - Player's X position
   * @param playerY - Player's Y position
   * @returns Nearest Pokemon in catch range, or null
   */
  getPokemonInCatchRange(playerX: number, playerY: number): PokemonSpawn | null {
    // Get candidates from spatial grid
    const nearbyIds = this.getNearbySpawnIds(playerX, playerY);

    let nearestInRange: PokemonSpawn | null = null;
    let nearestDistance: number = SPAWN_CONFIG.CATCH_RANGE_PIXELS;

    for (const id of nearbyIds) {
      const spawn = this.spawnsById.get(id);
      if (spawn) {
        const distance = this.calculateDistance(playerX, playerY, spawn.x, spawn.y);
        if (distance <= SPAWN_CONFIG.CATCH_RANGE_PIXELS && distance < nearestDistance) {
          nearestDistance = distance;
          nearestInRange = spawn;
        }
      }
    }

    return nearestInRange;
  }

  /**
   * Get all Pokemon within a certain range of the player.
   * Useful for UI indicators showing nearby catchable Pokemon.
   *
   * @param playerX - Player's X position
   * @param playerY - Player's Y position
   * @param range - Range in pixels (defaults to catch range)
   * @returns Array of spawns within range, sorted by distance
   */
  getPokemonInRange(playerX: number, playerY: number, range: number = SPAWN_CONFIG.CATCH_RANGE_PIXELS): PokemonSpawn[] {
    const nearbyIds = this.getNearbySpawnIds(playerX, playerY);
    const inRange: { spawn: PokemonSpawn; distance: number }[] = [];

    for (const id of nearbyIds) {
      const spawn = this.spawnsById.get(id);
      if (spawn) {
        const distance = this.calculateDistance(playerX, playerY, spawn.x, spawn.y);
        if (distance <= range) {
          inRange.push({ spawn, distance });
        }
      }
    }

    // Sort by distance
    inRange.sort((a, b) => a.distance - b.distance);
    return inRange.map(item => item.spawn);
  }

  /**
   * Check if we can add more spawns.
   *
   * @returns True if under max capacity
   */
  canAddSpawn(): boolean {
    return this.spawnsById.size < SPAWN_CONFIG.MAX_ACTIVE_SPAWNS;
  }

  /**
   * Get remaining attempts for a Pokemon.
   *
   * @param pokemonId - ID of the Pokemon
   * @returns Remaining attempts (0-3), or -1 if not found
   */
  getRemainingAttempts(pokemonId: bigint): number {
    const spawn = this.spawnsById.get(pokemonId);
    if (!spawn) return -1;
    return SPAWN_CONFIG.MAX_ATTEMPTS - spawn.attemptCount;
  }

  /**
   * Get all occupied slot indices.
   *
   * @returns Array of slot indices with active Pokemon
   */
  getOccupiedSlots(): number[] {
    return Array.from(this.slotToId.keys());
  }

  /**
   * Get available (empty) slot indices.
   *
   * @returns Array of slot indices without Pokemon
   */
  getAvailableSlots(): number[] {
    const available: number[] = [];
    for (let i = 0; i < SPAWN_CONFIG.MAX_ACTIVE_SPAWNS; i++) {
      if (!this.slotToId.has(i)) {
        available.push(i);
      }
    }
    return available;
  }

  // ============================================================
  // VISUAL ENTITY MANAGEMENT
  // Creating, destroying, and animating Pokemon sprites
  // ============================================================

  /**
   * Animate a Pokemon entity moving to a new position (relocation).
   * Uses Phaser tweens for smooth movement.
   *
   * @param spawn - Spawn with entity to animate
   * @param newX - Target X position
   * @param newY - Target Y position
   */
  private animateEntityRelocation(spawn: PokemonSpawn, newX: number, newY: number): void {
    if (!spawn.entity) return;

    try {
      // If entity has its own relocation method, use it
      if (typeof spawn.entity.playRelocateAnimation === 'function') {
        spawn.entity.playRelocateAnimation(newX, newY);
        return;
      }

      // Fallback: Simple tween animation
      // First fade out at current position
      this.scene.tweens.add({
        targets: spawn.entity,
        alpha: 0,
        scale: 0.5,
        duration: 300,
        ease: 'Quad.easeIn',
        onComplete: () => {
          if (spawn.entity) {
            // Teleport to new position
            spawn.entity.setPosition(newX, newY);

            // Fade back in
            this.scene.tweens.add({
              targets: spawn.entity,
              alpha: 1,
              scale: 1,
              duration: 300,
              ease: 'Back.easeOut',
            });
          }
        },
      });
    } catch (error) {
      // Fallback: Immediate position update
      console.warn('[PokemonSpawnManager] Animation error, using immediate position update');
      if (spawn.entity) {
        spawn.entity.setPosition(newX, newY);
      }
    }
  }

  // ============================================================
  // VISUAL EFFECTS
  // Spawn effects, particles, etc.
  // ============================================================

  /**
   * Play visual effects when a Pokemon spawns.
   *
   * @param spawn - The spawn to play effects for
   */
  private playSpawnEffects(spawn: PokemonSpawn): void {
    console.log('[PokemonSpawnManager] Playing spawn effects at:', spawn.x, spawn.y);

    // Emit event for external systems (e.g., sound effects) to react
    this.scene.events.emit('pokemon-spawn-effects', {
      x: spawn.x,
      y: spawn.y,
      pokemonId: spawn.id,
      slotIndex: spawn.slotIndex,
    });

    // If entity exists and has spawn animation, play it
    if (spawn.entity && typeof spawn.entity.playSpawnAnimation === 'function') {
      spawn.entity.playSpawnAnimation();
    }

    // Start grass rustle animation
    if (spawn.grassRustle) {
      spawn.grassRustle.playRustle();
    }
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Calculate Euclidean distance between two points.
   *
   * @param x1 - First point X
   * @param y1 - First point Y
   * @param x2 - Second point X
   * @param y2 - Second point Y
   * @returns Distance in pixels
   */
  private calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Clear all spawns (used for cleanup or re-sync).
   */
  private clearAllSpawns(): void {
    // Return all entities to pool
    for (const spawn of this.spawnsById.values()) {
      if (spawn.entity && spawn.grassRustle) {
        this.releaseEntityToPool(spawn.entity, spawn.grassRustle);
      } else {
        if (spawn.entity) {
          spawn.entity.destroy();
        }
        if (spawn.grassRustle) {
          spawn.grassRustle.stopRustle(true);
          spawn.grassRustle.destroy();
        }
      }
      spawn.entity = undefined;
      spawn.grassRustle = undefined;
    }

    // Clear collections
    this.spawnsById.clear();
    this.slotToId.clear();
    this.spatialGrid.clear();

    console.log('[PokemonSpawnManager] Cleared all spawns');
  }

  /**
   * Update loop - called from GameScene.update().
   * Updates visual entities and checks for state changes.
   *
   * @param _delta - Time since last frame in ms
   */
  update(_delta: number): void {
    // Update each Pokemon entity if it has an update method
    // Note: With pooling, we only update entities that are in use
    for (const spawn of this.spawnsById.values()) {
      if (spawn.entity && typeof spawn.entity.update === 'function') {
        spawn.entity.update(_delta);
      }
    }
  }

  /**
   * Cleanup when scene is destroyed.
   * Call from GameScene.shutdown().
   */
  destroy(): void {
    // Clean up debug mode visuals
    this.destroyDebugOverlay();
    this.destroyAllDebugLabels();
    this.destroyAllDebugBeacons();
    this.destroyAllDebugRangeCircles();

    this.clearAllSpawns();

    // Destroy pooled entities
    for (const pooled of this.entityPool) {
      if (pooled.grassRustle && !pooled.grassRustle.scene) continue;
      try {
        pooled.grassRustle.destroy();
      } catch { /* ignore */ }
      try {
        pooled.pokemon.destroy();
      } catch { /* ignore */ }
    }
    this.entityPool = [];

    this.isInitialized = false;
    console.log('[PokemonSpawnManager] Destroyed');
  }

  // ============================================================
  // STATISTICS & DEBUG METHODS
  // ============================================================

  /**
   * Get spawn statistics for monitoring.
   */
  getStats(): {
    activeCount: number;
    maxCount: number;
    poolSize: number;
    poolInUse: number;
    gridCells: number;
  } {
    return {
      activeCount: this.spawnsById.size,
      maxCount: SPAWN_CONFIG.MAX_ACTIVE_SPAWNS,
      poolSize: this.entityPool.length,
      poolInUse: this.entityPool.filter(e => e.inUse).length,
      gridCells: this.spatialGrid.size,
    };
  }

  /**
   * Log current state for debugging.
   * Call this from browser console: window.__PHASER_GAME__.scene.getScene('GameScene').pokemonSpawnManager.debugLogState()
   */
  debugLogState(): void {
    console.log('\n[PokemonSpawnManager] ============ DEBUG STATE ============');
    console.log('  Initialized:', this.isInitialized);
    console.log('  Debug Mode:', this.debugMode);

    console.log('\n  --- Collections ---');
    console.log('  spawnsById.size:', this.spawnsById.size);
    console.log('  slotToId.size:', this.slotToId.size);
    console.log('  entityPool.length:', this.entityPool.length);
    console.log('  spatialGrid.size:', this.spatialGrid.size);

    console.log('\n  --- Pool Status ---');
    const inUse = this.entityPool.filter(e => e.inUse).length;
    console.log(`  Pool usage: ${inUse} / ${this.entityPool.length} in use`);

    console.log('\n  --- Slot Mapping (slotToId) ---');
    if (this.slotToId.size === 0) {
      console.log('  (empty - no slots occupied)');
    } else {
      for (const [slot, id] of this.slotToId.entries()) {
        console.log(`  Slot ${slot} -> ID ${id.toString()}`);
      }
    }

    console.log('\n  --- All Spawns (spawnsById) ---');
    if (this.spawnsById.size === 0) {
      console.log('  (empty - no spawns registered)');
    } else {
      let i = 0;
      for (const spawn of this.spawnsById.values()) {
        console.log(`  [${i}] ID: ${spawn.id.toString()}`);
        console.log(`       Slot: ${spawn.slotIndex}, Pos: (${spawn.x}, ${spawn.y})`);
        console.log(`       Attempts: ${spawn.attemptCount}, Timestamp: ${spawn.timestamp}`);
        console.log(`       HasEntity: ${!!spawn.entity}, HasGrass: ${!!spawn.grassRustle}`);
        if (spawn.entity) {
          console.log(`       Entity visible: ${spawn.entity.visible}, active: ${spawn.entity.active}`);
        }
        i++;
        if (i >= 10) {
          console.log(`       ... and ${this.spawnsById.size - 10} more`);
          break;
        }
      }
    }

    console.log('\n  --- Spatial Grid ---');
    if (this.spatialGrid.size === 0) {
      console.log('  (empty - no grid cells)');
    } else {
      for (const [key, cell] of this.spatialGrid.entries()) {
        console.log(`  Cell ${key}: ${cell.spawns.size} spawn(s)`);
      }
    }

    console.log('===============================================\n');
  }

  // ============================================================
  // DEBUG MODE
  // ============================================================

  /**
   * Enable or disable debug mode.
   * When enabled:
   * - Shows slot index labels above each Pokemon
   * - Displays a stats overlay in the corner
   * - Logs detailed spawn activity to console
   *
   * @param enabled - Whether to enable debug mode
   *
   * Usage in GameScene:
   * ```typescript
   * // Enable debug mode
   * this.pokemonSpawnManager.setDebugMode(true);
   *
   * // Or toggle with a key
   * this.input.keyboard.on('keydown-F3', () => {
   *   this.pokemonSpawnManager.toggleDebugMode();
   * });
   * ```
   */
  setDebugMode(enabled: boolean): void {
    if (this.debugMode === enabled) {
      console.log('[PokemonSpawnManager] Debug mode already', enabled ? 'ENABLED' : 'DISABLED', '- no change');
      return;
    }

    this.debugMode = enabled;
    console.log('[PokemonSpawnManager] Debug mode:', enabled ? 'ENABLED' : 'DISABLED');
    console.log('[PokemonSpawnManager] Current beacons count:', this.debugBeacons.size);
    console.log('[PokemonSpawnManager] Current labels count:', this.debugLabels.size);
    console.log('[PokemonSpawnManager] Current range circles count:', this.debugRangeCircles.size);

    if (enabled) {
      this.createDebugOverlay();
      this.createAllDebugLabels(); // Also creates beacons and range circles
      console.log('[PokemonSpawnManager] After enable - beacons:', this.debugBeacons.size, 'labels:', this.debugLabels.size, 'range circles:', this.debugRangeCircles.size);
    } else {
      console.log('[PokemonSpawnManager] Disabling debug mode - destroying visuals...');
      this.destroyDebugOverlay();
      this.destroyAllDebugLabels();
      this.destroyAllDebugBeacons();
      this.destroyAllDebugRangeCircles();
      console.log('[PokemonSpawnManager] After disable - beacons:', this.debugBeacons.size, 'labels:', this.debugLabels.size, 'range circles:', this.debugRangeCircles.size);
    }
  }

  /**
   * Toggle debug mode on/off.
   * @returns The new debug mode state
   */
  toggleDebugMode(): boolean {
    this.setDebugMode(!this.debugMode);
    return this.debugMode;
  }

  /**
   * Check if debug mode is currently enabled.
   */
  isDebugMode(): boolean {
    return this.debugMode;
  }

  /**
   * Create the debug stats overlay in the top-left corner.
   */
  private createDebugOverlay(): void {
    if (this.debugOverlay) return;

    // Create container fixed to camera
    this.debugOverlay = this.scene.add.container(10, 10);
    this.debugOverlay.setScrollFactor(0); // Fixed to camera
    this.debugOverlay.setDepth(1000);

    // Background
    const bg = this.scene.add.rectangle(0, 0, 220, 120, 0x000000, 0.7);
    bg.setOrigin(0, 0);
    this.debugOverlay.add(bg);

    // Title
    const title = this.scene.add.text(10, 5, '🐾 SPAWN DEBUG', {
      fontSize: '12px',
      fontFamily: 'Courier New, monospace',
      color: '#00ff00',
    });
    this.debugOverlay.add(title);

    // Stats text (will be updated)
    const statsText = this.scene.add.text(10, 25, '', {
      fontSize: '10px',
      fontFamily: 'Courier New, monospace',
      color: '#ffffff',
      lineSpacing: 4,
    });
    statsText.setName('statsText');
    this.debugOverlay.add(statsText);

    this.updateDebugOverlay();
  }

  /**
   * Update the debug overlay with current stats.
   */
  private updateDebugOverlay(): void {
    if (!this.debugOverlay) return;

    const statsText = this.debugOverlay.getByName('statsText') as Phaser.GameObjects.Text;
    if (!statsText) return;

    const stats = this.getStats();
    const occupiedSlots = Array.from(this.slotToId.keys()).sort((a, b) => a - b);

    const lines = [
      `Active: ${stats.activeCount} / ${stats.maxCount}`,
      `Pool: ${stats.poolInUse} / ${stats.poolSize} in use`,
      `Grid cells: ${stats.gridCells}`,
      `Slots: ${occupiedSlots.length > 0 ? occupiedSlots.join(',') : 'none'}`,
      ``,
      `Press F3 to toggle`,
    ];

    statsText.setText(lines.join('\n'));
  }

  /**
   * Destroy the debug overlay.
   */
  private destroyDebugOverlay(): void {
    if (this.debugOverlay) {
      this.debugOverlay.destroy(true);
      this.debugOverlay = undefined;
    }
  }

  /**
   * Create debug labels for all current spawns.
   */
  private createAllDebugLabels(): void {
    for (const spawn of this.spawnsById.values()) {
      this.createDebugLabel(spawn);
      this.createDebugBeacon(spawn);
      this.createDebugRangeCircle(spawn);
    }
  }

  /**
   * Create a debug beacon (small marker) at spawn position.
   * Only shown in debug mode for position verification.
   * @deprecated Debug beacons are disabled - grass rustle is the main visual indicator
   */
  private createDebugBeacon(_spawn: PokemonSpawn): void {
    // Debug beacons disabled - grass rustle effect is the main visual indicator
    // The Pokemon entity itself is semi-transparent and hard to see on purpose
    return;
  }

  /**
   * Create a debug catch range circle around a Pokemon.
   * Shows the allowed proximity for catch attempts.
   */
  private createDebugRangeCircle(spawn: PokemonSpawn): void {
    if (!this.debugMode) return;
    if (this.debugRangeCircles.has(spawn.id)) return;

    const rangeCircle = this.scene.add.arc(
      spawn.x,
      spawn.y,
      SPAWN_CONFIG.CATCH_RANGE_PIXELS,
      0,
      360,
      false,
      0x00ff00,
      0.15
    );
    rangeCircle.setStrokeStyle(1, 0x00ff00, 0.4);
    rangeCircle.setDepth(5); // Below Pokemon but visible

    this.debugRangeCircles.set(spawn.id, rangeCircle);
    console.log(`[PokemonSpawnManager] Created catch range circle for spawn ${spawn.id.toString()}`);
  }

  /**
   * Destroy a debug catch range circle for a Pokemon.
   */
  private destroyDebugRangeCircle(pokemonId: bigint): void {
    const circle = this.debugRangeCircles.get(pokemonId);
    if (circle) {
      circle.destroy();
      this.debugRangeCircles.delete(pokemonId);
    }
  }

  /**
   * Destroy all debug catch range circles.
   */
  private destroyAllDebugRangeCircles(): void {
    console.log(`[PokemonSpawnManager] Destroying ${this.debugRangeCircles.size} catch range circles`);
    for (const circle of this.debugRangeCircles.values()) {
      circle.destroy();
    }
    this.debugRangeCircles.clear();
  }

  /**
   * Destroy a debug beacon for a Pokemon.
   */
  private destroyDebugBeacon(pokemonId: bigint): void {
    const beacon = this.debugBeacons.get(pokemonId);
    if (beacon) {
      this.scene.tweens.killTweensOf(beacon);
      beacon.destroy();
      this.debugBeacons.delete(pokemonId);
    }
  }

  /**
   * Destroy all debug beacons.
   */
  private destroyAllDebugBeacons(): void {
    console.log(`[PokemonSpawnManager] Destroying ${this.debugBeacons.size} debug beacons`);
    for (const [id, beacon] of this.debugBeacons.entries()) {
      console.log(`[PokemonSpawnManager] Destroying beacon for ID ${id.toString()}`);
      this.scene.tweens.killTweensOf(beacon);
      beacon.destroy();
    }
    this.debugBeacons.clear();
    console.log(`[PokemonSpawnManager] Debug beacons cleared, size: ${this.debugBeacons.size}`);
  }

  /**
   * Create a debug label above a Pokemon showing its slot index.
   */
  private createDebugLabel(spawn: PokemonSpawn): void {
    if (!this.debugMode) return;
    if (this.debugLabels.has(spawn.id)) return;

    const label = this.scene.add.text(spawn.x, spawn.y - 24, `[${spawn.slotIndex}]`, {
      fontSize: '10px',
      fontFamily: 'Courier New, monospace',
      color: '#ffff00',
      backgroundColor: '#000000',
      padding: { x: 2, y: 1 },
    });
    label.setOrigin(0.5, 1);
    label.setDepth(200);

    this.debugLabels.set(spawn.id, label);

    // Log spawn details
    console.log(
      `[DEBUG] Spawn: slot=${spawn.slotIndex}, id=${spawn.id.toString()}, pos=(${spawn.x}, ${spawn.y}), attempts=${spawn.attemptCount}`
    );
  }

  /**
   * Update a debug label position to follow its Pokemon.
   */
  private updateDebugLabel(spawn: PokemonSpawn): void {
    const label = this.debugLabels.get(spawn.id);
    if (label) {
      label.setPosition(spawn.x, spawn.y - 24);
    }
  }

  /**
   * Destroy a debug label for a Pokemon.
   */
  private destroyDebugLabel(pokemonId: bigint): void {
    const label = this.debugLabels.get(pokemonId);
    if (label) {
      label.destroy();
      this.debugLabels.delete(pokemonId);
    }
  }

  /**
   * Destroy all debug labels.
   */
  private destroyAllDebugLabels(): void {
    for (const label of this.debugLabels.values()) {
      label.destroy();
    }
    this.debugLabels.clear();
  }

  /**
   * Update debug visuals (call from scene update loop).
   * Updates label positions and overlay stats.
   */
  updateDebug(): void {
    if (!this.debugMode) return;

    // Update label positions
    for (const spawn of this.spawnsById.values()) {
      this.updateDebugLabel(spawn);
    }

    // Update overlay stats periodically (every 30 frames)
    if (this.scene.game.loop.frame % 30 === 0) {
      this.updateDebugOverlay();
    }
  }

  /**
   * Print a formatted table of all spawns to the console.
   * Useful for quick debugging without enabling visual debug mode.
   */
  printSpawnTable(): void {
    console.log('\n[PokemonSpawnManager] Spawn Table:');
    console.log('┌──────┬──────────────────┬────────────────────┬──────────┐');
    console.log('│ Slot │ Pokemon ID       │ Position           │ Attempts │');
    console.log('├──────┼──────────────────┼────────────────────┼──────────┤');

    const spawns = Array.from(this.spawnsById.values()).sort((a, b) => a.slotIndex - b.slotIndex);

    if (spawns.length === 0) {
      console.log('│  (no active spawns)                                    │');
    } else {
      for (const spawn of spawns) {
        const slot = spawn.slotIndex.toString().padStart(4);
        const id = spawn.id.toString().slice(0, 14).padEnd(16);
        const pos = `(${spawn.x}, ${spawn.y})`.padEnd(18);
        const attempts = `${spawn.attemptCount}/${SPAWN_CONFIG.MAX_ATTEMPTS}`.padStart(8);
        console.log(`│ ${slot} │ ${id} │ ${pos} │ ${attempts} │`);
      }
    }

    console.log('└──────┴──────────────────┴────────────────────┴──────────┘');
    console.log(`Total: ${this.spawnsById.size} / ${SPAWN_CONFIG.MAX_ACTIVE_SPAWNS} spawns\n`);
  }

  /**
   * Get a summary string for quick logging.
   */
  getSummary(): string {
    const stats = this.getStats();
    const slots = Array.from(this.slotToId.keys()).sort((a, b) => a - b);
    return `[Spawns: ${stats.activeCount}/${stats.maxCount}] [Pool: ${stats.poolInUse}/${stats.poolSize}] [Slots: ${slots.join(',') || 'none'}]`;
  }
}

// Export configuration for external use
export { SPAWN_CONFIG };
