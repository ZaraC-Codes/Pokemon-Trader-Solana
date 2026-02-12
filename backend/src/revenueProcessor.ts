/**
 * Revenue Processor — core pipeline:
 *   1. Withdraw SolBalls from game account
 *   2. Swap SolBalls -> USDC via Jupiter
 *   3. Split USDC into treasury / NFT pool / SOL reserve
 */
import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Transaction } from "@solana/web3.js";
import { SolanaClient } from "./solanaClient.js";
import {
  SOLBALLS_MINT,
  USDC_MINT,
  TREASURY_WALLET_A,
  TREASURY_WALLET_B,
  JUPITER_BASE_URL,
  JUPITER_API_KEY,
  JUPITER_SLIPPAGE_BPS,
  MIN_SOLBALLS_TO_SWAP,
  REVENUE_TREASURY_PCT,
  REVENUE_NFT_POOL_PCT,
  REVENUE_RESERVES_PCT,
} from "./config.js";

export interface SwapResult {
  solballsSpent: bigint;
  usdcReceived: bigint;
  txSignature: string;
  route: string;
}

export interface SplitResult {
  treasuryAmount: bigint;
  treasuryAAmount: bigint;
  treasuryBAmount: bigint;
  nftPoolAmount: bigint;
  solReserveAmount: bigint;
  treasuryATx: string;
  treasuryBTx: string;
  solReserveTx: string | null;
}

/**
 * Calculate USDC split amounts.
 * Exported for testing.
 */
export function splitUsdcAmounts(totalUsdc: bigint): {
  treasury: bigint;
  nftPool: bigint;
  solReserve: bigint;
} {
  const treasury = (totalUsdc * BigInt(REVENUE_TREASURY_PCT)) / 100n;
  const solReserve = (totalUsdc * BigInt(REVENUE_RESERVES_PCT)) / 100n;
  // NFT pool gets the remainder to avoid rounding loss
  const nftPool = totalUsdc - treasury - solReserve;
  return { treasury, nftPool, solReserve };
}

/**
 * Check if we should run a swap based on current game balance.
 * Exported for testing.
 */
export function shouldRunSwap(currentSolBalls: bigint): boolean {
  return currentSolBalls >= MIN_SOLBALLS_TO_SWAP;
}

/**
 * Get a swap quote from Jupiter.
 */
async function getJupiterQuote(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: bigint
): Promise<any> {
  const params = new URLSearchParams({
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: amount.toString(),
    slippageBps: JUPITER_SLIPPAGE_BPS.toString(),
  });

  const headers: Record<string, string> = {};
  if (JUPITER_API_KEY) {
    headers["x-api-key"] = JUPITER_API_KEY;
  }

  const resp = await fetch(`${JUPITER_BASE_URL}/quote?${params}`, { headers });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Jupiter quote failed (${resp.status}): ${body}`);
  }

  return resp.json();
}

/**
 * Build a swap transaction from Jupiter.
 */
async function getJupiterSwapTx(
  quoteResponse: any,
  userPublicKey: PublicKey
): Promise<Buffer> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (JUPITER_API_KEY) {
    headers["x-api-key"] = JUPITER_API_KEY;
  }

  const resp = await fetch(`${JUPITER_BASE_URL}/swap`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: userPublicKey.toBase58(),
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Jupiter swap failed (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  return Buffer.from(data.swapTransaction, "base64");
}

/**
 * Run the full swap pipeline: withdraw SolBalls -> swap to USDC via Jupiter.
 */
export async function runSwap(client: SolanaClient): Promise<SwapResult> {
  // 1. Check game SolBalls balance
  const gameBalance = await client.getGameSolballsBalance();
  console.log(
    `  Game SolCatch balance: ${Number(gameBalance) / 1e9} SOLCATCH`
  );

  if (!shouldRunSwap(gameBalance)) {
    throw new Error(
      `Game balance (${Number(gameBalance) / 1e9}) below threshold (${Number(MIN_SOLBALLS_TO_SWAP) / 1e9})`
    );
  }

  // 2. Withdraw SolBalls to backend wallet
  // Leave a small buffer (1 SOLCATCH) in case of rounding
  const withdrawAmount = gameBalance - 1_000_000_000n;
  console.log(
    `  Withdrawing ${Number(withdrawAmount) / 1e9} SOLCATCH to backend wallet...`
  );

  const withdrawTx = await client.withdrawRevenue(withdrawAmount);
  console.log(`  Withdraw TX: ${withdrawTx}`);

  // 3. Get Jupiter quote for SolBalls -> USDC
  console.log("  Getting Jupiter quote...");
  const quote = await getJupiterQuote(SOLBALLS_MINT, USDC_MINT, withdrawAmount);

  const outAmount = BigInt(quote.outAmount);
  const routeLabel =
    quote.routePlan
      ?.map((r: any) => r.swapInfo?.label || "unknown")
      .join(" -> ") || "direct";

  console.log(`  Quote: ${Number(withdrawAmount) / 1e9} SOLCATCH -> ${Number(outAmount) / 1e6} USDC`);
  console.log(`  Route: ${routeLabel}`);
  console.log(`  Price impact: ${quote.priceImpactPct || "N/A"}%`);

  // 4. Build and execute swap transaction
  console.log("  Executing swap...");
  const swapTxBytes = await getJupiterSwapTx(quote, client.wallet.publicKey);
  const swapSig = await client.signAndSendTransaction(swapTxBytes);
  console.log(`  Swap TX: ${swapSig}`);

  return {
    solballsSpent: withdrawAmount,
    usdcReceived: outAmount,
    txSignature: swapSig,
    route: routeLabel,
  };
}

/**
 * Split USDC in backend wallet:
 *   3% treasury (1.5% wallet A + 1.5% wallet B) as USDC
 *   96% NFT pool (stays in backend wallet as USDC for Gacha)
 *   1% SOL reserve (swapped from USDC to SOL for gas fees)
 */
export async function runSplit(
  client: SolanaClient,
  totalUsdc: bigint
): Promise<SplitResult> {
  const { treasury, nftPool, solReserve } = splitUsdcAmounts(totalUsdc);

  // Split treasury 50/50 between partners (remainder to B to avoid rounding loss)
  const treasuryA = treasury / 2n;
  const treasuryB = treasury - treasuryA;

  console.log(`  Splitting ${Number(totalUsdc) / 1e6} USDC:`);
  console.log(
    `    Treasury A (1.5%): ${Number(treasuryA) / 1e6} USDC -> ${TREASURY_WALLET_A.toBase58().slice(0, 8)}...`
  );
  console.log(
    `    Treasury B (1.5%): ${Number(treasuryB) / 1e6} USDC -> ${TREASURY_WALLET_B.toBase58().slice(0, 8)}...`
  );
  console.log(
    `    NFT Pool (${REVENUE_NFT_POOL_PCT}%): ${Number(nftPool) / 1e6} USDC (stays in wallet)`
  );
  console.log(
    `    SOL Reserve (${REVENUE_RESERVES_PCT}%): ${Number(solReserve) / 1e6} USDC -> SOL`
  );

  const backendUsdcAta = await getAssociatedTokenAddress(
    USDC_MINT,
    client.wallet.publicKey
  );

  // Transfer treasury A USDC
  let treasuryATxSig = "";
  if (treasuryA > 0n) {
    const treasuryAUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      TREASURY_WALLET_A
    );

    const tx = new Transaction().add(
      createTransferInstruction(
        backendUsdcAta,
        treasuryAUsdcAta,
        client.wallet.publicKey,
        treasuryA,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    tx.feePayer = client.wallet.publicKey;
    tx.recentBlockhash = (
      await client.connection.getLatestBlockhash()
    ).blockhash;
    tx.sign(client.wallet);

    treasuryATxSig = await client.connection.sendRawTransaction(
      tx.serialize()
    );
    await client.connection.confirmTransaction(treasuryATxSig, "confirmed");
    console.log(`  Treasury A transfer TX: ${treasuryATxSig}`);
  }

  // Transfer treasury B USDC
  let treasuryBTxSig = "";
  if (treasuryB > 0n) {
    const treasuryBUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      TREASURY_WALLET_B
    );

    const tx = new Transaction().add(
      createTransferInstruction(
        backendUsdcAta,
        treasuryBUsdcAta,
        client.wallet.publicKey,
        treasuryB,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    tx.feePayer = client.wallet.publicKey;
    tx.recentBlockhash = (
      await client.connection.getLatestBlockhash()
    ).blockhash;
    tx.sign(client.wallet);

    treasuryBTxSig = await client.connection.sendRawTransaction(
      tx.serialize()
    );
    await client.connection.confirmTransaction(treasuryBTxSig, "confirmed");
    console.log(`  Treasury B transfer TX: ${treasuryBTxSig}`);
  }

  // Swap SOL reserve portion (USDC -> SOL via Jupiter for gas fees)
  let solReserveTx: string | null = null;
  if (solReserve > 0n) {
    try {
      console.log("  Swapping SOL reserve USDC -> SOL...");
      const solMint = new PublicKey(
        "So11111111111111111111111111111111111111112"
      );
      const quote = await getJupiterQuote(USDC_MINT, solMint, solReserve);
      const swapTxBytes = await getJupiterSwapTx(
        quote,
        client.wallet.publicKey
      );
      solReserveTx = await client.signAndSendTransaction(swapTxBytes);
      console.log(`  SOL reserve swap TX: ${solReserveTx}`);
    } catch (err) {
      console.warn(
        `  SOL reserve swap failed (non-critical): ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // NFT pool USDC stays in the backend wallet (no transfer needed)

  return {
    treasuryAmount: treasury,
    treasuryAAmount: treasuryA,
    treasuryBAmount: treasuryB,
    nftPoolAmount: nftPool,
    solReserveAmount: solReserve,
    treasuryATx: treasuryATxSig,
    treasuryBTx: treasuryBTxSig,
    solReserveTx,
  };
}

/**
 * Full revenue processing pipeline: withdraw + swap + split.
 */
export async function runRevenueProcessor(
  client: SolanaClient
): Promise<{ swap: SwapResult; split: SplitResult } | null> {
  console.log("[RevenueProcessor] Starting revenue processing run...");

  const gameBalance = await client.getGameSolballsBalance();
  if (!shouldRunSwap(gameBalance)) {
    console.log(
      `[RevenueProcessor] Game balance (${Number(gameBalance) / 1e9} SOLCATCH) below threshold. Skipping.`
    );
    return null;
  }

  const swap = await runSwap(client);
  const split = await runSplit(client, swap.usdcReceived);

  console.log("[RevenueProcessor] Revenue processing complete.");
  return { swap, split };
}
