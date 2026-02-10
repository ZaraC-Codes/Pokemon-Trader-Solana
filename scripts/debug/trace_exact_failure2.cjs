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
  
  const erc20Abi = [
    "function allowance(address,address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)"
  ];
  const usdc = new ethers.Contract(USDC, erc20Abi, provider);
  
  // Check Manager -> SlabMachine allowance
  const managerToMachine = await usdc.allowance(SLAB_MANAGER, SLAB_MACHINE);
  console.log("SlabNFTManager -> SlabMachine USDC allowance:", managerToMachine.toString());
  
  // Check SlabNFTManager's USDC balance
  const managerBalance = await usdc.balanceOf(SLAB_MANAGER);
  console.log("SlabNFTManager USDC balance:", ethers.utils.formatUnits(managerBalance, 6), "USDC");
  
  // If balance >= 51, it would try to purchase
  const threshold = ethers.utils.parseUnits("51", 6);
  console.log("Purchase threshold: $51");
  console.log("Would trigger auto-purchase:", managerBalance.gte(threshold));
  
  console.log("\n=== Testing Individual Functions ===");
  
  const managerAbi = [
    "function depositRevenue(uint256 amount)",
    "function checkAndPurchaseNFT() returns (bool)"
  ];
  const manager = new ethers.Contract(SLAB_MANAGER, managerAbi, provider);
  
  // Test checkAndPurchaseNFT
  try {
    const result = await manager.callStatic.checkAndPurchaseNFT({
      from: POKEBALL_GAME
    });
    console.log("checkAndPurchaseNFT(): Would SUCCEED, result:", result);
  } catch (e) {
    console.log("checkAndPurchaseNFT(): FAILS -", e.reason || e.message.slice(0, 100));
  }
  
  console.log("\n=== Root Cause Analysis ===");
  console.log("The SlabNFTManager has:", ethers.utils.formatUnits(managerBalance, 6), "USDC");
  console.log("");
  
  if (managerBalance.gte(threshold)) {
    console.log("Since balance >= $51, checkAndPurchaseNFT() will try to buy!");
    console.log("But the Manager has ZERO approval to SlabMachine.");
    console.log("");
    console.log("In _executePurchase(), the code does:");
    console.log("  IERC20(usdcToken).approve(address(slabMachine), pullPrice);");
    console.log("  slabMachine.pull(...);");
    console.log("");
    console.log("The approve should happen first, so the pull should work.");
    console.log("Unless the approve itself is failing somehow...");
    console.log("");
    console.log("OR the error is from the SWAP, not the NFT purchase!");
  } else {
    console.log("Balance < $51, so checkAndPurchaseNFT() should return early.");
    console.log("The error must be coming from somewhere else!");
  }
  
  // Let's check if the error happens in the swap itself
  console.log("\n=== Testing Swap In Isolation ===");
  
  // Try to simulate just the swap part
  const gameAbi = require('./contracts/abi/abi_PokeballGameV6.json');
  const game = new ethers.Contract(POKEBALL_GAME, gameAbi, provider);
  
  // Check game's USDC balance
  const gameUsdc = await usdc.balanceOf(POKEBALL_GAME);
  console.log("PokeballGame USDC balance:", ethers.utils.formatUnits(gameUsdc, 6));
  
  // The swap flow:
  // 1. PokeballGame receives APE
  // 2. PokeballGame wraps to WAPE
  // 3. PokeballGame calls router.exactInputSingle
  // 4. Router calls pool.swap
  // 5. Pool sends USDC to PokeballGame first
  // 6. Pool calls algebraSwapCallback on Router
  // 7. Router's callback does WAPE.transferFrom(payer, pool, amount)
  // 8. payer = PokeballGame (from callback data)
  // 9. This needs PokeballGame -> Router WAPE allowance
  
  const CAMELOT_ROUTER = "0xC69Dc28924930583024E067b2B3d773018F4EB52";
  const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
  const wape = new ethers.Contract(WAPE, erc20Abi, provider);
  
  const wapeAllowance = await wape.allowance(POKEBALL_GAME, CAMELOT_ROUTER);
  console.log("PokeballGame -> Router WAPE allowance:", wapeAllowance.eq(ethers.constants.MaxUint256) ? "MAX" : ethers.utils.formatEther(wapeAllowance));
  
  console.log("\n=== Checking PokeballGame Internal State ===");
  
  // Read game config
  try {
    const router = await game.camelotRouter();
    console.log("Game's camelotRouter:", router);
    
    const wapeAddr = await game.wape();
    console.log("Game's wape:", wapeAddr);
    
    const managerAddr = await game.slabNFTManager();
    console.log("Game's slabNFTManager:", managerAddr);
  } catch (e) {
    console.log("Failed to read game config:", e.message);
  }
  
  // The key question: is the error from swap or from checkAndPurchaseNFT?
  console.log("\n=== DIAGNOSIS ===");
  console.log("Error: 'ERC20: transfer amount exceeds allowance'");
  console.log("");
  console.log("Possible sources:");
  console.log("1. WAPE.transferFrom in swap callback - but allowance is MAX");
  console.log("2. USDC.transferFrom in depositRevenue - but Game->Manager is ~MAX");
  console.log("3. USDC.transferFrom in checkAndPurchaseNFT -> slabMachine.pull");
  console.log("   - Manager->Machine allowance is ZERO");
  console.log("   - BUT the code approves before pulling");
  console.log("");
  console.log("Most likely: #3 - something in _executePurchase is wrong");
  console.log("The approve() call might not be working as expected");
}

main().catch(console.error);
