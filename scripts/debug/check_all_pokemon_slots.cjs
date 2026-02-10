/**
 * Check All Pokemon Slots
 *
 * Quick script to inspect all 20 Pokemon slots on PokeballGame
 */

const { ethers } = require('hardhat');

const POKEBALL_GAME_PROXY = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';

const ABI = [
  'function activePokemons(uint8) view returns (uint256 id, uint16 posX, uint16 posY, uint8 throwAttempts, bool isActive)',
  'function getActivePokemonCount() view returns (uint8)',
  'function getActivePokemonSlots() view returns (uint8[])',
  'function maxActivePokemon() view returns (uint8)',
  'function getAllActivePokemons() view returns (tuple(uint256 id, uint16 posX, uint16 posY, uint8 throwAttempts, bool isActive)[])',
];

async function main() {
  const [signer] = await ethers.getSigners();
  const contract = new ethers.Contract(POKEBALL_GAME_PROXY, ABI, signer);

  console.log('\n=== POKEMON SLOT STATUS ===\n');

  // Try helper functions first
  try {
    const count = await contract.getActivePokemonCount();
    console.log('Active Pokemon Count:', count.toString());
  } catch (e) {
    console.log('getActivePokemonCount() failed:', e.message.slice(0, 100));
  }

  try {
    const slots = await contract.getActivePokemonSlots();
    console.log('Active Slots:', slots.map(s => s.toString()).join(', ') || 'none');
  } catch (e) {
    console.log('getActivePokemonSlots() failed:', e.message.slice(0, 100));
  }

  try {
    const max = await contract.maxActivePokemon();
    console.log('Max Active Pokemon:', max.toString());
  } catch (e) {
    console.log('maxActivePokemon() failed:', e.message.slice(0, 100));
  }

  // Try getAllActivePokemons
  console.log('\n--- Trying getAllActivePokemons() ---');
  try {
    const all = await contract.getAllActivePokemons();
    console.log('Total slots returned:', all.length);
    all.forEach((p, i) => {
      if (p.isActive) {
        console.log(`  Slot ${i}: ID=${p.id.toString()}, pos=(${p.posX},${p.posY}), attempts=${p.throwAttempts}, ACTIVE`);
      }
    });
  } catch (e) {
    console.log('getAllActivePokemons() failed:', e.message.slice(0, 100));
  }

  // Check individual slots
  console.log('\n--- Checking Individual Slots 0-19 ---');
  for (let i = 0; i < 20; i++) {
    try {
      const p = await contract.activePokemons(i);
      if (p.isActive) {
        console.log(`  Slot ${i}: ID=${p.id.toString()}, pos=(${p.posX},${p.posY}), attempts=${p.throwAttempts}, ACTIVE ✅`);
      } else if (p.id.gt(0)) {
        console.log(`  Slot ${i}: ID=${p.id.toString()}, pos=(${p.posX},${p.posY}), attempts=${p.throwAttempts}, INACTIVE`);
      }
    } catch (e) {
      console.log(`  Slot ${i}: ERROR - ${e.message.slice(0, 50)}...`);
    }
  }

  console.log('\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });
