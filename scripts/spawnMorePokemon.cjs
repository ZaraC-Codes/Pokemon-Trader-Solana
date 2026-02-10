/**
 * Spawn More Pokemon Script (Slots 3-19)
 *
 * This script populates the remaining Pokemon slots (3-19) after the v1.2.0 upgrade
 * using forceSpawnPokemon(slot, x, y) which allows owner to specify exact positions.
 *
 * Prerequisites:
 * - PokeballGame upgraded to v1.2.0 (MAX_ACTIVE_POKEMON = 20)
 * - DEPLOYER_PRIVATE_KEY in .env.local is the contract owner
 * - Sufficient APE for gas (~0.1 APE for 17 transactions)
 *
 * Usage:
 *   npx hardhat run scripts/spawnMorePokemon.cjs --network apechain
 *
 * @author Z33Fi ("Z33Fi Made It")
 */

const { ethers } = require("hardhat");

// ============ Configuration ============

// PokeballGame proxy address (v1.2.0)
const POKEBALL_GAME_PROXY = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";

// Minimal ABI for spawning operations
const MINIMAL_ABI = [
  // Read functions
  "function owner() view returns (address)",
  "function getAllActivePokemons() view returns (tuple(uint256 id, uint256 positionX, uint256 positionY, uint8 throwAttempts, bool isActive, uint256 spawnTime)[20])",
  "function MAX_ACTIVE_POKEMON() view returns (uint8)",
  // Write function
  "function forceSpawnPokemon(uint8 slot, uint256 positionX, uint256 positionY) external",
];

// Spawn positions for slots 3-19
// These coordinates are spread across a typical game map (adjust as needed)
// Format: { slot, x, y, description }
const SPAWN_POSITIONS = [
  { slot: 3, x: 150, y: 400, description: "Near starting area" },
  { slot: 4, x: 300, y: 150, description: "Northern path" },
  { slot: 5, x: 450, y: 500, description: "Eastern meadow" },
  { slot: 6, x: 600, y: 250, description: "Mountain base" },
  { slot: 7, x: 750, y: 450, description: "Forest clearing" },
  { slot: 8, x: 200, y: 600, description: "Southern lake" },
  { slot: 9, x: 400, y: 350, description: "Central plaza" },
  { slot: 10, x: 550, y: 650, description: "Beach area" },
  { slot: 11, x: 700, y: 100, description: "Cave entrance" },
  { slot: 12, x: 850, y: 550, description: "Eastern forest" },
  { slot: 13, x: 250, y: 250, description: "Northwest corner" },
  { slot: 14, x: 900, y: 300, description: "Far east path" },
  { slot: 15, x: 100, y: 500, description: "Western shore" },
  { slot: 16, x: 500, y: 100, description: "North bridge" },
  { slot: 17, x: 650, y: 750, description: "Southern forest" },
  { slot: 18, x: 350, y: 550, description: "Center-south" },
  { slot: 19, x: 800, y: 200, description: "Northeast hills" },
];

// ============ Main Script ============

async function main() {
  const startTime = Date.now();

  console.log("\n" + "=".repeat(70));
  console.log("  Spawn More Pokemon (Slots 3-19)");
  console.log("  PokeballGame v1.2.0 - MAX_ACTIVE_POKEMON: 20");
  console.log("=".repeat(70));

  // ============ Network Validation ============
  console.log("\n📡 NETWORK VALIDATION");
  console.log("-".repeat(50));

  const network = await ethers.provider.getNetwork();
  console.log("  Chain ID:      ", network.chainId.toString());

  // Handle both ethers v5 (number) and v6 (bigint) chain ID formats
  const chainId = Number(network.chainId);
  if (chainId !== 33139) {
    console.error("\n❌ ERROR: Wrong network! Expected ApeChain (33139)");
    console.error("   Run with: --network apechain");
    process.exit(1);
  }
  console.log("  ✓ Connected to ApeChain Mainnet");

  // ============ Signer Validation ============
  console.log("\n👤 SIGNER VALIDATION");
  console.log("-".repeat(50));

  const [signer] = await ethers.getSigners();
  console.log("  Signer:        ", signer.address);

  const balance = await ethers.provider.getBalance(signer.address);
  // ethers v6 uses ethers.formatEther, v5 uses ethers.utils.formatEther
  const formatEther = ethers.formatEther || ethers.utils.formatEther;
  const balanceEth = formatEther(balance);
  console.log("  Balance:       ", balanceEth, "APE");

  if (parseFloat(balanceEth) < 0.05) {
    console.error("\n❌ ERROR: Insufficient balance for gas!");
    console.error("   Need at least 0.05 APE for 17 transactions");
    console.error("   Have:", balanceEth, "APE");
    process.exit(1);
  }
  console.log("  ✓ Sufficient balance for gas");

  // ============ Contract Connection ============
  console.log("\n📋 CONTRACT CONNECTION");
  console.log("-".repeat(50));

  const pokeballGame = new ethers.Contract(
    POKEBALL_GAME_PROXY,
    MINIMAL_ABI,
    signer
  );

  console.log("  Proxy Address: ", POKEBALL_GAME_PROXY);

  // Verify MAX_ACTIVE_POKEMON is 20
  const maxPokemon = await pokeballGame.MAX_ACTIVE_POKEMON();
  console.log("  MAX_ACTIVE:    ", maxPokemon.toString());

  if (maxPokemon.toString() !== "20") {
    console.error("\n❌ ERROR: Contract not upgraded to v1.2.0!");
    console.error("   MAX_ACTIVE_POKEMON is", maxPokemon.toString(), "expected 20");
    process.exit(1);
  }
  console.log("  ✓ Contract is v1.2.0 (20 slots)");

  // ============ Ownership Verification ============
  console.log("\n🔐 OWNERSHIP VERIFICATION");
  console.log("-".repeat(50));

  const owner = await pokeballGame.owner();
  console.log("  Contract Owner:", owner);
  console.log("  Signer:        ", signer.address);

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error("\n❌ ERROR: Signer is NOT the contract owner!");
    console.error("   Owner required:", owner);
    console.error("   Your address:  ", signer.address);
    console.error("\n   Use the correct wallet in DEPLOYER_PRIVATE_KEY");
    process.exit(1);
  }
  console.log("  ✓ Signer is the contract owner");

  // ============ Current State ============
  console.log("\n📊 CURRENT POKEMON STATE");
  console.log("-".repeat(50));

  const allPokemons = await pokeballGame.getAllActivePokemons();
  const activeSlots = [];
  const emptySlots = [];

  for (let i = 0; i < 20; i++) {
    if (allPokemons[i].isActive) {
      activeSlots.push(i);
      console.log(
        `    Slot ${i.toString().padStart(2)}: ID=${allPokemons[i].id}, pos=(${allPokemons[i].positionX}, ${allPokemons[i].positionY})`
      );
    } else {
      emptySlots.push(i);
    }
  }

  console.log(`\n  Active slots:  [${activeSlots.join(", ")}] (${activeSlots.length} total)`);
  console.log(`  Empty slots:   [${emptySlots.join(", ")}] (${emptySlots.length} total)`);

  // Filter spawn positions to only empty slots
  const spawnsToExecute = SPAWN_POSITIONS.filter((spawn) =>
    emptySlots.includes(spawn.slot)
  );

  if (spawnsToExecute.length === 0) {
    console.log("\n✓ All target slots (3-19) are already active!");
    console.log("  Nothing to spawn.");
    process.exit(0);
  }

  console.log(`\n  Slots to spawn: ${spawnsToExecute.length}`);

  // ============ Spawn Pokemon ============
  console.log("\n🚀 SPAWNING POKEMON");
  console.log("-".repeat(50));

  const txHashes = [];
  let successCount = 0;
  let failCount = 0;

  for (const spawn of spawnsToExecute) {
    const { slot, x, y, description } = spawn;
    console.log(`\n  [Slot ${slot}] ${description}`);
    console.log(`    Position: (${x}, ${y})`);

    try {
      console.log("    Sending transaction...");
      const tx = await pokeballGame.forceSpawnPokemon(slot, x, y);
      console.log(`    Tx Hash: ${tx.hash}`);

      console.log("    Waiting for confirmation...");
      const receipt = await tx.wait();
      console.log(`    ✓ Confirmed in block ${receipt.blockNumber}`);

      txHashes.push({
        slot,
        hash: tx.hash,
        block: receipt.blockNumber,
        status: "success",
      });
      successCount++;
    } catch (error) {
      console.error(`    ❌ Failed: ${error.message}`);
      txHashes.push({
        slot,
        hash: null,
        block: null,
        status: "failed",
        error: error.message,
      });
      failCount++;
    }
  }

  // ============ Summary ============
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(70));
  console.log("  🎉 SPAWN COMPLETE!");
  console.log("=".repeat(70));

  console.log(`
  Summary:
  ─────────────────────────────────────────────────────────────────
  Pokemon Spawned:    ${successCount}
  Failed:             ${failCount}
  Total Transactions: ${txHashes.length}
  Duration:           ${duration}s
  ─────────────────────────────────────────────────────────────────
`);

  // Print all transaction hashes
  if (txHashes.length > 0) {
    console.log("  Transaction Hashes:");
    console.log("  " + "-".repeat(68));
    for (const tx of txHashes) {
      if (tx.status === "success") {
        console.log(`    Slot ${tx.slot.toString().padStart(2)}: ${tx.hash} (block ${tx.block})`);
      } else {
        console.log(`    Slot ${tx.slot.toString().padStart(2)}: FAILED - ${tx.error}`);
      }
    }
    console.log();
  }

  // Final state
  console.log("  📊 FINAL STATE:");
  const finalPokemons = await pokeballGame.getAllActivePokemons();
  let finalActiveCount = 0;
  for (let i = 0; i < 20; i++) {
    if (finalPokemons[i].isActive) {
      finalActiveCount++;
    }
  }
  console.log(`    Active Pokemon: ${finalActiveCount}/20`);

  // Apescan links
  if (successCount > 0) {
    console.log("\n  View on Apescan:");
    for (const tx of txHashes.filter((t) => t.status === "success").slice(0, 5)) {
      console.log(`    https://apescan.io/tx/${tx.hash}`);
    }
    if (successCount > 5) {
      console.log(`    ... and ${successCount - 5} more`);
    }
  }

  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ SCRIPT FAILED!");
    console.error(error);
    process.exit(1);
  });
