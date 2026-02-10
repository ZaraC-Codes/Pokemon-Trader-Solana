/**
 * Investigate Token ID 300 and the failed inventory tracking
 */

const { ethers } = require('ethers');

const CALDERA_RPC = 'https://apechain.calderachain.xyz/http';
const SLAB_NFT_MANAGER_ADDRESS = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const SLAB_NFT_ADDRESS = '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7';
const SLAB_MACHINE_ADDRESS = '0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466';

const SLAB_NFT_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

const SLAB_NFT_MANAGER_ABI = [
  'function getInventoryCount() view returns (uint256)',
  'function getInventory() view returns (uint256[])',
  'function isInInventory(uint256 tokenId) view returns (bool)',
  'function pendingPullRequests(uint256 requestId) view returns (address)',
  'function pendingRequestCount() view returns (uint256)',
];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(CALDERA_RPC);

  const slabNFT = new ethers.Contract(SLAB_NFT_ADDRESS, SLAB_NFT_ABI, provider);
  const slabNFTManager = new ethers.Contract(SLAB_NFT_MANAGER_ADDRESS, SLAB_NFT_MANAGER_ABI, provider);

  console.log('='.repeat(70));
  console.log('INVESTIGATING TOKEN ID 300');
  console.log('='.repeat(70));
  console.log();

  // 1. Check current owner of Token 300
  console.log('1. TOKEN 300 OWNERSHIP');
  console.log('-'.repeat(50));
  try {
    const owner = await slabNFT.ownerOf(300);
    console.log(`   Owner: ${owner}`);
    if (owner.toLowerCase() === SLAB_NFT_MANAGER_ADDRESS.toLowerCase()) {
      console.log('   ✅ Token IS owned by SlabNFTManager');
    } else {
      console.log('   ⚠️  Token is NOT owned by SlabNFTManager');
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }
  console.log();

  // 2. Check if Token 300 is in inventory
  console.log('2. INVENTORY TRACKING');
  console.log('-'.repeat(50));
  try {
    const isTracked = await slabNFTManager.isInInventory(300);
    const inventory = await slabNFTManager.getInventory();
    const inventoryCount = await slabNFTManager.getInventoryCount();

    console.log(`   isInInventory(300): ${isTracked}`);
    console.log(`   Inventory array:    ${inventory.length > 0 ? inventory.map(t => t.toString()).join(', ') : '(empty)'}`);
    console.log(`   Inventory count:    ${inventoryCount}`);

    if (!isTracked) {
      console.log();
      console.log('   ⚠️  BUG DETECTED: NFT is owned but NOT tracked in inventory!');
      console.log('   This means onERC721Received() did not add it properly.');
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }
  console.log();

  // 3. Check the transfer transaction
  console.log('3. TRANSFER TRANSACTION ANALYSIS');
  console.log('-'.repeat(50));
  const txHash = '0x9d3d8a1d9b18ff17edb002b1eca8e568cc1a715223e933202a35e64990db9f55';
  console.log(`   TX Hash: ${txHash}`);
  console.log();

  try {
    const tx = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);

    console.log(`   From:         ${tx.from}`);
    console.log(`   To:           ${tx.to}`);
    console.log(`   Block:        ${receipt.blockNumber}`);
    console.log(`   Status:       ${receipt.status === 1 ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Gas Used:     ${receipt.gasUsed.toString()}`);
    console.log(`   Logs Count:   ${receipt.logs.length}`);
    console.log();

    // Parse logs
    console.log('   LOGS:');
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      console.log(`   [${i}] Address: ${log.address}`);
      console.log(`       Topics: ${log.topics.length}`);

      // Try to decode Transfer event
      if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
        // This is a Transfer event
        const from = '0x' + log.topics[1].slice(26);
        const to = '0x' + log.topics[2].slice(26);
        const tokenId = ethers.BigNumber.from(log.topics[3]).toString();
        console.log(`       TYPE: ERC721 Transfer`);
        console.log(`       From: ${from}`);
        console.log(`       To:   ${to}`);
        console.log(`       TokenID: ${tokenId}`);
      }
      console.log();
    }

    // Check if this was a randomNumberCallback
    console.log('   FUNCTION CALLED:');
    if (tx.to.toLowerCase() === SLAB_MACHINE_ADDRESS.toLowerCase()) {
      console.log('   Transaction was sent TO SlabMachine');
      // Try to decode the function selector
      const selector = tx.data.slice(0, 10);
      console.log(`   Function selector: ${selector}`);

      // randomNumberCallback selector = 0x... (need to calculate)
      const iface = new ethers.utils.Interface([
        'function randomNumberCallback(uint256 _requestId, uint256[] _randomNumber)'
      ]);
      const callbackSelector = iface.getSighash('randomNumberCallback');
      console.log(`   randomNumberCallback selector: ${callbackSelector}`);

      if (selector === callbackSelector) {
        console.log('   ✅ This IS a randomNumberCallback transaction!');

        // Decode the parameters
        try {
          const decoded = iface.decodeFunctionData('randomNumberCallback', tx.data);
          console.log(`   Request ID: ${decoded._requestId.toString()}`);
          console.log(`   Random Numbers: ${decoded._randomNumber.map(n => n.toString())}`);
        } catch (e) {
          console.log(`   Could not decode params: ${e.message}`);
        }
      } else {
        console.log('   This is NOT a randomNumberCallback');
      }
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }
  console.log();

  // 4. Check token URI (metadata)
  console.log('4. TOKEN 300 METADATA');
  console.log('-'.repeat(50));
  try {
    const uri = await slabNFT.tokenURI(300);
    console.log(`   Token URI: ${uri}`);

    if (uri.startsWith('ipfs://')) {
      const httpUri = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
      console.log(`   HTTP URL:  ${httpUri}`);
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }
  console.log();

  // 5. Recommendations
  console.log('='.repeat(70));
  console.log('DIAGNOSIS & RECOMMENDATIONS');
  console.log('='.repeat(70));
  console.log();
  console.log('ISSUE: Token 300 was transferred to SlabNFTManager but not');
  console.log('       added to the inventory tracking.');
  console.log();
  console.log('ROOT CAUSE OPTIONS:');
  console.log('1. The transfer was NOT via safeTransferFrom (onERC721Received not called)');
  console.log('2. The onERC721Received logic had a bug in the version at the time');
  console.log('3. The transaction reverted after the transfer but before inventory update');
  console.log();
  console.log('SOLUTION:');
  console.log('Need a recovery function to manually add untracked NFTs to inventory.');
  console.log('Something like: recoverUntracked(uint256[] tokenIds)');
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
