/**
 * Initialize the Pokeball Game.
 * Creates all PDAs (GameConfig, PokemonSlots, NftVault, TreasuryConfig)
 * and the game's SolBalls token account.
 *
 * Usage:
 *   npx ts-node scripts/solana/initialize.ts \
 *     --treasury <PUBKEY> \
 *     --solballs-mint <PUBKEY> \
 *     --usdc-mint <PUBKEY>
 */
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { loadProgram, deriveGamePDAs } from "./common";

async function main() {
  const args = process.argv.slice(2);

  // Parse CLI arguments
  let treasury: string | undefined;
  let solballsMint: string | undefined;
  let usdcMint: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--treasury" && args[i + 1]) treasury = args[++i];
    if (args[i] === "--solballs-mint" && args[i + 1]) solballsMint = args[++i];
    if (args[i] === "--usdc-mint" && args[i + 1]) usdcMint = args[++i];
  }

  if (!treasury || !solballsMint || !usdcMint) {
    console.error(
      "Usage: npx ts-node scripts/solana/initialize.ts \\\n" +
      "  --treasury <PUBKEY> \\\n" +
      "  --solballs-mint <PUBKEY> \\\n" +
      "  --usdc-mint <PUBKEY>"
    );
    process.exit(1);
  }

  const { program, provider, authority } = loadProgram();
  const pdas = deriveGamePDAs(program.programId);

  const treasuryPubkey = new PublicKey(treasury);
  const solballsMintPubkey = new PublicKey(solballsMint);
  const usdcMintPubkey = new PublicKey(usdcMint);

  // Default ball prices (6-decimal SolBalls atomic units)
  const ballPrices = [
    new BN(1_000_000),   // Poke Ball: 1 SolBalls
    new BN(10_000_000),  // Great Ball: 10 SolBalls
    new BN(25_000_000),  // Ultra Ball: 25 SolBalls
    new BN(49_900_000),  // Master Ball: 49.90 SolBalls
  ];

  // Default catch rates (percent)
  const catchRates = [2, 20, 50, 99];

  // Derive game's SolBalls ATA
  const gameSolballsAta = await getAssociatedTokenAddress(
    solballsMintPubkey,
    pdas.gameConfig,
    true
  );

  console.log("=== Pokeball Game Initialization ===");
  console.log(`  Authority:      ${authority.toBase58()}`);
  console.log(`  Treasury:       ${treasuryPubkey.toBase58()}`);
  console.log(`  SolBalls Mint:  ${solballsMintPubkey.toBase58()}`);
  console.log(`  USDC Mint:      ${usdcMintPubkey.toBase58()}`);
  console.log(`  GameConfig PDA: ${pdas.gameConfig.toBase58()}`);
  console.log(`  PokemonSlots:   ${pdas.pokemonSlots.toBase58()}`);
  console.log(`  NftVault:       ${pdas.nftVault.toBase58()}`);
  console.log(`  TreasuryConfig: ${pdas.treasuryConfig.toBase58()}`);
  console.log(`  Game SolBalls:  ${gameSolballsAta.toBase58()}`);
  console.log("");

  try {
    const tx = await program.methods
      .initialize(
        treasuryPubkey,
        solballsMintPubkey,
        usdcMintPubkey,
        ballPrices,
        catchRates
      )
      .accounts({
        authority: authority,
        gameConfig: pdas.gameConfig,
        pokemonSlots: pdas.pokemonSlots,
        nftVault: pdas.nftVault,
        treasuryConfig: pdas.treasuryConfig,
        solballsMint: solballsMintPubkey,
        gameSolballsAccount: gameSolballsAta,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log(`SUCCESS: Game initialized. TX: ${tx}`);
  } catch (err) {
    console.error("FAILED:", err);
    process.exit(1);
  }
}

main().catch(console.error);
