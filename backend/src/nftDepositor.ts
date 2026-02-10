/**
 * NFT Depositor — scans backend wallet for new NFTs and deposits them into the vault.
 */
import { PublicKey } from "@solana/web3.js";
import { SolanaClient } from "./solanaClient.js";
import { MAX_VAULT_SIZE, USDC_MINT, SOLBALLS_MINT } from "./config.js";

export interface DepositResult {
  nftMint: string;
  txSignature: string;
}

// Mints to skip when scanning for NFTs (known fungible tokens)
const SKIP_MINTS = new Set([
  USDC_MINT.toBase58(),
  SOLBALLS_MINT.toBase58(),
]);

/**
 * Scan the backend wallet for NFTs not yet in the vault, and deposit them.
 * Returns the list of successfully deposited NFTs.
 */
export async function depositNewNfts(
  client: SolanaClient
): Promise<DepositResult[]> {
  console.log("[NftDepositor] Scanning for new NFTs to deposit...");

  // Get current vault state
  const vault = await client.getNftVault();
  const currentCount = vault.count;
  const maxSize = vault.maxSize || MAX_VAULT_SIZE;

  console.log(`  Vault: ${currentCount}/${maxSize} NFTs`);

  if (currentCount >= maxSize) {
    console.log("  Vault is full. Skipping deposit.");
    return [];
  }

  // Get active vault mints (non-default pubkeys)
  const activeMints = vault.mints
    .slice(0, currentCount)
    .filter((m: PublicKey) => !m.equals(PublicKey.default));

  // Find NFTs in backend wallet not already in vault
  const newNfts = await client.findNewNftsInWallet(activeMints);

  // Filter out known fungible tokens
  const nftsToDeposit = newNfts.filter(
    (m) => !SKIP_MINTS.has(m.toBase58())
  );

  if (nftsToDeposit.length === 0) {
    console.log("  No new NFTs found in wallet.");
    return [];
  }

  console.log(`  Found ${nftsToDeposit.length} new NFT(s) to deposit.`);

  // Deposit each NFT (up to remaining vault capacity)
  const slotsAvailable = maxSize - currentCount;
  const toDeposit = nftsToDeposit.slice(0, slotsAvailable);
  const results: DepositResult[] = [];

  for (const nftMint of toDeposit) {
    try {
      console.log(`  Depositing ${nftMint.toBase58()}...`);
      const tx = await client.depositNft(nftMint);
      console.log(`    TX: ${tx}`);
      results.push({ nftMint: nftMint.toBase58(), txSignature: tx });
    } catch (err) {
      console.error(
        `    Failed to deposit ${nftMint.toBase58()}: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  console.log(
    `[NftDepositor] Deposited ${results.length}/${toDeposit.length} NFTs.`
  );
  return results;
}
