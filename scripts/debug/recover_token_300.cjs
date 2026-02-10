/**
 * Recover Token 300 and clear pending request
 *
 * This script:
 * 1. Recovers Token 300 (untracked NFT) into inventory
 * 2. Clears the stuck pending request counter
 */

const hre = require('hardhat');

async function main() {
  console.log('='.repeat(70));
  console.log('RECOVERING TOKEN 300 AND FIXING STATE');
  console.log('='.repeat(70));
  console.log();

  const PROXY_ADDRESS = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);
  console.log();

  // Get manager contract
  const manager = await hre.ethers.getContractAt(
    'contracts/SlabNFTManagerV2_2.sol:SlabNFTManager',
    PROXY_ADDRESS
  );

  // Check current state
  console.log('BEFORE RECOVERY:');
  let stats = await manager.getStats();
  console.log('  Inventory Size:', stats.inventorySize.toString());
  console.log('  Pending Requests:', stats.pending.toString());

  const inventory = await manager.getInventory();
  console.log('  Inventory:', inventory.length > 0 ? inventory.map(id => id.toString()).join(', ') : '(empty)');
  console.log();

  // Step 1: Recover Token 300
  console.log('Step 1: Recovering Token 300...');
  try {
    const tx1 = await manager.recoverUntrackedNFT(300, { gasLimit: 200000 });
    console.log('  TX:', tx1.hash);
    const receipt1 = await tx1.wait();
    console.log('  Confirmed in block:', receipt1.blockNumber);
    console.log('  ✅ Token 300 recovered!');
  } catch (err) {
    console.log('  ❌ Error:', err.message);
  }
  console.log();

  // Step 2: Clear pending request
  console.log('Step 2: Clearing pending request counter...');
  try {
    const tx2 = await manager.clearPendingRequest(0, { gasLimit: 100000 });
    console.log('  TX:', tx2.hash);
    const receipt2 = await tx2.wait();
    console.log('  Confirmed in block:', receipt2.blockNumber);
    console.log('  ✅ Pending request cleared!');
  } catch (err) {
    console.log('  ❌ Error:', err.message);
  }
  console.log();

  // Check final state
  console.log('AFTER RECOVERY:');
  stats = await manager.getStats();
  console.log('  Inventory Size:', stats.inventorySize.toString());
  console.log('  Pending Requests:', stats.pending.toString());

  const finalInventory = await manager.getInventory();
  console.log('  Inventory:', finalInventory.length > 0 ? finalInventory.map(id => id.toString()).join(', ') : '(empty)');
  console.log();

  // Verify no more untracked NFTs
  console.log('Checking for remaining untracked NFTs...');
  const untracked = await manager.getUntrackedNFTs(290, 310);
  if (untracked.length > 0) {
    console.log('  Found:', untracked.map(id => id.toString()).join(', '));
  } else {
    console.log('  ✅ No untracked NFTs remaining');
  }
  console.log();

  console.log('='.repeat(70));
  console.log('RECOVERY COMPLETE');
  console.log('='.repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Recovery failed:', error);
    process.exit(1);
  });
