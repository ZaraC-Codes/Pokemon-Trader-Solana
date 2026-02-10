/**
 * Deep trace - use eth_call with trace to find failing transfer
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

// Use archive node for tracing
const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const USER = "0x7028bEe2182A4D1E48e317748B51F15CA9814803";

async function main() {
  console.log("=== Deep Trace of APE Purchase Failure ===\n");
  
  const gameAbi = require('./contracts/abi/abi_PokeballGameV6.json');
  const game = new ethers.Contract(POKEBALL_GAME, gameAbi, provider);
  
  const apePrice = await game.apePriceUSD();
  const apeCost = ethers.utils.parseEther("1").mul(ethers.BigNumber.from(10).pow(8)).div(apePrice);
  
  // Encode the call
  const callData = game.interface.encodeFunctionData("purchaseBallsWithAPE", [0, 1]);
  
  console.log("Call parameters:");
  console.log("  To:", POKEBALL_GAME);
  console.log("  From:", USER);
  console.log("  Value:", ethers.utils.formatEther(apeCost), "APE");
  console.log("  Data:", callData);
  
  // Let's trace through the swap path manually
  console.log("\n=== Manual Trace Through Swap ===");
  
  // The swap happens like this:
  // 1. WAPE.deposit() - wraps APE
  // 2. WAPE.approve(router, amount) - should already be MAX
  // 3. router.exactInputSingle() - calls pool
  // 4. pool.swap() - does the swap
  // 5. pool calls callback to pull tokens
  
  // Let's check the pool's swap callback mechanism
  const ALGEBRA_POOL = "0xD54DBBBfaADca6A4D985Cd08c27E24C8a06433A0";
  const CAMELOT_ROUTER = "0xC69Dc28924930583024E067b2B3d773018F4EB52";
  const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
  
  // Check if router has any special state
  const wapeContract = new ethers.Contract(WAPE, [
    "function allowance(address,address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)"
  ], provider);
  
  // The issue might be in the callback - router calls algebraSwapCallback
  // Let's see what the router looks like
  
  // Check router's code to understand the swap mechanism
  const routerCode = await provider.getCode(CAMELOT_ROUTER);
  console.log("Router code length:", routerCode.length);
  
  // Let's trace a successful tx to compare
  console.log("\n=== Comparing Successful vs Current ===");
  
  // Get events from successful tx
  const successReceipt = await provider.getTransactionReceipt(
    "0x45d844e305471a2f2e7922fc0c00c063baa3f0b0162e6eefd64b19c986ce1247"
  );
  
  console.log("Successful tx logs:");
  const transferSig = ethers.utils.id("Transfer(address,address,uint256)");
  
  for (const log of successReceipt.logs) {
    if (log.topics[0] === transferSig) {
      const from = "0x" + log.topics[1].slice(26);
      const to = "0x" + log.topics[2].slice(26);
      const amount = ethers.BigNumber.from(log.data);
      
      // Identify the token
      let symbol = "???";
      let decimals = 18;
      if (log.address.toLowerCase() === "0x48b62137edfa95a428d35c09e44256a739f6b557") {
        symbol = "WAPE";
      } else if (log.address.toLowerCase() === "0xf1815bd50389c46847f0bda824ec8da914045d14") {
        symbol = "USDC";
        decimals = 6;
      }
      
      console.log("  ", symbol, "transfer:");
      console.log("    From:", from);
      console.log("    To:", to);
      console.log("    Amount:", decimals === 6 ? ethers.utils.formatUnits(amount, 6) : ethers.utils.formatEther(amount));
    }
  }
  
  // Now let's check if there's something weird with how Camelot callback works
  console.log("\n=== Checking Camelot Swap Mechanism ===");
  
  // The Camelot/Algebra router uses a callback pattern:
  // 1. router.exactInputSingle() 
  // 2. router calls pool.swap()
  // 3. pool.swap() FIRST transfers output tokens to recipient
  // 4. THEN pool calls algebraSwapCallback on the router
  // 5. router's callback uses transferFrom to pull input tokens from... where?
  
  // KEY INSIGHT: The router needs to pull WAPE from somewhere
  // In the callback, who is msg.sender? It's the POOL
  // The router's callback typically does: tokenIn.transferFrom(msg.sender, pool, amountIn)
  // But wait - that would need the POOL to have approved the router!
  
  // Let's check pool's allowance to router for WAPE
  const poolWapeAllowance = await wapeContract.allowance(ALGEBRA_POOL, CAMELOT_ROUTER);
  console.log("Pool -> Router WAPE allowance:", ethers.utils.formatEther(poolWapeAllowance));
  
  // Actually, most routers do a callback that pulls from the CALLER (PokeballGame)
  // using msg.sender stored before the swap
  
  // Let me check the SwapRouter implementation pattern
  // Typically it stores data in transient storage or callback data
  
  console.log("\n=== Alternative Theory ===");
  console.log("The router's algebraSwapCallback receives:");
  console.log("- amount0Delta, amount1Delta (how much to pay)");
  console.log("- data (contains payer address encoded)");
  console.log("");
  console.log("If the callback tries to pull tokens from the wrong address...");
  console.log("Or if there's a reentrancy guard state issue...");
  
  // Let's look at what data was passed in successful tx
  const successTx = await provider.getTransaction(
    "0x45d844e305471a2f2e7922fc0c00c063baa3f0b0162e6eefd64b19c986ce1247"
  );
  console.log("\nSuccessful tx input data length:", successTx.data.length);
  
  // Try calling at historical block vs now
  console.log("\n=== Block Comparison Test ===");
  
  // Try at block right before the issue
  try {
    await game.callStatic.purchaseBallsWithAPE(0, 1, { 
      value: apeCost,
      from: USER,
      blockTag: 32719352  // Right before last successful
    });
    console.log("Block 32719352: WOULD SUCCEED");
  } catch (e) {
    console.log("Block 32719352: WOULD FAIL -", e.reason || e.message);
  }
  
  // The successful block itself
  try {
    await game.callStatic.purchaseBallsWithAPE(0, 1, { 
      value: apeCost,
      from: USER,
      blockTag: 32719353
    });
    console.log("Block 32719353: WOULD SUCCEED");
  } catch (e) {
    console.log("Block 32719353: WOULD FAIL -", e.reason || e.message);
  }
  
  // Right after
  try {
    await game.callStatic.purchaseBallsWithAPE(0, 1, { 
      value: apeCost,
      from: USER,
      blockTag: 32719354
    });
    console.log("Block 32719354: WOULD SUCCEED");
  } catch (e) {
    console.log("Block 32719354: WOULD FAIL -", e.reason || e.message);
  }
  
  // Current
  try {
    await game.callStatic.purchaseBallsWithAPE(0, 1, { 
      value: apeCost,
      from: USER
    });
    console.log("Current: WOULD SUCCEED");
  } catch (e) {
    console.log("Current: WOULD FAIL -", e.reason || e.message);
  }
}

main().catch(console.error);
