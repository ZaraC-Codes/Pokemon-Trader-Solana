/**
 * Withdraw SolBalls revenue from the game program.
 *
 * Usage:
 *   # Withdraw specific amount (in SolBalls atomic units):
 *   npx ts-node scripts/solana/withdraw-revenue.ts --amount 50000000
 *
 *   # Withdraw all available SolBalls:
 *   npx ts-node scripts/solana/withdraw-revenue.ts --all
 *
 *   # Show balance only (dry run):
 *   npx ts-node scripts/solana/withdraw-revenue.ts --status
 */
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { loadProgram, deriveGamePDAs, formatTokenAmount } from "./common";

async function main() {
  const args = process.argv.slice(2);

  let amount: number | undefined;
  let withdrawAll = false;
  let statusOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--amount" && args[i + 1]) {
      amount = parseInt(args[++i]);
    }
    if (args[i] === "--all") withdrawAll = true;
    if (args[i] === "--status") statusOnly = true;
  }

  if (!amount && !withdrawAll && !statusOnly) {
    console.error(
      "Usage:\n" +
      "  npx ts-node scripts/solana/withdraw-revenue.ts --amount <ATOMIC_UNITS>\n" +
      "  npx ts-node scripts/solana/withdraw-revenue.ts --all\n" +
      "  npx ts-node scripts/solana/withdraw-revenue.ts --status\n" +
      "\n" +
      "Amount is in SolBalls atomic units (6 decimals, e.g. 1000000 = 1.0 SolBalls)"
    );
    process.exit(1);
  }

  const { program, provider, authority } = loadProgram();
  const pdas = deriveGamePDAs(program.programId);

  // Read game config to get SolBalls mint
  const gameConfig = await program.account.gameConfig.fetch(pdas.gameConfig);
  const solballsMint = gameConfig.solballsMint;

  // Derive token accounts
  const gameSolballsAta = await getAssociatedTokenAddress(
    solballsMint,
    pdas.gameConfig,
    true // allowOwnerOffCurve for PDA
  );
  const authoritySolballsAta = await getAssociatedTokenAddress(
    solballsMint,
    authority
  );

  // Get current balance
  let gameBalance: number;
  try {
    const balanceInfo = await provider.connection.getTokenAccountBalance(gameSolballsAta);
    gameBalance = Number(balanceInfo.value.amount);
  } catch {
    gameBalance = 0;
  }

  // Read treasury config
  const treasuryConfig = await program.account.treasuryConfig.fetch(pdas.treasuryConfig);

  console.log("=== Revenue Status ===");
  console.log(`  Authority:         ${authority.toBase58()}`);
  console.log(`  SolBalls Mint:     ${solballsMint.toBase58()}`);
  console.log(`  Game ATA:          ${gameSolballsAta.toBase58()}`);
  console.log(`  Game Balance:      ${formatTokenAmount(gameBalance)} SolBalls`);
  console.log(`  Total Revenue:     ${formatTokenAmount(gameConfig.totalRevenue)} SolBalls`);
  console.log(`  Total Withdrawn:   ${formatTokenAmount(treasuryConfig.totalWithdrawn)} SolBalls`);
  console.log(`  Treasury Wallet:   ${treasuryConfig.treasuryWallet.toBase58()}`);
  console.log("");

  if (statusOnly) {
    console.log("Done (status only).");
    return;
  }

  // Determine withdrawal amount
  let withdrawAmount: number;
  if (withdrawAll) {
    withdrawAmount = gameBalance;
    console.log(`Withdrawing ALL: ${formatTokenAmount(withdrawAmount)} SolBalls`);
  } else {
    withdrawAmount = amount!;
    console.log(`Withdrawing: ${formatTokenAmount(withdrawAmount)} SolBalls`);
  }

  if (withdrawAmount <= 0) {
    console.log("Nothing to withdraw (balance is 0).");
    return;
  }

  if (withdrawAmount > gameBalance) {
    console.error(
      `Error: Requested ${formatTokenAmount(withdrawAmount)} SolBalls ` +
      `but only ${formatTokenAmount(gameBalance)} available.`
    );
    process.exit(1);
  }

  // Check authority has a SolBalls ATA
  try {
    await provider.connection.getTokenAccountBalance(authoritySolballsAta);
  } catch {
    console.error(
      "Error: Authority does not have a SolBalls token account.\n" +
      `  Expected ATA: ${authoritySolballsAta.toBase58()}\n` +
      "  Create one first with: spl-token create-account <SOLBALLS_MINT>"
    );
    process.exit(1);
  }

  try {
    const tx = await program.methods
      .withdrawRevenue(new BN(withdrawAmount))
      .accounts({
        authority,
        gameConfig: pdas.gameConfig,
        treasuryConfig: pdas.treasuryConfig,
        gameSolballsAccount: gameSolballsAta,
        authoritySolballsAccount: authoritySolballsAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log(`\n  [OK] Withdrawn ${formatTokenAmount(withdrawAmount)} SolBalls — TX: ${tx}`);
  } catch (err: any) {
    console.error(`\n  [FAIL] Withdrawal failed: ${err.message || err}`);
    process.exit(1);
  }

  // Show updated balance
  try {
    const newBalance = await provider.connection.getTokenAccountBalance(gameSolballsAta);
    const updatedTreasury = await program.account.treasuryConfig.fetch(pdas.treasuryConfig);
    console.log("");
    console.log("=== Updated Status ===");
    console.log(`  Game Balance:    ${newBalance.value.uiAmountString} SolBalls`);
    console.log(`  Total Withdrawn: ${formatTokenAmount(updatedTreasury.totalWithdrawn)} SolBalls`);
  } catch {
    // Non-critical
  }

  console.log("\nDone.");
}

main().catch(console.error);
