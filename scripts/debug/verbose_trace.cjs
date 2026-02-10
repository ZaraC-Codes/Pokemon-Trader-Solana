/**
 * Get verbose trace of the failed call
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const USER = "0x7028bEe2182A4D1E48e317748B51F15CA9814803";

async function main() {
  console.log("=== Verbose Trace of Failed Call ===\n");
  
  const gameAbi = require('./contracts/abi/abi_PokeballGameV6.json');
  const game = new ethers.Contract(POKEBALL_GAME, gameAbi, provider);
  
  const apePrice = await game.apePriceUSD();
  const apeCost = ethers.utils.parseEther("1").mul(ethers.BigNumber.from(10).pow(8)).div(apePrice);
  
  const callData = game.interface.encodeFunctionData("purchaseBallsWithAPE", [0, 1]);
  
  console.log("Attempting debug_traceCall...");
  
  try {
    const trace = await provider.send("debug_traceCall", [
      {
        from: USER,
        to: POKEBALL_GAME,
        value: ethers.utils.hexValue(apeCost),
        data: callData
      },
      "latest",
      { tracer: "callTracer" }
    ]);
    
    // Print the trace focusing on calls
    function printTrace(call, depth = 0) {
      const indent = "  ".repeat(depth);
      const to = call.to || "CREATE";
      const type = call.type || "CALL";
      
      // Get function selector
      const selector = call.input ? call.input.slice(0, 10) : "";
      
      let funcName = selector;
      // Common selectors
      const selectors = {
        "0xd0e30db0": "deposit()",
        "0x23b872dd": "transferFrom()",
        "0xa9059cbb": "transfer()",
        "0xdd62ed3e": "allowance()",
        "0x70a08231": "balanceOf()",
        "0x095ea7b3": "approve()",
        "0xbc651188": "exactInputSingle()",
        "0x128acb08": "swap()",
        "0x2c8958f6": "algebraSwapCallback()",
        "0xbc1ca3e9": "depositRevenue()",
        "0xd82872fe": "checkAndPurchaseNFT()",
        "0x94ea04d1": "purchaseBalls()",
        "0xe97cb6fd": "purchaseBallsWithAPE()",
      };
      funcName = selectors[selector] || selector;
      
      console.log(indent + type + " " + to.slice(0, 12) + "... " + funcName);
      
      if (call.error) {
        console.log(indent + "  *** ERROR: " + call.error + " ***");
      }
      
      if (call.output && call.output !== "0x") {
        // Show failed return
        if (call.output.length > 130 && call.output.startsWith("0x08c379a0")) {
          // Error string
          try {
            const reason = ethers.utils.toUtf8String("0x" + call.output.slice(138));
            console.log(indent + "  REVERT: " + reason);
          } catch {}
        }
      }
      
      if (call.calls) {
        for (const subcall of call.calls) {
          printTrace(subcall, depth + 1);
        }
      }
    }
    
    printTrace(trace);
    
    // Now print full JSON for detailed analysis
    console.log("\n\n=== Full Trace JSON ===");
    console.log(JSON.stringify(trace, (key, value) => {
      if (typeof value === 'string' && value.length > 200) {
        return value.slice(0, 100) + "..." + value.slice(-20);
      }
      return value;
    }, 2));
    
  } catch (e) {
    console.log("debug_traceCall failed:", e.message);
    
    // Fall back to just checking the error
    console.log("\n=== Trying Regular Call ===");
    
    try {
      await provider.call({
        from: USER,
        to: POKEBALL_GAME,
        value: apeCost,
        data: callData
      });
    } catch (callError) {
      console.log("Call failed with:", callError.reason || callError.message);
      
      // Try to get the revert reason from data
      if (callError.data) {
        console.log("Error data:", callError.data);
      }
      
      // The error says "ERC20: transfer amount exceeds allowance"
      // This is from OpenZeppelin's ERC20._spendAllowance function
      // Which is called by transferFrom
      
      console.log("\n=== Analyzing Error Source ===");
      console.log("'ERC20: transfer amount exceeds allowance' comes from transferFrom()");
      console.log("");
      console.log("In the purchase flow, transferFrom is called:");
      console.log("1. In swap callback: WAPE.transferFrom(PokeballGame, Pool, amount)");
      console.log("2. In depositRevenue: USDC.transferFrom(PokeballGame, Manager, amount)");
      console.log("");
      console.log("Since WAPE allowance is MAX and USDC allowance is ~MAX,");
      console.log("the issue must be somewhere else...");
    }
  }
}

main().catch(console.error);
