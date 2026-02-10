/**
 * Deposit NFTs into the game vault.
 *
 * Usage:
 *   # Single NFT deposit:
 *   npx ts-node scripts/solana/deposit-nft.ts --mint <NFT_MINT_PUBKEY>
 *
 *   # Batch deposit multiple NFTs:
 *   npx ts-node scripts/solana/deposit-nft.ts --mints <MINT1>,<MINT2>,<MINT3>
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { loadProgram, deriveGamePDAs } from "./common";

async function main() {
  const args = process.argv.slice(2);

  let singleMint: string | undefined;
  let batchMints: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mint" && args[i + 1]) singleMint = args[++i];
    if (args[i] === "--mints" && args[i + 1]) {
      batchMints = args[++i].split(",");
    }
  }

  const mints = batchMints || (singleMint ? [singleMint] : []);

  if (mints.length === 0) {
    console.error(
      "Usage:\n" +
      "  npx ts-node scripts/solana/deposit-nft.ts --mint <NFT_MINT_PUBKEY>\n" +
      "  npx ts-node scripts/solana/deposit-nft.ts --mints <MINT1>,<MINT2>,<MINT3>"
    );
    process.exit(1);
  }

  const { program, provider, authority } = loadProgram();
  const pdas = deriveGamePDAs(program.programId);

  console.log(`=== Deposit NFTs (${mints.length} total) ===`);
  console.log(`  Authority: ${authority.toBase58()}`);
  console.log(`  NFT Vault: ${pdas.nftVault.toBase58()}`);
  console.log("");

  let successCount = 0;
  let failCount = 0;

  for (const mintStr of mints) {
    const nftMint = new PublicKey(mintStr.trim());

    const sourceNftAta = await getAssociatedTokenAddress(
      nftMint,
      authority
    );
    const vaultNftAta = await getAssociatedTokenAddress(
      nftMint,
      pdas.nftVault,
      true
    );

    try {
      const tx = await program.methods
        .depositNft()
        .accounts({
          authority,
          gameConfig: pdas.gameConfig,
          nftVault: pdas.nftVault,
          nftMint,
          sourceNftAccount: sourceNftAta,
          vaultNftAccount: vaultNftAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`  [OK] ${nftMint.toBase58()} — TX: ${tx}`);
      successCount++;
    } catch (err: any) {
      console.error(`  [FAIL] ${nftMint.toBase58()} — ${err.message || err}`);
      failCount++;
    }
  }

  console.log("");
  console.log(`Done. Success: ${successCount}, Failed: ${failCount}`);

  // Show vault state
  const nftVault = await program.account.nftVault.fetch(pdas.nftVault);
  console.log(`Vault now has ${nftVault.count} NFTs (max ${nftVault.maxSize})`);
}

main().catch(console.error);
