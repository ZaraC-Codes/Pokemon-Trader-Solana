/**
 * Trace what actually happened in successful tx
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";

async function main() {
  console.log("=== Tracing Successful APE Purchase ===\n");
  
  // The first successful APE purchase
  const txHash = "0xe344cc999488023d8f3c947617e2492fd52255fe26147226e3fc8ada5ccef961";
  
  const tx = await provider.getTransaction(txHash);
  const receipt = await provider.getTransactionReceipt(txHash);
  
  console.log("Transaction Details:");
  console.log("  From:", tx.from);
  console.log("  To:", tx.to);
  console.log("  Value:", ethers.utils.formatEther(tx.value), "APE");
  console.log("  Block:", receipt.blockNumber);
  console.log("  Gas Used:", receipt.gasUsed.toString());
  console.log("  Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
  
  // Decode function call
  const gameAbi = require('./contracts/abi/abi_PokeballGameV6.json');
  const iface = new ethers.utils.Interface(gameAbi);
  
  try {
    const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
    console.log("\n  Function:", decoded.name);
    console.log("  Args:", decoded.args);
  } catch (e) {
    console.log("  Could not decode:", e.message);
  }
  
  // Check all events
  console.log("\n=== Events ===");
  
  const depositTopic = ethers.utils.id("Deposit(address,uint256)");
  const withdrawTopic = ethers.utils.id("Withdrawal(address,uint256)");
  const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
  const swapTopic = ethers.utils.id("Swap(address,address,int256,int256,uint160,uint128,int24)");
  
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    const addr = log.address.toLowerCase();
    
    let eventName = "Unknown";
    let decoded = "";
    
    if (log.topics[0] === depositTopic) {
      eventName = "Deposit";
      const dst = "0x" + log.topics[1].slice(26);
      const amount = ethers.BigNumber.from(log.data);
      decoded = "dst=" + dst.slice(0,10) + "..., amount=" + ethers.utils.formatEther(amount);
    } else if (log.topics[0] === withdrawTopic) {
      eventName = "Withdrawal";
    } else if (log.topics[0] === transferTopic) {
      eventName = "Transfer";
      const from = "0x" + log.topics[1].slice(26);
      const to = "0x" + log.topics[2].slice(26);
      const amount = ethers.BigNumber.from(log.data);
      const isUsdc = addr === "0xf1815bd50389c46847f0bda824ec8da914045d14";
      decoded = from.slice(0,10) + "->" + to.slice(0,10) + ": " + 
        (isUsdc ? ethers.utils.formatUnits(amount, 6) + " USDC" : ethers.utils.formatEther(amount) + " WAPE");
    } else if (log.topics[0] === swapTopic) {
      eventName = "Swap";
    }
    
    const contractName = 
      addr === WAPE.toLowerCase() ? "WAPE" :
      addr === "0xf1815bd50389c46847f0bda824ec8da914045d14" ? "USDC" :
      addr === "0xd54dbbbfaadca6a4d985cd08c27e24c8a06433a0" ? "Pool" :
      addr === POKEBALL_GAME.toLowerCase() ? "Game" :
      addr.slice(0, 10);
    
    console.log(`${i}: [${contractName}] ${eventName} - ${decoded}`);
  }
  
  // Now trace the call
  console.log("\n=== Call Trace (debug_traceTransaction) ===");
  
  try {
    const trace = await provider.send("debug_traceTransaction", [
      txHash,
      { tracer: "callTracer" }
    ]);
    
    function printCall(call, indent = "") {
      console.log(indent + call.type + " " + (call.to || "CREATE").slice(0, 10) + "...");
      if (call.input) {
        console.log(indent + "  Input: " + call.input.slice(0, 20) + "...");
      }
      if (call.value && call.value !== "0x0") {
        console.log(indent + "  Value: " + ethers.utils.formatEther(ethers.BigNumber.from(call.value)));
      }
      if (call.error) {
        console.log(indent + "  ERROR: " + call.error);
      }
      if (call.calls) {
        for (const subcall of call.calls) {
          printCall(subcall, indent + "  ");
        }
      }
    }
    
    printCall(trace);
  } catch (e) {
    console.log("Trace failed:", e.message);
  }
  
  // Try to understand why eth_call fails but actual tx succeeded
  console.log("\n=== The Key Question ===");
  console.log("Why does eth_call fail but actual tx succeeded?");
  console.log("");
  console.log("eth_call simulation details:");
  console.log("- from: " + tx.from);
  console.log("- tx.origin in simulation: typically same as 'from' address");
  console.log("- msg.sender when PokeballGame calls WAPE: PokeballGame address");
  console.log("");
  console.log("Actual transaction:");
  console.log("- from: " + tx.from);
  console.log("- tx.origin: " + tx.from);
  console.log("- msg.sender in PokeballGame: " + tx.from);
  console.log("- msg.sender in WAPE: PokeballGame");
  console.log("");
  console.log("If WAPE checks 'tx.origin == msg.sender', both should fail equally.");
  console.log("The fact that actual tx works but eth_call doesn't suggests");
  console.log("there might be a difference in how tx.origin is handled.");
}

main().catch(console.error);
