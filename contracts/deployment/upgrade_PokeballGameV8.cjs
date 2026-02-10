/**
 * Upgrade PokeballGame to v1.8.0
 *
 * New features:
 * - New revenue split: 0.5% APE to PokeballGame, 0.5% APE to SlabNFTManager, 96% USDC to NFT pool, 3% to treasury
 * - Gasless throws using contract's APE reserve (players only sign ball purchases)
 * - Meta-transaction support (throwBallFor with signature verification)
 * - APE reserve management for gas and Entropy fees
 * - USDC to APE swap for USDC.e purchases to fund APE reserves
 *
 * PREREQUISITES:
 * - SlabNFTManager must be upgraded to v2.4.0 FIRST
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_PokeballGameV8.cjs --network apechain
 */

const hre = require('hardhat');

async function main() {
  console.log('='.repeat(70));
  console.log('UPGRADING POKEBALLGAME TO v1.8.0');
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

  if (slabManagerVersion !== '2.4.0') {
    console.log();
    console.log('WARNING: SlabNFTManager is version', slabManagerVersion);
    console.log('         PokeballGame v1.8.0 requires SlabNFTManager v2.4.0');
    console.log('         Please upgrade SlabNFTManager first:');
    console.log('         npx hardhat run contracts/deployment/upgrade_SlabNFTManagerV2_4.cjs --network apechain');
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

  // Show new features
  console.log('New features in v1.8.0:');
  console.log('  - Revenue split: 0.5% APE to PokeballGame, 0.5% APE to SlabNFTManager');
  console.log('  - Revenue split: 96% USDC to NFT pool, 3% USDC to treasury');
  console.log('  - Gasless throws (players only sign ball purchases)');
  console.log('  - Meta-transaction support (throwBallFor)');
  console.log('  - APE reserve management for Entropy fees');
  console.log('  - USDC to APE swap for funding reserves');
  console.log();

  // Compile
  console.log('Compiling PokeballGameV8...');
  await hre.run('compile');

  // Deploy new implementation directly
  console.log('Deploying new implementation...');
  const PokeballGameV8 = await hre.ethers.getContractFactory('contracts/PokeballGameV8.sol:PokeballGame');

  // Deploy implementation directly (not via proxy)
  const newImpl = await PokeballGameV8.deploy();
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

  // Initialize v1.8.0 with relayer address
  console.log('Initializing v1.8.0 with relayer address...');
  const game = await hre.ethers.getContractAt(
    'contracts/PokeballGameV8.sol:PokeballGame',
    PROXY_ADDRESS
  );

  // Use deployer as relayer for testing (can be changed later via setRelayerAddress)
  const RELAYER_ADDRESS = deployer.address;
  console.log('  Relayer Address:', RELAYER_ADDRESS);

  try {
    const initTx = await game.initializeV180(RELAYER_ADDRESS, { gasLimit: 200000 });
    console.log('Init TX:', initTx.hash);
    await initTx.wait();
    console.log('v1.8.0 initialization complete');
  } catch (err) {
    if (err.message.includes('Already initialized') || err.message.includes('V180AlreadyInitialized')) {
      console.log('v1.8.0 already initialized (skipping)');
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
  console.log('Version: 1.8.0');
  console.log();

  // Verify the upgrade
  console.log('Verifying upgrade...');

  const activePokemon = await game.getActivePokemonCount();
  console.log('Active Pokemon Count:', activePokemon);

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
  console.log(`   "version": "1.8.0"`);
  console.log();
  console.log('2. Update frontend ABI to abi_PokeballGameV8.json');
  console.log();
  console.log('3. Configure relayer for production:');
  console.log('   await game.setRelayerAddress("0x<production_relayer>");');
  console.log();
  console.log('4. Fund initial APE reserve if needed:');
  console.log('   await game.depositAPEReserve({ value: ethers.utils.parseEther("1") });');
  console.log();
  console.log('5. Test scenarios:');
  console.log('   - Player buys balls with APE -> verify 0.5%/0.5%/99% split');
  console.log('   - Player buys balls with USDC.e -> verify USDC to APE swap + split');
  console.log('   - Relayer calls throwBallFor -> verify gasless throw works');
  console.log('   - SlabNFTManager auto-purchase loop -> verify continues until 20 NFTs');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Upgrade failed:', error);
    process.exit(1);
  });
