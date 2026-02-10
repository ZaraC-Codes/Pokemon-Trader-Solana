/**
 * Use debug_traceCall to see exactly where it fails
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

// Try Alchemy for debug_traceCall
const ALCHEMY_URL = process.env.APECHAIN_RPC_URL || "https://apechain-mainnet.g.alchemy.com/v2/ZFj2WjRw4QO_f-y1JKTkqgdUOkjopaTw";
const provider = new ethers.providers.JsonRpcProvider(ALCHEMY_URL);

const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const USER = "0x7028bEe2182A4D1E48e317748B51F15CA9814803";

async function main() {
  const gameAbi = require('./contracts/abi/abi_PokeballGameV6.json');
  const iface = new ethers.utils.Interface(gameAbi);
  
  const apePrice = ethers.BigNumber.from("19012300");  // 0.190123 in 8 decimals
  const apeCost = ethers.utils.parseEther("1").mul(ethers.BigNumber.from(10).pow(8)).div(apePrice);
  
  const callData = iface.encodeFunctionData("purchaseBallsWithAPE", [0, 1]);
  
  console.log("Attempting debug_traceCall...");
  
  try {
    // Try debug_traceCall 
    const result = await provider.send("debug_traceCall", [
      {
        from: USER,
        to: POKEBALL_GAME,
        value: ethers.utils.hexValue(apeCost),
        data: callData
      },
      "latest",
      { tracer: "callTracer" }
    ]);
    
    console.log("Trace result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log("debug_traceCall not supported or failed:", e.message);
    
    // Try eth_call with more details
    console.log("\nTrying regular eth_call with error decoding...");
    
    try {
      await provider.call({
        from: USER,
        to: POKEBALL_GAME,
        value: apeCost,
        data: callData
      });
    } catch (callError) {
      console.log("Call reverted.");
      console.log("Error code:", callError.code);
      console.log("Error reason:", callError.reason);
      
      if (callError.data) {
        console.log("Error data:", callError.data);
        // Try to decode
        try {
          const decoded = ethers.utils.toUtf8String("0x" + callError.data.slice(138));
          console.log("Decoded message:", decoded);
        } catch {}
      }
    }
  }
  
  // Let's also check if maybe there's something wrong with how we call the function
  console.log("\n=== Checking Contract State ===");
  const game = new ethers.Contract(POKEBALL_GAME, gameAbi, provider);
  
  // Check if contract is paused or has any blockers
  try {
    const owner = await game.owner();
    console.log("Contract owner:", owner);
  } catch (e) {
    console.log("Can't read owner:", e.message);
  }
  
  // Check the exact function parameters
  console.log("\n=== Function Details ===");
  const funcFragment = iface.getFunction("purchaseBallsWithAPE");
  console.log("Function:", funcFragment.format());
  console.log("Selector:", iface.getSighash(funcFragment));
  
  // Also check the other purchase function
  const funcFragment2 = iface.getFunction("purchaseBalls");
  console.log("\nFunction:", funcFragment2.format());
  console.log("Selector:", iface.getSighash(funcFragment2));
  
  // Let's try calling purchaseBalls with useAPE=true (the old way that worked)
  console.log("\n=== Testing purchaseBalls(0, 1, true) ===");
  const callData2 = iface.encodeFunctionData("purchaseBalls", [0, 1, true]);
  console.log("Encoded data:", callData2);
  
  try {
    await provider.call({
      from: USER,
      to: POKEBALL_GAME,
      value: apeCost,
      data: callData2
    });
    console.log("purchaseBalls(0, 1, true) would SUCCEED!");
  } catch (e) {
    console.log("purchaseBalls(0, 1, true) FAILS:", e.reason || e.message);
  }
  
  // Try with much more APE (in case it's a price calculation issue)
  console.log("\n=== Testing with 10x APE ===");
  try {
    await provider.call({
      from: USER,
      to: POKEBALL_GAME,
      value: apeCost.mul(10),
      data: callData
    });
    console.log("With 10x APE would SUCCEED!");
  } catch (e) {
    console.log("With 10x APE FAILS:", e.reason || e.message);
  }
  
  // Let's verify the swap function works in isolation
  console.log("\n=== Testing WAPE deposit directly ===");
  const wapeAbi = ["function deposit() payable", "function balanceOf(address) view returns (uint256)"];
  const wape = new ethers.Contract("0x48b62137EdfA95a428D35C09E44256a739F6B557", wapeAbi, provider);
  
  // Check if WAPE deposit works
  const wapeIface = new ethers.utils.Interface(wapeAbi);
  const depositData = wapeIface.encodeFunctionData("deposit", []);
  
  try {
    await provider.call({
      from: USER,
      to: "0x48b62137EdfA95a428D35C09E44256a739F6B557",
      value: ethers.utils.parseEther("1"),
      data: depositData
    });
    console.log("WAPE.deposit() works for user");
  } catch (e) {
    console.log("WAPE.deposit() fails:", e.reason || e.message);
  }
}

main().catch(console.error);
