/**
 * Upgrade PokeballGame to v1.9.0
 *
 * New features:
 * - repositionPokemon(slot, newX, newY) - Admin function to move existing Pokemon
 * - despawnPokemon(slot) - Admin function to remove a Pokemon from a slot
 * - maxActivePokemon - Owner-configurable soft cap on active spawns (max 20)
 * - setMaxActivePokemon(newMax) - Adjust the soft cap at runtime
 * - getEffectiveMaxActivePokemon() - View function to get current effective max
 *
 * UNCHANGED:
 * - All economics, randomness, gasless throws, and NFT award logic
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_PokeballGameV9.cjs --network apechain
 */

const hre = require('hardhat');

async function main() {
  console.log('='.repeat(70));
  console.log('UPGRADING POKEBALLGAME TO v1.9.0');
  console.log('='.repeat(70));
  console.log();

  // Load addresses
  const addresses = require('../addresses.json');
  const PROXY_ADDRESS = addresses.contracts.pokeballGame.proxy;

  console.log('Proxy Address:', PROXY_ADDRESS);
  console.log('Current Implementation:', addresses.contracts.pokeballGame.implementation);
  console.log('Current Version:', addresses.contracts.pokeballGame.version);
  console.log();

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const balance = await deployer.getBalance();
  console.log('Balance:', hre.ethers.utils.formatEther(balance), 'APE');
  console.log();

  // Show new features
  console.log('New features in v1.9.0:');
  console.log('  - repositionPokemon(slot, newX, newY) - Move existing Pokemon without despawning');
  console.log('  - despawnPokemon(slot) - Remove a Pokemon from a slot');
  console.log('  - maxActivePokemon - Owner-configurable soft cap (max 20)');
  console.log('  - setMaxActivePokemon(newMax) - Adjust spawn density at runtime');
  console.log('  - getEffectiveMaxActivePokemon() - View current effective max');
  console.log();
  console.log('UNCHANGED:');
  console.log('  - All economics (revenue split, ball pricing, fees)');
  console.log('  - Randomness (Pyth Entropy integration)');
  console.log('  - Gasless throws (meta-transactions, relayer)');
  console.log('  - NFT award logic (SlabNFTManager integration)');
  console.log();

  // Compile
  console.log('Compiling PokeballGameV9...');
  await hre.run('compile');

  // Deploy new implementation directly
  console.log('Deploying new implementation...');
  const PokeballGameV9 = await hre.ethers.getContractFactory('contracts/PokeballGameV9.sol:PokeballGame');

  // Deploy implementation directly (not via proxy)
  const newImpl = await PokeballGameV9.deploy();
  await newImpl.deployed();
  console.log('New implementation deployed at:', newImpl.address);
  console.log();

  // Upgrade proxy using upgradeToAndCall
  console.log('Upgrading proxy to new implementation...');

  // Get proxy with UUPS interface
  const proxyABI = [
    'function upgradeToAndCall(address newImplementation, bytes memory data) external payable',
    'function upgradeTo(address newImplementation) external',
  ];
  const proxy = new hre.ethers.Contract(PROXY_ADDRESS, proxyABI, deployer);

  // Try upgradeToAndCall with empty data first
  try {
    const tx = await proxy.upgradeToAndCall(newImpl.address, '0x', { gasLimit: 500000 });
    console.log('Upgrade TX:', tx.hash);
    const receipt = await tx.wait();
    console.log('Upgrade confirmed in block:', receipt.blockNumber);
  } catch (err) {
    console.log('upgradeToAndCall failed, trying upgradeTo...');
    const tx = await proxy.upgradeTo(newImpl.address, { gasLimit: 500000 });
    console.log('Upgrade TX:', tx.hash);
    const receipt = await tx.wait();
    console.log('Upgrade confirmed in block:', receipt.blockNumber);
  }

  console.log();

  // Initialize v1.9.0
  console.log('Initializing v1.9.0...');
  const game = await hre.ethers.getContractAt(
    'contracts/PokeballGameV9.sol:PokeballGame',
    PROXY_ADDRESS
  );

  try {
    const initTx = await game.initializeV190({ gasLimit: 200000 });
    console.log('Init TX:', initTx.hash);
    await initTx.wait();
    console.log('v1.9.0 initialization complete');
  } catch (err) {
    if (err.message.includes('Already initialized')) {
      console.log('v1.9.0 already initialized (skipping)');
    } else {
      throw err;
    }
  }

  console.log();
  console.log('='.repeat(70));
  console.log('UPGRADE SUCCESSFUL');
  console.log('='.repeat(70));
  console.log();
  console.log('Proxy Address (unchanged):', PROXY_ADDRESS);
  console.log('New Implementation:', newImpl.address);
  console.log('Version: 1.9.0');
  console.log();

  // Verify the upgrade
  console.log('Verifying upgrade...');

  const activePokemon = await game.getActivePokemonCount();
  console.log('Active Pokemon Count:', activePokemon);

  const effectiveMax = await game.getEffectiveMaxActivePokemon();
  console.log('Effective Max Active Pokemon:', effectiveMax);

  const maxActive = await game.maxActivePokemon();
  console.log('maxActivePokemon storage:', maxActive);

  const nftInventory = await game.getNFTInventoryCount();
  console.log('NFT Inventory Count:', nftInventory);

  const throwFee = await game.getThrowFee();
  console.log('Throw Fee:', hre.ethers.utils.formatEther(throwFee), 'APE');

  const totalAPEReserve = await game.totalAPEReserve();
  console.log('Total APE Reserve:', hre.ethers.utils.formatEther(totalAPEReserve), 'APE');

  const relayerAddress = await game.relayerAddress();
  console.log('Relayer Address:', relayerAddress);
  console.log();

  console.log('='.repeat(70));
  console.log('NEXT STEPS');
  console.log('='.repeat(70));
  console.log();
  console.log('1. Update contracts/addresses.json:');
  console.log(`   "implementation": "${newImpl.address}",`);
  console.log(`   "version": "1.9.0"`);
  console.log();
  console.log('2. Update frontend ABI to abi_PokeballGameV9.json');
  console.log();
  console.log('3. Test spawn management:');
  console.log('   // Reposition Pokemon in slot 0 to coordinates (500, 500)');
  console.log('   await game.repositionPokemon(0, 500, 500);');
  console.log();
  console.log('   // Despawn Pokemon in slot 5');
  console.log('   await game.despawnPokemon(5);');
  console.log();
  console.log('   // Reduce active spawn limit to 10');
  console.log('   await game.setMaxActivePokemon(10);');
  console.log();
  console.log('4. Verify frontend receives PokemonRelocated events');
  console.log('   (repositionPokemon emits PokemonRelocated which frontend already handles)');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Upgrade failed:', error);
    process.exit(1);
  });
