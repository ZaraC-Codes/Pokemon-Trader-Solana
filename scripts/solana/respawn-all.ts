/**
 * Respawn All Pokemon — clears all existing spawns and creates fresh ones.
 *
 * This script fixes stale Pokemon that were spawned before the relocation
 * logic was deployed (e.g., Pokemon stuck with throw_attempts=3 but still active).
 *
 * For each active slot:
 *   1. Despawns the old Pokemon
 *   2. Force-spawns a new Pokemon at random coordinates with throw_attempts=0
 *
 * Usage:
 *   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   npx tsx scripts/solana/respawn-all.ts
 *   npx tsx scripts/solana/respawn-all.ts --stale-only   # Only respawn slots with throw_attempts >= 3
 *   npx tsx scripts/solana/respawn-all.ts --count 20      # Respawn first N active slots
 */
import * as anchor from "@coral-xyz/anchor";
import { loadProgram, deriveGamePDAs } from "./common.js";

async function main() {
  const args = process.argv.slice(2);

  let staleOnly = false;
  let maxCount = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--stale-only") staleOnly = true;
    if (args[i] === "--count" && args[i + 1]) maxCount = parseInt(args[++i], 10);
  }

  const { program, provider, authority } = loadProgram();
  const pdas = deriveGamePDAs(program.programId);

  console.log("=== Respawn All Pokemon ===");
  console.log(`  Authority: ${authority.toBase58()}`);
  console.log(`  Stale only: ${staleOnly}`);
  console.log("");

  // Read current state
  const pokemonSlots = await program.account.pokemonSlots.fetch(pdas.pokemonSlots);
  const slots = pokemonSlots.slots as any[];

  console.log(`Current state: ${pokemonSlots.activeCount}/20 active`);
  console.log("");

  // Find slots to respawn
  const toRespawn: number[] = [];
  for (let i = 0; i < 20; i++) {
    const slot = slots[i];
    if (!slot.isActive) continue;

    if (staleOnly && slot.throwAttempts < 3) continue;

    toRespawn.push(i);
    if (toRespawn.length >= maxCount) break;
  }

  if (toRespawn.length === 0) {
    console.log("No Pokemon to respawn.");
    return;
  }

  console.log(`Will respawn ${toRespawn.length} Pokemon in slots: [${toRespawn.join(", ")}]`);
  console.log("");

  let successCount = 0;
  let failCount = 0;

  for (const slotIndex of toRespawn) {
    const slot = slots[slotIndex];
    const pokemonId = slot.pokemonId;
    const attempts = slot.throwAttempts;

    console.log(`── Slot ${slotIndex}: Pokemon #${pokemonId} (attempts: ${attempts}/3) ──`);

    // Step 1: Despawn
    try {
      console.log("  Despawning...");
      const despawnTx = await program.methods
        .despawnPokemon(slotIndex)
        .accounts({
          authority,
          gameConfig: pdas.gameConfig,
          pokemonSlots: pdas.pokemonSlots,
        })
        .rpc();
      console.log(`  Despawn TX: ${despawnTx}`);
    } catch (err: any) {
      console.error(`  Despawn FAILED: ${err.message || err}`);
      failCount++;
      continue;
    }

    // Step 2: Force-spawn with random position
    const posX = Math.floor(Math.random() * 1000);
    const posY = Math.floor(Math.random() * 1000);

    try {
      console.log(`  Spawning at (${posX}, ${posY})...`);
      const spawnTx = await program.methods
        .forceSpawnPokemon(slotIndex, posX, posY)
        .accounts({
          authority,
          gameConfig: pdas.gameConfig,
          pokemonSlots: pdas.pokemonSlots,
        })
        .rpc();
      console.log(`  Spawn TX: ${spawnTx}`);
      successCount++;
    } catch (err: any) {
      console.error(`  Spawn FAILED: ${err.message || err}`);
      failCount++;
    }

    console.log("");
  }

  // Final state
  const finalSlots = await program.account.pokemonSlots.fetch(pdas.pokemonSlots);
  console.log("========================================");
  console.log(`Respawned: ${successCount}, Failed: ${failCount}`);
  console.log(`Active Pokemon: ${finalSlots.activeCount}/20`);
  console.log("");

  const finalSlotsData = finalSlots.slots as any[];
  for (let i = 0; i < 20; i++) {
    const slot = finalSlotsData[i];
    if (slot.isActive) {
      console.log(
        `  Slot ${String(i).padStart(2)}: Pokemon #${slot.pokemonId} ` +
        `at (${slot.posX}, ${slot.posY}) — ${slot.throwAttempts}/3 attempts`
      );
    }
  }
  console.log("========================================");
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
