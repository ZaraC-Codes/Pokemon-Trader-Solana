/**
 * Check exact allowance storage to understand the failure
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const CAMELOT_ROUTER = "0xC69Dc28924930583024E067b2B3d773018F4EB52";
const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
const USDC = "0xF1815bd50389c46847f0Bda824eC8da914045D14";
const SLAB_MANAGER = "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71";

async function main() {
  console.log("=== Checking All Relevant Allowances ===\n");
  
  const erc20Abi = ["function allowance(address,address) view returns (uint256)"];
  const wape = new ethers.Contract(WAPE, erc20Abi, provider);
  const usdc = new ethers.Contract(USDC, erc20Abi, provider);
  
  // The ERC20 error says "transfer amount exceeds allowance"
  // This happens in transferFrom when allowance < amount
  
  // Let's check ALL possible transferFrom paths in the purchase flow:
  
  console.log("=== WAPE Allowances ===");
  // 1. PokeballGame -> Camelot Router (for swap callback)
  const wapeGameToRouter = await wape.allowance(POKEBALL_GAME, CAMELOT_ROUTER);
  console.log("PokeballGame -> Router:", wapeGameToRouter.eq(ethers.constants.MaxUint256) ? "MAX" : ethers.utils.formatEther(wapeGameToRouter));
  
  // 2. Router -> Pool (for swap)
  const wapeRouterToPool = await wape.allowance(CAMELOT_ROUTER, "0xD54DBBBfaADca6A4D985Cd08c27E24C8a06433A0");
  console.log("Router -> Pool:", wapeRouterToPool.eq(ethers.constants.MaxUint256) ? "MAX" : ethers.utils.formatEther(wapeRouterToPool));
  
  console.log("\n=== USDC Allowances ===");
  // 3. PokeballGame -> SlabNFTManager (for depositRevenue)
  const usdcGameToManager = await usdc.allowance(POKEBALL_GAME, SLAB_MANAGER);
  console.log("PokeballGame -> Manager:", usdcGameToManager.gt(0) ? 
    (usdcGameToManager.gt(ethers.utils.parseUnits("1000000000", 6)) ? "~MAX" : ethers.utils.formatUnits(usdcGameToManager, 6)) 
    : "ZERO!");
  
  // 4. SlabNFTManager -> SlabMachine (for NFT purchase)
  const usdcManagerToMachine = await usdc.allowance(SLAB_MANAGER, "0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466");
  console.log("Manager -> SlabMachine:", usdcManagerToMachine.gt(0) ? 
    (usdcManagerToMachine.gt(ethers.utils.parseUnits("1000000000", 6)) ? "~MAX" : ethers.utils.formatUnits(usdcManagerToMachine, 6))
    : "ZERO!");
  
  // Let's trace through the swap callback to see what transferFrom is called
  console.log("\n=== Analyzing Swap Callback Flow ===");
  console.log("In Camelot/Algebra swap:");
  console.log("1. Router calls pool.swap()");
  console.log("2. Pool sends USDC out to recipient");
  console.log("3. Pool calls algebraSwapCallback on msg.sender (Router)");
  console.log("4. Router's callback must pay WAPE to pool");
  console.log("5. Router does: WAPE.transferFrom(payer, pool, amount)");
  console.log("   where payer = address encoded in callback data");
  console.log("");
  
  // Let me check the callback data from a successful tx
  console.log("=== Checking Successful Tx Callback Data ===");
  
  const receipt = await provider.getTransactionReceipt("0x45d844e305471a2f2e7922fc0c00c063baa3f0b0162e6eefd64b19c986ce1247");
  
  // Find the swap callback
  // The callback would be the nested call from pool to router
  const trace = await provider.send("debug_traceTransaction", [
    "0x45d844e305471a2f2e7922fc0c00c063baa3f0b0162e6eefd64b19c986ce1247",
    { tracer: "callTracer" }
  ]);
  
  // Find the algebraSwapCallback call
  function findCallback(call, depth = 0) {
    if (call.input && call.input.startsWith("0x2c8958f6")) { // algebraSwapCallback selector
      console.log("Found algebraSwapCallback at depth", depth);
      console.log("  From:", call.from);
      console.log("  To:", call.to);
      console.log("  Input length:", call.input.length);
      
      // Decode the callback
      // algebraSwapCallback(int256 amount0Delta, int256 amount1Delta, bytes data)
      const dataHex = call.input;
      console.log("  Data (first 200 chars):", dataHex.slice(0, 200));
    }
    if (call.calls) {
      for (const subcall of call.calls) {
        findCallback(subcall, depth + 1);
      }
    }
  }
  
  findCallback(trace);
  
  // The callback data typically contains the payer address
  // Let's decode what the router passes
  console.log("\n=== Decoding Swap Parameters ===");
  
  // From the trace, find the exactInputSingle call
  function findSwapCall(call) {
    if (call.to && call.to.toLowerCase() === CAMELOT_ROUTER.toLowerCase() && 
        call.input && call.input.startsWith("0xbc651188")) { // exactInputSingle
      console.log("Found exactInputSingle call");
      console.log("  Input:", call.input.slice(0, 300) + "...");
      return call;
    }
    if (call.calls) {
      for (const subcall of call.calls) {
        const found = findSwapCall(subcall);
        if (found) return found;
      }
    }
    return null;
  }
  
  const swapCall = findSwapCall(trace);
  if (swapCall) {
    // Decode ExactInputSingleParams
    // struct ExactInputSingleParams {
    //   address tokenIn;
    //   address tokenOut;
    //   address recipient;
    //   uint256 deadline;
    //   uint256 amountIn;
    //   uint256 amountOutMinimum;
    //   uint160 limitSqrtPrice;
    // }
    const data = swapCall.input.slice(10); // Remove selector
    const tokenIn = "0x" + data.slice(24, 64);
    const tokenOut = "0x" + data.slice(88, 128);
    const recipient = "0x" + data.slice(152, 192);
    
    console.log("  tokenIn:", tokenIn);
    console.log("  tokenOut:", tokenOut);
    console.log("  recipient:", recipient);
  }
}

main().catch(console.error);
