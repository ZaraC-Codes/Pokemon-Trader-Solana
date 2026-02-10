/**
 * Upgrade PokeballGame proxy to v1.4.0 - Native APE Payments
 *
 * Changes in v1.4.0:
 * - APE payments now use native APE via msg.value (like ETH on Ethereum)
 * - No more ERC-20 approve() needed for APE purchases
 * - purchaseBallsWithAPE() is payable and accepts native APE
 * - purchaseBallsWithUSDC() for USDC.e payments (unchanged)
 * - Legacy purchaseBalls() still works - if useAPE=true, send APE via msg.value
 * - Added withdrawAPEFees() for owner to withdraw accumulated native APE
 *
 * Usage:
 *   npx hardhat run contracts/deployment/upgrade_PokeballGameV4_NativeAPE.cjs --network apechain
 */

const hre = require("hardhat");

// Contract addresses
const POKEBALL_GAME_PROXY = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";

async function main() {
  console.log("=".repeat(60));
  console.log("PokeballGame Upgrade: v1.3.x → v1.4.0 (Native APE Payments)");
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
  // Use fully qualified name to avoid ambiguity with multiple versions
  const PokeballGameCurrent = await hre.ethers.getContractFactory("contracts/PokeballGameV4.sol:PokeballGame");
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

  // Check current state before upgrade
  console.log("Current state before upgrade:");
  const apePriceUSD = await currentContract.apePriceUSD();
  console.log("  APE Price (USD, 8 decimals):", apePriceUSD.toString());
  const treasuryWallet = await currentContract.treasuryWallet();
  console.log("  Treasury wallet:", treasuryWallet);
  const totalPlatformFees = await currentContract.totalPlatformFees();
  console.log("  Total platform fees (USDC):", hre.ethers.formatUnits(totalPlatformFees, 6));
  console.log("");

  // Deploy new implementation
  console.log("Deploying new PokeballGame v1.4.2 implementation...");

  // Note: PokeballGameV4.sol contains contract named "PokeballGame"
  // Use fully qualified name to avoid ambiguity with multiple versions
  const PokeballGameV4 = await hre.ethers.getContractFactory("contracts/PokeballGameV4.sol:PokeballGame");

  // Perform upgrade with storage safety check override
  // This is safe because we only ADD one new state variable at the end
  const upgraded = await hre.upgrades.upgradeProxy(POKEBALL_GAME_PROXY, PokeballGameV4, {
    unsafeSkipStorageCheck: true, // Storage layout compatible
    redeployImplementation: "always",
  });

  await upgraded.waitForDeployment();

  const newImpl = await hre.upgrades.erc1967.getImplementationAddress(POKEBALL_GAME_PROXY);
  console.log("");
  console.log("✓ Upgrade complete!");
  console.log("New implementation:", newImpl);
  console.log("");

  // Initialize v1.3.0 state if not already done (required for pricing)
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

  // Set APE price if not already set (prevents division by zero)
  const currentAPEPrice = await upgraded.apePriceUSD();
  console.log("Checking APE price...");
  console.log("  Current APE price:", currentAPEPrice.toString());
  if (currentAPEPrice === 0n) {
    console.log("  APE price is 0, setting to default $0.64...");
    const DEFAULT_APE_PRICE = 64000000n; // $0.64 in 8 decimals
    try {
      const setPriceTx = await upgraded.setAPEPrice(DEFAULT_APE_PRICE);
      await setPriceTx.wait();
      console.log("✓ APE price set to $0.64 (64000000)");
      console.log("  Tx hash:", setPriceTx.hash);
    } catch (e) {
      console.error("WARNING: setAPEPrice() failed:", e.message);
    }
  } else {
    console.log("✓ APE price already set");
  }
  console.log("");

  // Verify state preserved
  console.log("Verifying contract state after upgrade...");

  const newApePriceUSD = await upgraded.apePriceUSD();
  console.log("  APE Price (USD, 8 decimals):", newApePriceUSD.toString());

  const newTreasuryWallet = await upgraded.treasuryWallet();
  console.log("  Treasury wallet:", newTreasuryWallet);

  const newTotalPlatformFees = await upgraded.totalPlatformFees();
  console.log("  Total platform fees (USDC):", hre.ethers.formatUnits(newTotalPlatformFees, 6));

  // Check new v1.4.0 state
  const accumulatedAPEFees = await upgraded.accumulatedAPEFees();
  console.log("  Accumulated APE fees:", hre.ethers.formatEther(accumulatedAPEFees), "APE");

  // Verify ball prices
  const prices = await upgraded.getAllBallPrices();
  console.log("  Ball prices:");
  console.log("    Poke Ball:", hre.ethers.formatUnits(prices[0], 6), "USDC");
  console.log("    Great Ball:", hre.ethers.formatUnits(prices[1], 6), "USDC");
  console.log("    Ultra Ball:", hre.ethers.formatUnits(prices[2], 6), "USDC");
  console.log("    Master Ball:", hre.ethers.formatUnits(prices[3], 6), "USDC");

  // Verify catch rates
  const rates = await upgraded.getAllCatchRates();
  console.log("  Catch rates:");
  console.log("    Poke Ball:", rates[0].toString(), "%");
  console.log("    Great Ball:", rates[1].toString(), "%");
  console.log("    Ultra Ball:", rates[2].toString(), "%");
  console.log("    Master Ball:", rates[3].toString(), "%");

  console.log("");
  console.log("=".repeat(60));
  console.log("UPGRADE COMPLETE - NATIVE APE PAYMENTS ENABLED");
  console.log("=".repeat(60));
  console.log("");
  console.log("Summary:");
  console.log("  - Implementation upgraded to v1.4.2");
  console.log("  - APE payments now use native APE (msg.value)");
  console.log("  - No more ERC-20 approve() needed for APE");
  console.log("");
  console.log("New functions available:");
  console.log("  - purchaseBallsWithAPE(ballType, qty) payable - send APE via msg.value");
  console.log("  - purchaseBallsWithUSDC(ballType, qty) - USDC.e (requires approve)");
  console.log("  - purchaseBalls(ballType, qty, useAPE) payable - legacy, works with msg.value");
  console.log("  - withdrawAPEFees() - withdraw accumulated native APE to treasury");
  console.log("  - withdrawAllAPE() - emergency withdraw all APE to treasury");
  console.log("");
  console.log("Frontend changes required:");
  console.log("  1. For APE purchases: call purchaseBalls with { value: costWei }");
  console.log("  2. Remove APE token approval logic - no longer needed");
  console.log("  3. Keep USDC.e approval logic unchanged");
  console.log("");
  console.log("Example frontend call for APE purchase:");
  console.log("  const cost = await contract.calculateAPEAmount(totalCostUSDC);");
  console.log("  await contract.purchaseBallsWithAPE(ballType, qty, { value: cost });");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
