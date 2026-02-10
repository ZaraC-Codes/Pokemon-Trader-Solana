/**
 * Pre-approve WAPE to Camelot Router for PokeballGame
 *
 * This is a workaround for the v1.5.0 bug where the contract
 * forgot to approve WAPE before swapping via Camelot.
 *
 * Since WAPE.approve() can only be called by the token holder,
 * and the PokeballGame contract doesn't have an external function
 * to call approve, we need to upgrade the contract to fix this.
 *
 * This script just shows the issue - the real fix requires redeploying.
 */

const hre = require("hardhat");

const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const CAMELOT_ROUTER = "0xC69Dc28924930583024E067b2B3d773018F4EB52";
const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";

async function main() {
  console.log("=".repeat(60));
  console.log("WAPE APPROVAL STATUS CHECK");
  console.log("=".repeat(60));

  // Check current WAPE allowance from PokeballGame to Camelot
  const wape = await hre.ethers.getContractAt("IERC20", WAPE);

  const allowance = await wape.allowance(POKEBALL_GAME, CAMELOT_ROUTER);
  console.log("\nCurrent WAPE allowance:");
  console.log("  From:", POKEBALL_GAME, "(PokeballGame)");
  console.log("  To:", CAMELOT_ROUTER, "(Camelot Router)");
  console.log("  Amount:", hre.ethers.formatEther(allowance), "WAPE");

  if (allowance === 0n) {
    console.log("\n❌ WAPE NOT APPROVED!");
    console.log("The PokeballGame contract needs to approve WAPE to Camelot.");
    console.log("This requires a contract upgrade to add the approve call.");
  } else {
    console.log("\n✅ WAPE is approved!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
