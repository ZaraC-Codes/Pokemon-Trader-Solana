/**
 * Anchor Program Client
 *
 * Creates and manages the Anchor Program instance for the pokeball_game program.
 * Provides helper functions for reading PDAs and sending transactions.
 */

import { Program, AnchorProvider, type Idl, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey, type TransactionSignature, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import {
  POKEBALL_GAME_PROGRAM_ID,
  ORAO_VRF_PROGRAM_ID,
  SOLBALLS_MINT,
  getGameConfigPDA,
  getPokemonSlotsPDA,
  getPlayerInventoryPDA,
  getNftVaultPDA,
  getTreasuryConfigPDA,
  type BallType,
} from './constants';

// Import IDL from the generated JSON
import idlJson from '../../target/idl/pokeball_game.json';

// ============================================================
// TYPES
// ============================================================

/** Parsed GameConfig account data */
export interface GameConfig {
  authority: PublicKey;
  treasury: PublicKey;
  solballsMint: PublicKey;
  usdcMint: PublicKey;
  ballPrices: BN[];
  catchRates: number[];
  maxActivePokemon: number;
  pokemonIdCounter: BN;
  totalRevenue: BN;
  isInitialized: boolean;
  vrfCounter: BN;
  bump: number;
}

/** Parsed PokemonSlot */
export interface PokemonSlot {
  isActive: boolean;
  pokemonId: BN;
  posX: number;
  posY: number;
  throwAttempts: number;
  spawnTimestamp: BN;
}

/** Parsed PokemonSlots account */
export interface PokemonSlots {
  slots: PokemonSlot[];
  activeCount: number;
  bump: number;
}

/** Parsed PlayerInventory account */
export interface PlayerInventory {
  player: PublicKey;
  balls: number[];
  totalPurchased: BN;
  totalThrows: BN;
  totalCatches: BN;
  bump: number;
}

/** Parsed NftVault account */
export interface NftVault {
  authority: PublicKey;
  mints: PublicKey[];
  count: number;
  maxSize: number;
  bump: number;
}

// ============================================================
// PROGRAM CLIENT
// ============================================================

let _program: Program | null = null;
let _provider: AnchorProvider | null = null;

/**
 * Get or create an Anchor Program instance.
 * Re-creates if connection or wallet changes.
 */
export function getProgram(
  connection: Connection,
  wallet: AnchorWallet
): Program {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });

  // Re-create if provider changed
  if (_provider !== provider) {
    _provider = provider;
    _program = new Program(idlJson as Idl, provider);
  }

  return _program!;
}

/**
 * Get a read-only Program instance (no wallet needed).
 */
export function getReadOnlyProgram(connection: Connection): Program {
  // Create a dummy wallet for read-only access
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async () => { throw new Error('Read-only'); },
    signAllTransactions: async () => { throw new Error('Read-only'); },
  };
  const provider = new AnchorProvider(connection, dummyWallet as AnchorWallet, {
    commitment: 'confirmed',
  });
  return new Program(idlJson as Idl, provider);
}

// ============================================================
// ACCOUNT READERS
// ============================================================

export async function fetchGameConfig(
  connection: Connection
): Promise<GameConfig | null> {
  try {
    const program = getReadOnlyProgram(connection);
    const [pda] = getGameConfigPDA();
    const account = await program.account.gameConfig.fetch(pda);
    return account as unknown as GameConfig;
  } catch (e) {
    console.error('[programClient] Failed to fetch GameConfig:', e);
    return null;
  }
}

export async function fetchPokemonSlots(
  connection: Connection
): Promise<PokemonSlots | null> {
  try {
    const program = getReadOnlyProgram(connection);
    const [pda] = getPokemonSlotsPDA();
    const account = await program.account.pokemonSlots.fetch(pda);
    return account as unknown as PokemonSlots;
  } catch (e) {
    console.error('[programClient] Failed to fetch PokemonSlots:', e);
    return null;
  }
}

export async function fetchPlayerInventory(
  connection: Connection,
  playerPubkey: PublicKey
): Promise<PlayerInventory | null> {
  try {
    const program = getReadOnlyProgram(connection);
    const [pda] = getPlayerInventoryPDA(playerPubkey);
    const account = await program.account.playerInventory.fetch(pda);
    return account as unknown as PlayerInventory;
  } catch (e) {
    // Account not found is expected for new players
    if ((e as Error)?.message?.includes('Account does not exist')) {
      return null;
    }
    console.error('[programClient] Failed to fetch PlayerInventory:', e);
    return null;
  }
}

export async function fetchNftVault(
  connection: Connection
): Promise<NftVault | null> {
  try {
    const program = getReadOnlyProgram(connection);
    const [pda] = getNftVaultPDA();
    const account = await program.account.nftVault.fetch(pda);
    return account as unknown as NftVault;
  } catch (e) {
    console.error('[programClient] Failed to fetch NftVault:', e);
    return null;
  }
}

// ============================================================
// TRANSACTION BUILDERS
// ============================================================

/**
 * Purchase balls with SolBalls tokens.
 */
export async function purchaseBalls(
  connection: Connection,
  wallet: AnchorWallet,
  ballType: BallType,
  quantity: number
): Promise<TransactionSignature> {
  const program = getProgram(connection, wallet);
  const [gameConfigPDA] = getGameConfigPDA();
  const [playerInventoryPDA] = getPlayerInventoryPDA(wallet.publicKey);

  // Get the game's SolBalls ATA
  const gameSolballsAccount = await getAssociatedTokenAddress(
    SOLBALLS_MINT,
    gameConfigPDA,
    true // allowOwnerOffCurve for PDA
  );

  // Get player's SolBalls ATA
  const playerTokenAccount = await getAssociatedTokenAddress(
    SOLBALLS_MINT,
    wallet.publicKey
  );

  const tx = await program.methods
    .purchaseBalls(ballType, quantity)
    .accounts({
      player: wallet.publicKey,
      gameConfig: gameConfigPDA,
      playerTokenAccount,
      gameSolballsAccount,
      playerInventory: playerInventoryPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log('[programClient] purchaseBalls tx:', tx);
  return tx;
}

/** Result from throwBall — includes info needed to crank consume_randomness */
export interface ThrowBallResult {
  txSignature: TransactionSignature;
  vrfRequestPDA: PublicKey;
  vrfRandomnessPDA: PublicKey;
  vrfSeed: Buffer;
}

/**
 * Throw a ball at a Pokemon.
 * Requests ORAO VRF for catch determination.
 * Returns the tx signature AND the VRF request/randomness PDAs needed for consume_randomness.
 */
export async function throwBall(
  connection: Connection,
  wallet: AnchorWallet,
  slotIndex: number,
  ballType: BallType
): Promise<ThrowBallResult> {
  console.log('[programClient] throwBall called:', { slotIndex, ballType, payer: wallet.publicKey.toBase58() });

  const program = getProgram(connection, wallet);
  const [gameConfigPDA] = getGameConfigPDA();
  const [pokemonSlotsPDA] = getPokemonSlotsPDA();
  const [playerInventoryPDA] = getPlayerInventoryPDA(wallet.publicKey);

  // Fetch current vrf_counter using the SAME program instance (wallet-backed)
  // to avoid any read inconsistencies with the read-only program
  const gameConfig = await program.account.gameConfig.fetch(gameConfigPDA);
  if (!gameConfig) throw new Error('Game not initialized');

  const vrfCounter = (gameConfig as any).vrfCounter;
  console.log('[programClient] vrfCounter:', vrfCounter?.toString(), 'type:', typeof vrfCounter, 'isBN:', BN.isBN(vrfCounter));

  // Ensure vrfCounter is a BN
  const vrfCounterBN = BN.isBN(vrfCounter) ? vrfCounter : new BN(vrfCounter.toString());
  const counterBytes = vrfCounterBN.toArrayLike(Buffer, 'le', 8);

  // Derive VRF request PDA using same seeds as the on-chain program:
  //   seeds = [VRF_REQ_SEED, game_config.vrf_counter.to_le_bytes()]
  const [vrfRequestPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('vrf_req'), counterBytes],
    POKEBALL_GAME_PROGRAM_ID
  );

  // Build the full 32-byte VRF seed matching make_vrf_seed(counter, VRF_TYPE_THROW):
  //   seed[0..8]   = counter LE bytes
  //   seed[8]      = request_type (1 for throw)
  //   seed[24..32] = b"pkblgame"
  const VRF_TYPE_THROW = 1;
  const vrfSeed = Buffer.alloc(32);
  counterBytes.copy(vrfSeed, 0);          // bytes 0..7
  vrfSeed[8] = VRF_TYPE_THROW;             // byte 8
  Buffer.from('pkblgame').copy(vrfSeed, 24); // bytes 24..31

  console.log('[programClient] vrfSeed hex:', vrfSeed.toString('hex'));

  // ORAO VRF network state PDA
  const [vrfConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('orao-vrf-network-configuration')],
    ORAO_VRF_PROGRAM_ID
  );

  // ORAO randomness account PDA — uses the full 32-byte seed
  const [vrfRandomness] = PublicKey.findProgramAddressSync(
    [Buffer.from('orao-vrf-randomness-request'), vrfSeed],
    ORAO_VRF_PROGRAM_ID
  );

  // Read ORAO VRF treasury from the NetworkState account.
  // Layout: 8-byte discriminator + 32-byte authority + 32-byte treasury
  // So treasury pubkey is at bytes 40..72.
  const vrfConfigInfo = await connection.getAccountInfo(vrfConfig);
  if (!vrfConfigInfo) throw new Error('ORAO VRF network state not found on this cluster');
  const vrfTreasury = new PublicKey(vrfConfigInfo.data.subarray(40, 72));

  console.log('[programClient] throwBall accounts:', {
    player: wallet.publicKey.toBase58(),
    gameConfig: gameConfigPDA.toBase58(),
    pokemonSlots: pokemonSlotsPDA.toBase58(),
    playerInventory: playerInventoryPDA.toBase58(),
    vrfRequest: vrfRequestPDA.toBase58(),
    vrfConfig: vrfConfig.toBase58(),
    vrfRandomness: vrfRandomness.toBase58(),
    vrfTreasury: vrfTreasury.toBase58(),
    oraoVrf: ORAO_VRF_PROGRAM_ID.toBase58(),
  });

  console.log('[programClient] sending throwBall transaction...');
  // Let Anchor 0.30 auto-resolve PDA accounts with seeds defined in the IDL.
  // Only pass accounts without IDL PDA seeds: player (signer), vrfRandomness, vrfTreasury.
  const tx = await program.methods
    .throwBall(slotIndex, ballType)
    .accounts({
      player: wallet.publicKey,
      vrfRandomness,
      vrfTreasury,
    })
    .rpc();

  console.log('[programClient] throwBall tx confirmed:', tx);
  return {
    txSignature: tx,
    vrfRequestPDA,
    vrfRandomnessPDA: vrfRandomness,
    vrfSeed,
  };
}

/**
 * Call consume_randomness with automatic retry until VRF is fulfilled.
 *
 * Strategy: ORAO VRF fulfills sub-second, so we add a short initial delay
 * then send via .rpc() directly. If VrfNotFulfilled, we wait and retry.
 * Simulation is used only as a pre-check to avoid unnecessary wallet popups.
 *
 * Flow:
 *   1. Wait for initial delay (VRF should be fulfilled by then)
 *   2. Try .rpc() — one wallet popup
 *   3. If VrfNotFulfilled, wait and retry (up to timeout)
 */
export async function consumeRandomnessWithRetry(
  connection: Connection,
  wallet: AnchorWallet,
  vrfRequestPDA: PublicKey,
  vrfSeed: Buffer,
  playerPubkey?: PublicKey,
  timeoutMs: number = 30_000,
  retryIntervalMs: number = 2_000
): Promise<TransactionSignature> {
  const program = getProgram(connection, wallet);
  const [gameConfigPDA] = getGameConfigPDA();
  const [pokemonSlotsPDA] = getPokemonSlotsPDA();
  const [nftVaultPDA] = getNftVaultPDA();

  // Derive ORAO randomness PDA from the VRF seed
  const [vrfRandomness] = PublicKey.findProgramAddressSync(
    [Buffer.from('orao-vrf-randomness-request'), vrfSeed],
    ORAO_VRF_PROGRAM_ID
  );

  // Player inventory PDA (optional — needed for throw requests to update stats)
  let playerInventoryPDA: PublicKey | null = null;
  if (playerPubkey) {
    [playerInventoryPDA] = getPlayerInventoryPDA(playerPubkey);
  }

  // Pass ALL accounts explicitly — do not rely on auto-resolution.
  // This matches the working simulation script exactly.
  const accounts: Record<string, PublicKey | null> = {
    payer: wallet.publicKey,
    gameConfig: gameConfigPDA,
    pokemonSlots: pokemonSlotsPDA,
    vrfRequest: vrfRequestPDA,
    vrfRandomness,
    nftVault: nftVaultPDA,
    playerInventory: playerInventoryPDA,
    vaultNftTokenAccount: null,
    playerNftTokenAccount: null,
    nftMint: null,
    winner: null,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  };

  console.log('[programClient] consumeRandomnessWithRetry started', {
    payer: wallet.publicKey.toBase58(),
    gameConfig: gameConfigPDA.toBase58(),
    pokemonSlots: pokemonSlotsPDA.toBase58(),
    vrfRequest: vrfRequestPDA.toBase58(),
    vrfRandomness: vrfRandomness.toBase58(),
    nftVault: nftVaultPDA.toBase58(),
    playerInventory: playerInventoryPDA?.toBase58() ?? 'null',
  });

  // Short initial delay — ORAO VRF fulfills sub-second, but let's give it a moment
  console.log('[programClient] waiting 2s for ORAO VRF fulfillment...');
  await new Promise((r) => setTimeout(r, 2_000));

  // ---- Send the transaction with retries ----
  const start = Date.now();
  let attempt = 0;
  let lastError: Error | null = null;

  while (Date.now() - start < timeoutMs) {
    attempt++;
    try {
      console.log(`[programClient] consumeRandomness .rpc() attempt ${attempt}...`);

      const txSig = await program.methods
        .consumeRandomness()
        .accounts(accounts)
        .rpc();

      console.log('[programClient] consumeRandomness tx confirmed:', txSig);
      return txSig;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const msg = lastError.message;

      console.log(`[programClient] consumeRandomness attempt ${attempt} error:`, msg);

      // Check if VRF not fulfilled yet — retry
      if (
        msg.includes('VrfNotFulfilled') ||
        msg.includes('6020') ||
        msg.includes('0x1784') ||
        msg.includes('custom program error: 0x1784')
      ) {
        console.log(`[programClient] VRF not fulfilled yet, retrying in ${retryIntervalMs}ms...`);
        await new Promise((r) => setTimeout(r, retryIntervalMs));
        continue;
      }

      // User rejected the wallet popup — not retryable
      if (msg.includes('User rejected') || msg.includes('rejected')) {
        console.error('[programClient] User rejected consume_randomness transaction');
        throw new Error('Transaction cancelled by user');
      }

      // Any other error — log and throw
      console.error(`[programClient] consumeRandomness failed (non-retryable):`, msg);
      throw lastError;
    }
  }

  // Timed out
  throw new Error(`VRF fulfillment timeout after ${attempt} attempts: ${lastError?.message ?? 'unknown'}`);
}

// ============================================================
// EVENT TYPES
// ============================================================

export interface BallPurchasedEvent {
  buyer: PublicKey;
  ballType: number;
  quantity: number;
  totalCost: BN;
}

export interface ThrowAttemptedEvent {
  thrower: PublicKey;
  pokemonId: BN;
  ballType: number;
  slotIndex: number;
  vrfSeed: number[];
}

export interface CaughtPokemonEvent {
  catcher: PublicKey;
  pokemonId: BN;
  slotIndex: number;
  nftMint: PublicKey;
}

export interface FailedCatchEvent {
  thrower: PublicKey;
  pokemonId: BN;
  slotIndex: number;
  attemptsRemaining: number;
}

export interface PokemonSpawnedEvent {
  pokemonId: BN;
  slotIndex: number;
  posX: number;
  posY: number;
}

export interface PokemonDespawnedEvent {
  pokemonId: BN;
  slotIndex: number;
}

export interface NftAwardedEvent {
  winner: PublicKey;
  nftMint: PublicKey;
  vaultRemaining: number;
}
