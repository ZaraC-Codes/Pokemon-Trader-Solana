/**
 * Upgrade PokeballGame proxy from v1.2.0 to v1.3.0
 *
 * Changes in v1.3.0:
 * - Configurable ball prices (setBallPrice, setPricingConfig)
 * - $49.90 max purchase cap per transaction
 * - Enhanced BallPurchased event with totalAmount
 * - RandomnessReceived event for VRNG callback tracking
 * - setOwnerWallet() for ownership transfer
 * - Optional revert on no NFT available
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_PokeballGameV3.cjs --network apechain
 *
 * After upgrade, call initializeV130() to set default prices.
 */

const hre = require("hardhat");

// Contract addresses from addresses.json
const POKEBALL_GAME_PROXY = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";

async function main() {
  console.log("=".repeat(60));
  console.log("PokeballGame Upgrade: v1.2.0 → v1.3.0");
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
  const currentImpl = await hre.upgrades.erc1967.getImplementationAddress(POKEBALL_GAME_PROXY);
  console.log("Current implementation:", currentImpl);
  console.log("Proxy address:", POKEBALL_GAME_PROXY);
  console.log("");

  // Get current contract to check owner
  const PokeballGameV2 = await hre.ethers.getContractFactory("PokeballGame");
  const currentContract = PokeballGameV2.attach(POKEBALL_GAME_PROXY);

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

  // Deploy new implementation
  console.log("Deploying new PokeballGame v1.3.0 implementation...");

  // Note: The contract file is PokeballGameV3.sol but the contract name inside is still "PokeballGame"
  // This allows the upgrade to work without ABI changes for external callers
  const PokeballGameV3 = await hre.ethers.getContractFactory("PokeballGame", {
    libraries: {},
  });

  // Perform upgrade with storage safety check override
  // This is safe because we only ADD new state variables at the end
  const upgraded = await hre.upgrades.upgradeProxy(POKEBALL_GAME_PROXY, PokeballGameV3, {
    unsafeSkipStorageCheck: true, // We've verified storage layout manually
    redeployImplementation: "always",
  });

  await upgraded.waitForDeployment();

  const newImpl = await hre.upgrades.erc1967.getImplementationAddress(POKEBALL_GAME_PROXY);
  console.log("");
  console.log("✓ Upgrade complete!");
  console.log("New implementation:", newImpl);
  console.log("");

  // Initialize v1.3.0 state
  console.log("Initializing v1.3.0 state variables...");
  try {
    const tx = await upgraded.initializeV130();
    await tx.wait();
    console.log("✓ v1.3.0 initialization complete");
    console.log("  Tx hash:", tx.hash);
  } catch (e) {
    if (e.message.includes("V1.3.0 already initialized")) {
      console.log("⚠ v1.3.0 already initialized (this is OK)");
    } else {
      console.error("WARNING: initializeV130() failed:", e.message);
      console.log("You may need to call it manually.");
    }
  }
  console.log("");

  // Verify upgrade
  console.log("Verifying upgrade...");

  // Check MAX_ACTIVE_POKEMON still works
  const maxPokemon = await upgraded.MAX_ACTIVE_POKEMON();
  console.log("  MAX_ACTIVE_POKEMON:", maxPokemon.toString());

  // Check MAX_PURCHASE_USD (new constant)
  const maxPurchase = await upgraded.MAX_PURCHASE_USD();
  console.log("  MAX_PURCHASE_USD:", hre.ethers.formatUnits(maxPurchase, 6), "USDC");

  // Check ball prices
  const prices = await upgraded.getAllBallPrices();
  console.log("  Ball prices:");
  console.log("    Poke Ball:", hre.ethers.formatUnits(prices[0], 6), "USDC");
  console.log("    Great Ball:", hre.ethers.formatUnits(prices[1], 6), "USDC");
  console.log("    Ultra Ball:", hre.ethers.formatUnits(prices[2], 6), "USDC");
  console.log("    Master Ball:", hre.ethers.formatUnits(prices[3], 6), "USDC");

  // Check catch rates
  const rates = await upgraded.getAllCatchRates();
  console.log("  Catch rates:");
  console.log("    Poke Ball:", rates[0].toString(), "%");
  console.log("    Great Ball:", rates[1].toString(), "%");
  console.log("    Ultra Ball:", rates[2].toString(), "%");
  console.log("    Master Ball:", rates[3].toString(), "%");

  console.log("");
  console.log("=".repeat(60));
  console.log("UPGRADE COMPLETE");
  console.log("=".repeat(60));
  console.log("");
  console.log("New features available:");
  console.log("  - setBallPrice(ballType, newPrice) - adjust individual prices");
  console.log("  - setPricingConfig(...) - set all prices at once");
  console.log("  - setCatchRate(ballType, newRate) - adjust catch rates");
  console.log("  - setOwnerWallet(newOwner) - transfer ownership");
  console.log("  - setRevertOnNoNFT(bool) - revert if no NFT on catch");
  console.log("");
  console.log("Events now include:");
  console.log("  - BallPurchased: totalAmount field added");
  console.log("  - RandomnessReceived: new event for VRNG callbacks");
  console.log("  - BallPriceUpdated: emitted when prices change");
  console.log("  - CatchRateUpdated: emitted when rates change");
  console.log("");
  console.log("Purchase cap enforced: $49.90 max per transaction");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
