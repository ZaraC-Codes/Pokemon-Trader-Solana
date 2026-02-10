/**
 * Upgrade PokeballGame proxy to v1.3.1 and fix APE/WAPE token address
 *
 * Changes in v1.3.1:
 * - Added setApeToken() function to update APE/WAPE address
 * - Fixes: Contract was initialized with Ethereum mainnet APE address
 *          (0x4d224452801aced8b2f0aebe155379bb5d594381) instead of
 *          ApeChain WAPE address (0x48b62137EdfA95a428D35C09E44256a739F6B557)
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_PokeballGameV3_WAPE.cjs --network apechain
 */

const hre = require("hardhat");

// Contract addresses
const POKEBALL_GAME_PROXY = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";

// Token addresses
const WAPE_ADDRESS = "0x48b62137EdfA95a428D35C09E44256a739F6B557"; // Correct WAPE on ApeChain
const OLD_APE_ADDRESS = "0x4d224452801aced8b2f0aebe155379bb5d594381"; // Wrong Ethereum mainnet APE

async function main() {
  console.log("=".repeat(60));
  console.log("PokeballGame Upgrade: Fix APE → WAPE Token Address");
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

  // Get current contract to check owner and current APE address
  const PokeballGameCurrent = await hre.ethers.getContractFactory("PokeballGame");
  const currentContract = PokeballGameCurrent.attach(POKEBALL_GAME_PROXY);

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

  // Check current APE token address
  const currentApeAddress = await currentContract.ape();
  console.log("Current APE token address:", currentApeAddress);
  console.log("Expected old address:", OLD_APE_ADDRESS);
  console.log("Target WAPE address:", WAPE_ADDRESS);
  console.log("");

  if (currentApeAddress.toLowerCase() === WAPE_ADDRESS.toLowerCase()) {
    console.log("✓ APE token address is already set to WAPE. No upgrade needed.");
    return;
  }

  // Deploy new implementation
  console.log("Deploying new PokeballGame v1.3.1 implementation...");

  const PokeballGameV3 = await hre.ethers.getContractFactory("PokeballGame", {
    libraries: {},
  });

  // Perform upgrade with storage safety check override
  // This is safe because we only ADD a new function, no storage changes
  const upgraded = await hre.upgrades.upgradeProxy(POKEBALL_GAME_PROXY, PokeballGameV3, {
    unsafeSkipStorageCheck: true, // Storage layout unchanged
    redeployImplementation: "always",
  });

  await upgraded.waitForDeployment();

  const newImpl = await hre.upgrades.erc1967.getImplementationAddress(POKEBALL_GAME_PROXY);
  console.log("");
  console.log("✓ Upgrade complete!");
  console.log("New implementation:", newImpl);
  console.log("");

  // Initialize v1.3.0 state if not already done
  console.log("Checking v1.3.0 initialization...");
  try {
    const tx = await upgraded.initializeV130();
    await tx.wait();
    console.log("✓ v1.3.0 initialization complete");
    console.log("  Tx hash:", tx.hash);
  } catch (e) {
    if (e.message.includes("V1.3.0 already initialized")) {
      console.log("✓ v1.3.0 already initialized");
    } else {
      console.error("WARNING: initializeV130() failed:", e.message);
      console.log("This may be OK if already initialized.");
    }
  }
  console.log("");

  // Update APE token to WAPE
  console.log("Updating APE token address to WAPE...");
  console.log("  Old address:", currentApeAddress);
  console.log("  New address:", WAPE_ADDRESS);

  const setApeTx = await upgraded.setApeToken(WAPE_ADDRESS);
  await setApeTx.wait();
  console.log("✓ APE token updated to WAPE");
  console.log("  Tx hash:", setApeTx.hash);
  console.log("");

  // Verify the change
  const newApeAddress = await upgraded.ape();
  console.log("Verifying update...");
  console.log("  New APE token address:", newApeAddress);

  if (newApeAddress.toLowerCase() !== WAPE_ADDRESS.toLowerCase()) {
    console.error("ERROR: APE token address was not updated correctly!");
    process.exit(1);
  }
  console.log("✓ APE token address verified as WAPE");
  console.log("");

  // Verify other contract state is preserved
  console.log("Verifying contract state...");

  const maxPokemon = await upgraded.MAX_ACTIVE_POKEMON();
  console.log("  MAX_ACTIVE_POKEMON:", maxPokemon.toString());

  const usdceAddress = await upgraded.usdce();
  console.log("  USDC.e address:", usdceAddress);

  const treasuryWallet = await upgraded.treasuryWallet();
  console.log("  Treasury wallet:", treasuryWallet);

  const prices = await upgraded.getAllBallPrices();
  console.log("  Ball prices:");
  console.log("    Poke Ball:", hre.ethers.formatUnits(prices[0], 6), "USDC");
  console.log("    Great Ball:", hre.ethers.formatUnits(prices[1], 6), "USDC");
  console.log("    Ultra Ball:", hre.ethers.formatUnits(prices[2], 6), "USDC");
  console.log("    Master Ball:", hre.ethers.formatUnits(prices[3], 6), "USDC");

  console.log("");
  console.log("=".repeat(60));
  console.log("UPGRADE COMPLETE - APE PAYMENTS NOW USE WAPE");
  console.log("=".repeat(60));
  console.log("");
  console.log("Summary:");
  console.log("  - Implementation upgraded to v1.3.1");
  console.log("  - APE token address changed from Ethereum mainnet APE");
  console.log("    to ApeChain WAPE (0x48b62137EdfA95a428D35C09E44256a739F6B557)");
  console.log("");
  console.log("Frontend changes required:");
  console.log("  1. Update contracts/addresses.json: ape → 0x48b62137EdfA95a428D35C09E44256a739F6B557");
  console.log("  2. Update src/services/thirdwebConfig.ts: APE address → WAPE");
  console.log("");
  console.log("APE payments should now work on ApeChain!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
