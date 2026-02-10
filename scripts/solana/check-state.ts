/**
 * Read and display all game state.
 *
 * Usage:
 *   npx ts-node scripts/solana/check-state.ts
 *   npx ts-node scripts/solana/check-state.ts --player <PLAYER_PUBKEY>
 */
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  loadProgram,
  deriveGamePDAs,
  derivePlayerInventory,
  formatTokenAmount,
  formatPokemonSlot,
  BALL_NAMES,
  GAME_SOLBALLS_SEED,
} from "./common";

async function main() {
  const args = process.argv.slice(2);

  let playerAddress: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--player" && args[i + 1]) playerAddress = args[++i];
  }

  const { program, provider, authority } = loadProgram();
  const pdas = deriveGamePDAs(program.programId);

  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║           POKEBALL GAME STATE VIEWER              ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log(`  Program ID: ${program.programId.toBase58()}`);
  console.log(`  Authority:  ${authority.toBase58()}`);
  console.log("");

  // ─── Game Config ───────────────────────────────────────────
  try {
    const gameConfig = await program.account.gameConfig.fetch(pdas.gameConfig);
    console.log("=== Game Config ===");
    console.log(`  Initialized:        ${gameConfig.isInitialized}`);
    console.log(`  Authority:          ${gameConfig.authority.toBase58()}`);
    console.log(`  Treasury:           ${gameConfig.treasury.toBase58()}`);
    console.log(`  SolBalls Mint:      ${gameConfig.solballsMint.toBase58()}`);
    console.log(`  USDC Mint:          ${gameConfig.usdcMint.toBase58()}`);
    console.log(`  Max Active Pokemon: ${gameConfig.maxActivePokemon}`);
    console.log(`  Pokemon ID Counter: ${gameConfig.pokemonIdCounter}`);
    console.log(`  VRF Counter:        ${gameConfig.vrfCounter}`);
    console.log(`  Total Revenue:      ${formatTokenAmount(gameConfig.totalRevenue)} SolBalls`);
    console.log("");

    console.log("  Ball Prices:");
    for (let i = 0; i < 4; i++) {
      console.log(
        `    ${BALL_NAMES[i].padEnd(12)} ${formatTokenAmount(gameConfig.ballPrices[i])} SolBalls`
      );
    }
    console.log("");

    console.log("  Catch Rates:");
    for (let i = 0; i < 4; i++) {
      console.log(
        `    ${BALL_NAMES[i].padEnd(12)} ${gameConfig.catchRates[i]}%`
      );
    }
    console.log("");

    // ─── Game SolBalls Balance ──────────────────────────────
    try {
      const gameSolballsAta = await getAssociatedTokenAddress(
        gameConfig.solballsMint,
        pdas.gameConfig,
        true
      );
      const balance = await provider.connection.getTokenAccountBalance(gameSolballsAta);
      console.log(`  Game SolBalls Balance: ${balance.value.uiAmountString} SolBalls`);
    } catch {
      console.log("  Game SolBalls Balance: (account not found)");
    }
    console.log("");
  } catch (err: any) {
    console.log("=== Game Config: NOT INITIALIZED ===");
    console.log(`  (${err.message || err})`);
    console.log("");
  }

  // ─── Pokemon Slots ────────────────────────────────────────
  try {
    const pokemonSlots = await program.account.pokemonSlots.fetch(pdas.pokemonSlots);
    console.log("=== Pokemon Slots ===");
    console.log(`  Active Count: ${pokemonSlots.activeCount} / 20`);
    console.log("");

    for (let i = 0; i < 20; i++) {
      const slot = pokemonSlots.slots[i];
      if (slot.isActive) {
        const ts = new Date(Number(slot.spawnTimestamp) * 1000);
        console.log(
          `  Slot ${String(i).padStart(2)}: Pokemon #${slot.pokemonId} ` +
          `at (${slot.posX}, ${slot.posY}) — ${slot.throwAttempts}/3 attempts — ` +
          `spawned ${ts.toISOString()}`
        );
      }
    }

    const inactiveCount = 20 - Number(pokemonSlots.activeCount);
    if (inactiveCount > 0) {
      console.log(`  (${inactiveCount} empty slots)`);
    }
    console.log("");
  } catch (err: any) {
    console.log("=== Pokemon Slots: NOT INITIALIZED ===");
    console.log("");
  }

  // ─── NFT Vault ────────────────────────────────────────────
  try {
    const nftVault = await program.account.nftVault.fetch(pdas.nftVault);
    console.log("=== NFT Vault ===");
    console.log(`  NFT Count: ${nftVault.count} / ${nftVault.maxSize}`);
    console.log(`  Authority: ${nftVault.authority.toBase58()}`);
    console.log("");

    for (let i = 0; i < Number(nftVault.count); i++) {
      const mint = nftVault.mints[i];
      console.log(`  [${i}] ${mint.toBase58()}`);
    }
    if (Number(nftVault.count) === 0) {
      console.log("  (empty)");
    }
    console.log("");
  } catch (err: any) {
    console.log("=== NFT Vault: NOT INITIALIZED ===");
    console.log("");
  }

  // ─── Treasury Config ──────────────────────────────────────
  try {
    const treasuryConfig = await program.account.treasuryConfig.fetch(pdas.treasuryConfig);
    console.log("=== Treasury Config ===");
    console.log(`  Treasury Wallet:  ${treasuryConfig.treasuryWallet.toBase58()}`);
    console.log(`  Total Withdrawn:  ${formatTokenAmount(treasuryConfig.totalWithdrawn)} SolBalls`);
    console.log("");
  } catch (err: any) {
    console.log("=== Treasury Config: NOT INITIALIZED ===");
    console.log("");
  }

  // ─── Player Inventory (optional) ─────────────────────────
  if (playerAddress) {
    const playerKey = new PublicKey(playerAddress);
    const playerInvPda = derivePlayerInventory(playerKey, program.programId);

    try {
      const inventory = await program.account.playerInventory.fetch(playerInvPda);
      console.log(`=== Player Inventory (${playerAddress}) ===`);
      console.log(`  Player: ${inventory.player.toBase58()}`);

      for (let i = 0; i < 4; i++) {
        console.log(
          `    ${BALL_NAMES[i].padEnd(12)} ${inventory.balls[i]}`
        );
      }

      console.log("");
      console.log(`  Lifetime Stats:`);
      console.log(`    Total Purchased: ${inventory.totalPurchased}`);
      console.log(`    Total Throws:    ${inventory.totalThrows}`);
      console.log(`    Total Catches:   ${inventory.totalCatches}`);

      const catchRate =
        Number(inventory.totalThrows) > 0
          ? ((Number(inventory.totalCatches) / Number(inventory.totalThrows)) * 100).toFixed(1)
          : "N/A";
      console.log(`    Catch Rate:      ${catchRate}%`);
      console.log("");
    } catch (err: any) {
      console.log(`=== Player Inventory (${playerAddress}): NOT FOUND ===`);
      console.log("  (Player has not purchased any balls yet)");
      console.log("");
    }
  }

  console.log("Done.");
}

main().catch(console.error);
