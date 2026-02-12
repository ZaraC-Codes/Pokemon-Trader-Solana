/**
 * Mint Test NFTs and Deposit into Vault
 *
 * Creates fake test NFTs (0-decimal SPL tokens with supply=1) on devnet,
 * then deposits them into the game's NftVault PDA.
 * Also extends the ALT if VAULT_ALT_ADDRESS is provided.
 *
 * Usage:
 *   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   npx tsx scripts/solana/mint-test-nfts.ts --count 3
 *   npx tsx scripts/solana/mint-test-nfts.ts --count 3 --alt <ALT_ADDRESS>
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  AddressLookupTableProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { loadProgram, deriveGamePDAs } from "./common.js";

async function main() {
  const args = process.argv.slice(2);

  let count = 3;
  let altAddress: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) count = parseInt(args[++i], 10);
    if (args[i] === "--alt" && args[i + 1]) altAddress = args[++i];
  }

  console.log(`=== Mint ${count} Test NFTs & Deposit into Vault ===\n`);

  const { program, provider, authority } = loadProgram();
  const connection = provider.connection;
  const pdas = deriveGamePDAs(program.programId);
  const payer = (provider.wallet as any).payer as Keypair;

  console.log(`Authority:  ${authority.toBase58()}`);
  console.log(`NftVault:   ${pdas.nftVault.toBase58()}`);
  if (altAddress) console.log(`ALT:        ${altAddress}`);
  console.log("");

  // Check vault capacity
  const vault = await program.account.nftVault.fetch(pdas.nftVault);
  const vaultData = vault as any;
  const currentCount = vaultData.count as number;
  const maxSize = vaultData.maxSize as number;
  const available = maxSize - currentCount;

  console.log(`Vault: ${currentCount}/${maxSize} (${available} slots available)`);

  if (available === 0) {
    console.error("Vault is full! Cannot deposit more NFTs.");
    process.exit(1);
  }

  const toMint = Math.min(count, available);
  if (toMint < count) {
    console.log(`Only ${available} slots available, will mint ${toMint} instead of ${count}`);
  }
  console.log("");

  const mintedNfts: PublicKey[] = [];

  for (let i = 0; i < toMint; i++) {
    console.log(`── NFT ${i + 1}/${toMint} ──`);

    // 1. Create mint (0 decimals = NFT)
    console.log("  Creating mint...");
    const nftMint = await createMint(
      connection,
      payer,
      payer.publicKey, // mint authority
      null,            // no freeze authority
      0                // 0 decimals
    );
    console.log(`  Mint: ${nftMint.toBase58()}`);

    // 2. Create ATA for authority wallet
    console.log("  Creating ATA for authority...");
    const authorityAta = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      nftMint,
      payer.publicKey
    );
    console.log(`  ATA: ${authorityAta.address.toBase58()}`);

    // 3. Mint 1 token
    console.log("  Minting 1 token...");
    const mintTxSig = await mintTo(
      connection,
      payer,
      nftMint,
      authorityAta.address,
      payer.publicKey,
      1
    );
    console.log(`  Mint TX: ${mintTxSig}`);

    // 4. Deposit into vault via deposit_nft instruction
    console.log("  Depositing into vault...");
    const vaultNftAta = await getAssociatedTokenAddress(
      nftMint,
      pdas.nftVault,
      true // allowOwnerOffCurve for PDA
    );

    const depositTx = await program.methods
      .depositNft()
      .accounts({
        authority: payer.publicKey,
        gameConfig: pdas.gameConfig,
        nftVault: pdas.nftVault,
        nftMint,
        sourceNftAccount: authorityAta.address,
        vaultNftAccount: vaultNftAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`  Deposit TX: ${depositTx}`);
    mintedNfts.push(nftMint);

    // 5. Extend ALT if provided
    if (altAddress) {
      try {
        console.log("  Extending ALT...");
        const extendIx = AddressLookupTableProgram.extendLookupTable({
          payer: payer.publicKey,
          authority: payer.publicKey,
          lookupTable: new PublicKey(altAddress),
          addresses: [nftMint, vaultNftAta],
        });
        const extendTx = new Transaction().add(extendIx);
        const extendSig = await sendAndConfirmTransaction(
          connection,
          extendTx,
          [payer],
          { commitment: "confirmed" }
        );
        console.log(`  ALT extend TX: ${extendSig}`);
      } catch (altErr) {
        console.warn(`  ALT extension failed (non-fatal): ${altErr instanceof Error ? altErr.message : altErr}`);
      }
    }

    console.log(`  ✓ NFT ${i + 1} done!\n`);
  }

  // Final vault state
  const finalVault = await program.account.nftVault.fetch(pdas.nftVault);
  const finalData = finalVault as any;
  console.log("========================================");
  console.log(`Vault now has ${finalData.count}/${finalData.maxSize} NFTs:`);
  for (let i = 0; i < (finalData.count as number); i++) {
    console.log(`  [${i}] ${finalData.mints[i].toBase58()}`);
  }
  console.log("========================================");

  console.log("\nMinted NFT mints:");
  for (const m of mintedNfts) {
    console.log(`  ${m.toBase58()}`);
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
