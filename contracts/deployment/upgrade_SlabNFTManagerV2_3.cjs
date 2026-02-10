/**
 * Upgrade SlabNFTManager to v2.3.0
 *
 * New features:
 * - awardNFTToWinnerWithRandomness() for random NFT selection using Pyth Entropy
 * - Uses swap-and-pop pattern for O(1) removal at random index
 * - Reuses random number from catch determination (no additional Entropy fee)
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_SlabNFTManagerV2_3.cjs --network apechain
 */

const hre = require('hardhat');

async function main() {
  console.log('='.repeat(70));
  console.log('UPGRADING SLABNFTMANAGER TO v2.3.0');
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

  // Compile
  console.log('Compiling SlabNFTManagerV2_3...');
  await hre.run('compile');

  // Deploy new implementation directly
  console.log('Deploying new implementation...');
  const SlabNFTManagerV2_3 = await hre.ethers.getContractFactory('contracts/SlabNFTManagerV2_3.sol:SlabNFTManager');

  // Deploy implementation directly (not via proxy)
  const newImpl = await SlabNFTManagerV2_3.deploy();
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
  console.log('='.repeat(70));
  console.log('UPGRADE SUCCESSFUL');
  console.log('='.repeat(70));
  console.log();
  console.log('Proxy Address (unchanged):', PROXY_ADDRESS);
  console.log('New Implementation:', newImpl.address);
  console.log('Version: 2.3.0');
  console.log();

  // Verify the upgrade by checking new functions exist
  console.log('Verifying upgrade...');
  const manager = await hre.ethers.getContractAt(
    'contracts/SlabNFTManagerV2_3.sol:SlabNFTManager',
    PROXY_ADDRESS
  );

  const stats = await manager.getStats();
  console.log('Contract Stats:');
  console.log('  USDC Balance:', hre.ethers.utils.formatUnits(stats.balance, 6), 'USDC');
  console.log('  Inventory Size:', stats.inventorySize.toString());
  console.log('  Total Purchased:', stats.purchased.toString());
  console.log('  Total Awarded:', stats.awarded.toString());
  console.log('  Total USDC Spent:', hre.ethers.utils.formatUnits(stats.spent, 6), 'USDC');
  console.log('  Pending Requests:', stats.pending.toString());
  console.log();

  console.log('='.repeat(70));
  console.log('NEXT STEPS');
  console.log('='.repeat(70));
  console.log();
  console.log('1. Upgrade PokeballGame to v1.7.0 (to call awardNFTToWinnerWithRandomness)');
  console.log('   npx hardhat run contracts/deployment/upgrade_PokeballGameV7.cjs --network apechain');
  console.log();
  console.log('2. Update contracts/addresses.json:');
  console.log(`   "implementation": "${newImpl.address}",`);
  console.log(`   "version": "2.3.0"`);
  console.log();
  console.log('3. Update frontend ABIs if needed');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Upgrade failed:', error);
    process.exit(1);
  });
