/**
 * Upgrade SlabNFTManager to v2.4.0
 *
 * New features:
 * - APE reserve for Entropy fees (depositAPEReserve)
 * - Auto-purchase loop (continues until 20 NFTs OR funds depleted)
 * - Pyth Entropy integration for random NFT selection
 * - AutoPurchaseLoopCompleted event
 *
 * PREREQUISITES:
 * - Configure Pyth Entropy addresses before initializing
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_SlabNFTManagerV2_4.cjs --network apechain
 */

const hre = require('hardhat');

// Pyth Entropy addresses on ApeChain
const PYTH_ENTROPY_ADDRESS = '0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320';
const PYTH_ENTROPY_PROVIDER = '0x52DeaA1c84233F7bb8C8A45baeDE41091c616506';

async function main() {
  console.log('='.repeat(70));
  console.log('UPGRADING SLABNFTMANAGER TO v2.4.0');
  console.log('='.repeat(70));
  console.log();

  // Load addresses
  const addresses = require('../addresses.json');
  const PROXY_ADDRESS = addresses.contracts.slabNFTManager.proxy;

  console.log('Proxy Address:', PROXY_ADDRESS);
  console.log('Current Implementation:', addresses.contracts.slabNFTManager.implementation);
  console.log('Current Version:', addresses.contracts.slabNFTManager.version);
  console.log();

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const balance = await deployer.getBalance();
  console.log('Balance:', hre.ethers.utils.formatEther(balance), 'APE');
  console.log();

  // Show new features
  console.log('New features in v2.4.0:');
  console.log('  - APE reserve management for Entropy fees');
  console.log('  - Auto-purchase loop (until 20 NFTs OR funds depleted)');
  console.log('  - Pyth Entropy integration for random NFT selection');
  console.log('  - APEReserveDeposited event');
  console.log('  - AutoPurchaseLoopCompleted event');
  console.log();

  // Compile
  console.log('Compiling SlabNFTManagerV2_4...');
  await hre.run('compile');

  // Deploy new implementation directly
  console.log('Deploying new implementation...');
  const SlabNFTManagerV2_4 = await hre.ethers.getContractFactory('contracts/SlabNFTManagerV2_4.sol:SlabNFTManager');

  // Deploy implementation directly (not via proxy)
  const newImpl = await SlabNFTManagerV2_4.deploy();
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

  // Initialize v2.4.0 with Pyth Entropy addresses
  console.log('Initializing v2.4.0 with Pyth Entropy...');
  console.log('  Entropy Address:', PYTH_ENTROPY_ADDRESS);
  console.log('  Entropy Provider:', PYTH_ENTROPY_PROVIDER);

  const manager = await hre.ethers.getContractAt(
    'contracts/SlabNFTManagerV2_4.sol:SlabNFTManager',
    PROXY_ADDRESS
  );

  try {
    // Note: initializeV240 only takes entropy address - it gets provider via getDefaultProvider()
    const initTx = await manager.initializeV240(PYTH_ENTROPY_ADDRESS, { gasLimit: 200000 });
    console.log('Init TX:', initTx.hash);
    await initTx.wait();
    console.log('v2.4.0 initialization complete');
  } catch (err) {
    if (err.message.includes('Already initialized') || err.message.includes('V240AlreadyInitialized')) {
      console.log('v2.4.0 already initialized (skipping)');
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
  console.log('Version: 2.4.0');
  console.log();

  // Verify the upgrade
  console.log('Verifying upgrade...');

  const stats = await manager.getStats();
  console.log('Contract Stats:');
  console.log('  USDC Balance:', hre.ethers.utils.formatUnits(stats.balance, 6), 'USDC');
  console.log('  Inventory Size:', stats.inventorySize.toString());
  console.log('  Total Purchased:', stats.purchased.toString());
  console.log('  Total Awarded:', stats.awarded.toString());
  console.log('  Total USDC Spent:', hre.ethers.utils.formatUnits(stats.spent, 6), 'USDC');
  console.log('  Pending Requests:', stats.pending.toString());
  console.log();

  // Check APE reserve
  const apeReserve = await manager.apeReserve();
  console.log('APE Reserve:', hre.ethers.utils.formatEther(apeReserve), 'APE');

  // Check Entropy config
  const entropy = await manager.entropy();
  const provider = await manager.entropyProvider();
  console.log('Entropy Address:', entropy);
  console.log('Entropy Provider:', provider);
  console.log();

  console.log('='.repeat(70));
  console.log('NEXT STEPS');
  console.log('='.repeat(70));
  console.log();
  console.log('1. Upgrade PokeballGame to v1.8.0:');
  console.log('   npx hardhat run contracts/deployment/upgrade_PokeballGameV8.cjs --network apechain');
  console.log();
  console.log('2. Update contracts/addresses.json:');
  console.log(`   "implementation": "${newImpl.address}",`);
  console.log(`   "version": "2.4.0"`);
  console.log();
  console.log('3. Fund APE reserve (PokeballGame will do this automatically on purchases)');
  console.log();
  console.log('4. Update frontend ABIs to abi_SlabNFTManagerV2_4.json');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Upgrade failed:', error);
    process.exit(1);
  });
