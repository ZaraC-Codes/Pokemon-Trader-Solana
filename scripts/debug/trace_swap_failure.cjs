/**
 * Trace exactly which transfer fails in the APE swap flow
 * KEY INSIGHT: Issue started after first USDC.e purchase
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Addresses
const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
const USDC = "0xF1815bd50389c46847f0Bda824eC8da914045D14";
const CAMELOT_ROUTER = "0xC69Dc28924930583024E067b2B3d773018F4EB52";
const SLAB_NFT_MANAGER = "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71";

// ERC-20 ABI for allowance checks
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

async function main() {
  console.log("=== Tracing APE Swap Failure ===");
  console.log("INSIGHT: Issue started after first USDC.e purchase\n");
  
  const currentBlock = await provider.getBlockNumber();
  console.log("Current block:", currentBlock);
  
  const wape = new ethers.Contract(WAPE, ERC20_ABI, provider);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, provider);
  
  // Find the first USDC.e purchase
  console.log("\n=== Looking for USDC.e purchases ===");
  
  // BallPurchased event signature
  const ballPurchasedTopic = ethers.utils.id("BallPurchased(address,uint8,uint256,bool,uint256)");
  
  // Get recent BallPurchased events
  const logs = await provider.getLogs({
    address: POKEBALL_GAME,
    topics: [ballPurchasedTopic],
    fromBlock: 32710000,
    toBlock: currentBlock
  });
  
  console.log("Found", logs.length, "BallPurchased events");
  
  for (const log of logs) {
    const buyer = "0x" + log.topics[1].slice(26);
    // Decode data: ballType, quantity, usedAPE, totalAmount
    const decoded = ethers.utils.defaultAbiCoder.decode(
      ["uint8", "uint256", "bool", "uint256"],
      log.data
    );
    const ballType = decoded[0];
    const quantity = decoded[1].toString();
    const usedAPE = decoded[2];
    const totalAmount = decoded[3];
    
    const tx = await provider.getTransaction(log.transactionHash);
    console.log("\nBlock:", log.blockNumber);
    console.log("  Buyer:", buyer);
    console.log("  Ball Type:", ballType, "Qty:", quantity);
    console.log("  Used APE:", usedAPE);
    console.log("  Amount:", usedAPE 
      ? ethers.utils.formatEther(totalAmount) + " APE" 
      : ethers.utils.formatUnits(totalAmount, 6) + " USDC");
    console.log("  Tx:", log.transactionHash);
  }
  
  // Now check allowances at different blocks
  console.log("\n\n=== Checking Allowances at Different Points ===");
  
  // Before any purchases (block 32710000)
  const beforeBlock = 32710000;
  const wapeAllowanceBefore = await wape.allowance(POKEBALL_GAME, CAMELOT_ROUTER, { blockTag: beforeBlock });
  console.log("\nBefore purchases (block", beforeBlock, "):");
  console.log("  PokeballGame -> Router WAPE allowance:", ethers.utils.formatEther(wapeAllowanceBefore));
  
  // Current state
  const wapeAllowanceNow = await wape.allowance(POKEBALL_GAME, CAMELOT_ROUTER);
  console.log("\nCurrent state:");
  console.log("  PokeballGame -> Router WAPE allowance:", ethers.utils.formatEther(wapeAllowanceNow));
  
  // Check WAPE balance - this is critical
  console.log("\n=== CRITICAL: WAPE Balance Check ===");
  const wapeBalance = await wape.balanceOf(POKEBALL_GAME);
  console.log("PokeballGame WAPE balance:", ethers.utils.formatEther(wapeBalance));
  
  // If there's leftover WAPE, that's the problem!
  if (wapeBalance.gt(0)) {
    console.log("\n!!! FOUND LEFTOVER WAPE - This could be the issue!");
    console.log("If the contract has WAPE but the allowance was reset or");
    console.log("the swap uses transferFrom on this balance incorrectly...");
  }
}

main().catch(console.error);
