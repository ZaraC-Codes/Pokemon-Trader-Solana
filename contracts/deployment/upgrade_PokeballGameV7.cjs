/**
 * Upgrade PokeballGame to v1.7.0
 *
 * New features:
 * - Random NFT selection using Pyth Entropy random number
 * - Reuses catch determination random number for NFT index selection (no extra fee)
 * - Calls awardNFTToWinnerWithRandomness() on SlabNFTManager v2.3.0+
 *
 * PREREQUISITES:
 * - SlabNFTManager must be upgraded to v2.3.0 FIRST
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_PokeballGameV7.cjs --network apechain
 */

const hre = require('hardhat');

async function main() {
  console.log('='.repeat(70));
  console.log('UPGRADING POKEBALLGAME TO v1.7.0');
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

  // Check SlabNFTManager version
  console.log('Checking SlabNFTManager compatibility...');
  const slabManagerAddress = addresses.contracts.slabNFTManager.proxy;
  const slabManagerVersion = addresses.contracts.slabNFTManager.version;

  if (slabManagerVersion !== '2.3.0') {
    console.log();
    console.log('WARNING: SlabNFTManager is version', slabManagerVersion);
    console.log('         PokeballGame v1.7.0 requires SlabNFTManager v2.3.0');
    console.log('         Please upgrade SlabNFTManager first:');
    console.log('         npx hardhat run contracts/deployment/upgrade_SlabNFTManagerV2_3.cjs --network apechain');
    console.log();

    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question('Continue anyway? (y/n): ', resolve));
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('Aborting upgrade.');
      process.exit(0);
    }
  }
  console.log('SlabNFTManager:', slabManagerAddress);
  console.log();

  // Compile
  console.log('Compiling PokeballGameV7...');
  await hre.run('compile');

  // Deploy new implementation directly
  console.log('Deploying new implementation...');
  const PokeballGameV7 = await hre.ethers.getContractFactory('contracts/PokeballGameV7.sol:PokeballGame');

  // Deploy implementation directly (not via proxy)
  const newImpl = await PokeballGameV7.deploy();
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

  // Initialize v1.7.0 (marks as initialized, no parameters needed)
  console.log('Initializing v1.7.0...');
  const game = await hre.ethers.getContractAt(
    'contracts/PokeballGameV7.sol:PokeballGame',
    PROXY_ADDRESS
  );

  try {
    const initTx = await game.initializeV170({ gasLimit: 100000 });
    console.log('Init TX:', initTx.hash);
    await initTx.wait();
    console.log('v1.7.0 initialization complete');
  } catch (err) {
    if (err.message.includes('Already initialized')) {
      console.log('v1.7.0 already initialized (skipping)');
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
  console.log('Version: 1.7.0');
  console.log();

  // Verify the upgrade
  console.log('Verifying upgrade...');

  const activePokemon = await game.getActivePokemonCount();
  console.log('Active Pokemon Count:', activePokemon);

  const nftInventory = await game.getNFTInventoryCount();
  console.log('NFT Inventory Count:', nftInventory);

  const throwFee = await game.getThrowFee();
  console.log('Throw Fee:', hre.ethers.utils.formatEther(throwFee), 'APE');
  console.log();

  console.log('='.repeat(70));
  console.log('NEXT STEPS');
  console.log('='.repeat(70));
  console.log();
  console.log('1. Update contracts/addresses.json:');
  console.log(`   "implementation": "${newImpl.address}",`);
  console.log(`   "version": "1.7.0"`);
  console.log();
  console.log('2. Update frontend ABI to abi_PokeballGameV7.json');
  console.log();
  console.log('3. Test random NFT selection:');
  console.log('   - Add multiple NFTs to SlabNFTManager inventory');
  console.log('   - Catch Pokemon with successful throws');
  console.log('   - Verify random NFT indices in NFTAwardedWithRandomness events');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Upgrade failed:', error);
    process.exit(1);
  });
