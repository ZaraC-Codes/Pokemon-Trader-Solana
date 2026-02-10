/**
 * Verify WAPE uses tx.origin == msg.sender or extcodesize check
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
const WAPE_IMPL = "0xd22ba2ff50d5c086d4bc34e9612b92fcbf8c1152";

async function main() {
  console.log("=== Analyzing WAPE Implementation ===\n");
  
  // Get implementation bytecode
  const implCode = await provider.getCode(WAPE_IMPL);
  console.log("Implementation bytecode length:", implCode.length);
  
  // Look for specific patterns:
  // 1. EXTCODESIZE (0x3B) + ISZERO (0x15) pattern - checks if caller is EOA
  // 2. ORIGIN (0x32) + CALLER (0x33) + EQ (0x14) - checks tx.origin == msg.sender
  
  const bytecode = implCode.toLowerCase();
  
  // EXTCODESIZE opcode is 0x3b
  const extcodesizeCount = (bytecode.match(/3b/g) || []).length;
  console.log("EXTCODESIZE (0x3B) occurrences:", extcodesizeCount);
  
  // ORIGIN opcode is 0x32
  const originCount = (bytecode.match(/32/g) || []).length;
  console.log("ORIGIN (0x32) occurrences:", originCount);
  
  // CALLER opcode is 0x33
  const callerCount = (bytecode.match(/33/g) || []).length;
  console.log("CALLER (0x33) occurrences:", callerCount);
  
  // Look for pattern: ORIGIN CALLER EQ (32 33 14)
  if (bytecode.includes("323314") || bytecode.includes("333214")) {
    console.log("\n*** FOUND: tx.origin == msg.sender check pattern! ***");
    console.log("This blocks contract calls because tx.origin (user) != msg.sender (contract)");
  }
  
  // Look for pattern: CALLER EXTCODESIZE ISZERO (33 3b 15)
  if (bytecode.includes("333b15") || bytecode.includes("333b00")) {
    console.log("\n*** FOUND: extcodesize(msg.sender) == 0 check pattern! ***");
    console.log("This blocks contract calls because contracts have code");
  }
  
  // The real question: why did deposits work BEFORE but not NOW?
  // If WAPE always had this check, then eth_call simulations would always fail
  // But actual txs from EOAs (tx.origin) would work because tx.origin == user's wallet
  
  console.log("\n=== Understanding the Issue ===");
  console.log("When user calls PokeballGame.purchaseBallsWithAPE():");
  console.log("  tx.origin = user's wallet (0x7028b...)");
  console.log("  In PokeballGame context: msg.sender = user's wallet");
  console.log("  PokeballGame calls WAPE.deposit():");
  console.log("    tx.origin = STILL user's wallet (0x7028b...)");
  console.log("    In WAPE context: msg.sender = PokeballGame contract");
  console.log("");
  console.log("If WAPE checks tx.origin == msg.sender, this ALWAYS fails for contract calls!");
  console.log("But wait - the historical txs DID succeed...");
  
  // Let's actually verify the historical txs had WAPE deposit
  console.log("\n=== Verifying Historical Tx Logs ===");
  
  const receipt = await provider.getTransactionReceipt(
    "0xe344cc999488023d8f3c947617e2492fd52255fe26147226e3fc8ada5ccef961"  // First successful APE purchase
  );
  
  const depositTopic = ethers.utils.id("Deposit(address,uint256)");
  const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
  
  console.log("First APE purchase tx (block", receipt.blockNumber, "):");
  console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
  
  let foundWapeDeposit = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === WAPE.toLowerCase()) {
      if (log.topics[0] === depositTopic) {
        console.log("  WAPE Deposit event found!");
        foundWapeDeposit = true;
      }
      if (log.topics[0] === transferTopic) {
        console.log("  WAPE Transfer event found!");
      }
    }
  }
  
  if (foundWapeDeposit) {
    console.log("\nWAPE.deposit() DID execute successfully in this tx!");
    console.log("This means WAPE either:");
    console.log("1. Added the tx.origin check AFTER this tx");
    console.log("2. The check exists but eth_call simulation doesn't work properly");
  }
  
  // Check eth_call with tx.origin context
  console.log("\n=== Testing eth_call with transaction context ===");
  
  // eth_call doesn't support setting tx.origin directly
  // But we can check if the RPC provider supports trace
  try {
    const result = await provider.send("debug_traceTransaction", [
      "0xe344cc999488023d8f3c947617e2492fd52255fe26147226e3fc8ada5ccef961",
      { tracer: "callTracer" }
    ]);
    console.log("debug_traceTransaction result available");
  } catch (e) {
    console.log("debug_traceTransaction not available:", e.message.slice(0, 60));
  }
  
  // Key insight: The issue is that eth_call simulation sets tx.origin to 'from' address
  // But when PokeballGame calls WAPE, msg.sender becomes PokeballGame
  // If WAPE has onlyEOA modifier (tx.origin == msg.sender), it will fail
  
  console.log("\n=== THEORY ===");
  console.log("WAPE uses a modifier like 'require(tx.origin == msg.sender)'");
  console.log("OR uses 'require(extcodesize(msg.sender) == 0)'");
  console.log("");
  console.log("In eth_call simulation, these ALWAYS fail for contract calls.");
  console.log("In actual execution, they also ALWAYS fail for contract calls.");
  console.log("");
  console.log("BUT WAIT - historical txs succeeded! Let me check if WAPE changed.");
  
  // Check WAPE bytecode at historical vs current
  console.log("\n=== WAPE Bytecode at Historical Block ===");
  const codeBefore = await provider.getCode(WAPE, 32717107);  // First successful
  const codeNow = await provider.getCode(WAPE);
  
  console.log("Bytecode at block 32717107:", codeBefore.length, "chars");
  console.log("Bytecode now:", codeNow.length, "chars");
  console.log("Same bytecode:", codeBefore === codeNow);
  
  if (codeBefore !== codeNow) {
    console.log("\n*** WAPE PROXY CODE CHANGED! ***");
  }
  
  // Check implementation at historical
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implBefore = await provider.getStorageAt(WAPE, IMPL_SLOT, 32717107);
  const implNow = await provider.getStorageAt(WAPE, IMPL_SLOT);
  
  console.log("\nImplementation slot at block 32717107:", implBefore);
  console.log("Implementation slot now:", implNow);
  console.log("Same implementation:", implBefore === implNow);
  
  if (implBefore !== implNow) {
    console.log("\n*** WAPE IMPLEMENTATION CHANGED! ***");
    console.log("Old impl:", "0x" + implBefore.slice(26));
    console.log("New impl:", "0x" + implNow.slice(26));
  }
}

main().catch(console.error);
