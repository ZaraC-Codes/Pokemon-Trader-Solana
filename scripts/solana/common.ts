/**
 * Common utilities for admin CLI scripts.
 * Provides shared Anchor setup, PDA derivation, and helpers.
 */
import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// PDA seed constants (must match program constants.rs)
export const GAME_CONFIG_SEED = Buffer.from("game_config");
export const POKEMON_SLOTS_SEED = Buffer.from("pokemon_slots");
export const PLAYER_INV_SEED = Buffer.from("player_inv");
export const NFT_VAULT_SEED = Buffer.from("nft_vault");
export const TREASURY_SEED = Buffer.from("treasury");
export const VRF_REQ_SEED = Buffer.from("vrf_req");
export const GAME_SOLBALLS_SEED = Buffer.from("game_solballs");

// ORAO VRF
export const ORAO_VRF_PROGRAM_ID = new PublicKey(
  "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y"
);
export const ORAO_CONFIG_SEED = Buffer.from("orao-vrf-network-configuration");
export const ORAO_RANDOMNESS_SEED = Buffer.from("orao-vrf-randomness-request");

// Ball type names
export const BALL_NAMES = ["Poke Ball", "Great Ball", "Ultra Ball", "Master Ball"];

/**
 * Load the Anchor program and provider from environment.
 * Reads wallet from Anchor.toml or ANCHOR_WALLET env var.
 */
export function loadProgram(): {
  program: Program;
  provider: anchor.AnchorProvider;
  authority: PublicKey;
} {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PokeballGame as Program;
  const authority = provider.wallet.publicKey;

  return { program, provider, authority };
}

/**
 * Derive all game PDAs from the program ID.
 */
export function deriveGamePDAs(programId: PublicKey) {
  const [gameConfig] = PublicKey.findProgramAddressSync(
    [GAME_CONFIG_SEED],
    programId
  );
  const [pokemonSlots] = PublicKey.findProgramAddressSync(
    [POKEMON_SLOTS_SEED],
    programId
  );
  const [nftVault] = PublicKey.findProgramAddressSync(
    [NFT_VAULT_SEED],
    programId
  );
  const [treasuryConfig] = PublicKey.findProgramAddressSync(
    [TREASURY_SEED],
    programId
  );

  return { gameConfig, pokemonSlots, nftVault, treasuryConfig };
}

/**
 * Derive player inventory PDA.
 */
export function derivePlayerInventory(
  playerKey: PublicKey,
  programId: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PLAYER_INV_SEED, playerKey.toBuffer()],
    programId
  );
  return pda;
}

/**
 * Mirrors the on-chain make_vrf_seed function.
 */
export function makeVrfSeed(counter: number, requestType: number): Buffer {
  const seed = Buffer.alloc(32);
  seed.writeBigUInt64LE(BigInt(counter), 0);
  seed[8] = requestType;
  seed.write("pkblgame", 24, 8, "ascii");
  return seed;
}

/**
 * Format a token amount with decimals for display.
 */
export function formatTokenAmount(
  amount: BN | bigint | number,
  decimals: number = 9
): string {
  const num = typeof amount === "number" ? amount : Number(amount);
  return (num / Math.pow(10, decimals)).toFixed(decimals);
}

/**
 * Pretty-print a Pokemon slot.
 */
export function formatPokemonSlot(slot: any, index: number): string {
  if (!slot.isActive) {
    return `  Slot ${index}: (empty)`;
  }
  return `  Slot ${index}: Pokemon #${slot.pokemonId} at (${slot.posX}, ${slot.posY}) — ${slot.throwAttempts}/3 attempts`;
}
