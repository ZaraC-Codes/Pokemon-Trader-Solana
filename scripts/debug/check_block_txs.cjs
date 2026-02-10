/**
 * Check all transactions in block 32719353
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

async function main() {
  const block = await provider.getBlockWithTransactions(32719353);
  
  console.log("Block 32719353:");
  console.log("  Transactions:", block.transactions.length);
  console.log("");
  
  for (let i = 0; i < block.transactions.length; i++) {
    const tx = block.transactions[i];
    const receipt = await provider.getTransactionReceipt(tx.hash);
    
    console.log(`Tx #${i} (index ${receipt.transactionIndex}):`);
    console.log("  Hash:", tx.hash);
    console.log("  From:", tx.from);
    console.log("  To:", tx.to);
    console.log("  Value:", ethers.utils.formatEther(tx.value), "APE");
    console.log("  Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
    console.log("  Gas used:", receipt.gasUsed.toString());
    console.log("");
  }
  
  // Now the key test: simulate BEFORE the APE tx within the same block
  // In EVM, txs are ordered by index. If we simulate at blockTag=32719352,
  // we get state AFTER all txs in 32719352 but BEFORE txs in 32719353.
  
  // But we need to check state BETWEEN txs in 32719353
  // We can't easily do that with standard RPC...
  
  // Let's check what happened in block 32719352
  console.log("\n=== Block 32719352 ===");
  const prevBlock = await provider.getBlockWithTransactions(32719352);
  console.log("Transactions:", prevBlock.transactions.length);
  
  for (let i = 0; i < prevBlock.transactions.length; i++) {
    const tx = prevBlock.transactions[i];
    const receipt = await provider.getTransactionReceipt(tx.hash);
    
    console.log(`Tx #${i}:`);
    console.log("  Hash:", tx.hash);
    console.log("  From:", tx.from);
    console.log("  To:", tx.to);
    
    // Check if any touched our contracts
    const ourAddresses = [
      "0xb6e86af8a85555c6ac2d812c8b8be8a60c1c432f", // PokeballGame
      "0x48b62137edfa95a428d35c09e44256a739f6b557", // WAPE
      "0xf1815bd50389c46847f0bda824ec8da914045d14", // USDC
      "0xc69dc28924930583024e067b2b3d773018f4eb52", // Router
      "0xd54dbbbfaadca6a4d985cd08c27e24c8a06433a0", // Pool
    ];
    
    const touchedOurs = receipt.logs.some(log => 
      ourAddresses.includes(log.address.toLowerCase())
    );
    if (touchedOurs) {
      console.log("  ** TOUCHES OUR CONTRACTS **");
    }
    console.log("");
  }
}

main().catch(console.error);
