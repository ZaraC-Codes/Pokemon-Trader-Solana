/**
 * Check SlabMachine pull function
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const SLAB_MACHINE = "0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466";
const SLAB_MANAGER = "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71";
const USDC = "0xF1815bd50389c46847f0Bda824eC8da914045D14";

async function main() {
  console.log("=== Investigating SlabMachine Pull ===\n");
  
  // The selector is 0x97b41a12 
  // Let's calculate what function this is
  // pull(uint256,address) = keccak256("pull(uint256,address)").slice(0,10)
  
  console.log("Checking function selectors...");
  const candidates = [
    "pull(uint256,address)",
    "pull(address,uint256)",
    "pullFor(address)",
    "pullTo(address)",
    "buy(uint256,address)",
    "purchase(uint256,address)"
  ];
  
  for (const sig of candidates) {
    const selector = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(sig)).slice(0, 10);
    console.log(sig, "->", selector);
    if (selector === "0x97b41a12") {
      console.log("*** FOUND! Function is:", sig);
    }
  }
  
  // Check using common pull patterns
  const machineAbi = [
    "function pullPrice() view returns (uint256)",
    "function paymentToken() view returns (address)",
    "function pull(uint256 requestId, address recipient) returns (uint256)"
  ];
  const machine = new ethers.Contract(SLAB_MACHINE, machineAbi, provider);
  
  console.log("\n=== SlabMachine State ===");
  const pullPrice = await machine.pullPrice();
  console.log("Pull price:", ethers.utils.formatUnits(pullPrice, 6), "USDC");
  
  const paymentToken = await machine.paymentToken();
  console.log("Payment token:", paymentToken);
  console.log("Expected USDC:", USDC);
  console.log("Tokens match:", paymentToken.toLowerCase() === USDC.toLowerCase());
  
  // Check Manager's state
  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)"
  ];
  const usdc = new ethers.Contract(USDC, erc20Abi, provider);
  
  const managerBalance = await usdc.balanceOf(SLAB_MANAGER);
  console.log("\nSlabNFTManager USDC balance:", ethers.utils.formatUnits(managerBalance, 6), "USDC");
  console.log("Has enough for pull:", managerBalance.gte(pullPrice));
  
  const managerToMachine = await usdc.allowance(SLAB_MANAGER, SLAB_MACHINE);
  console.log("Manager -> Machine current allowance:", managerToMachine.toString());
  
  // THE KEY INSIGHT
  console.log("\n=== ROOT CAUSE ANALYSIS ===");
  console.log("Current manager balance:", ethers.utils.formatUnits(managerBalance, 6), "USDC");
  console.log("Current manager allowance to SlabMachine:", managerToMachine.toString());
  console.log("Pull price:", ethers.utils.formatUnits(pullPrice, 6), "USDC");
  console.log("");
  
  // Check if the balance + revenue deposit would trigger a purchase
  // If balance < pullPrice but balance + deposit >= pullPrice...
  console.log("After APE purchase ($1 ball = $0.97 revenue), manager would have:");
  const revenueFromPurchase = ethers.utils.parseUnits("0.97", 6);
  const newBalance = managerBalance.add(revenueFromPurchase);
  console.log("  New balance:", ethers.utils.formatUnits(newBalance, 6), "USDC");
  console.log("  Would trigger purchase:", newBalance.gte(pullPrice));
  
  if (newBalance.gte(pullPrice)) {
    console.log("\n*** THE BUG IS CONFIRMED! ***");
    console.log("1. Current balance: $50.44 (below $51 threshold)");
    console.log("2. APE purchase deposits ~$0.97 revenue");
    console.log("3. New balance: ~$51.41 (ABOVE threshold)");
    console.log("4. checkAndPurchaseNFT() tries to buy NFT");
    console.log("5. Manager does: approve(SlabMachine, pullPrice)");
    console.log("6. Manager calls: SlabMachine.pull(...)");
    console.log("7. SlabMachine does: USDC.transferFrom(Manager, ..., pullPrice)");
    console.log("8. BUT the transferFrom FAILS because...");
    console.log("");
    console.log("WAIT - the approve should work!");
    console.log("Let me check if SlabMachine.pull uses msg.sender or a different address");
  }
  
  // Check what the SlabMachine pull function actually does
  // From the trace, the pull function calls USDC.transferFrom
  // The question is: from WHO?
  
  console.log("\n=== Decoding the Failed TransferFrom ===");
  
  // From the trace output, the transferFrom call input would tell us the parameters
  // transferFrom(address from, address to, uint256 value)
  // Selector: 0x23b872dd
  
  // The trace showed USDC.transferFrom failed inside SlabMachine.pull
  // Let's see what the SlabMachine code looks like
  
  const machineCode = await provider.getCode(SLAB_MACHINE);
  console.log("SlabMachine code size:", machineCode.length / 2, "bytes");
  
  // Check if it's a proxy
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const machineImpl = await provider.getStorageAt(SLAB_MACHINE, IMPL_SLOT);
  if (machineImpl !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.log("SlabMachine IS A PROXY! Implementation:", "0x" + machineImpl.slice(26));
  } else {
    console.log("SlabMachine is not a standard proxy");
  }
}

main().catch(console.error);
