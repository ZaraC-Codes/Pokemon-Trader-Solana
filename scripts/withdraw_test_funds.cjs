/**
 * Withdraw Test Funds Script
 *
 * Allows the owner to withdraw accumulated fees/revenue for recycling during testing.
 * Compatible with ethers v5.x (uses ethers.providers.JsonRpcProvider).
 *
 * Usage:
 *   node scripts/withdraw_test_funds.cjs [action]
 *
 * Actions:
 *   status    - Show current balances (default)
 *   ape       - Withdraw accumulated APE platform fees from PokeballGame (3% of legacy v1.4.x APE payments)
 *   allape    - ⚠️ EMERGENCY ONLY - Withdraw ALL APE from PokeballGame (may include pending refunds)
 *   usdc      - Withdraw accumulated USDC.e platform fees from PokeballGame (3% of all payments)
 *   revenue   - Withdraw ALL USDC.e from SlabNFTManager (97% player pool, keeps NFTs)
 *   revenue:X - Withdraw specific amount X from SlabNFTManager (e.g., revenue:10.50)
 *
 * Notes on APE in PokeballGame:
 *   - Since v1.6.0, players pay Pyth Entropy fees (~0.073 APE) directly via msg.value
 *   - The contract does NOT maintain an APE buffer for entropy fees
 *   - Any APE in the contract is from: (1) legacy v1.4.x platform fees, (2) failed refunds
 *   - The 'allape' command should only be used in emergencies as it drains everything
 *
 * Requirements:
 *   - Must be called from the owner wallet
 *   - Set DEPLOYER_PRIVATE_KEY (or PRIVATE_KEY) in .env.local
 */

require("dotenv").config({ path: ".env.local" });
const { ethers } = require("ethers");
const fs = require("fs");

// Configuration
const RPC_URL =
  process.env.APECHAIN_RPC_URL || "https://apechain.calderachain.xyz/http";
// Support both PRIVATE_KEY and DEPLOYER_PRIVATE_KEY for flexibility
const PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

const POKEBALL_GAME_PROXY = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const SLAB_NFT_MANAGER_PROXY = "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71";
const USDC_ADDRESS = "0xF1815bd50389c46847f0Bda824eC8da914045D14";

// Load ABIs
const POKEBALL_ABI = JSON.parse(
  fs.readFileSync("./contracts/abi/abi_PokeballGameV6.json", "utf-8"),
);
// Use V2 ABI with emergencyWithdrawRevenue functions (raw array, not Hardhat artifact)
const SLAB_ABI = JSON.parse(
  fs.readFileSync("./contracts/abi/abi_SlabNFTManagerV2.json", "utf-8"),
);

// Simple ERC-20 ABI for balance checks
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

async function getStatus(provider, signerAddress) {
  console.log("\n=== CURRENT BALANCES ===\n");
  console.log(`Owner/Signer: ${signerAddress}`);

  // Get contracts
  const pokeballGame = new ethers.Contract(
    POKEBALL_GAME_PROXY,
    POKEBALL_ABI,
    provider,
  );
  const slabNFTManager = new ethers.Contract(
    SLAB_NFT_MANAGER_PROXY,
    SLAB_ABI,
    provider,
  );
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);

  // PokeballGame balances
  const pokeballAPEBalance = await provider.getBalance(POKEBALL_GAME_PROXY);
  const accumulatedAPEFees = await pokeballGame.accumulatedAPEFees();
  const accumulatedUSDCFees = await pokeballGame.accumulatedUSDCFees();

  // SlabNFTManager balances
  const slabUSDCBalance = await usdcContract.balanceOf(SLAB_NFT_MANAGER_PROXY);
  const inventoryCount = await slabNFTManager.getInventoryCount();

  // Treasury wallet
  const treasuryWallet = await pokeballGame.treasuryWallet();
  const treasuryAPE = await provider.getBalance(treasuryWallet);
  const treasuryUSDC = await usdcContract.balanceOf(treasuryWallet);

  // Signer balances (skip if read-only mode)
  let signerAPE = 0n;
  let signerUSDC = 0n;
  if (signerAddress !== "N/A (read-only mode)") {
    signerAPE = await provider.getBalance(signerAddress);
    signerUSDC = await usdcContract.balanceOf(signerAddress);
  }

  console.log("\n--- PokeballGame ---");
  console.log(
    `  Total APE Balance:     ${ethers.utils.formatEther(pokeballAPEBalance)} APE`,
  );
  console.log(
    `  ├─ Platform Fees:      ${ethers.utils.formatEther(accumulatedAPEFees)} APE (3% of legacy v1.4.x APE payments)`,
  );
  const unaccountedAPE = pokeballAPEBalance - accumulatedAPEFees;
  if (unaccountedAPE > 0n) {
    console.log(
      `  └─ Other (refunds):    ${ethers.utils.formatEther(unaccountedAPE)} APE`,
    );
  }
  console.log(
    `  USDC.e Platform Fees:  $${Number(accumulatedUSDCFees) / 1e6} USDC.e (3% of all payments)`,
  );

  console.log("\n--- SlabNFTManager (97% Player Pool) ---");
  console.log(
    `  USDC.e Balance:        $${Number(slabUSDCBalance) / 1e6} USDC.e`,
  );
  console.log(`  NFT Inventory:         ${inventoryCount} NFTs`);
  console.log(`  Auto-Purchase Status:  ${Number(slabUSDCBalance) >= 51_000_000 ? '✓ Ready (>=$51)' : `$${(51 - Number(slabUSDCBalance) / 1e6).toFixed(2)} more needed`}`);

  console.log("\n--- Treasury Wallet ---");
  console.log(`  Address:               ${treasuryWallet}`);
  console.log(
    `  APE Balance:           ${ethers.utils.formatEther(treasuryAPE)} APE`,
  );
  console.log(`  USDC.e Balance:        $${Number(treasuryUSDC) / 1e6} USDC.e`);

  if (signerAddress !== "N/A (read-only mode)") {
    console.log("\n--- Your Wallet (Signer) ---");
    console.log(`  Address:               ${signerAddress}`);
    console.log(
      `  APE Balance:           ${ethers.utils.formatEther(signerAPE)} APE`,
    );
    console.log(`  USDC.e Balance:        $${Number(signerUSDC) / 1e6} USDC.e`);
  }

  // Summary
  console.log("\n=== WITHDRAWAL OPTIONS ===\n");
  console.log("Platform Fees (3%):");
  if (accumulatedAPEFees > 0n) {
    console.log(
      `  node scripts/withdraw_test_funds.cjs ape       # Withdraw ${ethers.utils.formatEther(
        accumulatedAPEFees,
      )} APE fees`,
    );
  } else {
    console.log(`  ape       - No APE platform fees to withdraw`);
  }
  if (accumulatedUSDCFees > 0n) {
    console.log(
      `  node scripts/withdraw_test_funds.cjs usdc      # Withdraw $${
        Number(accumulatedUSDCFees) / 1e6
      } USDC.e fees`,
    );
  } else {
    console.log(`  usdc      - No USDC.e platform fees to withdraw`);
  }

  console.log("\nPlayer Pool (97%):");
  if (slabUSDCBalance > 0n) {
    console.log(
      `  node scripts/withdraw_test_funds.cjs revenue   # Withdraw $${
        Number(slabUSDCBalance) / 1e6
      } USDC.e from SlabNFTManager`,
    );
  } else {
    console.log(`  revenue   - No revenue to withdraw from SlabNFTManager`);
  }

  if (pokeballAPEBalance > 0n) {
    console.log("\n⚠️  Emergency Only:");
    console.log(
      `  node scripts/withdraw_test_funds.cjs allape    # Drain ALL ${ethers.utils.formatEther(
        pokeballAPEBalance,
      )} APE (use with caution!)`,
    );
  }
}

async function withdrawAPEFees(signer) {
  console.log("\n=== WITHDRAWING APE FEES ===\n");

  const pokeballGame = new ethers.Contract(
    POKEBALL_GAME_PROXY,
    POKEBALL_ABI,
    signer,
  );

  const accumulatedAPEFees = await pokeballGame.accumulatedAPEFees();
  if (accumulatedAPEFees === 0n) {
    console.log("No APE fees to withdraw.");
    return;
  }

  console.log(
    `Withdrawing ${ethers.utils.formatEther(accumulatedAPEFees)} APE fees...`,
  );

  const tx = await pokeballGame.withdrawAPEFees();
  console.log(`Transaction: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`✅ Success! Gas used: ${receipt.gasUsed.toString()}`);
}

async function withdrawAllAPE(signer, provider) {
  console.log("\n=== ⚠️  EMERGENCY WITHDRAW ALL APE ⚠️  ===\n");
  console.log("WARNING: This withdraws ALL APE from the contract.");
  console.log("         Use 'ape' command for normal platform fee withdrawal.\n");

  const pokeballGame = new ethers.Contract(
    POKEBALL_GAME_PROXY,
    POKEBALL_ABI,
    signer,
  );

  const balance = await provider.getBalance(POKEBALL_GAME_PROXY);
  if (balance === 0n) {
    console.log("No APE to withdraw.");
    return;
  }

  console.log(`⚠️  Withdrawing ALL ${ethers.utils.formatEther(balance)} APE...`);

  const tx = await pokeballGame.withdrawAllAPE();
  console.log(`Transaction: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`✅ Success! Gas used: ${receipt.gasUsed.toString()}`);
}

async function withdrawUSDCFees(signer) {
  console.log("\n=== WITHDRAWING USDC.e FEES ===\n");

  const pokeballGame = new ethers.Contract(
    POKEBALL_GAME_PROXY,
    POKEBALL_ABI,
    signer,
  );

  const accumulatedUSDCFees = await pokeballGame.accumulatedUSDCFees();
  if (accumulatedUSDCFees === 0n) {
    console.log("No USDC.e fees to withdraw.");
    return;
  }

  console.log(
    `Withdrawing $${Number(accumulatedUSDCFees) / 1e6} USDC.e fees...`,
  );

  const tx = await pokeballGame.withdrawUSDCFees();
  console.log(`Transaction: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`✅ Success! Gas used: ${receipt.gasUsed.toString()}`);
}

async function withdrawRevenue(signer, amount) {
  console.log("\n=== WITHDRAWING REVENUE FROM SLAB NFT MANAGER ===\n");

  const slabNFTManager = new ethers.Contract(
    SLAB_NFT_MANAGER_PROXY,
    SLAB_ABI,
    signer,
  );
  const usdcContract = new ethers.Contract(
    USDC_ADDRESS,
    ERC20_ABI,
    signer.provider,
  );

  const balance = await usdcContract.balanceOf(SLAB_NFT_MANAGER_PROXY);
  if (balance === 0n) {
    console.log("No USDC.e to withdraw from SlabNFTManager.");
    return;
  }

  let tx;
  if (amount === "all") {
    console.log(
      `Withdrawing ALL $${Number(balance) / 1e6} USDC.e (keeping NFTs)...`,
    );
    tx = await slabNFTManager.emergencyWithdrawAllRevenue();
  } else {
    const amountWei = BigInt(Math.floor(parseFloat(amount) * 1e6));
    if (amountWei > balance) {
      console.log(
        `Error: Requested $${amount} but only $${
          Number(balance) / 1e6
        } available.`,
      );
      return;
    }
    console.log(`Withdrawing $${amount} USDC.e (keeping NFTs)...`);
    tx = await slabNFTManager.emergencyWithdrawRevenue(amountWei);
  }

  console.log(`Transaction: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`✅ Success! Gas used: ${receipt.gasUsed.toString()}`);
}

async function main() {
  // Parse action
  const action = process.argv[2] || "status";

  // Setup provider (ethers v5 uses ethers.providers.JsonRpcProvider)
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  // Setup signer (required for write operations)
  let signer = null;
  if (PRIVATE_KEY && action !== "status") {
    signer = new ethers.Wallet(PRIVATE_KEY, provider);
    const signerAddress = await signer.getAddress();

    // Verify signer is owner
    const pokeballGame = new ethers.Contract(
      POKEBALL_GAME_PROXY,
      POKEBALL_ABI,
      provider,
    );
    const owner = await pokeballGame.owner();

    if (signerAddress.toLowerCase() !== owner.toLowerCase()) {
      console.error(
        `\n❌ Error: Signer (${signerAddress}) is not the owner (${owner})`,
      );
      console.error("Only the owner can withdraw funds.");
      process.exit(1);
    }
  }

  // Get signer address for status display
  const signerAddress = signer
    ? await signer.getAddress()
    : "N/A (read-only mode)";

  // Execute action
  switch (action) {
    case "status":
      await getStatus(provider, signerAddress);
      break;

    case "ape":
      if (!signer) {
        console.error(
          "Error: PRIVATE_KEY required for withdrawals. Set in .env.local",
        );
        process.exit(1);
      }
      await withdrawAPEFees(signer);
      break;

    case "allape":
      if (!signer) {
        console.error(
          "Error: PRIVATE_KEY required for withdrawals. Set in .env.local",
        );
        process.exit(1);
      }
      await withdrawAllAPE(signer, provider);
      break;

    case "usdc":
      if (!signer) {
        console.error(
          "Error: PRIVATE_KEY required for withdrawals. Set in .env.local",
        );
        process.exit(1);
      }
      await withdrawUSDCFees(signer);
      break;

    case "revenue":
      if (!signer) {
        console.error(
          "Error: PRIVATE_KEY required for withdrawals. Set in .env.local",
        );
        process.exit(1);
      }
      await withdrawRevenue(signer, "all");
      break;

    default:
      // Check for revenue:X format
      if (action.startsWith("revenue:")) {
        const amount = action.split(":")[1];
        if (!signer) {
          console.error(
            "Error: PRIVATE_KEY required for withdrawals. Set in .env.local",
          );
          process.exit(1);
        }
        await withdrawRevenue(signer, amount);
      } else {
        console.error(`Unknown action: ${action}`);
        console.log("\nUsage: node scripts/withdraw_test_funds.cjs [action]");
        console.log("\nPlatform Fees (3%):");
        console.log(
          "  ape       - Withdraw APE platform fees from PokeballGame",
        );
        console.log(
          "  usdc      - Withdraw USDC.e platform fees from PokeballGame",
        );
        console.log("\nPlayer Pool (97%):");
        console.log(
          "  revenue   - Withdraw ALL USDC.e from SlabNFTManager (keeps NFTs)",
        );
        console.log(
          "  revenue:X - Withdraw specific amount X from SlabNFTManager",
        );
        console.log("\n⚠️  Emergency Only:");
        console.log(
          "  allape    - Drain ALL APE from PokeballGame (includes pending refunds!)",
        );
        console.log("\nOther:");
        console.log("  status    - Show current balances (default)");
        process.exit(1);
      }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
