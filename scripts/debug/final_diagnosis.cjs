/**
 * Final diagnosis of the APE purchase failure
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const SLAB_MACHINE = "0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466";
const SLAB_MANAGER = "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71";
const USDC = "0xF1815bd50389c46847f0Bda824eC8da914045D14";
const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";

async function main() {
  console.log("=== FINAL DIAGNOSIS: APE Purchase Failure ===\n");
  
  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)"
  ];
  const usdc = new ethers.Contract(USDC, erc20Abi, provider);
  
  // Current state
  console.log("=== Current State ===");
  const managerBalance = await usdc.balanceOf(SLAB_MANAGER);
  console.log("SlabNFTManager USDC balance: $" + ethers.utils.formatUnits(managerBalance, 6));
  
  const gameUsdc = await usdc.balanceOf(POKEBALL_GAME);
  console.log("PokeballGame USDC balance: $" + ethers.utils.formatUnits(gameUsdc, 6));
  
  // The flow that triggers the bug:
  console.log("\n=== Bug Flow Analysis ===");
  console.log("1. User buys $1 PokeBall with APE");
  console.log("2. APE swapped to ~$1 USDC via Camelot (this works!)");
  console.log("3. 3% ($0.03) kept as fee, 97% ($0.97) sent to Manager");
  console.log("4. depositRevenue() succeeds");
  console.log("5. checkAndPurchaseNFT() is called");
  console.log("6. Manager balance is now: $" + ethers.utils.formatUnits(managerBalance.add(ethers.utils.parseUnits("0.97", 6)), 6));
  console.log("7. This is >= $51 threshold, so it tries to buy NFT!");
  console.log("8. Manager approves SlabMachine for pullPrice");
  console.log("9. Manager calls SlabMachine.pull()");
  console.log("10. SlabMachine tries USDC.transferFrom() -> FAILS");
  
  console.log("\n=== The Question ===");
  console.log("Why does transferFrom fail after approve succeeds?");
  console.log("");
  console.log("Possibilities:");
  console.log("A) SlabMachine.pull() uses a 'from' address other than msg.sender");
  console.log("B) The approved amount differs from the transferred amount");
  console.log("C) Some other state change invalidates the approval");
  
  // Let's check what the SlabMachine code does
  // Read SlabMachine's storage to find clues
  
  console.log("\n=== SlabMachine Investigation ===");
  
  // Try to find the payment parameters
  // Common pattern: paymentToken at slot 0, price at slot 1
  
  // Read specific known selectors
  // 2dabc24f might be usdcPullPrice() or similar
  
  try {
    const result = await provider.call({
      to: SLAB_MACHINE,
      data: "0x2dabc24f"  // This was called in the trace
    });
    console.log("SlabMachine.0x2dabc24f() =", result);
    if (result.length === 66) {
      const value = ethers.BigNumber.from(result);
      console.log("  As USDC amount: $" + ethers.utils.formatUnits(value, 6));
    }
  } catch (e) {
    console.log("SlabMachine.0x2dabc24f() reverted");
  }
  
  // Let's see if we can read the actual pull price
  // From contracts/addresses.json, the SlabMachine is at 0xC2DC75...
  // The standard NFT machine pull price is $51
  
  console.log("\n=== Checking Trace Details ===");
  
  // Re-read the trace to see the exact parameters
  // From the approve call, we can see what amount was approved
  // From the transferFrom call, we can see what amount was requested
  
  // In the trace, approve() succeeded (no error)
  // Then transferFrom() failed
  
  // Let me check if there's a mismatch in amounts
  console.log("The issue is likely that:");
  console.log("1. Manager reads pullPrice from SlabMachine");
  console.log("2. Manager approves that amount");
  console.log("3. SlabMachine.pull() actually transfers a DIFFERENT amount");
  console.log("4. The transferFrom fails because amount > allowance");
  
  console.log("\n=== SOLUTION ===");
  console.log("The SlabNFTManager needs to approve MORE than the pull price,");
  console.log("or there's a mismatch in the amounts being read/transferred.");
  console.log("");
  console.log("Recommended fix:");
  console.log("1. Check what amount SlabMachine.pull() actually transfers");
  console.log("2. Update SlabNFTManager to approve that exact amount");
  console.log("3. Or use MAX_UINT256 approval to avoid this issue");
  console.log("");
  console.log("IMMEDIATE WORKAROUND:");
  console.log("The current Manager balance ($50.44) is BELOW $51 threshold.");
  console.log("After a $1 purchase, it would be ~$51.41 which triggers the bug.");
  console.log("");
  console.log("Options:");
  console.log("A) Withdraw some USDC from Manager to keep balance < $51");
  console.log("B) Fix the SlabNFTManager approval logic");
  console.log("C) Pre-approve SlabMachine for a large amount");
  
  // Check current allowance
  const currentAllowance = await usdc.allowance(SLAB_MANAGER, SLAB_MACHINE);
  console.log("\nCurrent Manager->SlabMachine allowance:", currentAllowance.toString());
  
  if (currentAllowance.isZero()) {
    console.log("Allowance is ZERO - this is normal state before purchase attempt");
    console.log("The approve happens inside _executePurchase just before pull");
  }
}

main().catch(console.error);
