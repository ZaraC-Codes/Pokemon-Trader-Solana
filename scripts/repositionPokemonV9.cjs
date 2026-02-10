/**
 * Reposition Pokemon - Center-Heavy Layout (v1.9.0)
 *
 * The game world is 0-999 contract coordinates (scaled to 0-2400 pixels in game)
 * Player spawns at center (~500, 500 in contract coords)
 *
 * Distribution strategy (ring-based from center):
 * - Inner ring (4-6 Pokemon): ~110-140 units from center
 * - Mid ring (8 Pokemon): ~200-240 units from center
 * - Outer ring (remaining): ~280-340 units from center
 * - Minimum ~80 units between each Pokemon (no clusters)
 *
 * Uses v1.9.0 repositionPokemon(slot, newPosX, newPosY) function
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load environment - .env first, then .env.local (local overrides)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const POKEBALL_GAME_ADDRESS = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const RPC_URL = 'https://apechain.calderachain.xyz/http';

// Center-heavy spawn positions in contract coordinates (0-999)
// Player spawns at center (500, 500)
// Designed so player sees nearby Pokemon when loading in
const NEW_POSITIONS = [
  // === INNER RING (6 Pokemon) - ~110-140 units from center ===
  // These are immediately visible when player spawns
  [420, 420],   // Slot 0 - northwest inner (~113 units)
  [580, 420],   // Slot 1 - northeast inner (~113 units)
  [420, 580],   // Slot 2 - southwest inner (~113 units)
  [580, 580],   // Slot 3 - southeast inner (~113 units)
  [500, 370],   // Slot 4 - north inner (~130 units)
  [500, 630],   // Slot 5 - south inner (~130 units)

  // === MID RING (8 Pokemon) - ~200-240 units from center ===
  // Visible with slight movement
  [300, 500],   // Slot 6 - west mid (~200 units)
  [700, 500],   // Slot 7 - east mid (~200 units)
  [360, 360],   // Slot 8 - northwest mid (~198 units)
  [640, 360],   // Slot 9 - northeast mid (~198 units)
  [360, 640],   // Slot 10 - southwest mid (~198 units)
  [640, 640],   // Slot 11 - southeast mid (~198 units)
  [500, 260],   // Slot 12 - north mid (~240 units)
  [500, 740],   // Slot 13 - south mid (~240 units)

  // === OUTER RING (6 Pokemon) - ~280-340 units from center ===
  // Requires more exploration but still reachable
  [200, 500],   // Slot 14 - far west (~300 units)
  [800, 500],   // Slot 15 - far east (~300 units)
  [260, 260],   // Slot 16 - far northwest (~339 units)
  [740, 260],   // Slot 17 - far northeast (~339 units)
  [260, 740],   // Slot 18 - far southwest (~339 units)
  [740, 740],   // Slot 19 - far southeast (~339 units)
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

// Calculate distance from center
function distFromCenter(x, y) {
  return Math.sqrt(Math.pow(x - 500, 2) + Math.pow(y - 500, 2));
}

async function main() {
  console.log('═'.repeat(60));
  console.log('Pokemon Repositioning v1.9.0 - Center-Heavy Layout');
  console.log('═'.repeat(60));

  // Verify spacing first (minimum 80 units between Pokemon)
  const spacingIssues = verifySpacing(NEW_POSITIONS, 80);
  if (spacingIssues.length > 0) {
    console.log('\nWARNING: Some positions may be too close:');
    spacingIssues.forEach(issue => console.log('  - ' + issue));
    console.log('');
  } else {
    console.log('\n✓ All positions have at least 80 units spacing\n');
  }

  // Show ring distribution
  console.log('Ring Distribution from center (500, 500):');
  const inner = [], mid = [], outer = [];
  NEW_POSITIONS.forEach(([x, y], i) => {
    const dist = Math.round(distFromCenter(x, y));
    if (dist <= 150) inner.push({ slot: i, dist, x, y });
    else if (dist <= 250) mid.push({ slot: i, dist, x, y });
    else outer.push({ slot: i, dist, x, y });
  });

  console.log(`  Inner ring (≤150 units): ${inner.length} Pokemon`);
  inner.forEach(d => console.log(`    Slot ${d.slot}: ${d.dist} units at (${d.x}, ${d.y})`));

  console.log(`  Mid ring (150-250 units): ${mid.length} Pokemon`);
  mid.forEach(d => console.log(`    Slot ${d.slot}: ${d.dist} units at (${d.x}, ${d.y})`));

  console.log(`  Outer ring (>250 units): ${outer.length} Pokemon`);
  outer.forEach(d => console.log(`    Slot ${d.slot}: ${d.dist} units at (${d.x}, ${d.y})`));
  console.log('');

  // Load V9 ABI
  const abiPath = path.join(__dirname, '..', 'contracts', 'abi', 'abi_PokeballGameV9.json');
  if (!fs.existsSync(abiPath)) {
    console.error('ERROR: V9 ABI not found at', abiPath);
    process.exit(1);
  }
  const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

  // Setup provider and wallet
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!privateKey) {
    console.error('ERROR: DEPLOYER_PRIVATE_KEY not set in .env or .env.local');
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
      const oldDist = Math.round(distFromCenter(x, y));
      const newDist = Math.round(distFromCenter(newPos[0], newPos[1]));
      console.log(`Slot ${i.toString().padStart(2)}: (${x.toString().padStart(3)}, ${y.toString().padStart(3)}) [${oldDist.toString().padStart(3)}] → (${newPos[0].toString().padStart(3)}, ${newPos[1].toString().padStart(3)}) [${newDist.toString().padStart(3)}]`);
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
  console.log('Repositioning Pokemon using repositionPokemon()...');
  console.log('─'.repeat(60));

  // Reposition each active Pokemon using repositionPokemon
  let successCount = 0;
  let failCount = 0;

  for (const slot of activeSlots) {
    const [newX, newY] = NEW_POSITIONS[slot];

    try {
      console.log(`Slot ${slot}: Repositioning to (${newX}, ${newY})...`);

      // repositionPokemon(uint8 slotIndex, uint16 newPosX, uint16 newPosY)
      const tx = await contract.repositionPokemon(slot, newX, newY, {
        gasLimit: 200000,
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
    await new Promise(resolve => setTimeout(resolve, 300));
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
      const dist = Math.round(distFromCenter(x, y));
      let ring = 'outer';
      if (dist <= 150) ring = 'inner';
      else if (dist <= 250) ring = 'mid';
      console.log(`Slot ${i.toString().padStart(2)}: (${x.toString().padStart(3)}, ${y.toString().padStart(3)}) - ${dist.toString().padStart(3)} units from center [${ring}]`);
    }
  }
}

main().catch(console.error);
