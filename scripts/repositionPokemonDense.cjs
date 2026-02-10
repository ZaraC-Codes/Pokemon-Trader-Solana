/**
 * Reposition Pokemon - Evenly Spread, Closer to Center
 *
 * The game world is 0-999 contract coordinates (scaled to 0-2400 pixels)
 * Player spawns at center (~500, 500 in contract coords)
 *
 * New distribution strategy:
 * - All Pokemon within 100-400 units from center (no edge spawns)
 * - Evenly spaced around the playable area
 * - Minimum ~100 units between each Pokemon (no clusters)
 * - A few near center but not on top of each other
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load environment - .env first, then .env.local (local overrides)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const POKEBALL_GAME_ADDRESS = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const RPC_URL = 'https://apechain.calderachain.xyz/http';

// New spawn positions - evenly distributed, no clusters
// All within 100-400 units of center (500, 500)
// Format: [x, y] in contract coordinates (0-999)
const NEW_POSITIONS = [
  // === NEAR CENTER (4 Pokemon) - ~100-150 units from center, well spaced ===
  [420, 420],   // Slot 0 - northwest near
  [580, 420],   // Slot 1 - northeast near
  [420, 580],   // Slot 2 - southwest near
  [580, 580],   // Slot 3 - southeast near

  // === MEDIUM DISTANCE (8 Pokemon) - ~200-250 units from center ===
  [300, 400],   // Slot 4 - west
  [700, 400],   // Slot 5 - east
  [400, 300],   // Slot 6 - north-west
  [600, 300],   // Slot 7 - north-east
  [400, 700],   // Slot 8 - south-west
  [600, 700],   // Slot 9 - south-east
  [300, 600],   // Slot 10 - west-south
  [700, 600],   // Slot 11 - east-south

  // === OUTER AREA (8 Pokemon) - ~300-400 units from center, still reachable ===
  [200, 500],   // Slot 12 - far west
  [800, 500],   // Slot 13 - far east
  [500, 200],   // Slot 14 - far north
  [500, 800],   // Slot 15 - far south
  [250, 250],   // Slot 16 - far northwest
  [750, 250],   // Slot 17 - far northeast
  [250, 750],   // Slot 18 - far southwest
  [750, 750],   // Slot 19 - far southeast
];

// Verify minimum spacing between all positions
function verifySpacing(positions, minDistance) {
  const issues = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dx = positions[i][0] - positions[j][0];
      const dy = positions[i][1] - positions[j][1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistance) {
        issues.push(`Slots ${i} and ${j} are only ${dist.toFixed(0)} units apart`);
      }
    }
  }
  return issues;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('Pokemon Repositioning - Evenly Spread, Closer to Center');
  console.log('═'.repeat(60));

  // Verify spacing first
  const spacingIssues = verifySpacing(NEW_POSITIONS, 80);
  if (spacingIssues.length > 0) {
    console.log('WARNING: Some positions may be too close:');
    spacingIssues.forEach(issue => console.log('  - ' + issue));
    console.log('');
  }

  // Show distribution stats
  console.log('Distribution from center (500, 500):');
  const distances = NEW_POSITIONS.map(([x, y], i) => {
    const dist = Math.sqrt(Math.pow(x - 500, 2) + Math.pow(y - 500, 2));
    return { slot: i, dist: Math.round(dist), x, y };
  });
  distances.sort((a, b) => a.dist - b.dist);

  console.log('  Nearest to center:');
  distances.slice(0, 4).forEach(d => {
    console.log(`    Slot ${d.slot}: ${d.dist} units at (${d.x}, ${d.y})`);
  });
  console.log('  Farthest from center:');
  distances.slice(-4).forEach(d => {
    console.log(`    Slot ${d.slot}: ${d.dist} units at (${d.x}, ${d.y})`);
  });
  console.log('');

  // Load ABI
  const abiPath = path.join(__dirname, '..', 'contracts', 'abi', 'abi_PokeballGameV8.json');
  const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

  // Setup provider and wallet
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!privateKey) {
    console.error('ERROR: DEPLOYER_PRIVATE_KEY not set in .env.local');
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(POKEBALL_GAME_ADDRESS, abi, wallet);

  console.log('Wallet:', wallet.address);
  console.log('Contract:', POKEBALL_GAME_ADDRESS);
  console.log('');

  // Check current spawns
  const pokemons = await contract.getAllActivePokemons();
  const activeSlots = [];

  console.log('Current → New positions:');
  console.log('─'.repeat(60));

  for (let i = 0; i < pokemons.length; i++) {
    const p = pokemons[i];
    if (p.isActive) {
      activeSlots.push(i);
      const x = p.positionX.toNumber();
      const y = p.positionY.toNumber();
      const newPos = NEW_POSITIONS[i];
      const oldDist = Math.round(Math.sqrt(Math.pow(x - 500, 2) + Math.pow(y - 500, 2)));
      const newDist = Math.round(Math.sqrt(Math.pow(newPos[0] - 500, 2) + Math.pow(newPos[1] - 500, 2)));
      console.log(`Slot ${i.toString().padStart(2)}: (${x.toString().padStart(3)}, ${y.toString().padStart(3)}) [${oldDist}] → (${newPos[0].toString().padStart(3)}, ${newPos[1].toString().padStart(3)}) [${newDist}]`);
    }
  }

  console.log('');
  console.log(`Active slots: ${activeSlots.length}/20`);
  console.log('');

  // Confirm before proceeding
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    rl.question('Proceed with repositioning? (yes/no): ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('');
  console.log('Repositioning Pokemon...');
  console.log('─'.repeat(60));

  // Reposition each active Pokemon using forceSpawnPokemon
  let successCount = 0;
  let failCount = 0;

  for (const slot of activeSlots) {
    const [newX, newY] = NEW_POSITIONS[slot];

    try {
      console.log(`Slot ${slot}: Repositioning to (${newX}, ${newY})...`);

      // forceSpawnPokemon(uint8 slotIndex, uint16 posX, uint16 posY)
      const tx = await contract.forceSpawnPokemon(slot, newX, newY, {
        gasLimit: 500000,
      });

      console.log(`  TX: ${tx.hash}`);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log(`  ✓ Success (gas: ${receipt.gasUsed.toString()})`);
        successCount++;
      } else {
        console.log(`  ✗ Failed`);
        failCount++;
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      failCount++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Complete: ${successCount} repositioned, ${failCount} failed`);
  console.log('═'.repeat(60));

  // Show final positions
  console.log('');
  console.log('Final Pokemon positions:');
  console.log('─'.repeat(60));

  const newPokemons = await contract.getAllActivePokemons();
  for (let i = 0; i < newPokemons.length; i++) {
    const p = newPokemons[i];
    if (p.isActive) {
      const x = p.positionX.toNumber();
      const y = p.positionY.toNumber();
      const distFromCenter = Math.round(Math.sqrt(Math.pow(x - 500, 2) + Math.pow(y - 500, 2)));
      console.log(`Slot ${i.toString().padStart(2)}: (${x.toString().padStart(3)}, ${y.toString().padStart(3)}) - ${distFromCenter} units from center`);
    }
  }
}

main().catch(console.error);
