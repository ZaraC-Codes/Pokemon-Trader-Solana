/**
 * Configuration loaded from environment variables.
 * All required vars are validated at startup.
 */
import { PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

// Solana
export const SOLANA_RPC_URL = optionalEnv(
  "SOLANA_RPC_URL",
  "https://api.devnet.solana.com"
);
export const POKEBALL_GAME_PROGRAM_ID = new PublicKey(
  optionalEnv(
    "POKEBALL_GAME_PROGRAM_ID",
    "B93VJQKD5UW8qfNsLrQ4ZQvTG6AG7PZsR6o2WeBiboBZ"
  )
);

// Token mints
export const SOLBALLS_MINT = new PublicKey(requireEnv("SOLBALLS_MINT"));
export const USDC_MINT = new PublicKey(
  optionalEnv("USDC_MINT", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
);

// Wallets
export const BACKEND_WALLET_PRIVATE_KEY = requireEnv(
  "BACKEND_WALLET_PRIVATE_KEY"
);
// Dual treasury: each partner receives 1.5% of revenue as USDC (3% total split 50/50)
export const TREASURY_WALLET_A = new PublicKey(requireEnv("TREASURY_WALLET_A"));
export const TREASURY_WALLET_B = new PublicKey(requireEnv("TREASURY_WALLET_B"));

// Revenue split (must total 100)
export const REVENUE_TREASURY_PCT = Number(
  optionalEnv("REVENUE_TREASURY_PCT", "3")
);
export const REVENUE_NFT_POOL_PCT = Number(
  optionalEnv("REVENUE_NFT_POOL_PCT", "96")
);
export const REVENUE_RESERVES_PCT = Number(
  optionalEnv("REVENUE_RESERVES_PCT", "1")
);

// Jupiter
export const JUPITER_BASE_URL = optionalEnv(
  "JUPITER_BASE_URL",
  "https://lite-api.jup.ag/swap/v1"
);
export const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
export const JUPITER_SLIPPAGE_BPS = Number(
  optionalEnv("JUPITER_SLIPPAGE_BPS", "100")
);

// Gacha
export const GACHA_API_URL = optionalEnv(
  "GACHA_API_URL",
  "https://dev-gacha.collectorcrypt.com"
);
export const GACHA_API_KEY = requireEnv("GACHA_API_KEY");

// Thresholds
export const MIN_SOLBALLS_TO_SWAP = BigInt(
  optionalEnv("MIN_SOLBALLS_TO_SWAP", String(100 * 1_000_000_000)) // 100 SolCatch (9 decimals)
);
export const PACK_COST_USDC = BigInt(
  optionalEnv("PACK_COST_USDC", String(50 * 1_000_000)) // $50 USDC
);
export const MIN_PACKS_PER_RUN = Number(
  optionalEnv("MIN_PACKS_PER_RUN", "1")
);
export const MAX_VAULT_SIZE = 20;

// Address Lookup Table for vault NFTs (optional — needed if vault > 7 NFTs)
export const VAULT_ALT_ADDRESS = process.env.VAULT_ALT_ADDRESS || "";

// Cron interval (ms)
export const CRON_INTERVAL_MS = Number(
  optionalEnv("CRON_INTERVAL_MS", String(5 * 60 * 1000)) // 5 minutes
);

// Admin API
export const ADMIN_API_KEY = requireEnv("ADMIN_API_KEY");
export const PORT = Number(optionalEnv("PORT", "3001"));

// Validate split
if (
  REVENUE_TREASURY_PCT + REVENUE_NFT_POOL_PCT + REVENUE_RESERVES_PCT !== 100
) {
  throw new Error(
    `Revenue split must total 100, got ${REVENUE_TREASURY_PCT + REVENUE_NFT_POOL_PCT + REVENUE_RESERVES_PCT}`
  );
}
