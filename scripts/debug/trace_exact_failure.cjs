/**
 * Trace exactly where the transferFrom fails
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const SLAB_MANAGER = "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71";
const SLAB_MACHINE = "0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466";
const USDC = "0xF1815bd50389c46847f0Bda824eC8da914045D14";

async function main() {
  console.log("=== Finding Exact Failure Point ===\n");
  
  const erc20Abi = ["function allowance(address,address) view returns (uint256)"];
  const usdc = new ethers.Contract(USDC, erc20Abi, provider);
  
  // Check Manager -> SlabMachine allowance
  const managerToMachine = await usdc.allowance(SLAB_MANAGER, SLAB_MACHINE);
  console.log("SlabNFTManager -> SlabMachine USDC allowance:", managerToMachine.toString());
  
  if (managerToMachine.isZero()) {
    console.log("\n*** FOUND THE BUG! ***");
    console.log("SlabNFTManager has ZERO approval to SlabMachine for USDC!");
    console.log("");
    console.log("This means when checkAndPurchaseNFT() tries to pull from");
    console.log("SlabMachine, the USDC.transferFrom will fail!");
    console.log("");
    
    // But wait - the APE purchase shouldn't even trigger this...
    // Let me check the flow again
  }
  
  // Let me check if checkAndPurchaseNFT is called during purchase
  console.log("=== Understanding the Flow ===");
  console.log("purchaseBallsWithAPE() calls:");
  console.log("  1. _swapAPEtoUSDC() - swaps APE to USDC");
  console.log("  2. _processUnifiedPayment() - splits 3%/97%");
  console.log("     - Calls slabNFTManager.depositRevenue(revenue)");
  console.log("     - Calls slabNFTManager.checkAndPurchaseNFT()");
  console.log("");
  console.log("checkAndPurchaseNFT() might try to buy NFT if balance >= $51");
  
  // Check SlabNFTManager's USDC balance
  const managerBalance = await usdc.balanceOf(SLAB_MANAGER);
  console.log("\nSlabNFTManager USDC balance:", ethers.utils.formatUnits(managerBalance, 6), "USDC");
  
  // If balance >= 51, it would try to purchase
  const threshold = ethers.utils.parseUnits("51", 6);
  console.log("Purchase threshold: 51 USDC");
  console.log("Would trigger purchase:", managerBalance.gte(threshold));
  
  if (managerBalance.gte(threshold)) {
    console.log("\n*** The Manager has enough to trigger a purchase! ***");
    console.log("But it has NO approval to SlabMachine!");
    console.log("");
    console.log("The flow is:");
    console.log("1. Purchase APE -> swap to USDC");
    console.log("2. depositRevenue() to Manager");
    console.log("3. checkAndPurchaseNFT() checks balance");
    console.log("4. Balance >= 51, so it calls _executePurchase()");
    console.log("5. _executePurchase() does USDC.approve(slabMachine, amount)");
    console.log("6. Then calls slabMachine.pull()");
    console.log("");
    console.log("But wait - step 5 should approve first!");
    console.log("Let me check the SlabNFTManager code...");
  }
  
  // Read the SlabNFTManager contract to understand _executePurchase
  console.log("\n=== Checking Historical Data ===");
  
  // Check if there was ever an approval event
  const approvalTopic = ethers.utils.id("Approval(address,address,uint256)");
  
  const approvalLogs = await provider.getLogs({
    address: USDC,
    topics: [
      approvalTopic,
      ethers.utils.hexZeroPad(SLAB_MANAGER.toLowerCase(), 32)  // owner = SlabNFTManager
    ],
    fromBlock: 32710000,
    toBlock: await provider.getBlockNumber()
  });
  
  console.log("Approval events from SlabNFTManager:", approvalLogs.length);
  for (const log of approvalLogs) {
    const spender = "0x" + log.topics[2].slice(26);
    const amount = ethers.BigNumber.from(log.data);
    console.log("  Block", log.blockNumber, "- Spender:", spender.slice(0, 10), "Amount:", 
      amount.gt(ethers.utils.parseUnits("1000000000", 6)) ? "~MAX" : ethers.utils.formatUnits(amount, 6));
  }
  
  // Check current Manager USDC balance
  console.log("\n=== Current Manager State ===");
  const currentBalance = await usdc.balanceOf(SLAB_MANAGER);
  console.log("USDC Balance:", ethers.utils.formatUnits(currentBalance, 6));
  
  // The problem might be:
  // 1. Manager balance is >= 51
  // 2. checkAndPurchaseNFT() will try to buy
  // 3. The approve inside _executePurchase might be failing
  // OR
  // 4. The error is coming from somewhere else entirely
  
  console.log("\n=== Let's Test Just depositRevenue ===");
  
  // Simulate just the depositRevenue call
  const managerAbi = [
    "function depositRevenue(uint256 amount)",
    "function checkAndPurchaseNFT() returns (bool)"
  ];
  const manager = new ethers.Contract(SLAB_MANAGER, managerAbi, provider);
  
  try {
    // PokeballGame calling depositRevenue
    await manager.callStatic.depositRevenue(ethers.utils.parseUnits("0.97", 6), {
      from: POKEBALL_GAME
    });
    console.log("depositRevenue(): Would SUCCEED");
  } catch (e) {
    console.log("depositRevenue(): FAILS -", e.reason || e.message.slice(0, 100));
  }
  
  // Test checkAndPurchaseNFT
  try {
    const result = await manager.callStatic.checkAndPurchaseNFT({
      from: POKEBALL_GAME
    });
    console.log("checkAndPurchaseNFT(): Would SUCCEED, result:", result);
  } catch (e) {
    console.log("checkAndPurchaseNFT(): FAILS -", e.reason || e.message.slice(0, 100));
  }
}

main().catch(console.error);
