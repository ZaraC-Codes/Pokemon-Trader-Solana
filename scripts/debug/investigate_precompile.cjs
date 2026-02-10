/**
 * Investigate ApeChain precompile 0x6b
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

async function main() {
  console.log("=== Investigating ApeChain Precompile 0x6b ===\n");
  
  // The precompile at 0x6b is called with selector 0x5b1dac60
  // This is likely related to ApeChain's native token handling
  
  // Let's try calling it directly to see what it returns
  const precompileAddress = "0x000000000000000000000000000000000000006b";
  
  // Try calling with the selector
  try {
    const result = await provider.call({
      to: precompileAddress,
      data: "0x5b1dac60"
    });
    console.log("Precompile 0x6b result for 0x5b1dac60:", result);
    console.log("As number:", ethers.BigNumber.from(result).toString());
  } catch (e) {
    console.log("Precompile call failed:", e.message);
  }
  
  // The output from trace was: 0x00000000000000000000000000000000000000000000000000000000424e2826
  // 0x424e2826 = 1112729638 in decimal
  console.log("\nTrace showed precompile output: 0x424e2826");
  console.log("As decimal:", parseInt("0x424e2826", 16));
  
  // This could be:
  // 1. Block number (but seems too low for recent blocks)
  // 2. A config value
  // 3. An authorization check result
  
  // Let me check what ApeChain uses this for
  // ApeChain is an Arbitrum Orbit chain, let's check Orbit precompiles
  
  // Arbitrum precompiles typically:
  // 0x64 (100) = ArbSys
  // 0x65 (101) = ArbInfo
  // etc.
  
  // 0x6b (107) might be ApeChain-specific for native token wrapping
  
  // Let's see if the precompile output changes based on context
  console.log("\n=== Testing precompile from different callers ===");
  
  const testAddresses = [
    { name: "User", addr: "0x7028bEe2182A4D1E48e317748B51F15CA9814803" },
    { name: "PokeballGame", addr: "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f" },
    { name: "WAPE", addr: "0x48b62137EdfA95a428D35C09E44256a739F6B557" },
    { name: "Random", addr: "0x1234567890123456789012345678901234567890" },
  ];
  
  for (const test of testAddresses) {
    try {
      const result = await provider.call({
        from: test.addr,
        to: precompileAddress,
        data: "0x5b1dac60"
      });
      console.log(test.name + ":", result);
    } catch (e) {
      console.log(test.name + ": FAILED -", e.message.slice(0, 50));
    }
  }
  
  // Check if there are other selectors
  console.log("\n=== Trying other selectors on precompile ===");
  
  const selectors = [
    { name: "decimals()", sel: "0x313ce567" },
    { name: "symbol()", sel: "0x95d89b41" },
    { name: "name()", sel: "0x06fdde03" },
    { name: "totalSupply()", sel: "0x18160ddd" },
    { name: "isAllowed(address)", sel: "0x59cca195" },
  ];
  
  for (const s of selectors) {
    try {
      const result = await provider.call({
        to: precompileAddress,
        data: s.sel + "000000000000000000000000b6e86af8a85555c6ac2d812c8b8be8a60c1c432f"
      });
      console.log(s.name + ":", result);
    } catch (e) {
      console.log(s.name + ": no response");
    }
  }
  
  // The key question: Is the precompile blocking certain callers?
  // Let's trace what happens when eth_call simulates deposit
  
  console.log("\n=== Simulating WAPE.deposit() as PokeballGame ===");
  
  const wapeAbi = ["function deposit() payable"];
  const wapeIface = new ethers.utils.Interface(wapeAbi);
  const depositData = wapeIface.encodeFunctionData("deposit", []);
  
  // Try with debug_traceCall if available
  try {
    const trace = await provider.send("debug_traceCall", [
      {
        from: "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f",  // PokeballGame
        to: "0x48b62137EdfA95a428D35C09E44256a739F6B557",   // WAPE
        value: ethers.utils.hexValue(ethers.utils.parseEther("1")),
        data: depositData
      },
      "latest",
      { tracer: "callTracer" }
    ]);
    
    console.log("Trace result:");
    console.log(JSON.stringify(trace, (key, value) => {
      if (typeof value === 'string' && value.length > 100) {
        return value.slice(0, 50) + '...';
      }
      return value;
    }, 2));
  } catch (e) {
    console.log("Trace failed:", e.message.slice(0, 100));
  }
  
  // Let me check the WAPE implementation code for the precompile call
  console.log("\n=== Checking WAPE Implementation for Precompile Logic ===");
  
  const implCode = await provider.getCode("0xd22ba2ff50d5c086d4bc34e9612b92fcbf8c1152");
  
  // Look for 0x6b (107 decimal) in the code
  // In bytecode, PUSH1 0x6b would be 606b
  const has606b = implCode.includes("606b");
  console.log("Has PUSH1 0x6b:", has606b);
  
  // The precompile might be checking something about the transaction origin
  // If it returns 0 or reverts when called from a contract, that would explain the issue
  
  console.log("\n=== HYPOTHESIS ===");
  console.log("The precompile 0x6b likely checks tx.origin or provides some");
  console.log("authorization data that WAPE uses to allow/deny deposits.");
  console.log("");
  console.log("In eth_call simulation, the precompile might return different");
  console.log("results than in actual execution, causing the deposit to fail.");
  console.log("");
  console.log("This would explain why:");
  console.log("- Actual txs succeed (precompile returns valid auth)");  
  console.log("- eth_call simulations fail (precompile returns invalid/0)");
  console.log("- Even historical block simulations fail (precompile state)");
}

main().catch(console.error);
