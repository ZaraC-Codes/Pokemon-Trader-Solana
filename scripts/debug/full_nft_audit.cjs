/**
 * Full NFT Audit for SlabNFTManager
 *
 * Compares actual NFT balance with tracked inventory to find any discrepancies
 */

const { ethers } = require('hardhat');

const SLAB_NFT_MANAGER_PROXY = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const SLAB_NFT_ADDRESS = '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7';

const SLAB_NFT_MANAGER_ABI = [
  'function getInventoryCount() view returns (uint256)',
  'function getInventory() view returns (uint256[])',
  'function getUntrackedNFTs(uint256 startId, uint256 endId) view returns (uint256[])',
  'function recoverUntrackedNFT(uint256 tokenId) external',
  'function batchRecoverUntrackedNFTs(uint256[] tokenIds) external',
  'function owner() view returns (address)',
  'function MAX_INVENTORY_SIZE() view returns (uint256)',
  'function pendingRequestCount() view returns (uint256)',
];

const ERC721_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

async function main() {
  const [signer] = await ethers.getSigners();

  console.log('\n' + '='.repeat(70));
  console.log('  FULL NFT AUDIT - SlabNFTManager');
  console.log('='.repeat(70));

  const slabNFTManager = new ethers.Contract(SLAB_NFT_MANAGER_PROXY, SLAB_NFT_MANAGER_ABI, signer);
  const slabNFT = new ethers.Contract(SLAB_NFT_ADDRESS, ERC721_ABI, signer);

  // Get basic stats
  console.log('\n--- Contract Stats ---');

  const actualBalance = await slabNFT.balanceOf(SLAB_NFT_MANAGER_PROXY);
  console.log('Actual NFT Balance (balanceOf):', actualBalance.toString());

  const inventoryCount = await slabNFTManager.getInventoryCount();
  console.log('Tracked Inventory Count:       ', inventoryCount.toString());

  const inventory = await slabNFTManager.getInventory();
  console.log('Inventory Token IDs:           ', inventory.map(id => id.toString()).join(', ') || '(empty)');

  const pendingRequests = await slabNFTManager.pendingRequestCount();
  console.log('Pending VRF Requests:          ', pendingRequests.toString());

  const maxSize = await slabNFTManager.MAX_INVENTORY_SIZE();
  console.log('Max Inventory Size:            ', maxSize.toString());

  // Check for discrepancy
  const difference = actualBalance.toNumber() - inventory.length;
  console.log('\n--- Discrepancy Check ---');
  console.log('Actual Balance:  ', actualBalance.toString());
  console.log('Tracked Count:   ', inventory.length);
  console.log('Difference:      ', difference);

  if (difference > 0) {
    console.log('\n⚠️  UNTRACKED NFTs DETECTED!');
    console.log('There are', difference, 'NFT(s) owned but not tracked.');

    // Scan for untracked NFTs
    console.log('\n--- Scanning for Untracked NFTs ---');

    // Get total supply to know the range
    let totalSupply;
    try {
      totalSupply = await slabNFT.totalSupply();
      console.log('Total NFT Supply:', totalSupply.toString());
    } catch (e) {
      totalSupply = ethers.BigNumber.from(1000); // Default scan range
      console.log('Could not get totalSupply, scanning up to 1000');
    }

    // Scan in chunks
    const CHUNK_SIZE = 50;
    const untrackedAll = [];

    for (let start = 0; start < totalSupply.toNumber(); start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, totalSupply.toNumber());
      try {
        const untracked = await slabNFTManager.getUntrackedNFTs(start, end);
        if (untracked.length > 0) {
          untrackedAll.push(...untracked.map(id => id.toString()));
        }
      } catch (e) {
        // Ignore errors for ranges with no NFTs
      }
    }

    if (untrackedAll.length > 0) {
      console.log('\nUntracked NFT Token IDs:', untrackedAll.join(', '));
      console.log('\n📋 TO RECOVER THESE NFTs:');
      console.log('   Run: npx hardhat console --network apechain');
      console.log('   Then:');
      console.log(`   const manager = await ethers.getContractAt("SlabNFTManager", "${SLAB_NFT_MANAGER_PROXY}")`);
      if (untrackedAll.length === 1) {
        console.log(`   await manager.recoverUntrackedNFT(${untrackedAll[0]})`);
      } else {
        console.log(`   await manager.batchRecoverUntrackedNFTs([${untrackedAll.join(', ')}])`);
      }
    } else {
      console.log('\nNo untracked NFTs found in scan (this is unexpected given the balance difference)');
    }
  } else if (difference < 0) {
    console.log('\n❌ CRITICAL: Inventory shows MORE than actual balance!');
    console.log('This indicates state corruption.');
  } else {
    console.log('\n✅ Inventory matches actual balance - no untracked NFTs');
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log('\nActual NFT Balance:', actualBalance.toString());
  console.log('Tracked Inventory: ', inventory.length);
  console.log('Status:            ', difference === 0 ? '✅ HEALTHY' : '⚠️ NEEDS ATTENTION');
  console.log('\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });
