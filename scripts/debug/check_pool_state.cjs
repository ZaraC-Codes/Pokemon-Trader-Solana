/**
 * Check if pool state changed in a way that breaks swaps
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const ALGEBRA_POOL = "0xD54DBBBfaADca6A4D985Cd08c27E24C8a06433A0";
const CAMELOT_ROUTER = "0xC69Dc28924930583024E067b2B3d773018F4EB52";
const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
const USDC = "0xF1815bd50389c46847f0Bda824eC8da914045D14";

// Algebra Pool ABI (partial)
const POOL_ABI = [
  "function globalState() view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

// ERC20
const ERC20_ABI = [
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)"
];

async function main() {
  const pool = new ethers.Contract(ALGEBRA_POOL, POOL_ABI, provider);
  const wape = new ethers.Contract(WAPE, ERC20_ABI, provider);
  
  console.log("=== Pool Configuration ===");
  const token0 = await pool.token0();
  const token1 = await pool.token1();
  console.log("Token0:", token0);
  console.log("Token1:", token1);
  
  // Check pool state at different blocks
  const blocks = [32719352, 32719353, 32719354, await provider.getBlockNumber()];
  
  for (const blockNum of blocks) {
    console.log(`\n=== Block ${blockNum} ===`);
    
    const state = await pool.globalState({ blockTag: blockNum });
    console.log("Pool unlocked:", state.unlocked);
    console.log("Current tick:", state.tick);
    
    const liq = await pool.liquidity({ blockTag: blockNum });
    console.log("Liquidity:", liq.toString());
    
    // Check WAPE balance in pool
    const poolWape = await wape.balanceOf(ALGEBRA_POOL, { blockTag: blockNum });
    console.log("Pool WAPE:", ethers.utils.formatEther(poolWape));
    
    // Check WAPE allowance: PokeballGame -> Router
    const gameToRouter = await wape.allowance(POKEBALL_GAME, CAMELOT_ROUTER, { blockTag: blockNum });
    console.log("Game->Router WAPE allowance:", gameToRouter.eq(ethers.constants.MaxUint256) ? "MAX" : ethers.utils.formatEther(gameToRouter));
    
    // KEY CHECK: PokeballGame WAPE balance 
    // If the contract holds WAPE but approval was somehow invalidated...
    const gameWape = await wape.balanceOf(POKEBALL_GAME, { blockTag: blockNum });
    console.log("Game WAPE balance:", ethers.utils.formatEther(gameWape));
    
    // Also check native APE in contract
    const gameApe = await provider.getBalance(POKEBALL_GAME, blockNum);
    console.log("Game APE balance:", ethers.utils.formatEther(gameApe));
  }
  
  // Now let's trace what SHOULD happen in the swap
  console.log("\n\n=== Tracing Expected Swap Flow ===");
  console.log("1. purchaseBallsWithAPE receives ~5.26 APE");
  console.log("2. _swapAPEtoUSDC is called");
  console.log("3. IWAPE(wape).deposit{value: apeAmount}() wraps APE -> WAPE");
  console.log("4. IERC20(wape).approve(camelotRouter, apeAmount) - but already MAX approved");
  console.log("5. router.exactInputSingle called:");
  console.log("   - tokenIn: WAPE");
  console.log("   - tokenOut: USDC"); 
  console.log("   - recipient: address(this) [PokeballGame]");
  console.log("   - deadline: block.timestamp");
  console.log("   - amountIn: apeAmount");
  console.log("   - amountOutMinimum: 0");
  console.log("   - limitSqrtPrice: 0");
  console.log("");
  console.log("Router internally calls pool.swap()");
  console.log("Pool sends USDC out first");
  console.log("Pool calls algebraSwapCallback(amount0Delta, amount1Delta, data)");
  console.log("Router's callback should pull WAPE from...");
  console.log("");
  
  // Let's look at the router's swap function to understand where tokens come from
  console.log("=== KEY INSIGHT ===");
  console.log("In Algebra/Camelot routers, the callback receives 'data' parameter");
  console.log("This data encodes the PATH and the PAYER");
  console.log("The callback does: pay(token, payer, recipient, amount)");
  console.log("If payer == address(this), it uses transfer");
  console.log("If payer != address(this), it uses transferFrom");
  console.log("");
  console.log("In SwapRouter.exactInputSingle, the payer is msg.sender (PokeballGame)");
  console.log("So callback should do: WAPE.transferFrom(PokeballGame, pool, amount)");
  console.log("This requires PokeballGame to have approved the ROUTER, not the pool");
  console.log("");
  
  // Verify allowance is correct
  const currentAllowance = await wape.allowance(POKEBALL_GAME, CAMELOT_ROUTER);
  console.log("Current PokeballGame->Router WAPE allowance:", 
    currentAllowance.eq(ethers.constants.MaxUint256) ? "MAX (CORRECT)" : "NOT MAX - PROBLEM!");
  
  // Maybe the router or pool changed?
  console.log("\n=== Checking Contract Code Hashes ===");
  const routerCode = await provider.getCode(CAMELOT_ROUTER);
  const poolCode = await provider.getCode(ALGEBRA_POOL);
  
  const routerCodeBefore = await provider.getCode(CAMELOT_ROUTER, 32719352);
  const poolCodeBefore = await provider.getCode(ALGEBRA_POOL, 32719352);
  
  console.log("Router code changed:", routerCode !== routerCodeBefore);
  console.log("Pool code changed:", poolCode !== poolCodeBefore);
}

main().catch(console.error);
