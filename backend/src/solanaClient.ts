/**
 * Anchor + web3 wrapper for the pokeball_game program.
 * Provides typed helpers for reading state and calling instructions.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  VersionedTransaction,
  TransactionMessage,
  Transaction,
  AddressLookupTableProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import * as fs from "fs";

import {
  SOLANA_RPC_URL,
  POKEBALL_GAME_PROGRAM_ID,
  BACKEND_WALLET_PRIVATE_KEY,
  SOLBALLS_MINT,
  USDC_MINT,
  VAULT_ALT_ADDRESS,
} from "./config.js";

// PDA seed constants (must match program constants.rs)
const GAME_CONFIG_SEED = Buffer.from("game_config");
const NFT_VAULT_SEED = Buffer.from("nft_vault");
const TREASURY_SEED = Buffer.from("treasury");

// Lazy-loaded IDL (loaded once at startup)
let cachedIdl: any = null;

function loadIdl(): any {
  if (cachedIdl) return cachedIdl;

  // Check env override first
  const envPath = process.env.IDL_PATH;
  if (envPath) {
    cachedIdl = JSON.parse(fs.readFileSync(envPath, "utf-8"));
    return cachedIdl;
  }

  // Try multiple relative paths from the backend dir
  const paths = [
    "../target/idl/pokeball_game.json",
    "./target/idl/pokeball_game.json",
    "../../target/idl/pokeball_game.json",
  ];
  for (const p of paths) {
    try {
      const resolved = new URL(p, import.meta.url);
      cachedIdl = JSON.parse(fs.readFileSync(resolved, "utf-8"));
      return cachedIdl;
    } catch {
      // Try next
    }
  }

  // Fallback: resolve from CWD
  try {
    const absPath = fs.realpathSync("../target/idl/pokeball_game.json");
    cachedIdl = JSON.parse(fs.readFileSync(absPath, "utf-8"));
    return cachedIdl;
  } catch {
    throw new Error(
      "Could not find pokeball_game.json IDL. " +
        "Set IDL_PATH env var or ensure the file is at target/idl/pokeball_game.json"
    );
  }
}

export interface GamePDAs {
  gameConfig: PublicKey;
  nftVault: PublicKey;
  treasuryConfig: PublicKey;
}

export interface GameConfigAccount {
  authority: PublicKey;
  treasuryWallet: PublicKey;
  solballsMint: PublicKey;
  usdcMint: PublicKey;
  ballPrices: BN[];
  catchRates: number[];
  maxActivePokemon: number;
  pokemonIdCounter: BN;
  totalRevenue: BN;
  vrfCounter: BN;
  bump: number;
}

export interface NftVaultAccount {
  authority: PublicKey;
  mints: PublicKey[];
  count: number;
  maxSize: number;
  bump: number;
}

export interface TreasuryConfigAccount {
  treasuryWallet: PublicKey;
  totalWithdrawn: BN;
  bump: number;
}

export class SolanaClient {
  readonly connection: Connection;
  readonly wallet: Keypair;
  readonly provider: AnchorProvider;
  readonly program: Program;
  readonly pdas: GamePDAs;

  constructor() {
    this.connection = new Connection(SOLANA_RPC_URL, "confirmed");

    // Parse backend wallet from env
    this.wallet = this.parseKeypair(BACKEND_WALLET_PRIVATE_KEY);

    // Create Anchor provider
    const anchorWallet = new Wallet(this.wallet);
    this.provider = new AnchorProvider(this.connection, anchorWallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    // Load IDL and create program
    const idl = loadIdl();
    this.program = new Program(idl, this.provider);

    // Derive PDAs
    this.pdas = this.derivePDAs();
  }

  private parseKeypair(key: string): Keypair {
    // Try base58 first
    try {
      return Keypair.fromSecretKey(bs58.decode(key));
    } catch {
      // Try JSON array
      try {
        const arr = JSON.parse(key);
        return Keypair.fromSecretKey(Uint8Array.from(arr));
      } catch {
        // Try file path
        try {
          const data = JSON.parse(fs.readFileSync(key, "utf-8"));
          return Keypair.fromSecretKey(Uint8Array.from(data));
        } catch {
          throw new Error(
            "BACKEND_WALLET_PRIVATE_KEY must be base58, JSON array, or path to keypair file"
          );
        }
      }
    }
  }

  private derivePDAs(): GamePDAs {
    const [gameConfig] = PublicKey.findProgramAddressSync(
      [GAME_CONFIG_SEED],
      POKEBALL_GAME_PROGRAM_ID
    );
    const [nftVault] = PublicKey.findProgramAddressSync(
      [NFT_VAULT_SEED],
      POKEBALL_GAME_PROGRAM_ID
    );
    const [treasuryConfig] = PublicKey.findProgramAddressSync(
      [TREASURY_SEED],
      POKEBALL_GAME_PROGRAM_ID
    );
    return { gameConfig, nftVault, treasuryConfig };
  }

  /** Fetch GameConfig account. */
  async getGameConfig(): Promise<GameConfigAccount> {
    return (await this.program.account.gameConfig.fetch(
      this.pdas.gameConfig
    )) as unknown as GameConfigAccount;
  }

  /** Fetch NftVault account. */
  async getNftVault(): Promise<NftVaultAccount> {
    return (await this.program.account.nftVault.fetch(
      this.pdas.nftVault
    )) as unknown as NftVaultAccount;
  }

  /** Fetch TreasuryConfig account. */
  async getTreasuryConfig(): Promise<TreasuryConfigAccount> {
    return (await this.program.account.treasuryConfig.fetch(
      this.pdas.treasuryConfig
    )) as unknown as TreasuryConfigAccount;
  }

  /** Get the game's SolBalls ATA (owned by gameConfig PDA). */
  async getGameSolballsAta(): Promise<PublicKey> {
    return getAssociatedTokenAddress(
      SOLBALLS_MINT,
      this.pdas.gameConfig,
      true // allowOwnerOffCurve for PDA
    );
  }

  /** Get the SolBalls balance held by the game PDA. */
  async getGameSolballsBalance(): Promise<bigint> {
    const ata = await this.getGameSolballsAta();
    try {
      const info = await this.connection.getTokenAccountBalance(ata);
      return BigInt(info.value.amount);
    } catch {
      return 0n;
    }
  }

  /** Get the backend wallet's token balance for a given mint. */
  async getWalletTokenBalance(mint: PublicKey): Promise<bigint> {
    const ata = await getAssociatedTokenAddress(mint, this.wallet.publicKey);
    try {
      const info = await this.connection.getTokenAccountBalance(ata);
      return BigInt(info.value.amount);
    } catch {
      return 0n;
    }
  }

  /** Get the backend wallet's SOL balance. */
  async getWalletSolBalance(): Promise<number> {
    return this.connection.getBalance(this.wallet.publicKey);
  }

  /**
   * Withdraw SolBalls revenue from the game account to the backend wallet.
   * Returns the transaction signature.
   */
  async withdrawRevenue(amount: bigint): Promise<string> {
    const gameSolballsAta = await this.getGameSolballsAta();
    const backendSolballsAta = await getAssociatedTokenAddress(
      SOLBALLS_MINT,
      this.wallet.publicKey
    );

    const tx = await this.program.methods
      .withdrawRevenue(new BN(amount.toString()))
      .accounts({
        authority: this.wallet.publicKey,
        gameConfig: this.pdas.gameConfig,
        treasuryConfig: this.pdas.treasuryConfig,
        gameSolballsAccount: gameSolballsAta,
        authoritySolballsAccount: backendSolballsAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return tx;
  }

  /**
   * Deposit an NFT into the on-chain vault.
   * Returns the transaction signature.
   */
  async depositNft(nftMint: PublicKey): Promise<string> {
    const sourceNftAta = await getAssociatedTokenAddress(
      nftMint,
      this.wallet.publicKey
    );
    const vaultNftAta = await getAssociatedTokenAddress(
      nftMint,
      this.pdas.nftVault,
      true // allowOwnerOffCurve for PDA
    );

    const tx = await this.program.methods
      .depositNft()
      .accounts({
        authority: this.wallet.publicKey,
        gameConfig: this.pdas.gameConfig,
        nftVault: this.pdas.nftVault,
        nftMint,
        sourceNftAccount: sourceNftAta,
        vaultNftAccount: vaultNftAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Find all NFT mints in the backend wallet (SPL tokens with amount == 1, decimals == 0).
   * Excludes mints already in the vault.
   */
  async findNewNftsInWallet(vaultMints: PublicKey[]): Promise<PublicKey[]> {
    const vaultSet = new Set(vaultMints.map((m) => m.toBase58()));

    const tokenAccounts =
      await this.connection.getParsedTokenAccountsByOwner(
        this.wallet.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

    const nftMints: PublicKey[] = [];

    for (const { account } of tokenAccounts.value) {
      const info = account.data.parsed?.info;
      if (!info) continue;

      const amount = Number(info.tokenAmount?.amount ?? 0);
      const decimals = info.tokenAmount?.decimals ?? 0;
      const mint = info.mint;

      // NFTs: amount == 1, decimals == 0
      if (amount === 1 && decimals === 0 && !vaultSet.has(mint)) {
        nftMints.push(new PublicKey(mint));
      }
    }

    return nftMints;
  }

  /**
   * Sign and send a versioned transaction (from Jupiter/Gacha).
   * Returns the transaction signature.
   */
  async signAndSendTransaction(
    serializedTx: Buffer | Uint8Array
  ): Promise<string> {
    const tx = VersionedTransaction.deserialize(serializedTx);
    tx.sign([this.wallet]);

    const sig = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    // Wait for confirmation
    const latestBlockhash = await this.connection.getLatestBlockhash();
    await this.connection.confirmTransaction(
      { signature: sig, ...latestBlockhash },
      "confirmed"
    );

    return sig;
  }

  // ============================================================
  // ADDRESS LOOKUP TABLE (ALT) MANAGEMENT
  // ============================================================

  /**
   * Get the vault ALT address from env config.
   * Returns null if not configured.
   */
  getVaultAltAddress(): PublicKey | null {
    if (!VAULT_ALT_ADDRESS) return null;
    try {
      return new PublicKey(VAULT_ALT_ADDRESS);
    } catch {
      console.warn(`[SolanaClient] Invalid VAULT_ALT_ADDRESS: ${VAULT_ALT_ADDRESS}`);
      return null;
    }
  }

  /**
   * Create a new Address Lookup Table for the vault.
   * Returns the ALT address. This is a one-time operation.
   */
  async createVaultAlt(): Promise<PublicKey> {
    const slot = await this.connection.getSlot("confirmed");

    const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
      authority: this.wallet.publicKey,
      payer: this.wallet.publicKey,
      recentSlot: slot,
    });

    const tx = new Transaction().add(createIx);
    await sendAndConfirmTransaction(this.connection, tx, [this.wallet], {
      commitment: "confirmed",
    });

    console.log(`[SolanaClient] Created ALT: ${altAddress.toBase58()}`);
    return altAddress;
  }

  /**
   * Extend the vault ALT with new addresses (NFT mint + vault ATA).
   * Should be called after depositing a new NFT into the vault.
   *
   * ALT requires 1 slot (~400ms) deactivation period after extension
   * before the new entries are usable.
   */
  async extendVaultAlt(
    altAddress: PublicKey,
    newAddresses: PublicKey[]
  ): Promise<string> {
    if (newAddresses.length === 0) return "";

    const extendIx = AddressLookupTableProgram.extendLookupTable({
      payer: this.wallet.publicKey,
      authority: this.wallet.publicKey,
      lookupTable: altAddress,
      addresses: newAddresses,
    });

    const tx = new Transaction().add(extendIx);
    const sig = await sendAndConfirmTransaction(this.connection, tx, [this.wallet], {
      commitment: "confirmed",
    });

    console.log(
      `[SolanaClient] Extended ALT ${altAddress.toBase58()} with ${newAddresses.length} addresses. TX: ${sig}`
    );
    return sig;
  }

  /**
   * Extend the vault ALT with a newly deposited NFT's mint + vault ATA.
   * Skips if VAULT_ALT_ADDRESS is not configured (vault has ≤7 NFTs, ALT not needed).
   */
  async extendAltForNewNft(nftMint: PublicKey): Promise<void> {
    const altAddress = this.getVaultAltAddress();
    if (!altAddress) {
      console.log("[SolanaClient] No VAULT_ALT_ADDRESS configured, skipping ALT extension");
      return;
    }

    const vaultAta = await getAssociatedTokenAddress(
      nftMint,
      this.pdas.nftVault,
      true // allowOwnerOffCurve for PDA
    );

    await this.extendVaultAlt(altAddress, [nftMint, vaultAta]);
  }
}
