/**
 * Deployment Script for SlabNFTManager Contract
 * @author Z33Fi ("Z33Fi Made It")
 *
 * Network: ApeChain Mainnet (Chain ID: 33139)
 * Pattern: UUPS Proxy
 *
 * Usage:
 *   npx hardhat run contracts/deployment/deploy_SlabNFTManager.js --network apechain
 *
 * Prerequisites:
 *   - PokeballGame should be deployed first (or pass zero address and set later)
 */

const { ethers, upgrades } = require("hardhat");

// ============ Contract Addresses (ApeChain Mainnet) ============

const ADDRESSES = {
  // Tokens
  USDC_E: "0xF1815bd50389c46847f0Bda824eC8da914045D14",

  // External Contracts
  SLAB_MACHINE: "0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466",
  SLAB_NFT: "0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7",

  // Set this after PokeballGame is deployed, or use zero address initially
  POKEBALL_GAME: "0x0000000000000000000000000000000000000000",
};

// ============ Wallet Configuration ============
// From contracts/wallets.json

const WALLETS = {
  // Owner wallet - controls upgrades and admin functions
  OWNER: "0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06",

  // Treasury wallet - for emergency withdrawals
  TREASURY: "0x1D1d0E6eF415f2BAe0c21939c50Bc4ffBeb65c74",
};

async function main() {
  console.log("============================================");
  console.log("  SlabNFTManager Deployment Script");
  console.log("  Network: ApeChain Mainnet (33139)");
  console.log("  Pattern: UUPS Proxy");
  console.log("============================================\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "APE\n");

  // Validate wallet addresses
  console.log("Validating configuration...");

  const { isAddress } = await import("ethers");
  if (!isAddress(WALLETS.OWNER)) {
    throw new Error("Invalid WALLETS.OWNER address");
  }
  if (!isAddress(WALLETS.TREASURY)) {
    throw new Error("Invalid WALLETS.TREASURY address");
  }

  console.log("Configuration validated!\n");

  // Display deployment parameters
  console.log("Deployment Parameters:");
  console.log("----------------------");
  console.log("Owner Wallet:     ", WALLETS.OWNER);
  console.log("Treasury Wallet:  ", WALLETS.TREASURY);
  console.log("USDC.e Address:   ", ADDRESSES.USDC_E);
  console.log("SlabMachine:      ", ADDRESSES.SLAB_MACHINE);
  console.log("Slab NFT:         ", ADDRESSES.SLAB_NFT);
  console.log("PokeballGame:     ", ADDRESSES.POKEBALL_GAME);
  console.log("\n");

  if (ADDRESSES.POKEBALL_GAME === "0x0000000000000000000000000000000000000000") {
    console.log("⚠️  WARNING: PokeballGame address is zero!");
    console.log("   You must call setPokeballGame() after deployment.\n");
  }

  // Deploy implementation and proxy
  console.log("Deploying SlabNFTManager with UUPS proxy...\n");

  const SlabNFTManager = await ethers.getContractFactory("SlabNFTManager");

  const slabNFTManager = await upgrades.deployProxy(
    SlabNFTManager,
    [
      WALLETS.OWNER,           // _owner
      WALLETS.TREASURY,        // _treasury
      ADDRESSES.USDC_E,        // _usdce
      ADDRESSES.SLAB_MACHINE,  // _slabMachine
      ADDRESSES.SLAB_NFT,      // _slabNFT
      ADDRESSES.POKEBALL_GAME  // _pokeballGame (can be zero)
    ],
    {
      initializer: "initialize",
      kind: "uups",
    }
  );

  await slabNFTManager.waitForDeployment();

  const proxyAddress = await slabNFTManager.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("============================================");
  console.log("  Deployment Complete!");
  console.log("============================================\n");
  console.log("Proxy Address:          ", proxyAddress);
  console.log("Implementation Address: ", implementationAddress);
  console.log("\n");

  // Verify contract state
  console.log("Verifying contract state...\n");

  const owner = await slabNFTManager.owner();
  const treasury = await slabNFTManager.treasuryWallet();
  const pokeballGame = await slabNFTManager.pokeballGame();
  const paused = await slabNFTManager.paused();
  const inventoryCount = await slabNFTManager.getInventoryCount();

  console.log("Contract State:");
  console.log("---------------");
  console.log("Owner:           ", owner);
  console.log("Treasury:        ", treasury);
  console.log("PokeballGame:    ", pokeballGame);
  console.log("Paused:          ", paused);
  console.log("Inventory Count: ", inventoryCount.toString());
  console.log("\n");

  // Output for frontend integration
  console.log("============================================");
  console.log("  Frontend Integration");
  console.log("============================================\n");
  console.log("Add to your frontend config:\n");
  console.log(`const SLAB_NFT_MANAGER_ADDRESS = "${proxyAddress}";`);
  console.log("\n");

  // Output for verification
  console.log("============================================");
  console.log("  Contract Verification");
  console.log("============================================\n");
  console.log("To verify on Apescan, run:\n");
  console.log(`npx hardhat verify --network apechain ${implementationAddress}`);
  console.log("\n");

  // Post-deployment instructions
  console.log("============================================");
  console.log("  Post-Deployment Steps");
  console.log("============================================\n");
  console.log("1. If PokeballGame is already deployed:");
  console.log(`   await slabNFTManager.setPokeballGame(POKEBALL_GAME_ADDRESS)`);
  console.log("\n2. Update PokeballGame to use this manager:");
  console.log(`   await pokeballGame.setSlabNFTManager("${proxyAddress}")`);
  console.log("\n3. Approve USDC.e for initial funding (if needed):");
  console.log(`   await usdce.approve("${proxyAddress}", amount)`);
  console.log(`   await slabNFTManager.depositRevenue(amount)`);
  console.log("\n");

  // Return deployment info
  return {
    proxy: proxyAddress,
    implementation: implementationAddress,
    deployer: deployer.address,
  };
}

// Execute deployment
main()
  .then((result) => {
    console.log("Deployment successful!");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });

/**
 * Post-Deployment Checklist:
 *
 * 1. ✅ Verify contract on Apescan
 * 2. ✅ Set PokeballGame address if deployed later
 * 3. ✅ Update PokeballGame to reference this manager
 * 4. ✅ Approve USDC.e spending for SlabMachine
 * 5. ✅ Deposit initial USDC.e if pre-funding
 * 6. ✅ Test checkAndPurchaseNFT() with owner
 * 7. ✅ Test awardNFTToWinner() from PokeballGame
 *
 * Emergency Functions:
 * - pause(): Halt all operations
 * - unpause(): Resume operations
 * - emergencyWithdraw(): Move all assets to treasury
 */
