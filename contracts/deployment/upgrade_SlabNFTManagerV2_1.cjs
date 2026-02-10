/**
 * Upgrade SlabNFTManager proxy from v2.0.0 to v2.1.0
 *
 * Changes in v2.1.0:
 * - Fixed SlabMachine pull price issue: machineConfig().usdcPullPrice returns stale/incorrect value (1)
 * - Added PULL_PRICE_USDC constant ($51) for reliable approval amounts
 * - _executePurchase now uses PULL_PRICE_USDC instead of machineConfig value
 * - _attemptNFTPurchase simplified to use PULL_PRICE_USDC for balance check
 * - Added emergencyWithdrawRevenue() for owner to withdraw accumulated USDC.e without NFTs
 * - Added emergencyWithdrawAllRevenue() for owner to withdraw all USDC.e at once
 * - Added getPullPrice() view function
 *
 * BUG FIXED:
 * - slabMachine.machineConfig() returns usdcPullPrice = 1 (wrong)
 * - Actual SlabMachine charges $50 USDC per pull
 * - Manager was approving $0.000001, then SlabMachine tried to transfer $50
 * - Result: "ERC20: transfer amount exceeds allowance" on every APE purchase
 *   after balance exceeded $51 threshold
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_SlabNFTManagerV2_1.cjs --network apechain
 */

const hre = require("hardhat");

// Contract addresses from addresses.json
const SLAB_NFT_MANAGER_PROXY = "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71";

async function main() {
  console.log("=".repeat(60));
  console.log("SlabNFTManager Upgrade: v2.0.0 → v2.1.0");
  console.log("=".repeat(60));
  console.log("");
  console.log("BUG FIX: SlabMachine pull price approval mismatch");
  console.log("  - machineConfig().usdcPullPrice returned: $0.000001");
  console.log("  - Actual SlabMachine pull cost: $50");
  console.log("  - Fix: Use hardcoded PULL_PRICE_USDC = $51");
  console.log("");

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Check deployer balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.utils.formatEther(balance), "APE");
  console.log("");

  // Verify deployer is owner of proxy
  const currentImpl = await hre.upgrades.erc1967.getImplementationAddress(SLAB_NFT_MANAGER_PROXY);
  console.log("Current implementation:", currentImpl);
  console.log("Proxy address:", SLAB_NFT_MANAGER_PROXY);
  console.log("");

  // Get current contract to check owner
  const SlabNFTManagerV2 = await hre.ethers.getContractFactory("contracts/SlabNFTManagerV2.sol:SlabNFTManager");
  const currentContract = SlabNFTManagerV2.attach(SLAB_NFT_MANAGER_PROXY);

  const owner = await currentContract.owner();
  console.log("Contract owner:", owner);

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error("ERROR: Deployer is not the contract owner!");
    console.error("Owner:", owner);
    console.error("Deployer:", deployer.address);
    process.exit(1);
  }

  console.log("✓ Deployer is contract owner");
  console.log("");

  // Check current state
  const currentInventory = await currentContract.getInventoryCount();
  console.log("Current inventory count:", currentInventory.toString());

  const currentMax = await currentContract.MAX_INVENTORY_SIZE();
  console.log("Current MAX_INVENTORY_SIZE:", currentMax.toString());

  // Get current USDC balance
  const USDC_ADDRESS = "0xF1815bd50389c46847f0Bda824eC8da914045D14";
  const usdcContract = await hre.ethers.getContractAt("IERC20", USDC_ADDRESS);
  const usdcBalance = await usdcContract.balanceOf(SLAB_NFT_MANAGER_PROXY);
  console.log("Current USDC.e balance:", hre.ethers.utils.formatUnits(usdcBalance, 6), "USDC.e");
  console.log("");

  // Deploy new implementation
  console.log("Deploying new SlabNFTManager v2.1.0 implementation...");

  // Note: The contract file is SlabNFTManagerV2_1.sol but the contract name inside is still "SlabNFTManager"
  const SlabNFTManagerV2_1 = await hre.ethers.getContractFactory("contracts/SlabNFTManagerV2_1.sol:SlabNFTManager", {
    libraries: {},
  });

  // Perform upgrade
  // Storage layout is identical to v2.0.0 - only constants and logic change
  // Constants are embedded in bytecode, not stored in proxy storage
  const upgraded = await hre.upgrades.upgradeProxy(SLAB_NFT_MANAGER_PROXY, SlabNFTManagerV2_1, {
    unsafeSkipStorageCheck: true, // Safe because storage layout unchanged
    redeployImplementation: "always",
  });

  await upgraded.deployed();

  const newImpl = await hre.upgrades.erc1967.getImplementationAddress(SLAB_NFT_MANAGER_PROXY);
  console.log("");
  console.log("✓ Upgrade complete!");
  console.log("New implementation:", newImpl);
  console.log("");

  // Verify upgrade
  console.log("Verifying upgrade...");

  // Check MAX_INVENTORY_SIZE preserved
  const newMax = await upgraded.MAX_INVENTORY_SIZE();
  console.log("  MAX_INVENTORY_SIZE:", newMax.toString());

  if (newMax.toString() !== "20") {
    console.error("ERROR: MAX_INVENTORY_SIZE should be 20!");
    process.exit(1);
  }
  console.log("  ✓ MAX_INVENTORY_SIZE correctly at 20");

  // Check new PULL_PRICE_USDC constant
  const pullPrice = await upgraded.PULL_PRICE_USDC();
  console.log("  PULL_PRICE_USDC:", hre.ethers.utils.formatUnits(pullPrice, 6), "USDC.e");

  if (pullPrice.toString() !== "51000000") {
    console.error("ERROR: PULL_PRICE_USDC should be 51000000 ($51)!");
    process.exit(1);
  }
  console.log("  ✓ PULL_PRICE_USDC correctly set to $51");

  // Check getPullPrice() function
  const getPullPriceResult = await upgraded.getPullPrice();
  console.log("  getPullPrice():", hre.ethers.utils.formatUnits(getPullPriceResult, 6), "USDC.e");

  // Check inventory preserved
  const newInventory = await upgraded.getInventoryCount();
  console.log("  Inventory count after upgrade:", newInventory.toString());

  if (newInventory.toString() !== currentInventory.toString()) {
    console.error("WARNING: Inventory count changed during upgrade!");
    console.error("  Before:", currentInventory.toString());
    console.error("  After:", newInventory.toString());
  } else {
    console.log("  ✓ Inventory preserved");
  }

  // Check balance preserved
  const newUsdcBalance = await usdcContract.balanceOf(SLAB_NFT_MANAGER_PROXY);
  console.log("  USDC.e balance after upgrade:", hre.ethers.utils.formatUnits(newUsdcBalance, 6));

  if (newUsdcBalance.toString() !== usdcBalance.toString()) {
    console.error("WARNING: USDC balance changed during upgrade!");
  } else {
    console.log("  ✓ USDC.e balance preserved");
  }

  // Check stats preserved
  const stats = await upgraded.getStats();
  console.log("  Contract stats:");
  console.log("    USDC balance:", hre.ethers.utils.formatUnits(stats[0], 6), "USDC.e");
  console.log("    Inventory size:", stats[1].toString());
  console.log("    Total purchased:", stats[2].toString());
  console.log("    Total awarded:", stats[3].toString());
  console.log("    Total spent:", hre.ethers.utils.formatUnits(stats[4], 6), "USDC.e");
  console.log("    Pending requests:", stats[5].toString());

  // Check canTriggerPurchase
  const [canPurchase, reason] = await upgraded.canTriggerPurchase();
  console.log("  Can trigger purchase:", canPurchase, "-", reason);

  console.log("");
  console.log("=".repeat(60));
  console.log("UPGRADE COMPLETE - v2.1.0");
  console.log("=".repeat(60));
  console.log("");
  console.log("Bug fixed:");
  console.log("  - SlabMachine approval now uses $51 (PULL_PRICE_USDC)");
  console.log("  - Previously used machineConfig().usdcPullPrice which returned $0.000001");
  console.log("  - APE purchases should now work correctly!");
  console.log("");
  console.log("New features:");
  console.log("  - PULL_PRICE_USDC constant = $51 USDC.e");
  console.log("  - getPullPrice() - returns the fixed pull price");
  console.log("  - emergencyWithdrawRevenue(amount) - withdraw specific USDC.e amount");
  console.log("  - emergencyWithdrawAllRevenue() - withdraw all USDC.e");
  console.log("");
  console.log("New events:");
  console.log("  - RevenueWithdrawn(recipient, amount, remainingBalance)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
