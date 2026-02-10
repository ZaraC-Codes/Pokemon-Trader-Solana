/**
 * Upgrade PokeballGame to v1.5.0 (Unified Payments + Auto-Swap)
 *
 * This script upgrades the PokeballGame proxy to v1.5.0 with:
 * - Unified payment flow (APE and USDC.e both go to USDC.e)
 * - Auto-swap APE → USDC.e via Camelot DEX
 * - 3% fees accumulated in USDC.e (accumulatedUSDCFees)
 * - 97% revenue auto-sent to SlabNFTManager
 * - Slippage protection for swaps
 *
 * Run: npx hardhat run contracts/deployment/upgrade_PokeballGameV5.cjs --network apechain
 */

const hre = require("hardhat");

// Contract addresses from contracts/addresses.json
const PROXY_ADDRESS = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";

// Camelot DEX addresses on ApeChain
const CAMELOT_ROUTER = "0xC69Dc28924930583024E067b2B3d773018F4EB52"; // SwapRouter (AMMv3)
const WAPE_ADDRESS = "0x48b62137EdfA95a428D35C09E44256a739F6B557"; // Wrapped APE

// Default slippage: 1% (100 basis points)
const DEFAULT_SLIPPAGE_BPS = 100;

// APE price in USD (8 decimals) - $0.64 = 64000000
const APE_PRICE_USD = 64000000;

async function main() {
  console.log("=".repeat(60));
  console.log("UPGRADING PokeballGame TO v1.5.0");
  console.log("=".repeat(60));

  const [deployer] = await hre.ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "APE");

  // Get proxy contract
  console.log("\nProxy address:", PROXY_ADDRESS);

  // Compile and deploy new implementation
  console.log("\n[1/4] Compiling PokeballGameV5...");
  const PokeballGameV5 = await hre.ethers.getContractFactory(
    "contracts/PokeballGameV5.sol:PokeballGame"
  );

  // Get current implementation
  const proxyAdmin = await hre.upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("Current implementation:", proxyAdmin);

  // Upgrade
  console.log("\n[2/4] Upgrading proxy to v1.5.0...");
  const upgraded = await hre.upgrades.upgradeProxy(PROXY_ADDRESS, PokeballGameV5, {
    unsafeAllow: ["constructor"],
  });

  await upgraded.waitForDeployment();
  const newImpl = await hre.upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("New implementation:", newImpl);

  // Initialize v1.5.0 features
  console.log("\n[3/4] Initializing v1.5.0 features...");
  console.log("  Camelot Router:", CAMELOT_ROUTER);
  console.log("  WAPE Address:", WAPE_ADDRESS);
  console.log("  Slippage:", DEFAULT_SLIPPAGE_BPS, "bps (", DEFAULT_SLIPPAGE_BPS / 100, "%)");

  try {
    const tx1 = await upgraded.initializeV150(
      CAMELOT_ROUTER,
      WAPE_ADDRESS,
      DEFAULT_SLIPPAGE_BPS
    );
    await tx1.wait();
    console.log("  ✅ initializeV150() successful");
  } catch (err) {
    if (err.message.includes("Already initialized")) {
      console.log("  ⚠️  Already initialized (skipping)");
    } else {
      throw err;
    }
  }

  // Set APE price if not already set
  console.log("\n[4/4] Setting APE price...");
  try {
    const currentPrice = await upgraded.apePriceUSD();
    if (currentPrice.toString() === "0" || currentPrice.toString() === "64000000") {
      const tx2 = await upgraded.setAPEPrice(APE_PRICE_USD);
      await tx2.wait();
      console.log("  ✅ APE price set to $", APE_PRICE_USD / 1e8);
    } else {
      console.log("  ⚠️  APE price already set:", currentPrice.toString());
    }
  } catch (err) {
    console.log("  ⚠️  Could not set APE price:", err.message);
  }

  // Verify configuration
  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION");
  console.log("=".repeat(60));

  const router = await upgraded.camelotRouter();
  const wape = await upgraded.wape();
  const slippage = await upgraded.swapSlippageBps();
  const apePrice = await upgraded.apePriceUSD();
  const usdcFees = await upgraded.accumulatedUSDCFees();

  console.log("\nCamelot Router:", router);
  console.log("WAPE:", wape);
  console.log("Swap Slippage:", slippage.toString(), "bps");
  console.log("APE Price:", apePrice.toString(), "(", Number(apePrice) / 1e8, "USD)");
  console.log("Accumulated USDC Fees:", usdcFees.toString());

  console.log("\n" + "=".repeat(60));
  console.log("UPGRADE COMPLETE");
  console.log("=".repeat(60));
  console.log("\nProxy:", PROXY_ADDRESS);
  console.log("New Implementation:", newImpl);
  console.log("\nv1.5.0 Features:");
  console.log("  ✅ Unified payment flow (APE + USDC.e → USDC.e)");
  console.log("  ✅ Auto-swap APE → USDC.e via Camelot");
  console.log("  ✅ 3% fees in USDC.e (withdrawUSDCFees())");
  console.log("  ✅ 97% revenue auto-sent to SlabNFTManager");
  console.log("  ✅ Slippage protection:", DEFAULT_SLIPPAGE_BPS / 100, "%");

  // Export ABI
  console.log("\n[OPTIONAL] To generate ABI, run:");
  console.log("  npx hardhat compile");
  console.log("  Then copy artifacts/contracts/PokeballGameV5.sol/PokeballGame.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
