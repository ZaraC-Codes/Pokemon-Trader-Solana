/**
 * Test if a REAL APE purchase would work (dry run with estimateGas)
 * 
 * The key insight is that eth_call might be failing for simulation reasons,
 * but the actual transaction might succeed.
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const USER = "0x7028bEe2182A4D1E48e317748B51F15CA9814803";

async function main() {
  console.log("=== Testing Real Transaction Potential ===\n");
  
  const gameAbi = require('./contracts/abi/abi_PokeballGameV6.json');
  const game = new ethers.Contract(POKEBALL_GAME, gameAbi, provider);
  
  // Get APE price
  const apePrice = await game.apePriceUSD();
  console.log("APE Price:", Number(apePrice) / 1e8, "USD");
  
  // Calculate cost for 1 PokeBall
  const apeCost = ethers.utils.parseEther("1").mul(ethers.BigNumber.from(10).pow(8)).div(apePrice);
  console.log("APE needed for 1 PokeBall:", ethers.utils.formatEther(apeCost), "APE");
  
  // Try eth_call (expected to fail based on previous tests)
  console.log("\n=== eth_call Test ===");
  try {
    await game.callStatic.purchaseBallsWithAPE(0, 1, {
      from: USER,
      value: apeCost
    });
    console.log("eth_call: SUCCEEDED");
  } catch (e) {
    console.log("eth_call: FAILED -", e.reason);
  }
  
  // Try estimateGas (this is closer to actual execution)
  console.log("\n=== estimateGas Test ===");
  try {
    const gasEstimate = await game.estimateGas.purchaseBallsWithAPE(0, 1, {
      from: USER,
      value: apeCost
    });
    console.log("estimateGas: SUCCEEDED -", gasEstimate.toString(), "gas");
    console.log("\n*** This suggests the actual transaction WOULD work! ***");
  } catch (e) {
    console.log("estimateGas: FAILED -", e.reason || e.message.slice(0, 100));
  }
  
  // Also test the old purchaseBalls function
  console.log("\n=== Testing purchaseBalls(0, 1, true) ===");
  try {
    const gasEstimate = await game.estimateGas.purchaseBalls(0, 1, true, {
      from: USER,
      value: apeCost
    });
    console.log("estimateGas: SUCCEEDED -", gasEstimate.toString(), "gas");
  } catch (e) {
    console.log("estimateGas: FAILED -", e.reason || e.message.slice(0, 100));
  }
  
  // Let's check user's balance
  console.log("\n=== User Balance Check ===");
  const userBalance = await provider.getBalance(USER);
  console.log("User APE balance:", ethers.utils.formatEther(userBalance), "APE");
  console.log("Required for tx:", ethers.utils.formatEther(apeCost), "APE + gas");
  console.log("Has enough:", userBalance.gt(apeCost));
  
  // Let's check if there's something specific about how wagmi/viem does the call
  console.log("\n=== Direct RPC eth_estimateGas ===");
  const callData = game.interface.encodeFunctionData("purchaseBallsWithAPE", [0, 1]);
  
  try {
    const result = await provider.send("eth_estimateGas", [{
      from: USER,
      to: POKEBALL_GAME,
      value: ethers.utils.hexValue(apeCost),
      data: callData
    }]);
    console.log("eth_estimateGas: SUCCEEDED -", parseInt(result, 16), "gas");
  } catch (e) {
    console.log("eth_estimateGas: FAILED");
    if (e.error && e.error.message) {
      console.log("  Error:", e.error.message);
    } else {
      console.log("  Error:", e.message.slice(0, 200));
    }
  }
  
  // Check if eth_call returns different from estimateGas
  console.log("\n=== Direct RPC eth_call ===");
  try {
    const result = await provider.send("eth_call", [{
      from: USER,
      to: POKEBALL_GAME,
      value: ethers.utils.hexValue(apeCost),
      data: callData
    }, "latest"]);
    console.log("eth_call: SUCCEEDED");
    console.log("  Result:", result);
  } catch (e) {
    console.log("eth_call: FAILED");
    if (e.error && e.error.message) {
      console.log("  Error:", e.error.message);
    } else {
      console.log("  Error:", e.message.slice(0, 200));
    }
  }
}

main().catch(console.error);
