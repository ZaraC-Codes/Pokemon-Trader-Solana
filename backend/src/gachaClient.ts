/**
 * Collector Crypt Gacha API client.
 * Handles pack generation, transaction submission, and pack opening.
 */
import { PublicKey } from "@solana/web3.js";
import { SolanaClient } from "./solanaClient.js";
import { GACHA_API_URL, GACHA_API_KEY } from "./config.js";

export interface GachaPackResult {
  memo: string;
  nftAddress: string;
  rarity: string;
  submitTxSignature: string;
}

/**
 * Sleep helper for spacing API calls.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an authenticated request to the Gacha API.
 */
async function gachaFetch(
  path: string,
  body: Record<string, unknown>
): Promise<any> {
  const resp = await fetch(`${GACHA_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": GACHA_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gacha API ${path} failed (${resp.status}): ${text}`);
  }

  return resp.json();
}

/**
 * Purchase a single Gacha pack and return the NFT info.
 *
 * Flow:
 *   1. POST /api/generatePack -> { memo, transaction }
 *   2. Sign and submit the transaction
 *   3. POST /api/submitTransaction -> { signature }
 *   4. POST /api/openPack -> { nftAddress, rarity, ... }
 */
export async function purchasePack(
  client: SolanaClient,
  packType: string = "pokemon50"
): Promise<GachaPackResult> {
  // 1. Generate pack
  console.log(`  Generating pack (type: ${packType})...`);
  const genResult = await gachaFetch("/api/generatePack", {
    playerAddress: client.wallet.publicKey.toBase58(),
    packType,
  });

  const { memo, transaction: txBase64 } = genResult;
  if (!memo || !txBase64) {
    throw new Error(
      `generatePack returned unexpected shape: ${JSON.stringify(genResult)}`
    );
  }
  console.log(`  Pack memo: ${memo}`);

  // 2. Sign and send the transaction
  console.log("  Signing and submitting pack purchase transaction...");
  const txBytes = Buffer.from(txBase64, "base64");
  const submitTxSignature = await client.signAndSendTransaction(txBytes);
  console.log(`  Pack purchase TX: ${submitTxSignature}`);

  // 3. Notify Gacha API of successful submission
  await sleep(2000); // Small delay before submitting
  console.log("  Notifying Gacha API of submitted transaction...");
  await gachaFetch("/api/submitTransaction", {
    signedTransaction: submitTxSignature,
  });

  // 4. Open pack
  await sleep(3000); // Wait for on-chain confirmation
  console.log("  Opening pack...");
  const openResult = await gachaFetch("/api/openPack", { memo });

  const nftAddress = openResult.nftAddress || openResult.nft_address;
  const rarity = openResult.rarity || "unknown";
  console.log(`  Received NFT: ${nftAddress} (rarity: ${rarity})`);

  return {
    memo,
    nftAddress,
    rarity,
    submitTxSignature,
  };
}

/**
 * Purchase multiple packs up to the given count.
 * Spaces purchases 5 seconds apart to avoid rate limits.
 */
export async function purchaseMultiplePacks(
  client: SolanaClient,
  count: number,
  packType: string = "pokemon50"
): Promise<GachaPackResult[]> {
  const results: GachaPackResult[] = [];

  for (let i = 0; i < count; i++) {
    console.log(`  [Pack ${i + 1}/${count}]`);
    try {
      const result = await purchasePack(client, packType);
      results.push(result);
    } catch (err) {
      console.error(
        `  Pack ${i + 1} failed: ${err instanceof Error ? err.message : err}`
      );
      // Continue with remaining packs
    }

    // Space purchases apart
    if (i < count - 1) {
      console.log("  Waiting 5s before next purchase...");
      await sleep(5000);
    }
  }

  return results;
}
