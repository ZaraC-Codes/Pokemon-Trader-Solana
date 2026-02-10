/**
 * Raw Pokemon Slot Check
 *
 * Checks Pokemon data using correct ABI
 */

const { ethers } = require('hardhat');

const POKEBALL_GAME_PROXY = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';

// Using exact ABI from abi_PokeballGameV9.json
const ABI = [
  {
    "inputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "name": "activePokemons",
    "outputs": [
      { "internalType": "uint256", "name": "id", "type": "uint256" },
      { "internalType": "uint256", "name": "positionX", "type": "uint256" },
      { "internalType": "uint256", "name": "positionY", "type": "uint256" },
      { "internalType": "uint8", "name": "throwAttempts", "type": "uint8" },
      { "internalType": "bool", "name": "isActive", "type": "bool" },
      { "internalType": "uint256", "name": "spawnTime", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getActivePokemonCount",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getActivePokemonSlots",
    "outputs": [{ "internalType": "uint8[]", "name": "", "type": "uint8[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllActivePokemons",
    "outputs": [{
      "components": [
        { "internalType": "uint256", "name": "id", "type": "uint256" },
        { "internalType": "uint256", "name": "positionX", "type": "uint256" },
        { "internalType": "uint256", "name": "positionY", "type": "uint256" },
        { "internalType": "uint8", "name": "throwAttempts", "type": "uint8" },
        { "internalType": "bool", "name": "isActive", "type": "bool" },
        { "internalType": "uint256", "name": "spawnTime", "type": "uint256" }
      ],
      "internalType": "struct PokeballGame.Pokemon[]",
      "name": "",
      "type": "tuple[]"
    }],
    "stateMutability": "view",
    "type": "function"
  }
];

async function main() {
  const [signer] = await ethers.getSigners();
  const provider = signer.provider;

  console.log('\n=== RAW POKEMON SLOT CHECK ===\n');

  // First, let's try a raw eth_call
  const contract = new ethers.Contract(POKEBALL_GAME_PROXY, ABI, provider);

  // Get active count (this worked before)
  try {
    const count = await contract.getActivePokemonCount();
    console.log('Active Pokemon Count:', count.toString());
  } catch (e) {
    console.log('getActivePokemonCount() error:', e.reason || e.message);
  }

  // Try to get all active Pokemon
  console.log('\n--- Trying getAllActivePokemons() ---');
  try {
    const all = await contract.getAllActivePokemons();
    console.log('getAllActivePokemons() returned:', all.length, 'entries');
    if (all.length > 0) {
      console.log('First entry:', {
        id: all[0].id.toString(),
        positionX: all[0].positionX.toString(),
        positionY: all[0].positionY.toString(),
        throwAttempts: all[0].throwAttempts,
        isActive: all[0].isActive,
        spawnTime: all[0].spawnTime.toString()
      });
    }
  } catch (e) {
    console.log('getAllActivePokemons() error:');
    console.log('  Message:', e.message.slice(0, 200));
    if (e.data) console.log('  Data:', e.data);
    if (e.reason) console.log('  Reason:', e.reason);
  }

  // Try individual slot with direct encoding
  console.log('\n--- Trying activePokemons(0) with raw call ---');
  try {
    const pokemon = await contract.activePokemons(0);
    console.log('Slot 0:', {
      id: pokemon.id.toString(),
      positionX: pokemon.positionX.toString(),
      positionY: pokemon.positionY.toString(),
      throwAttempts: pokemon.throwAttempts,
      isActive: pokemon.isActive,
      spawnTime: pokemon.spawnTime.toString()
    });
  } catch (e) {
    console.log('activePokemons(0) error:');
    console.log('  Message:', e.message.slice(0, 200));
    if (e.error) {
      console.log('  Inner error code:', e.error.code);
      console.log('  Inner error message:', e.error.message);
    }
  }

  // Try raw storage read
  console.log('\n--- Trying raw storage read ---');

  // activePokemons is at storage slot based on contract layout
  // We need to find the slot for the mapping
  // For a mapping at slot N, the data for key K is at keccak256(K . N)

  // Let's check what version is deployed
  try {
    const implSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
    const implAddress = await provider.getStorageAt(POKEBALL_GAME_PROXY, implSlot);
    console.log('Implementation address (from storage):', '0x' + implAddress.slice(26));
  } catch (e) {
    console.log('Failed to get implementation:', e.message);
  }

  // Check if contract code exists
  const code = await provider.getCode(POKEBALL_GAME_PROXY);
  console.log('Contract code length:', code.length, 'chars');

  console.log('\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });
