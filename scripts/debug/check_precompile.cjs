/**
 * Check what precompile WAPE calls
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

async function main() {
  console.log("=== Analyzing WAPE's Precompile Call ===\n");
  
  // The trace shows WAPE calls STATICCALL to 0x00000000... with input 0x5b1dac60...
  // This is ApeChain-specific
  
  // 0x5b1dac60 is likely a function selector
  console.log("Function selector from trace: 0x5b1dac60");
  
  // Let's decode what this might be
  // Common precompile functions on ApeChain/Arbitrum Orbit chains
  
  // On ApeChain, there might be a precompile for checking msg.sender authorization
  // Or for L1 → L2 aliasing
  
  // Let's trace the last successful APE tx more carefully
  const txHash = "0x45d844e305471a2f2e7922fc0c00c063baa3f0b0162e6eefd64b19c986ce1247"; // Last successful
  
  console.log("Tracing last successful APE tx:", txHash);
  
  const trace = await provider.send("debug_traceTransaction", [
    txHash,
    { tracer: "callTracer" }
  ]);
  
  // Find all precompile calls
  function findPrecompileCalls(call, results = []) {
    if (call.to && call.to.startsWith("0x000000000000000000000000000000000000")) {
      results.push({
        to: call.to,
        input: call.input,
        type: call.type
      });
    }
    if (call.calls) {
      for (const subcall of call.calls) {
        findPrecompileCalls(subcall, results);
      }
    }
    return results;
  }
  
  const precompileCalls = findPrecompileCalls(trace);
  console.log("\nPrecompile calls found:", precompileCalls.length);
  for (const pc of precompileCalls) {
    console.log("  To:", pc.to);
    console.log("  Input:", pc.input);
    console.log("");
  }
  
  // The precompile at low addresses are usually:
  // 0x01 - ecrecover
  // 0x02 - sha256
  // 0x03 - ripemd160
  // 0x04 - identity
  // ...
  // ApeChain (Arbitrum Orbit) might have custom precompiles
  
  // Let's check what address the trace actually shows
  console.log("=== Full trace structure ===");
  console.log(JSON.stringify(trace, (key, value) => {
    if (typeof value === 'string' && value.length > 100) {
      return value.slice(0, 50) + '...';
    }
    return value;
  }, 2));
}

main().catch(console.error);
