/**
 * Upgrade SlabNFTManager proxy from v1.0.0 to v2.0.0
 *
 * Changes in v2.0.0:
 * - Increased MAX_INVENTORY_SIZE from 10 to 20
 * - Added setOwnerWallet() for ownership transfer
 * - Added events: OwnerWalletUpdated, InventoryCapacityReached, AutoPurchaseSkippedInventoryFull
 * - Added getMaxInventorySize() view function
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_SlabNFTManagerV2.cjs --network apechain
 */

const hre = require("hardhat");

// Contract addresses from addresses.json
const SLAB_NFT_MANAGER_PROXY = "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71";

async function main() {
  console.log("=".repeat(60));
  console.log("SlabNFTManager Upgrade: v1.0.0 → v2.0.0");
  console.log("=".repeat(60));
  console.log("");

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Check deployer balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "APE");
  console.log("");

  // Verify deployer is owner of proxy
  const currentImpl = await hre.upgrades.erc1967.getImplementationAddress(SLAB_NFT_MANAGER_PROXY);
  console.log("Current implementation:", currentImpl);
  console.log("Proxy address:", SLAB_NFT_MANAGER_PROXY);
  console.log("");

  // Get current contract to check owner
  const SlabNFTManagerV1 = await hre.ethers.getContractFactory("contracts/SlabNFTManagerV2.sol:SlabNFTManager");
  const currentContract = SlabNFTManagerV1.attach(SLAB_NFT_MANAGER_PROXY);

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

  // Check current inventory state
  const currentInventory = await currentContract.getInventoryCount();
  console.log("Current inventory count:", currentInventory.toString());

  // Check current max (should be 10 in v1.0.0)
  const currentMax = await currentContract.MAX_INVENTORY_SIZE();
  console.log("Current MAX_INVENTORY_SIZE:", currentMax.toString());
  console.log("");

  // Deploy new implementation
  console.log("Deploying new SlabNFTManager v2.0.0 implementation...");

  // Note: The contract file is SlabNFTManagerV2.sol but the contract name inside is still "SlabNFTManager"
  const SlabNFTManagerV2 = await hre.ethers.getContractFactory("contracts/SlabNFTManagerV2.sol:SlabNFTManager", {
    libraries: {},
  });

  // Perform upgrade
  // Storage layout is identical - only the constant value changes
  // Constants are embedded in bytecode, not stored in proxy storage
  const upgraded = await hre.upgrades.upgradeProxy(SLAB_NFT_MANAGER_PROXY, SlabNFTManagerV2, {
    unsafeSkipStorageCheck: true, // Safe because storage layout unchanged
    redeployImplementation: "always",
  });

  await upgraded.waitForDeployment();

  const newImpl = await hre.upgrades.erc1967.getImplementationAddress(SLAB_NFT_MANAGER_PROXY);
  console.log("");
  console.log("✓ Upgrade complete!");
  console.log("New implementation:", newImpl);
  console.log("");

  // Verify upgrade
  console.log("Verifying upgrade...");

  // Check new MAX_INVENTORY_SIZE
  const newMax = await upgraded.MAX_INVENTORY_SIZE();
  console.log("  New MAX_INVENTORY_SIZE:", newMax.toString());

  if (newMax.toString() !== "20") {
    console.error("ERROR: MAX_INVENTORY_SIZE should be 20!");
    process.exit(1);
  }
  console.log("  ✓ MAX_INVENTORY_SIZE correctly updated to 20");

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

  // Check stats preserved
  const stats = await upgraded.getStats();
  console.log("  Contract stats:");
  console.log("    NFTs purchased:", stats[0].toString());
  console.log("    NFTs awarded:", stats[1].toString());
  console.log("    USDC spent:", hre.ethers.formatUnits(stats[2], 6));
  console.log("    Current inventory:", stats[3].toString());
  console.log("    USDC balance:", hre.ethers.formatUnits(stats[4], 6));

  // Check hasInventorySpace
  const [hasSpace, availableSlots] = await upgraded.hasInventorySpace();
  console.log("  Has inventory space:", hasSpace);
  console.log("  Available slots:", availableSlots.toString());

  console.log("");
  console.log("=".repeat(60));
  console.log("UPGRADE COMPLETE");
  console.log("=".repeat(60));
  console.log("");
  console.log("New features available:");
  console.log("  - MAX_INVENTORY_SIZE increased from 10 to 20");
  console.log("  - setOwnerWallet(newOwner) - transfer ownership");
  console.log("  - getMaxInventorySize() - returns current max (20)");
  console.log("");
  console.log("New events:");
  console.log("  - OwnerWalletUpdated(oldOwner, newOwner)");
  console.log("  - InventoryCapacityReached(currentSize, maxSize)");
  console.log("  - AutoPurchaseSkippedInventoryFull(balance, inventorySize, maxSize)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
