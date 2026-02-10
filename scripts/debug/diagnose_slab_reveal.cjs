/**
 * Diagnose Slab Reveal Flow
 *
 * Checks:
 * 1. SlabMachine configuration and VRF provider
 * 2. Pending pull requests from SlabNFTManager
 * 3. Recent NFT transfers and events
 * 4. VRF callback status
 */

const { ethers } = require('ethers');

// Configuration
const CALDERA_RPC = 'https://apechain.calderachain.xyz/http';
const SLAB_MACHINE_ADDRESS = '0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466';
const SLAB_NFT_MANAGER_ADDRESS = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const SLAB_NFT_ADDRESS = '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7';
const USDC_ADDRESS = '0xF1815bd50389c46847f0Bda824eC8da914045D14';

// Minimal ABIs
const SLAB_MACHINE_ABI = [
  'function machineConfig() view returns (uint256 maxPulls, uint256 buybackExpiry, uint256 buybackPercentage, uint256 minBuybackValue, uint256 usdcPullPrice)',
  'function randomNumberCallback(uint256 _requestId, uint256[] _randomNumber)',
  'event SlabPulled()',
  'event SlabDeposited(uint256 tokenId, uint256 value, uint8 rarity)',
];

const SLAB_NFT_MANAGER_ABI = [
  'function getInventoryCount() view returns (uint256)',
  'function getInventory() view returns (uint256[])',
  'function pendingRequestCount() view returns (uint256)',
  'function totalNFTsPurchased() view returns (uint256)',
  'function totalUSDCSpent() view returns (uint256)',
  'event NFTPurchaseInitiated(uint256 indexed requestId, uint256 amount, address indexed recipient)',
  'event NFTReceived(uint256 indexed tokenId, uint256 inventorySize)',
  'event NFTAwarded(address indexed winner, uint256 indexed tokenId, uint256 remainingInventory)',
];

const ERC721_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

async function main() {
  console.log('='.repeat(70));
  console.log('SLAB REVEAL FLOW DIAGNOSTIC');
  console.log('='.repeat(70));
  console.log();

  const provider = new ethers.providers.JsonRpcProvider(CALDERA_RPC);
  const blockNumber = await provider.getBlockNumber();
  console.log(`Current block: ${blockNumber}`);
  console.log();

  // Create contract instances
  const slabMachine = new ethers.Contract(SLAB_MACHINE_ADDRESS, SLAB_MACHINE_ABI, provider);
  const slabNFTManager = new ethers.Contract(SLAB_NFT_MANAGER_ADDRESS, SLAB_NFT_MANAGER_ABI, provider);
  const slabNFT = new ethers.Contract(SLAB_NFT_ADDRESS, ERC721_ABI, provider);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);

  // 1. SlabMachine Configuration
  console.log('1. SLABMACHINE CONFIGURATION');
  console.log('-'.repeat(50));
  try {
    const config = await slabMachine.machineConfig();
    console.log(`   Max Pulls per TX:     ${config.maxPulls}`);
    console.log(`   Buyback Expiry:       ${config.buybackExpiry} seconds`);
    console.log(`   Buyback Percentage:   ${config.buybackPercentage}%`);
    console.log(`   Min Buyback Value:    ${ethers.utils.formatUnits(config.minBuybackValue, 6)} USDC`);
    console.log(`   USDC Pull Price:      ${ethers.utils.formatUnits(config.usdcPullPrice, 6)} USDC`);
    console.log();

    if (config.usdcPullPrice.eq(1)) {
      console.log('   ⚠️  WARNING: Pull price shows $0.000001 (stale config)');
      console.log('   ⚠️  This is why we hardcoded $51 in SlabNFTManager v2.1.0');
    }
  } catch (err) {
    console.log(`   Error reading config: ${err.message}`);
  }
  console.log();

  // 2. SlabNFTManager Status
  console.log('2. SLABNFTMANAGER STATUS');
  console.log('-'.repeat(50));
  try {
    const inventoryCount = await slabNFTManager.getInventoryCount();
    const inventory = await slabNFTManager.getInventory();
    const pendingCount = await slabNFTManager.pendingRequestCount();
    const totalPurchased = await slabNFTManager.totalNFTsPurchased();
    const totalSpent = await slabNFTManager.totalUSDCSpent();
    const usdcBalance = await usdc.balanceOf(SLAB_NFT_MANAGER_ADDRESS);
    const nftBalance = await slabNFT.balanceOf(SLAB_NFT_MANAGER_ADDRESS);

    console.log(`   Inventory Count:      ${inventoryCount} / 20`);
    console.log(`   Inventory Token IDs:  ${inventory.length > 0 ? inventory.map(t => t.toString()).join(', ') : '(empty)'}`);
    console.log(`   Pending Requests:     ${pendingCount}`);
    console.log(`   Total NFTs Purchased: ${totalPurchased}`);
    console.log(`   Total USDC Spent:     $${ethers.utils.formatUnits(totalSpent, 6)}`);
    console.log(`   Current USDC Balance: $${ethers.utils.formatUnits(usdcBalance, 6)}`);
    console.log(`   NFT Balance (ERC721): ${nftBalance}`);

    if (pendingCount > 0) {
      console.log();
      console.log('   ⚠️  PENDING REQUESTS DETECTED!');
      console.log('   These pulls are waiting for VRF callback.');
    }
  } catch (err) {
    console.log(`   Error reading status: ${err.message}`);
  }
  console.log();

  // 3. Recent NFTPurchaseInitiated Events
  console.log('3. RECENT NFT PURCHASE EVENTS (last 50,000 blocks)');
  console.log('-'.repeat(50));
  try {
    const fromBlock = Math.max(0, blockNumber - 50000);
    const purchaseFilter = slabNFTManager.filters.NFTPurchaseInitiated();
    const purchaseEvents = await slabNFTManager.queryFilter(purchaseFilter, fromBlock, blockNumber);

    if (purchaseEvents.length === 0) {
      console.log('   No NFTPurchaseInitiated events found');
    } else {
      console.log(`   Found ${purchaseEvents.length} purchase initiation(s):`);
      for (const event of purchaseEvents) {
        const block = await event.getBlock();
        const timestamp = new Date(block.timestamp * 1000).toISOString();
        console.log();
        console.log(`   Request ID: ${event.args.requestId}`);
        console.log(`   Amount:     $${ethers.utils.formatUnits(event.args.amount, 6)} USDC`);
        console.log(`   Recipient:  ${event.args.recipient}`);
        console.log(`   Block:      ${event.blockNumber}`);
        console.log(`   Time:       ${timestamp}`);
        console.log(`   TX:         ${event.transactionHash}`);
      }
    }
  } catch (err) {
    console.log(`   Error querying events: ${err.message}`);
  }
  console.log();

  // 4. Recent NFTReceived Events
  console.log('4. RECENT NFT RECEIVED EVENTS (last 50,000 blocks)');
  console.log('-'.repeat(50));
  try {
    const fromBlock = Math.max(0, blockNumber - 50000);
    const receivedFilter = slabNFTManager.filters.NFTReceived();
    const receivedEvents = await slabNFTManager.queryFilter(receivedFilter, fromBlock, blockNumber);

    if (receivedEvents.length === 0) {
      console.log('   No NFTReceived events found');
      console.log('   This means NO NFTs have been received by SlabNFTManager');
    } else {
      console.log(`   Found ${receivedEvents.length} NFT receipt(s):`);
      for (const event of receivedEvents) {
        const block = await event.getBlock();
        const timestamp = new Date(block.timestamp * 1000).toISOString();
        console.log();
        console.log(`   Token ID:       ${event.args.tokenId}`);
        console.log(`   Inventory Size: ${event.args.inventorySize}`);
        console.log(`   Block:          ${event.blockNumber}`);
        console.log(`   Time:           ${timestamp}`);
        console.log(`   TX:             ${event.transactionHash}`);
      }
    }
  } catch (err) {
    console.log(`   Error querying events: ${err.message}`);
  }
  console.log();

  // 5. Recent ERC721 Transfers TO SlabNFTManager
  console.log('5. RECENT NFT TRANSFERS TO SLABNFTMANAGER (last 50,000 blocks)');
  console.log('-'.repeat(50));
  try {
    const fromBlock = Math.max(0, blockNumber - 50000);
    const transferFilter = slabNFT.filters.Transfer(null, SLAB_NFT_MANAGER_ADDRESS);
    const transferEvents = await slabNFT.queryFilter(transferFilter, fromBlock, blockNumber);

    if (transferEvents.length === 0) {
      console.log('   No ERC721 transfers to SlabNFTManager found');
    } else {
      console.log(`   Found ${transferEvents.length} transfer(s):`);
      for (const event of transferEvents) {
        const block = await event.getBlock();
        const timestamp = new Date(block.timestamp * 1000).toISOString();
        console.log();
        console.log(`   Token ID: ${event.args.tokenId}`);
        console.log(`   From:     ${event.args.from}`);
        console.log(`   Block:    ${event.blockNumber}`);
        console.log(`   Time:     ${timestamp}`);
        console.log(`   TX:       ${event.transactionHash}`);
      }
    }
  } catch (err) {
    console.log(`   Error querying transfers: ${err.message}`);
  }
  console.log();

  // 6. Check SlabMachine for randomNumberCallback transactions
  console.log('6. CHECKING FOR VRF CALLBACKS TO SLABMACHINE');
  console.log('-'.repeat(50));
  console.log('   (Searching for transactions to SlabMachine that call randomNumberCallback)');
  console.log();

  // Get SlabMachine's recent transactions
  // Note: This requires scanning transactions, which is expensive
  // Instead, let's look for SlabPulled events which indicate completed pulls
  try {
    const fromBlock = Math.max(0, blockNumber - 50000);
    const slabPulledFilter = slabMachine.filters.SlabPulled();
    const slabPulledEvents = await slabMachine.queryFilter(slabPulledFilter, fromBlock, blockNumber);

    console.log(`   Found ${slabPulledEvents.length} SlabPulled event(s)`);
    if (slabPulledEvents.length > 0) {
      console.log('   These indicate successful VRF callbacks and NFT reveals:');
      for (const event of slabPulledEvents.slice(-5)) { // Last 5
        const block = await event.getBlock();
        const timestamp = new Date(block.timestamp * 1000).toISOString();
        console.log(`     - Block ${event.blockNumber} at ${timestamp}`);
        console.log(`       TX: ${event.transactionHash}`);
      }
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }
  console.log();

  // 7. Summary and Diagnosis
  console.log('='.repeat(70));
  console.log('DIAGNOSIS SUMMARY');
  console.log('='.repeat(70));
  console.log();

  try {
    const pendingCount = await slabNFTManager.pendingRequestCount();
    const inventoryCount = await slabNFTManager.getInventoryCount();
    const totalPurchased = await slabNFTManager.totalNFTsPurchased();

    if (pendingCount > 0) {
      console.log(`⚠️  STATUS: ${pendingCount} PENDING REQUEST(S)`);
      console.log();
      console.log('   The SlabNFTManager has initiated pull request(s) that are waiting');
      console.log('   for the VRF callback from the randomness provider.');
      console.log();
      console.log('   Possible issues:');
      console.log('   1. VRF subscription not funded (needs LINK or native token)');
      console.log('   2. VRF callback gas limit too low');
      console.log('   3. VRF provider is down or misconfigured');
      console.log('   4. SlabMachine.randomNumberCallback() reverted');
      console.log();
      console.log('   Next steps:');
      console.log('   - Check ApeScan for the pull() transaction');
      console.log('   - Look for a corresponding randomNumberCallback() transaction');
      console.log('   - If no callback exists, check VRF subscription funding');
    } else if (inventoryCount > 0) {
      console.log(`✅  STATUS: HEALTHY`);
      console.log();
      console.log(`   Inventory: ${inventoryCount} NFT(s) ready to award`);
      console.log(`   Total purchased: ${totalPurchased}`);
      console.log();
      console.log('   The reveal flow is working correctly.');
    } else if (totalPurchased > 0 && inventoryCount === 0) {
      console.log(`✅  STATUS: HEALTHY (inventory empty after awards)`);
      console.log();
      console.log(`   All ${totalPurchased} purchased NFTs have been awarded to winners.`);
      console.log('   System is waiting for more revenue to trigger next purchase.');
    } else {
      console.log(`ℹ️  STATUS: NO ACTIVITY YET`);
      console.log();
      console.log('   No NFT purchases have been triggered yet.');
      console.log('   Need $51+ in SlabNFTManager to trigger auto-purchase.');
    }
  } catch (err) {
    console.log(`Error in summary: ${err.message}`);
  }

  console.log();
  console.log('='.repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
