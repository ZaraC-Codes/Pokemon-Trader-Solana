/**
 * Create Vault Address Lookup Table (ALT)
 *
 * One-time script to create an ALT for the vault NFTs.
 * Populates it with current vault NFT mints + vault ATAs.
 * The ALT allows consume_randomness transactions with >7 vault NFTs
 * to fit within Solana's 1232-byte transaction limit.
 *
 * Usage:
 *   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   npx tsx scripts/solana/create-vault-alt.ts
 *
 * After creation, set VAULT_ALT_ADDRESS in backend .env and
 * VITE_VAULT_ALT_ADDRESS in frontend .env.
 */

import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  AddressLookupTableProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { loadProgram, deriveGamePDAs, NFT_VAULT_SEED } from "./common.js";

async function main() {
  console.log("=== Create Vault Address Lookup Table ===\n");

  const { program, provider, authority } = loadProgram();
  const connection = provider.connection;
  const programId = program.programId;
  const pdas = deriveGamePDAs(programId);

  console.log(`Authority: ${authority.toBase58()}`);
  console.log(`NftVault PDA: ${pdas.nftVault.toBase58()}`);

  // 1. Fetch vault state
  console.log("\nFetching NftVault...");
  const vault = await program.account.nftVault.fetch(pdas.nftVault);
  const vaultData = vault as any;
  const count = vaultData.count as number;
  console.log(`Vault has ${count} NFTs (max: ${vaultData.maxSize})`);

  // 2. Collect all addresses to add to the ALT
  const altAddresses: PublicKey[] = [];

  for (let i = 0; i < count; i++) {
    const mint: PublicKey = vaultData.mints[i];
    if (mint.equals(PublicKey.default)) continue;

    const vaultAta = await getAssociatedTokenAddress(
      mint,
      pdas.nftVault,
      true // allowOwnerOffCurve for PDA
    );

    altAddresses.push(mint, vaultAta);
    console.log(`  NFT ${i}: mint=${mint.toBase58()}, vaultATA=${vaultAta.toBase58()}`);
  }

  console.log(`\nTotal addresses to add: ${altAddresses.length} (${count} mints + ${count} vault ATAs)`);

  // 3. Create the ALT
  console.log("\nCreating Address Lookup Table...");
  const slot = await connection.getSlot("finalized");

  const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
    authority: authority,
    payer: authority,
    recentSlot: slot,
  });

  const createTx = new Transaction().add(createIx);
  const createSig = await sendAndConfirmTransaction(
    connection,
    createTx,
    [(provider.wallet as any).payer],
    { commitment: "confirmed" }
  );
  console.log(`ALT created: ${altAddress.toBase58()}`);
  console.log(`Create TX: ${createSig}`);

  // 4. Extend the ALT with vault addresses (if any)
  if (altAddresses.length > 0) {
    // ALT extend supports up to 30 addresses per transaction
    const BATCH_SIZE = 30;
    for (let i = 0; i < altAddresses.length; i += BATCH_SIZE) {
      const batch = altAddresses.slice(i, i + BATCH_SIZE);
      console.log(`\nExtending ALT with addresses ${i}..${i + batch.length - 1}...`);

      const extendIx = AddressLookupTableProgram.extendLookupTable({
        payer: authority,
        authority: authority,
        lookupTable: altAddress,
        addresses: batch,
      });

      const extendTx = new Transaction().add(extendIx);
      const extendSig = await sendAndConfirmTransaction(
        connection,
        extendTx,
        [(provider.wallet as any).payer],
        { commitment: "confirmed" }
      );
      console.log(`  Extend TX: ${extendSig}`);
    }
  }

  // 5. Output the address
  console.log("\n========================================");
  console.log("ALT Address:", altAddress.toBase58());
  console.log("========================================");
  console.log("\nAdd the following to your .env files:");
  console.log(`  Backend:  VAULT_ALT_ADDRESS=${altAddress.toBase58()}`);
  console.log(`  Frontend: VITE_VAULT_ALT_ADDRESS=${altAddress.toBase58()}`);
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
