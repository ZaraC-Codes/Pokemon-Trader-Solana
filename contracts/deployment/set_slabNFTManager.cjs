/**
 * Set SlabNFTManager address on PokeballGame v1.5.0
 *
 * This script configures the SlabNFTManager so that 97% of revenue
 * flows to it for NFT auto-purchase.
 *
 * Run: npx hardhat run contracts/deployment/set_slabNFTManager.cjs --network apechain
 */

const hre = require("hardhat");

// Contract addresses
const POKEBALL_GAME_PROXY = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const SLAB_NFT_MANAGER = "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71";

async function main() {
  console.log("=".repeat(60));
  console.log("SETTING SlabNFTManager ON PokeballGame v1.5.0");
  console.log("=".repeat(60));

  const [deployer] = await hre.ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  // Get contract instance
  const PokeballGame = await hre.ethers.getContractAt(
    "contracts/PokeballGameV5.sol:PokeballGame",
    POKEBALL_GAME_PROXY
  );

  // Check current value
  const currentManager = await PokeballGame.slabNFTManager();
  console.log("\nCurrent SlabNFTManager:", currentManager);

  if (currentManager.toLowerCase() === SLAB_NFT_MANAGER.toLowerCase()) {
    console.log("✅ Already set to correct address. No action needed.");
    return;
  }

  // Set the manager
  console.log("\nSetting SlabNFTManager to:", SLAB_NFT_MANAGER);
  const tx = await PokeballGame.setSlabNFTManager(SLAB_NFT_MANAGER);
  console.log("Transaction hash:", tx.hash);

  await tx.wait();
  console.log("✅ Transaction confirmed!");

  // Verify
  const newManager = await PokeballGame.slabNFTManager();
  console.log("\nNew SlabNFTManager:", newManager);

  if (newManager.toLowerCase() === SLAB_NFT_MANAGER.toLowerCase()) {
    console.log("\n" + "=".repeat(60));
    console.log("SUCCESS! SlabNFTManager configured.");
    console.log("=".repeat(60));
    console.log("\nRevenue flow is now active:");
    console.log("  - 3% fees → accumulatedUSDCFees (withdraw via withdrawUSDCFees())");
    console.log("  - 97% revenue → SlabNFTManager.depositRevenue()");
    console.log("  - Auto-purchase triggers when SlabNFTManager balance >= $51 USDC.e");
  } else {
    console.error("\n❌ ERROR: Manager address mismatch after setting!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
