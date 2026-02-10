/**
 * Upgrade PokeballGame to v1.6.0 (Pyth Entropy Integration)
 *
 * This script:
 * 1. Compiles PokeballGameV6.sol
 * 2. Upgrades the proxy to the new implementation
 * 3. Calls initializeV160() to configure Pyth Entropy
 *
 * Prerequisites:
 * - Current implementation: v1.5.0
 * - Deployer wallet with sufficient APE for gas
 * - Pyth Entropy contract address for ApeChain
 *
 * Usage:
 * npx hardhat run contracts/deployment/upgrade_PokeballGameV6.cjs --network apechain
 */

const hre = require("hardhat");

// Contract addresses
const PROXY_ADDRESS = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";

// Pyth Entropy on ApeChain
// Source: https://entropy-explorer.pyth.network/
const PYTH_ENTROPY_ADDRESS = "0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320";

async function main() {
  console.log("=".repeat(60));
  console.log("UPGRADING POKEBALLGAME TO v1.6.0 (Pyth Entropy)");
  console.log("=".repeat(60));

  const [deployer] = await hre.ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "APE");

  // Get proxy contract
  console.log("\nProxy address:", PROXY_ADDRESS);
  console.log("Pyth Entropy:", PYTH_ENTROPY_ADDRESS);

  // Compile and deploy new implementation
  console.log("\n[1/4] Compiling PokeballGameV6...");
  const PokeballGameV6 = await hre.ethers.getContractFactory(
    "contracts/PokeballGameV6.sol:PokeballGame"
  );

  // Get current implementation
  const currentImpl = await hre.upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("Current implementation:", currentImpl);

  // Upgrade
  console.log("\n[2/4] Upgrading proxy to v1.6.0...");
  const upgraded = await hre.upgrades.upgradeProxy(PROXY_ADDRESS, PokeballGameV6, {
    unsafeAllow: ["constructor"],
    redeployImplementation: "always",
  });

  await upgraded.waitForDeployment();
  const newImpl = await hre.upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("New implementation:", newImpl);

  // Initialize v1.6.0
  console.log("\n[3/4] Initializing v1.6.0 (Pyth Entropy)...");
  const initTx = await upgraded.initializeV160(PYTH_ENTROPY_ADDRESS);
  await initTx.wait();
  console.log("initializeV160 tx:", initTx.hash);

  // Verify
  console.log("\n[4/4] Verifying configuration...");

  const entropyAddr = await upgraded.entropy();
  console.log("  entropy():", entropyAddr);

  const providerAddr = await upgraded.entropyProvider();
  console.log("  entropyProvider():", providerAddr);

  const throwFee = await upgraded.getThrowFee();
  console.log("  getThrowFee():", hre.ethers.formatEther(throwFee), "APE");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("UPGRADE COMPLETE");
  console.log("=".repeat(60));
  console.log("\nPokeballGame v1.6.0 is now live!");
  console.log("  Proxy:", PROXY_ADDRESS);
  console.log("  Implementation:", newImpl);
  console.log("  Pyth Entropy:", entropyAddr);
  console.log("  Default Provider:", providerAddr);
  console.log("  Throw Fee:", hre.ethers.formatEther(throwFee), "APE");
  console.log("\nChanges from v1.5.0:");
  console.log("  - Replaced POP VRNG with Pyth Entropy");
  console.log("  - No whitelist required for randomness");
  console.log("  - throwBall() now requires msg.value for Entropy fee");
  console.log("  - spawnPokemon() now requires msg.value for Entropy fee");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nUpgrade failed:", error);
    process.exit(1);
  });
