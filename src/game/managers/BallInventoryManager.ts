/**
 * BallInventoryManager
 *
 * Client-side manager for tracking the player's PokéBall inventory.
 * Syncs with the PokeballGame contract via event-driven methods.
 *
 * This is a pure logical manager (no Phaser dependency) that can be used by:
 * - React UI components (shop modal, HUD display)
 * - Phaser game mechanics (CatchMechanicsManager)
 *
 * Integration Example:
 * ```typescript
 * // Create singleton instance
 * const ballInventory = new BallInventoryManager();
 *
 * // Subscribe to changes in React component
 * useEffect(() => {
 *   const handleUpdate = (inventory: BallInventory) => {
 *     setInventory(inventory);
 *   };
 *   ballInventory.addListener(handleUpdate);
 *   return () => ballInventory.removeListener(handleUpdate);
 * }, []);
 *
 * // Sync from contract on mount
 * const counts = await contract.getAllPlayerBalls(address);
 * ballInventory.onInventorySynced({
 *   pokeBalls: Number(counts[0]),
 *   greatBalls: Number(counts[1]),
 *   ultraBalls: Number(counts[2]),
 *   masterBalls: Number(counts[3]),
 * });
 *
 * // Handle purchase events
 * contract.on('BallPurchased', (player, ballType, quantity) => {
 *   if (player === currentUser) {
 *     ballInventory.onBallPurchased(ballType, Number(quantity));
 *   }
 * });
 * ```
 */

/**
 * Ball type constants matching the PokeballGame contract.
 */
export const BALL_TYPE = {
  POKE_BALL: 0,
  GREAT_BALL: 1,
  ULTRA_BALL: 2,
  MASTER_BALL: 3,
} as const;

export type BallType = 0 | 1 | 2 | 3;

/**
 * Player's ball inventory counts.
 */
export interface BallInventory {
  /** Type 0 - Basic ball, 2% catch rate, $1.00 */
  pokeBalls: number;
  /** Type 1 - Better ball, 20% catch rate, $10.00 */
  greatBalls: number;
  /** Type 2 - High-tier ball, 50% catch rate, $25.00 */
  ultraBalls: number;
  /** Type 3 - Guaranteed catch, 99% catch rate, $49.90 */
  masterBalls: number;
}

/**
 * Ball metadata for UI display and game logic.
 */
interface BallMetadata {
  name: string;
  price: number;       // USD price
  catchChance: number; // Percentage (0-100)
}

/**
 * Static ball metadata indexed by ball type.
 */
const BALL_METADATA: Record<BallType, BallMetadata> = {
  0: { name: 'Poke Ball', price: 1.0, catchChance: 2 },
  1: { name: 'Great Ball', price: 10.0, catchChance: 20 },
  2: { name: 'Ultra Ball', price: 25.0, catchChance: 50 },
  3: { name: 'Master Ball', price: 49.9, catchChance: 99 },
};

/**
 * Callback type for inventory change listeners.
 */
export type InventoryListener = (inventory: BallInventory) => void;

/**
 * BallInventoryManager
 *
 * Manages the player's PokéBall inventory on the client side.
 * Provides methods for querying counts, consuming balls, and syncing with the contract.
 * Emits events when inventory changes for UI updates.
 */
export class BallInventoryManager {
  /** Internal inventory state */
  private inventory: BallInventory;

  /** Listeners for inventory changes */
  private listeners: Set<InventoryListener>;

  constructor() {
    // Initialize all counts to zero
    this.inventory = {
      pokeBalls: 0,
      greatBalls: 0,
      ultraBalls: 0,
      masterBalls: 0,
    };

    this.listeners = new Set();

    console.log('[BallInventoryManager] Initialized with empty inventory');
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  /**
   * Check if the player has at least one ball of the given type.
   *
   * @param ballType - Ball type (0-3)
   * @returns True if player has at least one ball
   */
  hasBall(ballType: BallType): boolean {
    return this.getBallCount(ballType) > 0;
  }

  /**
   * Get the count of a specific ball type.
   *
   * @param ballType - Ball type (0-3)
   * @returns Number of balls owned
   */
  getBallCount(ballType: BallType): number {
    switch (ballType) {
      case 0:
        return this.inventory.pokeBalls;
      case 1:
        return this.inventory.greatBalls;
      case 2:
        return this.inventory.ultraBalls;
      case 3:
        return this.inventory.masterBalls;
    }
  }

  /**
   * Get all ball counts as a single object.
   * Returns a copy to prevent external mutation.
   *
   * @returns Copy of the current inventory
   */
  getAllCounts(): BallInventory {
    return { ...this.inventory };
  }

  /**
   * Get the total number of balls across all types.
   *
   * @returns Total ball count
   */
  getTotalBalls(): number {
    return (
      this.inventory.pokeBalls +
      this.inventory.greatBalls +
      this.inventory.ultraBalls +
      this.inventory.masterBalls
    );
  }

  // ============================================================
  // BALL METADATA METHODS
  // ============================================================

  /**
   * Get the USD price for a ball type.
   *
   * @param ballType - Ball type (0-3)
   * @returns Price in USD
   */
  getBallPrice(ballType: BallType): number {
    return BALL_METADATA[ballType].price;
  }

  /**
   * Get the catch chance percentage for a ball type.
   *
   * @param ballType - Ball type (0-3)
   * @returns Catch chance as percentage (2, 20, 50, or 99)
   */
  getBallCatchChance(ballType: BallType): number {
    return BALL_METADATA[ballType].catchChance;
  }

  /**
   * Get the display name for a ball type.
   *
   * @param ballType - Ball type (0-3)
   * @returns Human-readable ball name
   */
  getBallName(ballType: BallType): string {
    return BALL_METADATA[ballType].name;
  }

  /**
   * Get all metadata for a ball type.
   *
   * @param ballType - Ball type (0-3)
   * @returns Ball metadata object
   */
  getBallMetadata(ballType: BallType): BallMetadata {
    return { ...BALL_METADATA[ballType] };
  }

  // ============================================================
  // INVENTORY MODIFICATION METHODS
  // ============================================================

  /**
   * Update the count for a specific ball type.
   * Use this for direct contract sync.
   *
   * @param ballType - Ball type (0-3)
   * @param newCount - New count value (must be >= 0)
   */
  updateInventory(ballType: BallType, newCount: number): void {
    // Ensure non-negative
    const safeCount = Math.max(0, Math.floor(newCount));

    switch (ballType) {
      case 0:
        this.inventory.pokeBalls = safeCount;
        break;
      case 1:
        this.inventory.greatBalls = safeCount;
        break;
      case 2:
        this.inventory.ultraBalls = safeCount;
        break;
      case 3:
        this.inventory.masterBalls = safeCount;
        break;
    }

    console.log(`[BallInventoryManager] Updated ${this.getBallName(ballType)} count to ${safeCount}`);
    this.notifyListeners();
  }

  /**
   * Decrement a ball count by 1 (for throwing).
   * Only decrements if the player has at least one ball.
   *
   * @param ballType - Ball type (0-3)
   * @returns True if ball was consumed, false if none available
   */
  decrementBall(ballType: BallType): boolean {
    const currentCount = this.getBallCount(ballType);

    if (currentCount <= 0) {
      console.log(`[BallInventoryManager] Cannot decrement ${this.getBallName(ballType)}: none available`);
      return false;
    }

    switch (ballType) {
      case 0:
        this.inventory.pokeBalls--;
        break;
      case 1:
        this.inventory.greatBalls--;
        break;
      case 2:
        this.inventory.ultraBalls--;
        break;
      case 3:
        this.inventory.masterBalls--;
        break;
    }

    console.log(`[BallInventoryManager] Decremented ${this.getBallName(ballType)}, now: ${this.getBallCount(ballType)}`);
    this.notifyListeners();
    return true;
  }

  /**
   * Add balls to inventory (for purchases or rewards).
   *
   * @param ballType - Ball type (0-3)
   * @param quantity - Number of balls to add (must be > 0)
   */
  private addBalls(ballType: BallType, quantity: number): void {
    if (quantity <= 0) return;

    const safeQuantity = Math.floor(quantity);

    switch (ballType) {
      case 0:
        this.inventory.pokeBalls += safeQuantity;
        break;
      case 1:
        this.inventory.greatBalls += safeQuantity;
        break;
      case 2:
        this.inventory.ultraBalls += safeQuantity;
        break;
      case 3:
        this.inventory.masterBalls += safeQuantity;
        break;
    }
  }

  // ============================================================
  // CONTRACT SYNC METHODS
  // Called from Web3 event listeners or React hooks
  // ============================================================

  /**
   * Handle BallPurchased event from the contract.
   * Called when the player buys balls.
   *
   * @param ballType - Type of ball purchased (0-3)
   * @param quantity - Number of balls purchased
   */
  onBallPurchased(ballType: BallType, quantity: number): void {
    console.log(`[BallInventoryManager] onBallPurchased: ${quantity}x ${this.getBallName(ballType)}`);

    this.addBalls(ballType, quantity);

    console.log(`[BallInventoryManager] New count: ${this.getBallCount(ballType)}`);
    this.notifyListeners();
  }

  /**
   * Sync inventory from contract state.
   * Called on initial load or when reconnecting.
   *
   * @param initial - Full inventory from contract query
   */
  onInventorySynced(initial: BallInventory): void {
    console.log('[BallInventoryManager] onInventorySynced:', initial);

    // Replace entire inventory with contract state
    this.inventory = {
      pokeBalls: Math.max(0, Math.floor(initial.pokeBalls)),
      greatBalls: Math.max(0, Math.floor(initial.greatBalls)),
      ultraBalls: Math.max(0, Math.floor(initial.ultraBalls)),
      masterBalls: Math.max(0, Math.floor(initial.masterBalls)),
    };

    this.notifyListeners();
  }

  /**
   * Handle ball consumption from contract (after successful throw attempt).
   * The contract decrements the ball count, so we sync locally.
   *
   * @param ballType - Type of ball that was consumed
   */
  onBallConsumed(ballType: BallType): void {
    console.log(`[BallInventoryManager] onBallConsumed: ${this.getBallName(ballType)}`);

    // Decrement locally (contract already decremented on-chain)
    this.decrementBall(ballType);
  }

  // ============================================================
  // EVENT LISTENER PATTERN
  // For React/UI integration
  // ============================================================

  /**
   * Subscribe to inventory changes.
   * Listener is called immediately with current state, then on each change.
   *
   * @param listener - Callback function receiving updated inventory
   */
  addListener(listener: InventoryListener): void {
    this.listeners.add(listener);

    // Immediately notify with current state
    listener(this.getAllCounts());

    console.log(`[BallInventoryManager] Listener added, total: ${this.listeners.size}`);
  }

  /**
   * Unsubscribe from inventory changes.
   *
   * @param listener - Previously registered callback
   */
  removeListener(listener: InventoryListener): void {
    this.listeners.delete(listener);

    console.log(`[BallInventoryManager] Listener removed, total: ${this.listeners.size}`);
  }

  /**
   * Notify all listeners of inventory change.
   */
  private notifyListeners(): void {
    const snapshot = this.getAllCounts();

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('[BallInventoryManager] Listener error:', error);
      }
    }
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Check if player can afford to throw any ball.
   *
   * @returns True if player has at least one ball of any type
   */
  hasAnyBalls(): boolean {
    return this.getTotalBalls() > 0;
  }

  /**
   * Get the best available ball type (highest catch chance).
   *
   * @returns Best ball type available, or null if no balls
   */
  getBestAvailableBall(): BallType | null {
    // Check from best to worst
    if (this.hasBall(3)) return 3; // Master Ball
    if (this.hasBall(2)) return 2; // Ultra Ball
    if (this.hasBall(1)) return 1; // Great Ball
    if (this.hasBall(0)) return 0; // Poke Ball
    return null;
  }

  /**
   * Get array of all ball types the player has.
   *
   * @returns Array of available ball types
   */
  getAvailableBallTypes(): BallType[] {
    const available: BallType[] = [];
    if (this.hasBall(0)) available.push(0);
    if (this.hasBall(1)) available.push(1);
    if (this.hasBall(2)) available.push(2);
    if (this.hasBall(3)) available.push(3);
    return available;
  }

  /**
   * Reset inventory to zero (for testing or logout).
   */
  reset(): void {
    this.inventory = {
      pokeBalls: 0,
      greatBalls: 0,
      ultraBalls: 0,
      masterBalls: 0,
    };

    console.log('[BallInventoryManager] Reset to empty inventory');
    this.notifyListeners();
  }

  /**
   * Log current inventory state for debugging.
   */
  debugLogState(): void {
    console.log('[BallInventoryManager] Current inventory:');
    console.log(`  - Poke Balls: ${this.inventory.pokeBalls}`);
    console.log(`  - Great Balls: ${this.inventory.greatBalls}`);
    console.log(`  - Ultra Balls: ${this.inventory.ultraBalls}`);
    console.log(`  - Master Balls: ${this.inventory.masterBalls}`);
    console.log(`  - Total: ${this.getTotalBalls()}`);
    console.log(`  - Listeners: ${this.listeners.size}`);
  }
}

// ============================================================
// SINGLETON EXPORT (optional pattern for global access)
// ============================================================

/**
 * Global singleton instance for shared access across React and Phaser.
 * Use this if you need consistent state between UI and game layers.
 *
 * Usage:
 * ```typescript
 * import { ballInventoryManager } from './BallInventoryManager';
 * ballInventoryManager.hasBall(0); // Check if player has Poke Balls
 * ```
 */
let singletonInstance: BallInventoryManager | null = null;

export function getBallInventoryManager(): BallInventoryManager {
  if (!singletonInstance) {
    singletonInstance = new BallInventoryManager();
  }
  return singletonInstance;
}

/**
 * Reset the singleton (for testing or user logout).
 */
export function resetBallInventoryManager(): void {
  if (singletonInstance) {
    singletonInstance.reset();
  }
  singletonInstance = null;
}
