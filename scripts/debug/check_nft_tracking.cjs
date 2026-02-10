/**
 * Check NFT Tracking Status in SlabNFTManager
 *
 * Checks if a specific NFT is:
 * 1. Owned by SlabNFTManager
 * 2. Tracked in the inventory array
 * 3. Eligible for award to future winners
 */

const { ethers } = require('hardhat');

const SLAB_NFT_MANAGER_PROXY = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const SLAB_NFT_ADDRESS = '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7';

// REPLACE THIS with the actual token ID you returned
const TOKEN_ID = process.env.TOKEN_ID || '300'; // Default to 300 for testing

const SLAB_NFT_MANAGER_ABI = [
  'function getInventoryCount() view returns (uint256)',
  'function getInventory() view returns (uint256[])',
  'function getUntrackedNFTs(uint256 startId, uint256 endId) view returns (uint256[])',
  'function recoverUntrackedNFT(uint256 tokenId) external',
  'function batchRecoverUntrackedNFTs(uint256[] tokenIds) external',
  'function owner() view returns (address)',
  'function MAX_INVENTORY_SIZE() view returns (uint256)',
];

const ERC721_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
];

async function main() {
  const [signer] = await ethers.getSigners();
  const tokenId = BigInt(TOKEN_ID);

  console.log('\n' + '='.repeat(70));
  console.log('  NFT TRACKING STATUS CHECK');
  console.log('='.repeat(70));
  console.log('\nToken ID:', tokenId.toString());
  console.log('SlabNFTManager:', SLAB_NFT_MANAGER_PROXY);
  console.log('Slab NFT Collection:', SLAB_NFT_ADDRESS);
  console.log('Signer:', signer.address);

  const slabNFTManager = new ethers.Contract(SLAB_NFT_MANAGER_PROXY, SLAB_NFT_MANAGER_ABI, signer);
  const slabNFT = new ethers.Contract(SLAB_NFT_ADDRESS, ERC721_ABI, signer);

  // ===== Step 1: Check ownership =====
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 1: OWNERSHIP CHECK');
  console.log('-'.repeat(70));

  let isOwnedByManager = false;
  try {
    const owner = await slabNFT.ownerOf(tokenId);
    console.log('\nNFT Owner:', owner);
    console.log('Expected: ', SLAB_NFT_MANAGER_PROXY);
    isOwnedByManager = owner.toLowerCase() === SLAB_NFT_MANAGER_PROXY.toLowerCase();
    console.log('Owned by SlabNFTManager:', isOwnedByManager ? '✅ YES' : '❌ NO');

    if (!isOwnedByManager) {
      console.log('\n⚠️  The NFT is NOT owned by SlabNFTManager.');
      console.log('   Current owner:', owner);
      console.log('   You need to transfer it to SlabNFTManager first.');
      return;
    }
  } catch (e) {
    console.log('\n❌ Failed to get owner:', e.message);
    return;
  }

  // ===== Step 2: Check if tracked in inventory =====
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 2: INVENTORY TRACKING CHECK');
  console.log('-'.repeat(70));

  let inventory = [];
  let isTracked = false;
  try {
    const inventoryCount = await slabNFTManager.getInventoryCount();
    inventory = await slabNFTManager.getInventory();
    const maxSize = await slabNFTManager.MAX_INVENTORY_SIZE();

    console.log('\nInventory Count:', inventoryCount.toString(), '/', maxSize.toString());
    console.log('Inventory Token IDs:', inventory.map(id => id.toString()).join(', ') || '(empty)');

    isTracked = inventory.some(id => id.toString() === tokenId.toString());
    console.log('\nToken', tokenId.toString(), 'is tracked:', isTracked ? '✅ YES' : '❌ NO');
  } catch (e) {
    console.log('\n❌ Failed to get inventory:', e.message);
  }

  // ===== Step 3: Check for untracked NFTs =====
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 3: UNTRACKED NFT CHECK');
  console.log('-'.repeat(70));

  if (isOwnedByManager && !isTracked) {
    console.log('\n⚠️  NFT is OWNED but NOT TRACKED - needs recovery!');

    // Check a range around the token ID
    const startId = tokenId > 5n ? tokenId - 5n : 0n;
    const endId = tokenId + 5n;

    try {
      const untrackedNFTs = await slabNFTManager.getUntrackedNFTs(startId, endId);
      console.log(`\nUntracked NFTs in range [${startId}, ${endId}]:`,
        untrackedNFTs.map(id => id.toString()).join(', ') || '(none)');

      const isInUntrackedList = untrackedNFTs.some(id => id.toString() === tokenId.toString());
      console.log('Token', tokenId.toString(), 'in untracked list:', isInUntrackedList ? '✅ YES' : '❌ NO');
    } catch (e) {
      console.log('\n❌ Failed to get untracked NFTs:', e.message);
    }
  }

  // ===== Step 4: Recovery needed? =====
  console.log('\n' + '-'.repeat(70));
  console.log('  STEP 4: RECOVERY STATUS');
  console.log('-'.repeat(70));

  if (isOwnedByManager && isTracked) {
    console.log('\n✅ NFT is properly tracked and ready for award!');
    console.log('   No action needed.');
  } else if (isOwnedByManager && !isTracked) {
    console.log('\n⚠️  RECOVERY NEEDED');
    console.log('   The NFT is owned by SlabNFTManager but not tracked in inventory.');
    console.log('   Run the recovery command to add it to the awardable pool.\n');

    // Check if signer is owner
    const contractOwner = await slabNFTManager.owner();
    const isOwner = signer.address.toLowerCase() === contractOwner.toLowerCase();
    console.log('Contract Owner:', contractOwner);
    console.log('You are owner: ', isOwner ? '✅ YES' : '❌ NO');

    if (isOwner) {
      console.log('\n📋 TO RECOVER, run:');
      console.log(`   TOKEN_ID=${tokenId} node scripts/debug/recover_nft.cjs`);
      console.log('\n   Or via Hardhat console:');
      console.log(`   await slabNFTManager.recoverUntrackedNFT(${tokenId})`);
    } else {
      console.log('\n⚠️  You need to connect as the owner wallet to recover.');
    }
  } else {
    console.log('\n❌ NFT is not owned by SlabNFTManager - cannot be awarded.');
  }

  // ===== Summary =====
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log('\nToken ID:        ', tokenId.toString());
  console.log('Owned by Manager:', isOwnedByManager ? '✅' : '❌');
  console.log('Tracked in Pool: ', isTracked ? '✅' : '❌');
  console.log('Awardable:       ', (isOwnedByManager && isTracked) ? '✅ YES' : '❌ NO');
  console.log('\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });
