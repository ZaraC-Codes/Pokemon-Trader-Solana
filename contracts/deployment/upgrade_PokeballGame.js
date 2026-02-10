/**
 * Upgrade Script for PokeballGame Contract
 * @author Z33Fi ("Z33Fi Made It")
 *
 * Network: ApeChain Mainnet (Chain ID: 33139)
 * Pattern: UUPS Proxy Upgrade
 *
 * This script demonstrates how to upgrade the PokeballGame contract
 * to a new implementation version.
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_PokeballGame.js --network apechain
 *
 * Prerequisites:
 *   - The caller must be the contract owner
 *   - PokeballGameV2 must be compiled and available
 *   - The new implementation must be storage-compatible
 *
 * IMPORTANT: UUPS upgrades are controlled by the owner via _authorizeUpgrade()
 * which is implemented in the contract itself. No separate ProxyAdmin needed.
 */

const { ethers, upgrades } = require("hardhat");

// ============ Configuration ============

// IMPORTANT: Set this to your deployed PokeballGame proxy address
const POKEBALL_GAME_PROXY = "0x0000000000000000000000000000000000000000"; // <- REPLACE WITH ACTUAL

// ============ Upgrade Function ============

async function main() {
  console.log("============================================");
  console.log("  PokeballGame UUPS Upgrade Script");
  console.log("  Network: ApeChain Mainnet (33139)");
  console.log("============================================\n");

  // Validate proxy address
  if (POKEBALL_GAME_PROXY === "0x0000000000000000000000000000000000000000") {
    console.error("ERROR: Please set POKEBALL_GAME_PROXY to your deployed proxy address!");
    process.exit(1);
  }

  // Get deployer/owner account
  const [deployer] = await ethers.getSigners();
  console.log("Upgrader address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Upgrader balance:", ethers.formatEther(balance), "APE\n");

  // Get current implementation address
  const currentImpl = await upgrades.erc1967.getImplementationAddress(POKEBALL_GAME_PROXY);
  console.log("Current proxy address:        ", POKEBALL_GAME_PROXY);
  console.log("Current implementation address:", currentImpl);

  // Verify ownership
  const PokeballGame = await ethers.getContractFactory("PokeballGame");
  const proxyContract = PokeballGame.attach(POKEBALL_GAME_PROXY);
  const currentOwner = await proxyContract.owner();

  console.log("Contract owner:               ", currentOwner);

  if (deployer.address.toLowerCase() !== currentOwner.toLowerCase()) {
    console.error("\nERROR: Deployer is not the contract owner!");
    console.error("Only the owner can upgrade UUPS contracts.");
    process.exit(1);
  }

  console.log("\n--- Pre-Upgrade State ---\n");

  // Capture pre-upgrade state for verification
  const preUpgradeState = {
    owner: currentOwner,
    treasury: await proxyContract.treasuryWallet(),
    slabNFTManager: await proxyContract.slabNFTManager(),
    apePriceUSD: (await proxyContract.apePriceUSD()).toString(),
    paused: await proxyContract.paused(),
    nextPokemonId: (await proxyContract.nextPokemonId()).toString(),
    totalPlatformFees: (await proxyContract.totalPlatformFees()).toString(),
  };

  console.log("Pre-upgrade state:");
  console.log(JSON.stringify(preUpgradeState, null, 2));

  // Perform upgrade
  console.log("\n--- Performing Upgrade ---\n");

  // For demonstration, we're upgrading to the same contract version
  // In a real upgrade, you would use PokeballGameV2:
  // const PokeballGameV2 = await ethers.getContractFactory("PokeballGameV2");
  // const upgraded = await upgrades.upgradeProxy(POKEBALL_GAME_PROXY, PokeballGameV2);

  // Using the same contract for demonstration
  console.log("Upgrading to new PokeballGame implementation...");

  const upgraded = await upgrades.upgradeProxy(POKEBALL_GAME_PROXY, PokeballGame, {
    kind: "uups",
  });

  await upgraded.waitForDeployment();

  // Get new implementation address
  const newImpl = await upgrades.erc1967.getImplementationAddress(POKEBALL_GAME_PROXY);

  console.log("\nUpgrade complete!");
  console.log("New implementation address:", newImpl);

  // Verify implementation changed (if it's a new version)
  if (newImpl.toLowerCase() === currentImpl.toLowerCase()) {
    console.log("\n⚠️  Implementation address unchanged (same version deployed)");
  } else {
    console.log("\n✅ Implementation address changed successfully!");
  }

  // Verify state preservation
  console.log("\n--- Post-Upgrade State Verification ---\n");

  const postUpgradeState = {
    owner: await proxyContract.owner(),
    treasury: await proxyContract.treasuryWallet(),
    slabNFTManager: await proxyContract.slabNFTManager(),
    apePriceUSD: (await proxyContract.apePriceUSD()).toString(),
    paused: await proxyContract.paused(),
    nextPokemonId: (await proxyContract.nextPokemonId()).toString(),
    totalPlatformFees: (await proxyContract.totalPlatformFees()).toString(),
  };

  console.log("Post-upgrade state:");
  console.log(JSON.stringify(postUpgradeState, null, 2));

  // Compare states
  const stateMatch =
    preUpgradeState.owner === postUpgradeState.owner &&
    preUpgradeState.treasury === postUpgradeState.treasury &&
    preUpgradeState.slabNFTManager === postUpgradeState.slabNFTManager &&
    preUpgradeState.apePriceUSD === postUpgradeState.apePriceUSD &&
    preUpgradeState.paused === postUpgradeState.paused &&
    preUpgradeState.nextPokemonId === postUpgradeState.nextPokemonId &&
    preUpgradeState.totalPlatformFees === postUpgradeState.totalPlatformFees;

  if (stateMatch) {
    console.log("\n✅ State preserved correctly after upgrade!");
  } else {
    console.log("\n❌ WARNING: State mismatch detected after upgrade!");
    console.log("Pre-upgrade: ", preUpgradeState);
    console.log("Post-upgrade:", postUpgradeState);
  }

  // Output summary
  console.log("\n============================================");
  console.log("  Upgrade Summary");
  console.log("============================================\n");

  const upgradeInfo = {
    network: "ApeChain Mainnet (33139)",
    timestamp: new Date().toISOString(),
    upgrader: deployer.address,
    proxy: POKEBALL_GAME_PROXY,
    previousImplementation: currentImpl,
    newImplementation: newImpl,
    statePreserved: stateMatch,
  };

  console.log(JSON.stringify(upgradeInfo, null, 2));

  // Verification command
  console.log("\n--- Contract Verification ---\n");
  console.log("Verify new implementation on Apescan:\n");
  console.log(`npx hardhat verify --network apechain ${newImpl}`);

  return upgradeInfo;
}

// Execute upgrade
main()
  .then((result) => {
    console.log("\n============================================");
    console.log("  Upgrade Complete!");
    console.log("============================================\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n============================================");
    console.error("  Upgrade Failed!");
    console.error("============================================\n");
    console.error(error);
    process.exit(1);
  });

/**
 * ============================================
 * CREATING A NEW VERSION (PokeballGameV2)
 * ============================================
 *
 * To create a new version for upgrade:
 *
 * 1. Create contracts/PokeballGameV2.sol:
 *    - Copy PokeballGame.sol
 *    - Rename contract to PokeballGameV2
 *    - Update @custom:version to 2.0.0
 *    - Add new state variables AFTER existing ones
 *    - Add reinitializer function if new initialization needed
 *    - NEVER remove or reorder existing state variables!
 *
 * 2. Example V2 changes:
 *
 *    // Add new state variable at the end (before __gap)
 *    uint256 public newFeature;
 *
 *    // Reduce __gap size by the number of new slots used
 *    uint256[48] private __gap; // was [49]
 *
 *    // Optional: reinitializer for new version
 *    function initializeV2(uint256 _newFeature) external reinitializer(2) {
 *        newFeature = _newFeature;
 *    }
 *
 * 3. Test thoroughly on testnet before mainnet upgrade!
 *
 * 4. Update this script:
 *    - Import PokeballGameV2 contract factory
 *    - Use it in upgradeProxy() call
 *    - Call initializeV2() if needed after upgrade
 */
