/**
 * Revenue Processor — main entrypoint.
 * Express HTTP server with admin endpoints + cron scheduler.
 */
import express from "express";
import { SolanaClient } from "./solanaClient.js";
import { runRevenueProcessor } from "./revenueProcessor.js";
import { purchaseMultiplePacks } from "./gachaClient.js";
import { mockPurchasePacks } from "./mockGacha.js";
import { depositNewNfts } from "./nftDepositor.js";
import { ensureCentralSpawns } from "./spawnManager.js";
import {
  ADMIN_API_KEY,
  PORT,
  CRON_INTERVAL_MS,
  USDC_MINT,
  PACK_COST_USDC,
  MIN_PACKS_PER_RUN,
  MAX_VAULT_SIZE,
  SKIP_REVENUE_SWAP,
  MOCK_GACHA,
} from "./config.js";

// ── State ──────────────────────────────────────────────────────
let lastSwapTime: Date | null = null;
let lastGachaTime: Date | null = null;
let lastDepositTime: Date | null = null;
let lastSpawnCheckTime: Date | null = null;
let isProcessing = false;

// ── Solana Client (lazy init) ──────────────────────────────────
let client: SolanaClient;

function getClient(): SolanaClient {
  if (!client) {
    client = new SolanaClient();
    console.log(
      `Solana client initialized. Backend wallet: ${client.wallet.publicKey.toBase58()}`
    );
  }
  return client;
}

// ── Auth Middleware ─────────────────────────────────────────────
function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Pipeline: Gacha + Deposit ──────────────────────────────────
async function runGachaPipeline(c: SolanaClient): Promise<{
  packsPurchased: number;
  nftsDeposited: number;
}> {
  // Check vault capacity
  const vault = await c.getNftVault();
  const vaultCount = vault.count;
  const slotsAvailable = (vault.maxSize || MAX_VAULT_SIZE) - vaultCount;

  if (slotsAvailable <= 0) {
    console.log("[Gacha] Vault is full. Skipping.");
    return { packsPurchased: 0, nftsDeposited: 0 };
  }

  // Check NFT pool USDC balance
  const usdcBalance = await c.getWalletTokenBalance(USDC_MINT);
  const packsAffordable = Number(usdcBalance / PACK_COST_USDC);
  const packsToBuy = Math.min(
    packsAffordable,
    slotsAvailable,
    MIN_PACKS_PER_RUN
  );

  if (packsToBuy < MIN_PACKS_PER_RUN) {
    console.log(
      `[Gacha] Insufficient USDC (${Number(usdcBalance) / 1e6}) or vault capacity. ` +
        `Can afford ${packsAffordable} packs, ${slotsAvailable} slots available.`
    );
    return { packsPurchased: 0, nftsDeposited: 0 };
  }

  console.log(`[Gacha] Purchasing ${packsToBuy} pack(s)${MOCK_GACHA ? " (MOCK MODE)" : ""}...`);
  const packs = MOCK_GACHA
    ? await mockPurchasePacks(c, packsToBuy)
    : await purchaseMultiplePacks(c, packsToBuy);
  lastGachaTime = new Date();

  // Deposit any new NFTs
  const deposits = await depositNewNfts(c);
  if (deposits.length > 0) {
    lastDepositTime = new Date();
  }

  return {
    packsPurchased: packs.length,
    nftsDeposited: deposits.length,
  };
}

// ── Full Cron Tick ─────────────────────────────────────────────
async function cronTick(): Promise<void> {
  if (isProcessing) {
    console.log("[Cron] Previous run still in progress. Skipping.");
    return;
  }

  isProcessing = true;
  console.log(`\n[Cron] Tick at ${new Date().toISOString()}`);

  try {
    const c = getClient();

    // Phase 1: Revenue processing (withdraw + swap + split)
    if (SKIP_REVENUE_SWAP) {
      console.log("[Cron] SKIP_REVENUE_SWAP=true — skipping Phase 1 (no swap on devnet)");
    } else {
      const revenueResult = await runRevenueProcessor(c);
      if (revenueResult) {
        lastSwapTime = new Date();
      }
    }

    // Phase 2: Gacha + deposit (runs regardless of phase 1)
    await runGachaPipeline(c);

    // Phase 3: Spawn management (ensure central zone has >= 4 Pokemon)
    try {
      const spawnResult = await ensureCentralSpawns(c);
      lastSpawnCheckTime = new Date();
      if (spawnResult.spawned > 0) {
        console.log(
          `[Cron] Spawn manager: spawned ${spawnResult.spawned}, ` +
            `central ${spawnResult.centralBefore}->${spawnResult.centralAfter}`
        );
      }
    } catch (spawnErr) {
      console.error(
        `[Cron] Spawn manager error: ${spawnErr instanceof Error ? spawnErr.message : spawnErr}`
      );
    }
  } catch (err) {
    console.error(
      `[Cron] Error: ${err instanceof Error ? err.message : err}`
    );
  } finally {
    isProcessing = false;
  }
}

// ── Express App ────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check (no auth)
app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Status endpoint
app.get("/status", requireAuth, async (_req, res) => {
  try {
    const c = getClient();
    const [gameSolBalls, backendUsdc, backendSol, vault] = await Promise.all([
      c.getGameSolballsBalance(),
      c.getWalletTokenBalance(USDC_MINT),
      c.getWalletSolBalance(),
      c.getNftVault(),
    ]);

    res.json({
      gameSolballsBalance: Number(gameSolBalls) / 1e6,
      backendUsdcBalance: Number(backendUsdc) / 1e6,
      backendSolBalance: backendSol / 1e9,
      vaultNftCount: vault.count,
      vaultMaxSize: vault.maxSize || MAX_VAULT_SIZE,
      lastSwapTime: lastSwapTime?.toISOString() || null,
      lastGachaTime: lastGachaTime?.toISOString() || null,
      lastDepositTime: lastDepositTime?.toISOString() || null,
      lastSpawnCheckTime: lastSpawnCheckTime?.toISOString() || null,
      isProcessing,
      backendWallet: c.wallet.publicKey.toBase58(),
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// Manual swap trigger
app.post("/trigger-swap", requireAuth, async (_req, res) => {
  if (isProcessing) {
    res.status(409).json({ error: "Processing already in progress" });
    return;
  }

  isProcessing = true;
  try {
    const c = getClient();
    const result = await runRevenueProcessor(c);
    if (result) {
      lastSwapTime = new Date();
    }
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    isProcessing = false;
  }
});

// Manual gacha trigger
app.post("/trigger-gacha", requireAuth, async (_req, res) => {
  if (isProcessing) {
    res.status(409).json({ error: "Processing already in progress" });
    return;
  }

  isProcessing = true;
  try {
    const c = getClient();
    const result = await runGachaPipeline(c);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    isProcessing = false;
  }
});

// Manual spawn check trigger
app.post("/trigger-spawns", requireAuth, async (req, res) => {
  if (isProcessing) {
    res.status(409).json({ error: "Processing already in progress" });
    return;
  }

  isProcessing = true;
  try {
    const c = getClient();
    const fillGlobal = req.body?.fillGlobal === true;
    const result = await ensureCentralSpawns(c, { fillGlobal });
    lastSpawnCheckTime = new Date();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    isProcessing = false;
  }
});

// ── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Revenue Processor listening on port ${PORT}`);
  console.log(`Cron interval: ${CRON_INTERVAL_MS / 1000}s`);
  if (SKIP_REVENUE_SWAP) {
    console.log(`⚠ SKIP_REVENUE_SWAP=true — Phase 1 (swap) disabled, only Gacha+Deposit will run`);
  }
  if (MOCK_GACHA) {
    console.log(`⚠ MOCK_GACHA=true — Minting test NFTs locally instead of calling Gacha API`);
  }
  console.log(`Spawn manager active — ensuring >=4 central spawns every cron tick`);

  // Schedule cron
  setInterval(cronTick, CRON_INTERVAL_MS);

  // Run first tick after 5s startup delay
  setTimeout(cronTick, 5000);
});
