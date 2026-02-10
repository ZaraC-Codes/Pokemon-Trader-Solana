/**
 * APE Price Updater Script
 *
 * Fetches the current APE/USD price from CoinGecko and updates the PokeballGame
 * contract's apePriceUSD value. Run hourly via cron/Task Scheduler to keep
 * pricing accurate for APE payments.
 *
 * Usage:
 *   node scripts/update_ape_price.cjs [options]
 *
 * Options:
 *   --dry-run    Fetch and calculate but don't send transaction
 *   --force      Skip safety checks (use with caution)
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY or PRIVATE_KEY - Owner wallet private key
 *   APECHAIN_RPC_URL - RPC endpoint (default: Caldera public)
 *   APE_PRICE_API_URL - Price API URL (default: CoinGecko)
 *   APE_PRICE_MAX_CHANGE_PCT - Max allowed % change (default: 30)
 *
 * Scheduling (cron example - every hour):
 *   0 * * * * cd /path/to/Pokemon-Trader && node scripts/update_ape_price.cjs >> logs/ape_price.log 2>&1
 */

require("dotenv").config({ path: ".env.local" });
const { ethers } = require("ethers");
const fs = require("fs");
const https = require("https");

// ============ Configuration ============

const RPC_URL =
  process.env.APECHAIN_RPC_URL || "https://apechain.calderachain.xyz/http";
const PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

// Price API configuration
const DEFAULT_API_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=apecoin&vs_currencies=usd";
const APE_PRICE_API_URL = process.env.APE_PRICE_API_URL || DEFAULT_API_URL;

// Safety configuration
const MAX_CHANGE_PCT = parseInt(process.env.APE_PRICE_MAX_CHANGE_PCT || "30", 10);
const MIN_PRICE_USD = 0.01; // Minimum sane APE price ($0.01)
const MAX_PRICE_USD = 100; // Maximum sane APE price ($100)

// Contract addresses
const POKEBALL_GAME_PROXY = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";

// Load ABI
const POKEBALL_ABI = JSON.parse(
  fs.readFileSync("./contracts/abi/abi_PokeballGameV6.json", "utf-8")
);

// ============ Helper Functions ============

/**
 * Fetch APE/USD price from API
 * @returns {Promise<number>} Price in USD
 */
function fetchApePrice() {
  return new Promise((resolve, reject) => {
    const url = new URL(APE_PRICE_API_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "PokeballGame-PriceUpdater/1.0",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`API returned status ${res.statusCode}: ${data}`));
            return;
          }

          const json = JSON.parse(data);

          // Handle CoinGecko format
          if (json.apecoin && typeof json.apecoin.usd === "number") {
            resolve(json.apecoin.usd);
            return;
          }

          // Handle direct price format { price: X } or { usd: X }
          if (typeof json.price === "number") {
            resolve(json.price);
            return;
          }
          if (typeof json.usd === "number") {
            resolve(json.usd);
            return;
          }

          reject(new Error(`Unexpected API response format: ${data}`));
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${e.message}`));
        }
      });
    });

    req.on("error", (e) => {
      reject(new Error(`API request failed: ${e.message}`));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("API request timed out"));
    });

    req.end();
  });
}

/**
 * Convert USD price to on-chain format (8 decimals)
 * @param {number} priceUSD - Price in USD
 * @returns {bigint} Price in 8-decimal fixed point
 */
function toOnChainPrice(priceUSD) {
  return BigInt(Math.round(priceUSD * 1e8));
}

/**
 * Convert on-chain price to USD
 * @param {bigint} onChainPrice - Price in 8-decimal fixed point
 * @returns {number} Price in USD
 */
function toUsdPrice(onChainPrice) {
  return Number(onChainPrice) / 1e8;
}

/**
 * Calculate percentage change between two values
 * @param {number} oldValue
 * @param {number} newValue
 * @returns {number} Percentage change (absolute)
 */
function percentChange(oldValue, newValue) {
  if (oldValue === 0) return newValue === 0 ? 0 : 100;
  return Math.abs((newValue - oldValue) / oldValue) * 100;
}

/**
 * Format timestamp for logging
 * @returns {string} ISO timestamp
 */
function timestamp() {
  return new Date().toISOString();
}

// ============ Main Logic ============

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  console.log(`[${timestamp()}] APE Price Updater starting...`);

  // Validate environment
  if (!PRIVATE_KEY && !dryRun) {
    console.error(
      `[${timestamp()}] ERROR: PRIVATE_KEY or DEPLOYER_PRIVATE_KEY required for updates`
    );
    console.error("  Set in .env.local or use --dry-run to just check price");
    process.exit(1);
  }

  // Setup provider
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  // Setup contract (read-only for now)
  const pokeballGame = new ethers.Contract(
    POKEBALL_GAME_PROXY,
    POKEBALL_ABI,
    provider
  );

  // Step 1: Fetch current on-chain price
  let currentOnChainPrice;
  try {
    currentOnChainPrice = await pokeballGame.apePriceUSD();
    console.log(
      `[${timestamp()}] Current on-chain price: $${toUsdPrice(currentOnChainPrice).toFixed(4)} (raw: ${currentOnChainPrice.toString()})`
    );
  } catch (e) {
    console.error(`[${timestamp()}] ERROR: Failed to read current price: ${e.message}`);
    process.exit(1);
  }

  // Step 2: Fetch market price from API
  let marketPriceUSD;
  try {
    console.log(`[${timestamp()}] Fetching price from API...`);
    marketPriceUSD = await fetchApePrice();
    console.log(`[${timestamp()}] Market price: $${marketPriceUSD.toFixed(4)}`);
  } catch (e) {
    console.error(`[${timestamp()}] ERROR: Failed to fetch market price: ${e.message}`);
    process.exit(1);
  }

  // Step 3: Validate market price
  if (marketPriceUSD < MIN_PRICE_USD || marketPriceUSD > MAX_PRICE_USD) {
    console.error(
      `[${timestamp()}] ERROR: Market price $${marketPriceUSD} outside sane range ($${MIN_PRICE_USD}-$${MAX_PRICE_USD})`
    );
    console.error("  This may indicate bad API data. Skipping update.");
    process.exit(1);
  }

  // Step 4: Calculate new on-chain price
  const newOnChainPrice = toOnChainPrice(marketPriceUSD);
  const currentPriceUSD = toUsdPrice(currentOnChainPrice);

  console.log(
    `[${timestamp()}] Calculated: $${currentPriceUSD.toFixed(4)} -> $${marketPriceUSD.toFixed(4)} (${newOnChainPrice.toString()})`
  );

  // Step 5: Check if update needed
  if (currentOnChainPrice.toString() === newOnChainPrice.toString()) {
    console.log(`[${timestamp()}] No change needed. Price already current.`);
    process.exit(0);
  }

  // Step 6: Safety check - price change bounds
  const changePct = percentChange(currentPriceUSD, marketPriceUSD);
  console.log(`[${timestamp()}] Price change: ${changePct.toFixed(2)}%`);

  if (changePct > MAX_CHANGE_PCT && !force) {
    console.error(
      `[${timestamp()}] WARNING: Price change (${changePct.toFixed(2)}%) exceeds safety limit (${MAX_CHANGE_PCT}%)`
    );
    console.error("  This may indicate bad API data or extreme market movement.");
    console.error("  Use --force to override this check if the change is legitimate.");
    process.exit(1);
  }

  // Step 7: Dry run check
  if (dryRun) {
    console.log(`[${timestamp()}] DRY RUN: Would update price to $${marketPriceUSD.toFixed(4)} (${newOnChainPrice.toString()})`);
    console.log(`[${timestamp()}] DRY RUN: No transaction sent.`);
    process.exit(0);
  }

  // Step 8: Setup signer and verify ownership
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const signerAddress = await signer.getAddress();

  const owner = await pokeballGame.owner();
  if (signerAddress.toLowerCase() !== owner.toLowerCase()) {
    console.error(`[${timestamp()}] ERROR: Signer (${signerAddress}) is not owner (${owner})`);
    process.exit(1);
  }

  // Step 9: Send transaction
  console.log(`[${timestamp()}] Sending setAPEPrice transaction...`);
  const pokeballGameWithSigner = pokeballGame.connect(signer);

  try {
    const tx = await pokeballGameWithSigner.setAPEPrice(newOnChainPrice);
    console.log(`[${timestamp()}] Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[${timestamp()}] Transaction confirmed. Gas used: ${receipt.gasUsed.toString()}`);

    // Final summary
    console.log(
      `[${timestamp()}] SUCCESS: APE price updated $${currentPriceUSD.toFixed(4)} -> $${marketPriceUSD.toFixed(4)} ` +
        `(${currentOnChainPrice.toString()} -> ${newOnChainPrice.toString()}), tx: ${tx.hash}`
    );
  } catch (e) {
    console.error(`[${timestamp()}] ERROR: Transaction failed: ${e.message}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${timestamp()}] Unexpected error:`, err);
    process.exit(1);
  });
