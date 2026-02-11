/**
 * Anchor Program Client
 *
 * Creates and manages the Anchor Program instance for the pokeball_game program.
 * Provides helper functions for reading PDAs and sending transactions.
 */

import { Program, AnchorProvider, type Idl, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey, type TransactionSignature } from '@solana/web3.js';
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

/**
 * Throw a ball at a Pokemon.
 * Requests ORAO VRF for catch determination.
 */
export async function throwBall(
  connection: Connection,
  wallet: AnchorWallet,
  slotIndex: number,
  ballType: BallType
): Promise<TransactionSignature> {
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

  // ORAO VRF accounts
  const [vrfConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('orao-vrf-network-configuration')],
    ORAO_VRF_PROGRAM_ID
  );

  // ORAO randomness account PDA — uses the full 32-byte seed
  const [vrfRandomness] = PublicKey.findProgramAddressSync(
    [Buffer.from('orao-vrf-randomness-request'), vrfSeed],
    ORAO_VRF_PROGRAM_ID
  );

  // ORAO treasury
  const [vrfTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from('orao-vrf-treasury')],
    ORAO_VRF_PROGRAM_ID
  );

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

  console.log('[programClient] counterBytes hex:', counterBytes.toString('hex'));
  console.log('[programClient] vrfRequest PDA (client-derived):', vrfRequestPDA.toBase58());

  console.log('[programClient] sending throwBall transaction...');
  // Let Anchor 0.30 auto-resolve PDA accounts that have seeds defined in the IDL
  // (gameConfig, pokemonSlots, playerInventory, vrfRequest, vrfConfig).
  // Only pass accounts without PDA seeds (vrfRandomness, vrfTreasury) and the signer.
  // orao_vrf has a fixed address in the IDL and system_program is auto-resolved.
  const tx = await program.methods
    .throwBall(slotIndex, ballType)
    .accounts({
      player: wallet.publicKey,
      vrfRandomness,
      vrfTreasury,
    })
    .rpc();

  console.log('[programClient] throwBall tx confirmed:', tx);
  return tx;
}

/**
 * Call consume_randomness after VRF fulfillment.
 * Can be called by anyone (cranker pattern).
 */
export async function consumeRandomness(
  connection: Connection,
  wallet: AnchorWallet,
  vrfRequestPDA: PublicKey,
  vrfRandomness: PublicKey,
  playerInventoryPDA?: PublicKey,
  nftMint?: PublicKey,
  winner?: PublicKey
): Promise<TransactionSignature> {
  const program = getProgram(connection, wallet);
  const [gameConfigPDA] = getGameConfigPDA();
  const [pokemonSlotsPDA] = getPokemonSlotsPDA();
  const [nftVaultPDA] = getNftVaultPDA();

  const accounts: Record<string, PublicKey | null> = {
    payer: wallet.publicKey,
    gameConfig: gameConfigPDA,
    pokemonSlots: pokemonSlotsPDA,
    vrfRequest: vrfRequestPDA,
    vrfRandomness,
    nftVault: nftVaultPDA,
    playerInventory: playerInventoryPDA ?? null,
    vaultNftTokenAccount: null,
    playerNftTokenAccount: null,
    nftMint: nftMint ?? null,
    winner: winner ?? null,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  };

  const tx = await program.methods
    .consumeRandomness()
    .accounts(accounts)
    .rpc();

  console.log('[programClient] consumeRandomness tx:', tx);
  return tx;
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
