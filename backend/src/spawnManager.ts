/**
 * Spawn Manager — ensures minimum central Pokemon spawns near player start.
 * Called by the cron tick to maintain at least MIN_CENTRAL_SPAWNS active
 * Pokemon within CENTER_RADIUS of the map center (player spawn point).
 *
 * Constants must stay consistent with:
 *   - scripts/solana/spawn-pokemon.ts  (batch mode)
 *   - scripts/solana/check-spawns.ts   (debug script)
 */
import { SolanaClient, PokemonSlotData } from "./solanaClient.js";

// ── Central Zone Constants ──────────────────────────────────
export const CENTER_X = 500;
export const CENTER_Y = 500;
export const CENTER_RADIUS = 80; // ±80 contract units ≈ ±192px ≈ 12 tiles
export const MIN_CENTRAL_SPAWNS = 4;
export const EDGE_MARGIN = 50;
export const MAX_POKEMON_SLOTS = 20;

// ── Result Interface ────────────────────────────────────────
export interface SpawnManagerResult {
  centralBefore: number;
  centralAfter: number;
  spawned: number;
  repositioned: number;
  totalActive: number;
  actions: string[];
}

// ── Helpers ─────────────────────────────────────────────────

/** Check whether a position falls within the central zone (box / L-infinity). */
export function isInCentralZone(x: number, y: number): boolean {
  return (
    x >= CENTER_X - CENTER_RADIUS &&
    x <= CENTER_X + CENTER_RADIUS &&
    y >= CENTER_Y - CENTER_RADIUS &&
    y <= CENTER_Y + CENTER_RADIUS
  );
}

/** Chebyshev (L-infinity) distance from center — matches the box check. */
export function distanceFromCenter(x: number, y: number): number {
  return Math.max(Math.abs(x - CENTER_X), Math.abs(y - CENTER_Y));
}

/** Random int in [min, max] inclusive. */
function randRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random position within the central zone, clamped away from edges. */
export function randomCentralPosition(): { x: number; y: number } {
  const minX = Math.max(EDGE_MARGIN, CENTER_X - CENTER_RADIUS);
  const maxX = Math.min(999 - EDGE_MARGIN, CENTER_X + CENTER_RADIUS);
  const minY = Math.max(EDGE_MARGIN, CENTER_Y - CENTER_RADIUS);
  const maxY = Math.min(999 - EDGE_MARGIN, CENTER_Y + CENTER_RADIUS);
  return { x: randRange(minX, maxX), y: randRange(minY, maxY) };
}

/** Random position anywhere on the map (0-999). */
export function randomMapPosition(): { x: number; y: number } {
  return {
    x: Math.floor(Math.random() * 1000),
    y: Math.floor(Math.random() * 1000),
  };
}

// ── Main Function ───────────────────────────────────────────

/**
 * Ensure at least MIN_CENTRAL_SPAWNS active Pokemon exist in the central zone.
 *
 * Algorithm:
 * 1. Read PokemonSlots from chain
 * 2. Count how many active slots have positions within CENTER_RADIUS of (500,500)
 * 3. If central count < MIN_CENTRAL_SPAWNS:
 *    a. First, fill empty slots with central spawns (forceSpawnPokemon)
 *    b. If still not enough, reposition the farthest non-central Pokemon
 *       into the central zone (repositionPokemon)
 * 4. Optionally fill remaining empty slots with global random spawns
 *    (controlled by fillGlobal parameter, defaults to false)
 */
export async function ensureCentralSpawns(
  client: SolanaClient,
  options: { fillGlobal?: boolean; maxGlobalFill?: number } = {}
): Promise<SpawnManagerResult> {
  const { fillGlobal = false, maxGlobalFill = 8 } = options;
  const actions: string[] = [];

  // 1. Read current state
  const pokemonSlots = await client.getPokemonSlots();
  const gameConfig = await client.getGameConfig();
  const maxActive = gameConfig.maxActivePokemon;

  // 2. Analyze slots
  const emptySlotIndices: number[] = [];
  let centralCount = 0;
  let totalActive = 0;
  // Track non-central active slots sorted by distance (farthest first) for reposition
  const nonCentralSlots: Array<{ index: number; dist: number }> = [];

  for (let i = 0; i < MAX_POKEMON_SLOTS; i++) {
    const slot = pokemonSlots.slots[i];
    if (slot.isActive) {
      totalActive++;
      if (isInCentralZone(slot.posX, slot.posY)) {
        centralCount++;
      } else {
        nonCentralSlots.push({
          index: i,
          dist: distanceFromCenter(slot.posX, slot.posY),
        });
      }
    } else {
      emptySlotIndices.push(i);
    }
  }

  // Sort non-central by distance descending (farthest first — reposition these first)
  nonCentralSlots.sort((a, b) => b.dist - a.dist);

  console.log(
    `[SpawnManager] State: ${totalActive} active, ${centralCount} central, ` +
      `${emptySlotIndices.length} empty, max_active=${maxActive}`
  );

  const centralBefore = centralCount;
  let spawned = 0;
  let repositioned = 0;

  // 3a. Fill central zone deficit using empty slots first
  if (centralCount < MIN_CENTRAL_SPAWNS) {
    const spawnableCount = Math.max(
      0,
      Math.min(
        MIN_CENTRAL_SPAWNS - centralCount,
        emptySlotIndices.length,
        maxActive - totalActive
      )
    );

    if (spawnableCount > 0) {
      console.log(
        `[SpawnManager] Spawning ${spawnableCount} central Pokemon into empty slots`
      );

      for (let i = 0; i < spawnableCount; i++) {
        const slotIndex = emptySlotIndices.shift()!;
        const { x, y } = randomCentralPosition();

        try {
          const tx = await client.forceSpawnPokemon(slotIndex, x, y);
          const msg = `Spawned central Pokemon at slot ${slotIndex} (${x}, ${y}) TX: ${tx}`;
          console.log(`  [SpawnManager] ${msg}`);
          actions.push(msg);
          centralCount++;
          totalActive++;
          spawned++;
        } catch (err) {
          const errMsg = `Failed to spawn at slot ${slotIndex}: ${err instanceof Error ? err.message : err}`;
          console.error(`  [SpawnManager] ${errMsg}`);
          actions.push(errMsg);
        }
      }
    }

    // 3b. If still not enough central spawns, reposition farthest non-central Pokemon
    const stillNeeded = MIN_CENTRAL_SPAWNS - centralCount;
    if (stillNeeded > 0 && nonCentralSlots.length > 0) {
      const toReposition = Math.min(stillNeeded, nonCentralSlots.length);
      console.log(
        `[SpawnManager] Repositioning ${toReposition} farthest Pokemon into central zone`
      );

      for (let i = 0; i < toReposition; i++) {
        const { index: slotIndex, dist } = nonCentralSlots[i];
        const { x, y } = randomCentralPosition();

        try {
          const tx = await client.repositionPokemon(slotIndex, x, y);
          const msg = `Repositioned slot ${slotIndex} (was dist=${dist}) to central (${x}, ${y}) TX: ${tx}`;
          console.log(`  [SpawnManager] ${msg}`);
          actions.push(msg);
          centralCount++;
          repositioned++;
        } catch (err) {
          const errMsg = `Failed to reposition slot ${slotIndex}: ${err instanceof Error ? err.message : err}`;
          console.error(`  [SpawnManager] ${errMsg}`);
          actions.push(errMsg);
        }
      }
    }
  }

  if (centralCount >= MIN_CENTRAL_SPAWNS) {
    console.log(
      `[SpawnManager] Central zone OK (${centralCount} >= ${MIN_CENTRAL_SPAWNS})`
    );
  }

  // 4. Optionally fill remaining empty slots with global random spawns
  if (fillGlobal && emptySlotIndices.length > 0) {
    const globalToFill = Math.max(
      0,
      Math.min(
        emptySlotIndices.length,
        maxActive - totalActive,
        maxGlobalFill
      )
    );

    if (globalToFill > 0) {
      console.log(
        `[SpawnManager] Filling ${globalToFill} global random spawns`
      );

      for (let i = 0; i < globalToFill; i++) {
        const slotIndex = emptySlotIndices.shift()!;
        const { x, y } = randomMapPosition();

        try {
          const tx = await client.forceSpawnPokemon(slotIndex, x, y);
          const msg = `Spawned global Pokemon at slot ${slotIndex} (${x}, ${y}) TX: ${tx}`;
          console.log(`  [SpawnManager] ${msg}`);
          actions.push(msg);
          totalActive++;
          spawned++;
        } catch (err) {
          const errMsg = `Failed global spawn at slot ${slotIndex}: ${err instanceof Error ? err.message : err}`;
          console.error(`  [SpawnManager] ${errMsg}`);
          actions.push(errMsg);
        }
      }
    }
  }

  const result: SpawnManagerResult = {
    centralBefore,
    centralAfter: centralCount,
    spawned,
    repositioned,
    totalActive,
    actions,
  };

  console.log(
    `[SpawnManager] Done: central ${centralBefore}->${centralCount}, ` +
      `spawned ${spawned}, repositioned ${repositioned}, total active ${totalActive}`
  );

  return result;
}
