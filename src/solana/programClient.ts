/**
 * Anchor Program Client
 *
 * Creates and manages the Anchor Program instance for the pokeball_game program.
 * Provides helper functions for reading PDAs and sending transactions.
 */

import { Program, AnchorProvider, type Idl, BN } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  type TransactionSignature,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
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
 * Call consume_randomness with sign-once, send-many pattern.
 *
 * CRITICAL: Each .rpc() call triggers a wallet popup. To avoid multiple popups,
 * we build and sign the transaction ONCE, then retry sending the raw signed tx.
 *
 * Flow:
 *   1. Wait 2s for ORAO VRF fulfillment (sub-second, but give it margin)
 *   2. Build transaction + sign once (ONE wallet popup)
 *   3. Send signed tx via sendRawTransaction with skipPreflight
 *   4. If it fails, wait and re-send the same signed tx (no new popup)
 *   5. If blockhash expires, rebuild + re-sign (rare, only after ~60s)
 */
export async function consumeRandomnessWithRetry(
  connection: Connection,
  wallet: AnchorWallet,
  vrfRequestPDA: PublicKey,
  vrfSeed: Buffer,
  playerPubkey?: PublicKey,
  timeoutMs: number = 30_000,
  retryIntervalMs: number = 2_000,
  onSigned?: () => void
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

  // The player's wallet — winner for NFT transfer
  const winnerPubkey = playerPubkey ?? wallet.publicKey;

  // Pass ALL accounts explicitly — do not rely on auto-resolution.
  // Note: the on-chain struct no longer has optional NFT accounts or rent/associatedToken.
  // Instead, ALL vault NFTs are passed via remaining_accounts.
  const accounts: Record<string, PublicKey | null> = {
    payer: wallet.publicKey,
    gameConfig: gameConfigPDA,
    pokemonSlots: pokemonSlotsPDA,
    vrfRequest: vrfRequestPDA,
    vrfRandomness,
    nftVault: nftVaultPDA,
    playerInventory: playerInventoryPDA,
    winner: winnerPubkey,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };

  console.log('[programClient] consumeRandomnessWithRetry started', {
    payer: wallet.publicKey.toBase58(),
    vrfRequest: vrfRequestPDA.toBase58(),
    vrfRandomness: vrfRandomness.toBase58(),
    winner: winnerPubkey.toBase58(),
  });

  // ---- Fetch vault state and build remaining_accounts for NFT transfer ----
  console.log('[programClient] fetching NftVault for remaining_accounts...');
  const vault = await fetchNftVault(connection);
  const remainingAccounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];

  if (vault && vault.count > 0) {
    const activeMints = vault.mints.slice(0, vault.count).filter(
      (m: PublicKey) => !m.equals(PublicKey.default)
    );

    console.log(`[programClient] vault has ${activeMints.length} NFTs, building remaining_accounts...`);

    // Derive ATAs for each vault NFT and build remaining_accounts groups of 3
    const ataCreationIxs: any[] = [];

    for (const mint of activeMints) {
      const vaultAta = await getAssociatedTokenAddress(mint, nftVaultPDA, true); // allowOwnerOffCurve for PDA
      const playerAta = await getAssociatedTokenAddress(mint, winnerPubkey);

      // Check if player ATA exists; if not, we need to create it
      const playerAtaInfo = await connection.getAccountInfo(playerAta);
      if (!playerAtaInfo) {
        ataCreationIxs.push(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,  // payer
            playerAta,         // ATA to create
            winnerPubkey,      // owner
            mint               // mint
          )
        );
      }

      // remaining_accounts: [mint (read-only), vault_ata (writable), player_ata (writable)]
      remainingAccounts.push(
        { pubkey: mint, isWritable: false, isSigner: false },
        { pubkey: vaultAta, isWritable: true, isSigner: false },
        { pubkey: playerAta, isWritable: true, isSigner: false },
      );
    }

    // Create any missing player ATAs BEFORE the consume_randomness tx
    if (ataCreationIxs.length > 0) {
      console.log(`[programClient] creating ${ataCreationIxs.length} missing player ATA(s)...`);
      const ataTx = new Transaction();
      for (const ix of ataCreationIxs) {
        ataTx.add(ix);
      }
      const { blockhash: ataBlockhash } = await connection.getLatestBlockhash('confirmed');
      ataTx.recentBlockhash = ataBlockhash;
      ataTx.feePayer = wallet.publicKey;
      const signedAtaTx = await wallet.signTransaction(ataTx);
      const ataRawTx = signedAtaTx.serialize();
      const ataTxSig = await connection.sendRawTransaction(ataRawTx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      console.log(`[programClient] ATA creation tx: ${ataTxSig}`);
      await connection.confirmTransaction(ataTxSig, 'confirmed');
      console.log('[programClient] ATA creation confirmed');
    }
  } else {
    console.log('[programClient] vault empty or not found, no remaining_accounts needed');
  }

  // Wait for ORAO VRF fulfillment — sub-second, but give it 2s margin
  console.log('[programClient] waiting 2s for ORAO VRF fulfillment...');
  await new Promise((r) => setTimeout(r, 2_000));

  // ---- Build consume_randomness instruction ----
  console.log('[programClient] building consumeRandomness transaction...');
  const consumeIx = await program.methods
    .consumeRandomness()
    .accounts(accounts)
    .remainingAccounts(remainingAccounts)
    .instruction();

  // ---- Choose legacy vs versioned transaction based on vault size ----
  // Legacy tx fits ~7 NFTs (1232 byte limit). Above that, use VersionedTransaction with ALT.
  const MAX_LEGACY_NFTS = 7;
  const vaultNftCount = vault ? vault.count : 0;
  let rawTx: Buffer;
  let blockhash: string;
  let lastValidBlockHeight: number;

  if (vaultNftCount <= MAX_LEGACY_NFTS) {
    // ---- Legacy Transaction path ----
    console.log(`[programClient] using legacy transaction (${vaultNftCount} vault NFTs)`);
    const tx = new Transaction().add(consumeIx);
    ({ blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed'));
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;

    console.log('[programClient] requesting wallet signature (one popup)...');
    const signedTx = await wallet.signTransaction(tx);
    rawTx = signedTx.serialize() as Buffer;
  } else {
    // ---- Versioned Transaction (v0) with Address Lookup Table ----
    console.log(`[programClient] using versioned transaction with ALT (${vaultNftCount} vault NFTs)`);
    const altAddress = import.meta.env.VITE_VAULT_ALT_ADDRESS;
    if (!altAddress) {
      throw new Error(
        `Vault has ${vaultNftCount} NFTs (> ${MAX_LEGACY_NFTS}), but VITE_VAULT_ALT_ADDRESS is not set. ` +
        'An Address Lookup Table is required for large vaults.'
      );
    }

    const altPubkey = new PublicKey(altAddress);
    const altAccount = await connection.getAddressLookupTable(altPubkey);
    if (!altAccount.value) {
      throw new Error(`Address Lookup Table ${altAddress} not found on-chain`);
    }

    ({ blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed'));
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [consumeIx],
    }).compileToV0Message([altAccount.value]);

    const versionedTx = new VersionedTransaction(messageV0);

    console.log('[programClient] requesting wallet signature (one popup, versioned tx)...');
    const signedVersionedTx = await wallet.signTransaction(versionedTx);
    rawTx = Buffer.from(signedVersionedTx.serialize());
  }

  console.log('[programClient] transaction signed, sending...');

  // Notify caller that wallet signature is complete (modal can close, animation can start)
  onSigned?.();

  // ---- Send the signed tx with retries (no more popups) ----
  const start = Date.now();
  let attempt = 0;
  let lastError: Error | null = null;

  while (Date.now() - start < timeoutMs) {
    attempt++;
    try {
      console.log(`[programClient] sendRawTransaction attempt ${attempt}...`);

      const txSig = await connection.sendRawTransaction(rawTx, {
        skipPreflight: false,       // Let the RPC node simulate first
        preflightCommitment: 'confirmed',
        maxRetries: 0,              // We handle retries ourselves
      });

      console.log(`[programClient] tx sent: ${txSig}, waiting for confirmation...`);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        { signature: txSig, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      if (confirmation.value.err) {
        const errStr = JSON.stringify(confirmation.value.err);
        console.log(`[programClient] tx confirmed with error: ${errStr}`);

        // VrfNotFulfilled — retry sending
        if (errStr.includes('6020') || errStr.includes('0x1784')) {
          console.log(`[programClient] VRF not fulfilled yet, retrying in ${retryIntervalMs}ms...`);
          await new Promise((r) => setTimeout(r, retryIntervalMs));
          continue;
        }

        throw new Error(`consumeRandomness on-chain error: ${errStr}`);
      }

      console.log('[programClient] consumeRandomness confirmed:', txSig);
      return txSig;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const msg = lastError.message;

      console.log(`[programClient] attempt ${attempt} error:`, msg);

      // VrfNotFulfilled in preflight simulation — retry
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

      // Blockhash expired — this is rare (>60s), but handle gracefully
      if (msg.includes('blockhash') || msg.includes('Blockhash not found') || msg.includes('block height exceeded')) {
        console.error('[programClient] Blockhash expired, cannot retry further');
        throw new Error('Transaction expired. Please try again.');
      }

      // User rejected (shouldn't happen here since we already signed)
      if (msg.includes('User rejected') || msg.includes('rejected')) {
        throw new Error('Transaction cancelled');
      }

      // AlreadyProcessed means our tx already landed — treat as success
      if (msg.includes('AlreadyProcessed') || msg.includes('already been processed')) {
        console.log('[programClient] Transaction already processed — likely succeeded');
        // Return empty sig — the tx already confirmed, parseConsumeResult
        // won't find logs but will default to 'missed' which is safe
        return '' as TransactionSignature;
      }

      // Any other error
      console.error(`[programClient] consumeRandomness failed:`, msg);
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
