/**
 * Debug with Caldera RPC
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const USER = "0x7028bEe2182A4D1E48e317748B51F15CA9814803";
const CAMELOT_ROUTER = "0xC69Dc28924930583024E067b2B3d773018F4EB52";
const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
const USDC = "0xF1815bd50389c46847f0Bda824eC8da914045D14";

async function main() {
  console.log("=== Detailed Debug ===\n");
  
  // First, let's simulate just the swap part
  // The router's exactInputSingle function
  const routerAbi = [
    "function exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) external payable returns (uint256 amountOut)"
  ];
  
  const router = new ethers.Contract(CAMELOT_ROUTER, routerAbi, provider);
  const routerIface = new ethers.utils.Interface(routerAbi);
  
  const swapParams = {
    tokenIn: WAPE,
    tokenOut: USDC,
    recipient: POKEBALL_GAME,
    deadline: Math.floor(Date.now() / 1000) + 600,
    amountIn: ethers.utils.parseEther("5.26"),
    amountOutMinimum: 0,
    limitSqrtPrice: 0
  };
  
  const swapData = routerIface.encodeFunctionData("exactInputSingle", [swapParams]);
  
  console.log("=== Test 1: Router swap as USER (should fail - no WAPE) ===");
  try {
    await provider.call({
      from: USER,
      to: CAMELOT_ROUTER,
      data: swapData
    });
    console.log("SUCCEEDED (unexpected!)");
  } catch (e) {
    console.log("Failed:", e.reason || e.message.slice(0, 100));
  }
  
  console.log("\n=== Test 2: Router swap as PokeballGame (should fail - no WAPE balance) ===");
  try {
    await provider.call({
      from: POKEBALL_GAME,
      to: CAMELOT_ROUTER,
      data: swapData
    });
    console.log("SUCCEEDED (unexpected!)");
  } catch (e) {
    console.log("Failed:", e.reason || e.message.slice(0, 100));
  }
  
  // Now let's check what happens if PokeballGame HAS WAPE
  // We can't mint WAPE in simulation, but we can check the flow
  
  console.log("\n=== Test 3: Check if WAPE.deposit works ===");
  const wapeAbi = ["function deposit() payable"];
  const wapeIface = new ethers.utils.Interface(wapeAbi);
  const depositData = wapeIface.encodeFunctionData("deposit", []);
  
  try {
    await provider.call({
      from: POKEBALL_GAME,
      to: WAPE,
      value: ethers.utils.parseEther("1"),
      data: depositData
    });
    console.log("WAPE.deposit from PokeballGame: WORKS");
  } catch (e) {
    console.log("WAPE.deposit from PokeballGame: FAILS -", e.reason || e.message.slice(0, 100));
  }
  
  // The key insight: In simulation, we can't chain calls
  // The contract deposits WAPE, then immediately calls the router
  // Let's trace the full purchase call step by step
  
  console.log("\n=== Test 4: Full purchaseBallsWithAPE simulation ===");
  const gameAbi = require('./contracts/abi/abi_PokeballGameV6.json');
  const game = new ethers.Contract(POKEBALL_GAME, gameAbi, provider);
  
  const apeCost = ethers.utils.parseEther("5.26");
  
  try {
    const result = await game.callStatic.purchaseBallsWithAPE(0, 1, {
      from: USER,
      value: apeCost
    });
    console.log("purchaseBallsWithAPE SUCCEEDED!");
    console.log("Result:", result);
  } catch (e) {
    console.log("purchaseBallsWithAPE FAILED");
    console.log("Reason:", e.reason);
    console.log("Error code:", e.code);
    
    // The error is "ERC20: transfer amount exceeds allowance"
    // This means a transferFrom is failing
    // Let's identify which one
    
    console.log("\n=== Analyzing the error ===");
    console.log("The error 'ERC20: transfer amount exceeds allowance' can occur in:");
    console.log("1. WAPE.transferFrom in router callback - needs Game->Router approval");
    console.log("2. USDC.transferFrom in _processUnifiedPayment - needs Game->Manager approval");
    console.log("");
    
    // Check both allowances
    const erc20Abi = ["function allowance(address,address) view returns (uint256)"];
    const wape = new ethers.Contract(WAPE, erc20Abi, provider);
    const usdc = new ethers.Contract(USDC, erc20Abi, provider);
    
    const wapeAllowance = await wape.allowance(POKEBALL_GAME, CAMELOT_ROUTER);
    const usdcAllowance = await usdc.allowance(POKEBALL_GAME, "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71");
    
    console.log("WAPE allowance (Game->Router):", wapeAllowance.eq(ethers.constants.MaxUint256) ? "MAX" : wapeAllowance.toString());
    console.log("USDC allowance (Game->Manager):", usdcAllowance.gt(0) ? "Has allowance" : "ZERO");
    
    // Both should be fine... but let me check one more thing
    // Maybe the approval in _swapAPEtoUSDC is overwriting the existing approval?
    console.log("\n=== Checking contract's approve logic ===");
    console.log("In _swapAPEtoUSDC, the contract does:");
    console.log("  IERC20(wape).approve(camelotRouter, apeAmount);");
    console.log("");
    console.log("If there's already a MAX approval, and we try to set a smaller one,");
    console.log("some tokens REQUIRE setting to 0 first (USDT-style).");
    console.log("But WAPE is standard ERC20, so this shouldn't matter...");
    
    // Let's check WAPE's approve behavior
    console.log("\n=== Checking WAPE contract ===");
    const wapeCode = await provider.getCode(WAPE);
    console.log("WAPE code size:", wapeCode.length / 2, "bytes");
    
    // Check if WAPE is a proxy
    const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const implSlot = await provider.getStorageAt(WAPE, IMPLEMENTATION_SLOT);
    console.log("WAPE implementation slot:", implSlot);
    if (implSlot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      const implAddress = "0x" + implSlot.slice(26);
      console.log("WAPE IS A PROXY! Implementation:", implAddress);
    } else {
      console.log("WAPE is not a proxy (or uses different slot)");
    }
  }
}

main().catch(console.error);
