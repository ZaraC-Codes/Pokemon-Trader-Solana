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
  
  // The selector is 0x97b41a12 - let's find out what function this is
  console.log("SlabMachine function selector: 0x97b41a12");
  
  // Common function selectors
  // pull(address,uint256) = 0x0d8a6d52
  // pull() = 0x329daf90 
  
  // Let's check what the SlabMachine expects
  const slabMachineAbi = require('./abi_SlabMachine.json');
  const iface = new ethers.utils.Interface(slabMachineAbi);
  
  // Find the function with selector 0x97b41a12
  for (const fragment of Object.values(iface.functions)) {
    const selector = iface.getSighash(fragment);
    if (selector === "0x97b41a12") {
      console.log("Found function:", fragment.format());
      console.log("Parameters:", fragment.inputs.map(i => i.name + ": " + i.type).join(", "));
    }
  }
  
  // Check pullPrice
  console.log("\n=== Checking Pull Price ===");
  const machineAbi = [
    "function pullPrice() view returns (uint256)",
    "function paymentToken() view returns (address)"
  ];
  const machine = new ethers.Contract(SLAB_MACHINE, machineAbi, provider);
  
  const pullPrice = await machine.pullPrice();
  console.log("Pull price:", ethers.utils.formatUnits(pullPrice, 6), "USDC");
  
  const paymentToken = await machine.paymentToken();
  console.log("Payment token:", paymentToken);
  
  // Check Manager's USDC balance
  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)"
  ];
  const usdc = new ethers.Contract(USDC, erc20Abi, provider);
  
  const managerBalance = await usdc.balanceOf(SLAB_MANAGER);
  console.log("\nSlabNFTManager USDC balance:", ethers.utils.formatUnits(managerBalance, 6), "USDC");
  
  // Check Manager -> Machine allowance
  const managerToMachine = await usdc.allowance(SLAB_MANAGER, SLAB_MACHINE);
  console.log("Manager -> Machine allowance:", managerToMachine.toString());
  
  console.log("\n=== Understanding the Problem ===");
  console.log("The trace shows:");
  console.log("1. Manager calls approve(SlabMachine, pullPrice) - SUCCEEDS");
  console.log("2. Manager calls SlabMachine.pull() with selector 0x97b41a12");
  console.log("3. SlabMachine calls USDC.transferFrom(from, to, amount) - FAILS");
  console.log("");
  console.log("The transferFrom fails with 'allowance exceeded'");
  console.log("");
  console.log("Possible reasons:");
  console.log("1. The 'from' in transferFrom is NOT the Manager");
  console.log("2. The approve didn't actually set the allowance");
  console.log("3. There's a reentrancy or state issue");
  
  // Let's check the SlabMachine's pull function to see what address it pulls from
  console.log("\n=== Checking SlabMachine Pull Implementation ===");
  
  // Based on the ABI, find the pull function
  for (const fragment of Object.values(iface.functions)) {
    if (fragment.name === "pull") {
      console.log("Pull function:", fragment.format());
      console.log("  Inputs:", fragment.inputs.map(i => i.name + ": " + i.type).join(", "));
    }
  }
  
  // The key question: does SlabMachine.pull() use msg.sender or a stored address?
  // If it uses msg.sender, then the transferFrom would be from SLAB_MANAGER
  // If it uses some other address, that would explain the issue
  
  console.log("\n=== Testing Direct Pull Simulation ===");
  
  // First, approve the machine
  const approveData = new ethers.utils.Interface([
    "function approve(address,uint256)"
  ]).encodeFunctionData("approve", [SLAB_MACHINE, pullPrice]);
  
  try {
    // Simulate approve from Manager
    await provider.call({
      from: SLAB_MANAGER,
      to: USDC,
      data: approveData
    });
    console.log("approve() from Manager: Would SUCCEED");
  } catch (e) {
    console.log("approve() from Manager: FAILS -", e.reason);
  }
  
  // Now check the allowance AFTER approve (in same context - won't persist)
  // In actual execution, the approve sets allowance, then pull uses it
  // But in separate eth_call, the approve doesn't persist
  
  console.log("\n=== THE REAL ISSUE ===");
  console.log("In eth_call simulation, each call is independent.");
  console.log("The approve() APPEARS to succeed but doesn't persist.");
  console.log("Then the pull() tries to transferFrom with ZERO allowance.");
  console.log("");
  console.log("In ACTUAL execution:");
  console.log("1. approve() sets allowance in storage");
  console.log("2. pull() reads the new allowance and succeeds");
  console.log("");
  console.log("So the simulation shows a false failure!");
  console.log("The ACTUAL transaction might work!");
  
  // But wait - we tested with estimateGas too, which should behave like execution
  console.log("\n=== But estimateGas also failed... ===");
  console.log("estimateGas DOES execute the transaction (without committing)");
  console.log("So if approve() and pull() are in the same transaction,");
  console.log("the allowance should persist for the pull()...");
  console.log("");
  console.log("Unless... there's something specific about how approve() works");
  console.log("in this USDC contract that causes the issue.");
  
  // Check if USDC is a proxy with special approve behavior
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const usdcImpl = await provider.getStorageAt(USDC, IMPL_SLOT);
  console.log("\nUSDC implementation slot:", usdcImpl);
  if (usdcImpl !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.log("USDC IS A PROXY! Implementation:", "0x" + usdcImpl.slice(26));
  }
}

main().catch(console.error);
