/**
 * Upgrade SlabNFTManager to v2.2.0
 *
 * New features:
 * - recoverUntrackedNFT() to manually add NFTs that arrived via transferFrom
 * - clearPendingRequest() to fix stuck pendingRequestCount
 * - batchRecoverUntrackedNFTs() for recovering multiple NFTs
 * - getUntrackedNFTs() to find NFTs needing recovery
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_SlabNFTManagerV2_2.cjs --network apechain
 */

const hre = require('hardhat');

async function main() {
  console.log('='.repeat(70));
  console.log('UPGRADING SLABNFTMANAGER TO v2.2.0');
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
  console.log('Compiling SlabNFTManagerV2_2...');
  await hre.run('compile');

  // Deploy new implementation directly
  console.log('Deploying new implementation...');
  const SlabNFTManagerV2_2 = await hre.ethers.getContractFactory('contracts/SlabNFTManagerV2_2.sol:SlabNFTManager');

  // Deploy implementation directly (not via proxy)
  const newImpl = await SlabNFTManagerV2_2.deploy();
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
  console.log('Version: 2.2.0');
  console.log();

  // Verify the upgrade by checking new functions exist
  console.log('Verifying upgrade...');
  const manager = await hre.ethers.getContractAt(
    'contracts/SlabNFTManagerV2_2.sol:SlabNFTManager',
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

  // Check for untracked NFTs
  console.log('Checking for untracked NFTs in range 290-310...');
  try {
    const untracked = await manager.getUntrackedNFTs(290, 310);
    if (untracked.length > 0) {
      console.log('Found untracked NFTs:', untracked.map(id => id.toString()).join(', '));
    } else {
      console.log('No untracked NFTs found in range.');
    }
  } catch (err) {
    console.log('Error checking untracked NFTs:', err.message);
  }
  console.log();

  console.log('='.repeat(70));
  console.log('NEXT STEPS');
  console.log('='.repeat(70));
  console.log();
  console.log('1. Recover Token 300:');
  console.log('   await manager.recoverUntrackedNFT(300)');
  console.log();
  console.log('2. Clear the stuck pending request:');
  console.log('   await manager.clearPendingRequest(0)');
  console.log();
  console.log('3. Update contracts/addresses.json:');
  console.log(`   "implementation": "${newImpl.address}",`);
  console.log(`   "version": "2.2.0"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Upgrade failed:', error);
    process.exit(1);
  });
