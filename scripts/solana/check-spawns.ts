/**
 * Debug script: check Pokemon spawn positions and central zone compliance.
 *
 * Usage:
 *   npx tsx scripts/solana/check-spawns.ts
 *
 * Prints all active slots with positions, distances from center,
 * and confirms whether the central spawn invariant (>= 4) is met.
 * Exits with code 1 if the invariant is violated.
 *
 * Constants must stay consistent with:
 *   - scripts/solana/spawn-pokemon.ts  (batch mode)
 *   - backend/src/spawnManager.ts      (cron enforcement)
 */
import { loadProgram, deriveGamePDAs } from "./common";

// Central zone constants
const CENTER_X = 500;
const CENTER_Y = 500;
const CENTER_RADIUS = 80;
const MIN_CENTRAL_SPAWNS = 4;

function isInCentralZone(x: number, y: number): boolean {
  return (
    x >= CENTER_X - CENTER_RADIUS &&
    x <= CENTER_X + CENTER_RADIUS &&
    y >= CENTER_Y - CENTER_RADIUS &&
    y <= CENTER_Y + CENTER_RADIUS
  );
}

function distanceFromCenter(x: number, y: number): number {
  return Math.max(Math.abs(x - CENTER_X), Math.abs(y - CENTER_Y));
}

async function main() {
  const { program } = loadProgram();
  const pdas = deriveGamePDAs(program.programId);

  const pokemonSlots = await program.account.pokemonSlots.fetch(
    pdas.pokemonSlots
  ) as any;

  console.log("=======================================================");
  console.log("  POKEMON SPAWN CENTRAL ZONE DIAGNOSTIC");
  console.log("=======================================================");
  console.log(
    `  Center: (${CENTER_X}, ${CENTER_Y}), Radius: ${CENTER_RADIUS} ` +
      `(box ${CENTER_X - CENTER_RADIUS}-${CENTER_X + CENTER_RADIUS})`
  );
  console.log(`  Required central spawns: >= ${MIN_CENTRAL_SPAWNS}`);
  console.log("");

  let totalActive = 0;
  let centralCount = 0;
  const activeSlots: Array<{
    index: number;
    pokemonId: string;
    x: number;
    y: number;
    dist: number;
    central: boolean;
    attempts: number;
  }> = [];

  for (let i = 0; i < 20; i++) {
    const slot = pokemonSlots.slots[i];
    if (!slot.isActive) continue;

    totalActive++;
    const dist = distanceFromCenter(slot.posX, slot.posY);
    const central = isInCentralZone(slot.posX, slot.posY);
    if (central) centralCount++;

    activeSlots.push({
      index: i,
      pokemonId: slot.pokemonId.toString(),
      x: slot.posX,
      y: slot.posY,
      dist,
      central,
      attempts: slot.throwAttempts,
    });
  }

  // Print active slots sorted by distance from center
  console.log("  Active Pokemon (sorted by distance from center):");
  console.log(
    "  -------------------------------------------------------"
  );

  const sorted = [...activeSlots].sort((a, b) => a.dist - b.dist);
  for (const s of sorted) {
    const tag = s.central ? "[CENTRAL]" : "         ";
    console.log(
      `  Slot ${String(s.index).padStart(2)}: ` +
        `Pokemon #${s.pokemonId.padStart(4)} ` +
        `at (${String(s.x).padStart(3)}, ${String(s.y).padStart(3)}) ` +
        `dist=${String(s.dist).padStart(3)} ` +
        `${tag} ` +
        `${s.attempts}/3 attempts`
    );
  }

  const emptyCount = 20 - totalActive;
  if (emptyCount > 0) {
    console.log(`  (${emptyCount} empty slots)`);
  }

  console.log("");
  console.log(
    "  -------------------------------------------------------"
  );
  console.log(`  Total active:    ${totalActive} / 20`);
  console.log(
    `  Central spawns:  ${centralCount} (expected >= ${MIN_CENTRAL_SPAWNS})`
  );

  if (centralCount >= MIN_CENTRAL_SPAWNS) {
    console.log(`  Status:          OK`);
    console.log("");
    process.exit(0);
  } else {
    console.log(
      `  Status:          VIOLATION -- need ${MIN_CENTRAL_SPAWNS - centralCount} more central spawns`
    );
    console.log("");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
