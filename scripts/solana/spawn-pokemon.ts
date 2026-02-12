/**
 * Spawn Pokemon via ORAO VRF or force-spawn at specific coordinates.
 *
 * Usage:
 *   # VRF spawn (random position via ORAO VRF):
 *   npx ts-node scripts/solana/spawn-pokemon.ts --slot 0
 *
 *   # Force spawn (specific position, no VRF):
 *   npx ts-node scripts/solana/spawn-pokemon.ts --slot 0 --pos 500,500
 *
 *   # Batch force-spawn multiple slots:
 *   npx ts-node scripts/solana/spawn-pokemon.ts --batch 0,1,2,3,4
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  loadProgram,
  deriveGamePDAs,
  makeVrfSeed,
  ORAO_VRF_PROGRAM_ID,
  ORAO_CONFIG_SEED,
  ORAO_RANDOMNESS_SEED,
  VRF_REQ_SEED,
} from "./common";

// ============================================================
// CENTRAL ZONE — guarantee spawns near the player start
// ============================================================

const CENTER_X = 500;           // Player spawn center in contract coords (0-999)
const CENTER_Y = 500;
const CENTER_RADIUS = 80;       // ±80 contract units ≈ ±192 pixels ≈ 12 tiles
const MIN_CENTRAL_SPAWNS = 4;   // Guarantee at least this many near center
const EDGE_MARGIN = 50;         // Keep central spawns away from map edges

/** Random int in [min, max] inclusive */
function randRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random position within the central zone, clamped away from edges */
function randomCentralPosition(): { x: number; y: number } {
  const minX = Math.max(EDGE_MARGIN, CENTER_X - CENTER_RADIUS);
  const maxX = Math.min(999 - EDGE_MARGIN, CENTER_X + CENTER_RADIUS);
  const minY = Math.max(EDGE_MARGIN, CENTER_Y - CENTER_RADIUS);
  const maxY = Math.min(999 - EDGE_MARGIN, CENTER_Y + CENTER_RADIUS);
  return { x: randRange(minX, maxX), y: randRange(minY, maxY) };
}

/** Random position anywhere on the map (0-999) */
function randomMapPosition(): { x: number; y: number } {
  return { x: Math.floor(Math.random() * 1000), y: Math.floor(Math.random() * 1000) };
}

async function main() {
  const args = process.argv.slice(2);

  let slotIndex: number | undefined;
  let posX: number | undefined;
  let posY: number | undefined;
  let batchSlots: number[] | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--slot" && args[i + 1]) slotIndex = parseInt(args[++i]);
    if (args[i] === "--pos" && args[i + 1]) {
      const [x, y] = args[++i].split(",").map(Number);
      posX = x;
      posY = y;
    }
    if (args[i] === "--batch" && args[i + 1]) {
      batchSlots = args[++i].split(",").map(Number);
    }
  }

  if (slotIndex === undefined && !batchSlots) {
    console.error(
      "Usage:\n" +
      "  npx ts-node scripts/solana/spawn-pokemon.ts --slot <0-19> [--pos <x>,<y>]\n" +
      "  npx ts-node scripts/solana/spawn-pokemon.ts --batch <slot1,slot2,...>"
    );
    process.exit(1);
  }

  const { program, provider, authority } = loadProgram();
  const pdas = deriveGamePDAs(program.programId);

  // Batch mode: force-spawn multiple slots with central-first positioning
  if (batchSlots) {
    const centralCount = Math.min(MIN_CENTRAL_SPAWNS, batchSlots.length);
    console.log(`=== Batch Force Spawn: slots [${batchSlots.join(", ")}] ===`);
    console.log(`  Central zone: (${CENTER_X}±${CENTER_RADIUS}, ${CENTER_Y}±${CENTER_RADIUS})`);
    console.log(`  Guaranteeing ${centralCount} central spawns, ${batchSlots.length - centralCount} random`);

    for (let i = 0; i < batchSlots.length; i++) {
      const slot = batchSlots[i];
      const isCentral = i < MIN_CENTRAL_SPAWNS;
      const { x, y } = isCentral ? randomCentralPosition() : randomMapPosition();
      const label = isCentral ? "(central)" : "(random)";

      try {
        const tx = await program.methods
          .forceSpawnPokemon(slot, x, y)
          .accounts({
            authority,
            gameConfig: pdas.gameConfig,
            pokemonSlots: pdas.pokemonSlots,
          })
          .rpc();
        console.log(`  Slot ${slot}: Spawned at (${x}, ${y}) ${label} — TX: ${tx}`);
      } catch (err: any) {
        console.error(`  Slot ${slot}: FAILED — ${err.message || err}`);
      }
    }
    return;
  }

  // Single spawn
  if (posX !== undefined && posY !== undefined) {
    // Force spawn at specific coordinates
    console.log(`=== Force Spawn: slot ${slotIndex} at (${posX}, ${posY}) ===`);
    try {
      const tx = await program.methods
        .forceSpawnPokemon(slotIndex!, posX, posY)
        .accounts({
          authority,
          gameConfig: pdas.gameConfig,
          pokemonSlots: pdas.pokemonSlots,
        })
        .rpc();
      console.log(`SUCCESS: TX: ${tx}`);
    } catch (err) {
      console.error("FAILED:", err);
      process.exit(1);
    }
  } else {
    // VRF spawn — requires ORAO VRF accounts
    console.log(`=== VRF Spawn: slot ${slotIndex} (random position) ===`);

    const gameConfig = await program.account.gameConfig.fetch(pdas.gameConfig);
    const vrfCounter = gameConfig.vrfCounter.toNumber();

    // Derive VRF request PDA
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64LE(BigInt(vrfCounter));
    const [vrfRequestPda] = PublicKey.findProgramAddressSync(
      [VRF_REQ_SEED, counterBuf],
      program.programId
    );

    // Derive VRF seed and randomness PDA
    const seed = makeVrfSeed(vrfCounter, 0); // VRF_TYPE_SPAWN = 0
    const [vrfRandomnessPda] = PublicKey.findProgramAddressSync(
      [ORAO_RANDOMNESS_SEED, seed],
      ORAO_VRF_PROGRAM_ID
    );

    // Derive ORAO VRF config
    const [vrfConfigPda] = PublicKey.findProgramAddressSync(
      [ORAO_CONFIG_SEED],
      ORAO_VRF_PROGRAM_ID
    );

    console.log(`  VRF Counter: ${vrfCounter}`);
    console.log(`  VRF Request PDA: ${vrfRequestPda.toBase58()}`);
    console.log(`  VRF Randomness PDA: ${vrfRandomnessPda.toBase58()}`);
    console.log("");
    console.log("  NOTE: After this TX, you must wait for ORAO to fulfill");
    console.log("  randomness, then call consume_randomness to complete spawn.");

    try {
      // Note: vrfTreasury needs to be read from ORAO config in a real deployment
      const tx = await program.methods
        .spawnPokemon(slotIndex!)
        .accounts({
          authority,
          gameConfig: pdas.gameConfig,
          pokemonSlots: pdas.pokemonSlots,
          vrfRequest: vrfRequestPda,
          vrfConfig: vrfConfigPda,
          vrfRandomness: vrfRandomnessPda,
          vrfTreasury: vrfConfigPda, // TODO: Read actual treasury from ORAO config
          oraoVrf: ORAO_VRF_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`\nSUCCESS: VRF spawn requested. TX: ${tx}`);
      console.log(`  Next step: Call consume_randomness after ORAO fulfills.`);
    } catch (err) {
      console.error("FAILED:", err);
      process.exit(1);
    }
  }
}

main().catch(console.error);
