/**
 * Check SlabMachine with correct ABI
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
  
  // pull(uint256,address) selector is 0x97b41a12
  console.log("Pull function: pull(uint256 requestId, address recipient)");
  
  // Try reading directly from storage or using different selectors
  // Common getter patterns in SlabMachine
  
  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)"
  ];
  const usdc = new ethers.Contract(USDC, erc20Abi, provider);
  
  const managerBalance = await usdc.balanceOf(SLAB_MANAGER);
  console.log("SlabNFTManager USDC balance:", ethers.utils.formatUnits(managerBalance, 6), "USDC");
  
  const managerToMachine = await usdc.allowance(SLAB_MANAGER, SLAB_MACHINE);
  console.log("Manager -> Machine allowance:", managerToMachine.toString());
  
  // Read SlabNFTManager to get the pull price it uses
  const managerAbi = require('./contracts/abi/abi_SlabNFTManager.json');
  const manager = new ethers.Contract(SLAB_MANAGER, managerAbi, provider);
  
  // Check SlabNFTManager's stored config
  console.log("\n=== SlabNFTManager State ===");
  
  try {
    const slabMachineAddr = await manager.slabMachine();
    console.log("slabMachine:", slabMachineAddr);
  } catch (e) {
    console.log("slabMachine read failed");
  }
  
  try {
    const usdcToken = await manager.usdcToken();
    console.log("usdcToken:", usdcToken);
  } catch (e) {
    console.log("usdcToken read failed");
  }
  
  // The key function - what price does Manager use?
  // Check if there's a pullPrice stored
  console.log("\n=== Looking at the SlabNFTManager Code ===");
  
  // The _executePurchase function should:
  // 1. Get pull price (maybe from SlabMachine or stored)
  // 2. Approve SlabMachine for that amount  
  // 3. Call SlabMachine.pull()
  
  // From the trace, the approve succeeded, then pull failed
  // The pull function likely does transferFrom with msg.sender as 'from'
  // So if Manager approves and Manager calls pull, the transferFrom should work
  
  // UNLESS... the issue is that checkAndPurchaseNFT is being called
  // when balance < pullPrice but the code still tries to pull
  
  console.log("\n=== Checking Pull Price from Contract ===");
  
  // Try calling the function that gets pull price
  // From SlabNFTManagerV2, it should have a way to read SlabMachine's pull price
  
  // Read the SlabMachine's config using storage
  // Storage slots in SlabMachine might have:
  // - pullPrice at some slot
  // - paymentToken at some slot
  
  // Let's read first 10 storage slots
  console.log("\nSlabMachine storage slots:");
  for (let i = 0; i < 10; i++) {
    const slot = await provider.getStorageAt(SLAB_MACHINE, i);
    if (slot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log("Slot", i, ":", slot);
    }
  }
  
  // Check SlabNFTManager storage
  console.log("\nSlabNFTManager storage slots:");
  for (let i = 0; i < 20; i++) {
    const slot = await provider.getStorageAt(SLAB_MANAGER, i);
    if (slot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      // Decode if it looks like an address
      if (slot.startsWith("0x000000000000000000000000")) {
        const addr = "0x" + slot.slice(26);
        console.log("Slot", i, ": address", addr);
      } else {
        // Try as uint256
        const num = ethers.BigNumber.from(slot);
        if (num.lt(ethers.utils.parseUnits("1000000", 6))) {
          // Might be a USDC amount
          console.log("Slot", i, ": amount", ethers.utils.formatUnits(num, 6), "?");
        } else {
          console.log("Slot", i, ":", slot);
        }
      }
    }
  }
  
  // Now the critical check: the pull price that SlabNFTManager uses
  // In SlabNFTManagerV2.sol, the _executePurchase function should:
  // 1. Call slabMachine.pullPrice() to get the price
  // 2. Check if balance >= pullPrice
  // 3. Approve pullPrice amount
  // 4. Call slabMachine.pull()
  
  console.log("\n=== ROOT CAUSE FOUND ===");
  console.log("From the trace:");
  console.log("1. checkAndPurchaseNFT() is called (balance ~$51 after deposit)");
  console.log("2. approve() to SlabMachine succeeds");
  console.log("3. SlabMachine.pull() is called");
  console.log("4. SlabMachine.pull() does USDC.transferFrom() which FAILS");
  console.log("");
  console.log("The failure is 'transfer amount exceeds allowance'");
  console.log("This means the allowance from step 2 isn't sufficient.");
  console.log("");
  console.log("POSSIBLE CAUSES:");
  console.log("A) SlabMachine.pull() transfers MORE than pullPrice");
  console.log("B) SlabMachine.pull() pulls from a different address than msg.sender");
  console.log("C) The approve amount doesn't match the transfer amount");
  console.log("");
  console.log("Most likely: The SlabMachine has been upgraded or reconfigured");
  console.log("and now requires a different amount than what SlabNFTManager approves.");
}

main().catch(console.error);
