/**
 * Mock Gacha — mint test NFTs locally for devnet testing.
 * Used when the external Gacha API machine is empty.
 * Mints a simple SPL token (amount=1, decimals=0) to simulate an NFT.
 */
import {
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { SolanaClient } from "./solanaClient.js";
import type { GachaPackResult } from "./gachaClient.js";

/**
 * Mint a test NFT to the backend wallet.
 * Creates a new mint (decimals=0), mints 1 token, then disables mint authority.
 */
export async function mintMockNft(
  client: SolanaClient
): Promise<GachaPackResult> {
  const nftMint = Keypair.generate();
  const conn = client.connection;
  const payer = client.wallet;

  console.log(`  [MockGacha] Minting test NFT: ${nftMint.publicKey.toBase58()}`);

  // Create mint account (decimals=0 for NFT)
  const lamports = await getMinimumBalanceForRentExemptMint(conn);
  const createMintIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: nftMint.publicKey,
    space: MINT_SIZE,
    lamports,
    programId: TOKEN_PROGRAM_ID,
  });
  const initMintIx = createInitializeMintInstruction(
    nftMint.publicKey,
    0, // decimals = 0 (NFT)
    payer.publicKey, // mint authority
    null // no freeze authority
  );

  // Create ATA for backend wallet
  const ata = await getAssociatedTokenAddress(
    nftMint.publicKey,
    payer.publicKey
  );
  const createAtaIx = createAssociatedTokenAccountInstruction(
    payer.publicKey,
    ata,
    payer.publicKey,
    nftMint.publicKey
  );

  // Mint 1 token
  const mintToIx = createMintToInstruction(
    nftMint.publicKey,
    ata,
    payer.publicKey,
    1 // amount = 1 (single NFT)
  );

  const tx = new Transaction().add(
    createMintIx,
    initMintIx,
    createAtaIx,
    mintToIx
  );

  const sig = await sendAndConfirmTransaction(conn, tx, [payer, nftMint], {
    commitment: "confirmed",
  });

  console.log(`  [MockGacha] Minted test NFT: ${nftMint.publicKey.toBase58()}`);
  console.log(`  [MockGacha] TX: ${sig}`);

  return {
    memo: `mock-${Date.now()}`,
    nftAddress: nftMint.publicKey.toBase58(),
    rarity: "mock-common",
    submitTxSignature: sig,
  };
}

/**
 * Mock replacement for purchaseMultiplePacks.
 * Mints test NFTs locally instead of calling the Gacha API.
 */
export async function mockPurchasePacks(
  client: SolanaClient,
  count: number
): Promise<GachaPackResult[]> {
  const results: GachaPackResult[] = [];

  for (let i = 0; i < count; i++) {
    console.log(`  [MockGacha] Pack ${i + 1}/${count}`);
    try {
      const result = await mintMockNft(client);
      results.push(result);
    } catch (err) {
      console.error(
        `  [MockGacha] Pack ${i + 1} failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  return results;
}
