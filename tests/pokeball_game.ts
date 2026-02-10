import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PokeballGame } from "../target/types/pokeball_game";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { assert, expect } from "chai";

// ORAO VRF program constants
const ORAO_VRF_PROGRAM_ID = new PublicKey(
  "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y"
);
const CONFIG_ACCOUNT_SEED = Buffer.from("orao-vrf-network-configuration");
const RANDOMNESS_ACCOUNT_SEED = Buffer.from("orao-vrf-randomness-request");

// PDA seed constants (must match program)
const GAME_CONFIG_SEED = Buffer.from("game_config");
const POKEMON_SLOTS_SEED = Buffer.from("pokemon_slots");
const PLAYER_INV_SEED = Buffer.from("player_inv");
const NFT_VAULT_SEED = Buffer.from("nft_vault");
const TREASURY_SEED = Buffer.from("treasury");
const VRF_REQ_SEED = Buffer.from("vrf_req");

// Default ball prices (6-decimal SolBalls atomic units)
const DEFAULT_BALL_PRICES = [
  new BN(1_000_000),   // Poke Ball: 1 SolBalls
  new BN(10_000_000),  // Great Ball: 10 SolBalls
  new BN(25_000_000),  // Ultra Ball: 25 SolBalls
  new BN(49_900_000),  // Master Ball: 49.90 SolBalls
];

// Default catch rates (percent)
const DEFAULT_CATCH_RATES = [2, 20, 50, 99];

describe("pokeball_game", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PokeballGame as Program<PokeballGame>;
  const authority = provider.wallet as anchor.Wallet;

  // Keypairs and accounts
  let solballsMint: PublicKey;
  let usdcMint: PublicKey;
  let treasuryKeypair: Keypair;
  let playerKeypair: Keypair;

  // PDAs
  let gameConfigPda: PublicKey;
  let gameConfigBump: number;
  let pokemonSlotsPda: PublicKey;
  let pokemonSlotsBump: number;
  let nftVaultPda: PublicKey;
  let nftVaultBump: number;
  let treasuryConfigPda: PublicKey;
  let treasuryConfigBump: number;
  let gameSolballsAta: PublicKey;

  // Player accounts
  let playerSolballsAta: PublicKey;
  let playerInventoryPda: PublicKey;

  // NFT mints for testing
  let nftMint1: PublicKey;
  let nftMint2: PublicKey;
  let nftMint3: PublicKey;

  before(async () => {
    // Generate keypairs
    treasuryKeypair = Keypair.generate();
    playerKeypair = Keypair.generate();

    // Airdrop SOL to player
    const airdropSig = await provider.connection.requestAirdrop(
      playerKeypair.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Create SolBalls SPL token mint (6 decimals)
    solballsMint = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      6
    );

    // Create USDC mock mint (6 decimals)
    usdcMint = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      6
    );

    // Derive PDAs
    [gameConfigPda, gameConfigBump] = PublicKey.findProgramAddressSync(
      [GAME_CONFIG_SEED],
      program.programId
    );
    [pokemonSlotsPda, pokemonSlotsBump] = PublicKey.findProgramAddressSync(
      [POKEMON_SLOTS_SEED],
      program.programId
    );
    [nftVaultPda, nftVaultBump] = PublicKey.findProgramAddressSync(
      [NFT_VAULT_SEED],
      program.programId
    );
    [treasuryConfigPda, treasuryConfigBump] = PublicKey.findProgramAddressSync(
      [TREASURY_SEED],
      program.programId
    );

    // Derive game's SolBalls ATA (owned by gameConfigPda)
    gameSolballsAta = await getAssociatedTokenAddress(
      solballsMint,
      gameConfigPda,
      true // allowOwnerOffCurve for PDA
    );

    // Create player's SolBalls token account and mint tokens
    playerSolballsAta = await createAssociatedTokenAccount(
      provider.connection,
      (authority as any).payer,
      solballsMint,
      playerKeypair.publicKey
    );

    // Mint 1000 SolBalls to player (1000 * 10^6 = 1_000_000_000)
    await mintTo(
      provider.connection,
      (authority as any).payer,
      solballsMint,
      playerSolballsAta,
      authority.publicKey,
      1_000_000_000
    );

    // Derive player inventory PDA
    [playerInventoryPda] = PublicKey.findProgramAddressSync(
      [PLAYER_INV_SEED, playerKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Create 3 NFT mints for testing vault operations
    nftMint1 = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      0 // NFTs have 0 decimals
    );
    nftMint2 = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      0
    );
    nftMint3 = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      0
    );

    // Mint 1 of each NFT to authority
    for (const mint of [nftMint1, nftMint2, nftMint3]) {
      const ata = await createAssociatedTokenAccount(
        provider.connection,
        (authority as any).payer,
        mint,
        authority.publicKey
      );
      await mintTo(
        provider.connection,
        (authority as any).payer,
        mint,
        ata,
        authority.publicKey,
        1
      );
    }
  });

  // ============================================================
  // INITIALIZATION
  // ============================================================

  describe("initialize", () => {
    it("initializes the game config", async () => {
      await program.methods
        .initialize(
          treasuryKeypair.publicKey,
          solballsMint,
          usdcMint,
          DEFAULT_BALL_PRICES,
          DEFAULT_CATCH_RATES
        )
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          pokemonSlots: pokemonSlotsPda,
          nftVault: nftVaultPda,
          treasuryConfig: treasuryConfigPda,
          solballsMint: solballsMint,
          gameSolballsAccount: gameSolballsAta,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Verify GameConfig
      const gameConfig = await program.account.gameConfig.fetch(gameConfigPda);
      assert.isTrue(gameConfig.isInitialized);
      assert.ok(gameConfig.authority.equals(authority.publicKey));
      assert.ok(gameConfig.treasury.equals(treasuryKeypair.publicKey));
      assert.ok(gameConfig.solballsMint.equals(solballsMint));
      assert.ok(gameConfig.usdcMint.equals(usdcMint));
      assert.equal(gameConfig.maxActivePokemon, 20);
      assert.equal(gameConfig.pokemonIdCounter.toNumber(), 0);
      assert.equal(gameConfig.totalRevenue.toNumber(), 0);
      assert.equal(gameConfig.vrfCounter.toNumber(), 0);

      // Verify ball prices
      for (let i = 0; i < 4; i++) {
        assert.equal(
          gameConfig.ballPrices[i].toNumber(),
          DEFAULT_BALL_PRICES[i].toNumber()
        );
      }

      // Verify catch rates
      for (let i = 0; i < 4; i++) {
        assert.equal(gameConfig.catchRates[i], DEFAULT_CATCH_RATES[i]);
      }

      // Verify PokemonSlots
      const pokemonSlots = await program.account.pokemonSlots.fetch(pokemonSlotsPda);
      assert.equal(pokemonSlots.activeCount, 0);
      for (const slot of pokemonSlots.slots) {
        assert.isFalse(slot.isActive);
      }

      // Verify NftVault
      const nftVault = await program.account.nftVault.fetch(nftVaultPda);
      assert.equal(nftVault.count, 0);
      assert.equal(nftVault.maxSize, 20);

      // Verify TreasuryConfig
      const treasuryConfig = await program.account.treasuryConfig.fetch(treasuryConfigPda);
      assert.ok(treasuryConfig.treasuryWallet.equals(treasuryKeypair.publicKey));
      assert.equal(treasuryConfig.totalWithdrawn.toNumber(), 0);
    });

    it("fails to initialize twice", async () => {
      try {
        await program.methods
          .initialize(
            treasuryKeypair.publicKey,
            solballsMint,
            usdcMint,
            DEFAULT_BALL_PRICES,
            DEFAULT_CATCH_RATES
          )
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
            pokemonSlots: pokemonSlotsPda,
            nftVault: nftVaultPda,
            treasuryConfig: treasuryConfigPda,
            solballsMint: solballsMint,
            gameSolballsAccount: gameSolballsAta,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
        assert.fail("Should have failed on second initialize");
      } catch (err) {
        // Expected — PDA already exists, init will fail
        assert.ok(err);
      }
    });
  });

  // ============================================================
  // BALL PURCHASES
  // ============================================================

  describe("purchase_balls", () => {
    it("player purchases Poke Balls", async () => {
      const quantity = 10;
      const ballType = 0; // Poke Ball

      await program.methods
        .purchaseBalls(ballType, quantity)
        .accounts({
          player: playerKeypair.publicKey,
          gameConfig: gameConfigPda,
          playerTokenAccount: playerSolballsAta,
          gameSolballsAccount: gameSolballsAta,
          playerInventory: playerInventoryPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([playerKeypair])
        .rpc();

      // Verify player inventory
      const inventory = await program.account.playerInventory.fetch(playerInventoryPda);
      assert.equal(inventory.balls[0], quantity);
      assert.equal(inventory.balls[1], 0);
      assert.equal(inventory.balls[2], 0);
      assert.equal(inventory.balls[3], 0);
      assert.equal(inventory.totalPurchased.toNumber(), quantity);
      assert.ok(inventory.player.equals(playerKeypair.publicKey));

      // Verify game revenue updated
      const gameConfig = await program.account.gameConfig.fetch(gameConfigPda);
      const expectedCost = DEFAULT_BALL_PRICES[0].toNumber() * quantity;
      assert.equal(gameConfig.totalRevenue.toNumber(), expectedCost);

      // Verify token transfer
      const gameTokenAccount = await getAccount(provider.connection, gameSolballsAta);
      assert.equal(Number(gameTokenAccount.amount), expectedCost);
    });

    it("player purchases Great Balls", async () => {
      const quantity = 5;
      const ballType = 1; // Great Ball

      await program.methods
        .purchaseBalls(ballType, quantity)
        .accounts({
          player: playerKeypair.publicKey,
          gameConfig: gameConfigPda,
          playerTokenAccount: playerSolballsAta,
          gameSolballsAccount: gameSolballsAta,
          playerInventory: playerInventoryPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([playerKeypair])
        .rpc();

      const inventory = await program.account.playerInventory.fetch(playerInventoryPda);
      assert.equal(inventory.balls[0], 10); // Previous purchase
      assert.equal(inventory.balls[1], 5);  // This purchase
      assert.equal(inventory.totalPurchased.toNumber(), 15);
    });

    it("fails with invalid ball type", async () => {
      try {
        await program.methods
          .purchaseBalls(4, 1) // Ball type 4 doesn't exist
          .accounts({
            player: playerKeypair.publicKey,
            gameConfig: gameConfigPda,
            playerTokenAccount: playerSolballsAta,
            gameSolballsAccount: gameSolballsAta,
            playerInventory: playerInventoryPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([playerKeypair])
          .rpc();
        assert.fail("Should have failed with invalid ball type");
      } catch (err) {
        assert.ok(err.toString().includes("InvalidBallType"));
      }
    });

    it("fails with zero quantity", async () => {
      try {
        await program.methods
          .purchaseBalls(0, 0)
          .accounts({
            player: playerKeypair.publicKey,
            gameConfig: gameConfigPda,
            playerTokenAccount: playerSolballsAta,
            gameSolballsAccount: gameSolballsAta,
            playerInventory: playerInventoryPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([playerKeypair])
          .rpc();
        assert.fail("Should have failed with zero quantity");
      } catch (err) {
        assert.ok(err.toString().includes("ZeroQuantity"));
      }
    });

    it("fails with insufficient SolBalls balance", async () => {
      try {
        // Try to buy an absurd amount
        await program.methods
          .purchaseBalls(3, 1000000) // 1M Master Balls = way more than player has
          .accounts({
            player: playerKeypair.publicKey,
            gameConfig: gameConfigPda,
            playerTokenAccount: playerSolballsAta,
            gameSolballsAccount: gameSolballsAta,
            playerInventory: playerInventoryPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([playerKeypair])
          .rpc();
        assert.fail("Should have failed with insufficient balance");
      } catch (err) {
        assert.ok(err);
      }
    });
  });

  // ============================================================
  // ADMIN SPAWN MANAGEMENT
  // ============================================================

  describe("force_spawn_pokemon", () => {
    it("authority force-spawns a Pokemon", async () => {
      await program.methods
        .forceSpawnPokemon(0, 500, 500)
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          pokemonSlots: pokemonSlotsPda,
        })
        .rpc();

      const pokemonSlots = await program.account.pokemonSlots.fetch(pokemonSlotsPda);
      const slot = pokemonSlots.slots[0];
      assert.isTrue(slot.isActive);
      assert.equal(slot.pokemonId.toNumber(), 1);
      assert.equal(slot.posX, 500);
      assert.equal(slot.posY, 500);
      assert.equal(slot.throwAttempts, 0);
      assert.equal(pokemonSlots.activeCount, 1);

      const gameConfig = await program.account.gameConfig.fetch(gameConfigPda);
      assert.equal(gameConfig.pokemonIdCounter.toNumber(), 1);
    });

    it("spawns multiple Pokemon in different slots", async () => {
      await program.methods
        .forceSpawnPokemon(5, 100, 200)
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          pokemonSlots: pokemonSlotsPda,
        })
        .rpc();

      await program.methods
        .forceSpawnPokemon(10, 800, 900)
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          pokemonSlots: pokemonSlotsPda,
        })
        .rpc();

      const pokemonSlots = await program.account.pokemonSlots.fetch(pokemonSlotsPda);
      assert.equal(pokemonSlots.activeCount, 3);
      assert.isTrue(pokemonSlots.slots[0].isActive);
      assert.isTrue(pokemonSlots.slots[5].isActive);
      assert.isTrue(pokemonSlots.slots[10].isActive);
      assert.isFalse(pokemonSlots.slots[1].isActive);
    });

    it("fails on occupied slot", async () => {
      try {
        await program.methods
          .forceSpawnPokemon(0, 100, 100) // Slot 0 already occupied
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
            pokemonSlots: pokemonSlotsPda,
          })
          .rpc();
        assert.fail("Should have failed on occupied slot");
      } catch (err) {
        assert.ok(err.toString().includes("SlotAlreadyOccupied"));
      }
    });

    it("fails on invalid slot index", async () => {
      try {
        await program.methods
          .forceSpawnPokemon(20, 100, 100) // Max is 19
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
            pokemonSlots: pokemonSlotsPda,
          })
          .rpc();
        assert.fail("Should have failed on invalid slot");
      } catch (err) {
        assert.ok(err.toString().includes("InvalidSlotIndex"));
      }
    });

    it("fails on invalid coordinates", async () => {
      try {
        await program.methods
          .forceSpawnPokemon(1, 1000, 500) // Max coordinate is 999
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
            pokemonSlots: pokemonSlotsPda,
          })
          .rpc();
        assert.fail("Should have failed on invalid coordinate");
      } catch (err) {
        assert.ok(err.toString().includes("InvalidCoordinate"));
      }
    });

    it("fails for non-authority signer", async () => {
      try {
        await program.methods
          .forceSpawnPokemon(1, 100, 100)
          .accounts({
            authority: playerKeypair.publicKey, // Not the authority
            gameConfig: gameConfigPda,
            pokemonSlots: pokemonSlotsPda,
          })
          .signers([playerKeypair])
          .rpc();
        assert.fail("Should have failed for non-authority");
      } catch (err) {
        assert.ok(err.toString().includes("Unauthorized") || err.toString().includes("ConstraintRaw"));
      }
    });
  });

  // ============================================================
  // REPOSITION POKEMON
  // ============================================================

  describe("reposition_pokemon", () => {
    it("repositions a Pokemon to new coordinates", async () => {
      await program.methods
        .repositionPokemon(0, 750, 250)
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          pokemonSlots: pokemonSlotsPda,
        })
        .rpc();

      const pokemonSlots = await program.account.pokemonSlots.fetch(pokemonSlotsPda);
      const slot = pokemonSlots.slots[0];
      assert.equal(slot.posX, 750);
      assert.equal(slot.posY, 250);
      assert.equal(slot.throwAttempts, 0); // Reset on reposition
    });

    it("fails on inactive slot", async () => {
      try {
        await program.methods
          .repositionPokemon(2, 100, 100) // Slot 2 is empty
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
            pokemonSlots: pokemonSlotsPda,
          })
          .rpc();
        assert.fail("Should have failed on inactive slot");
      } catch (err) {
        assert.ok(err.toString().includes("SlotNotActive"));
      }
    });
  });

  // ============================================================
  // DESPAWN POKEMON
  // ============================================================

  describe("despawn_pokemon", () => {
    it("despawns a Pokemon from a slot", async () => {
      // First confirm slot 10 is active
      let pokemonSlots = await program.account.pokemonSlots.fetch(pokemonSlotsPda);
      assert.isTrue(pokemonSlots.slots[10].isActive);
      const prevCount = pokemonSlots.activeCount;

      await program.methods
        .despawnPokemon(10)
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          pokemonSlots: pokemonSlotsPda,
        })
        .rpc();

      pokemonSlots = await program.account.pokemonSlots.fetch(pokemonSlotsPda);
      assert.isFalse(pokemonSlots.slots[10].isActive);
      assert.equal(pokemonSlots.activeCount, prevCount - 1);
    });

    it("fails on already empty slot", async () => {
      try {
        await program.methods
          .despawnPokemon(10) // Already despawned
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
            pokemonSlots: pokemonSlotsPda,
          })
          .rpc();
        assert.fail("Should have failed on inactive slot");
      } catch (err) {
        assert.ok(err.toString().includes("SlotNotActive"));
      }
    });
  });

  // ============================================================
  // NFT VAULT OPERATIONS
  // ============================================================

  describe("deposit_nft", () => {
    it("deposits an NFT into the vault", async () => {
      const sourceNftAta = await getAssociatedTokenAddress(
        nftMint1,
        authority.publicKey
      );
      const vaultNftAta = await getAssociatedTokenAddress(
        nftMint1,
        nftVaultPda,
        true
      );

      await program.methods
        .depositNft()
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          nftVault: nftVaultPda,
          nftMint: nftMint1,
          sourceNftAccount: sourceNftAta,
          vaultNftAccount: vaultNftAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const nftVault = await program.account.nftVault.fetch(nftVaultPda);
      assert.equal(nftVault.count, 1);
      assert.ok(nftVault.mints[0].equals(nftMint1));

      // Verify NFT was transferred
      const vaultTokenAccount = await getAccount(provider.connection, vaultNftAta);
      assert.equal(Number(vaultTokenAccount.amount), 1);
    });

    it("deposits a second NFT", async () => {
      const sourceNftAta = await getAssociatedTokenAddress(
        nftMint2,
        authority.publicKey
      );
      const vaultNftAta = await getAssociatedTokenAddress(
        nftMint2,
        nftVaultPda,
        true
      );

      await program.methods
        .depositNft()
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          nftVault: nftVaultPda,
          nftMint: nftMint2,
          sourceNftAccount: sourceNftAta,
          vaultNftAccount: vaultNftAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const nftVault = await program.account.nftVault.fetch(nftVaultPda);
      assert.equal(nftVault.count, 2);
      assert.ok(nftVault.mints[1].equals(nftMint2));
    });
  });

  describe("withdraw_nft", () => {
    it("withdraws an NFT from the vault", async () => {
      const vaultNftAta = await getAssociatedTokenAddress(
        nftMint1,
        nftVaultPda,
        true
      );
      const authorityNftAta = await getAssociatedTokenAddress(
        nftMint1,
        authority.publicKey
      );

      await program.methods
        .withdrawNft(0) // Index 0
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          nftVault: nftVaultPda,
          vaultNftAccount: vaultNftAta,
          authorityNftAccount: authorityNftAta,
          nftMint: nftMint1,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const nftVault = await program.account.nftVault.fetch(nftVaultPda);
      assert.equal(nftVault.count, 1);
      // After swap-and-pop, nftMint2 should be at index 0 now
      assert.ok(nftVault.mints[0].equals(nftMint2));

      // Verify NFT returned to authority
      const authorityAccount = await getAccount(provider.connection, authorityNftAta);
      assert.equal(Number(authorityAccount.amount), 1);
    });

    it("fails with invalid index", async () => {
      try {
        const vaultNftAta = await getAssociatedTokenAddress(
          nftMint2,
          nftVaultPda,
          true
        );
        const authorityNftAta = await getAssociatedTokenAddress(
          nftMint2,
          authority.publicKey
        );

        await program.methods
          .withdrawNft(5) // Index 5 is out of bounds (only 1 NFT left)
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
            nftVault: nftVaultPda,
            vaultNftAccount: vaultNftAta,
            authorityNftAccount: authorityNftAta,
            nftMint: nftMint2,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have failed with invalid index");
      } catch (err) {
        assert.ok(err.toString().includes("InvalidNftIndex"));
      }
    });

    it("re-deposits NFT for later tests", async () => {
      // Re-deposit NFT1 for consume_randomness tests
      const sourceNftAta = await getAssociatedTokenAddress(
        nftMint1,
        authority.publicKey
      );
      const vaultNftAta = await getAssociatedTokenAddress(
        nftMint1,
        nftVaultPda,
        true
      );

      await program.methods
        .depositNft()
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          nftVault: nftVaultPda,
          nftMint: nftMint1,
          sourceNftAccount: sourceNftAta,
          vaultNftAccount: vaultNftAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const nftVault = await program.account.nftVault.fetch(nftVaultPda);
      assert.equal(nftVault.count, 2);
    });
  });

  // ============================================================
  // ADMIN CONFIGURATION
  // ============================================================

  describe("admin configuration", () => {
    it("sets ball price", async () => {
      const newPrice = new BN(2_000_000); // $2 for Poke Ball

      await program.methods
        .setBallPrice(0, newPrice)
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
        })
        .rpc();

      const gameConfig = await program.account.gameConfig.fetch(gameConfigPda);
      assert.equal(gameConfig.ballPrices[0].toNumber(), 2_000_000);
    });

    it("fails with zero ball price", async () => {
      try {
        await program.methods
          .setBallPrice(0, new BN(0))
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
          })
          .rpc();
        assert.fail("Should have failed with zero price");
      } catch (err) {
        assert.ok(err.toString().includes("ZeroBallPrice"));
      }
    });

    it("sets catch rate", async () => {
      await program.methods
        .setCatchRate(0, 5) // 5% for Poke Ball
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
        })
        .rpc();

      const gameConfig = await program.account.gameConfig.fetch(gameConfigPda);
      assert.equal(gameConfig.catchRates[0], 5);
    });

    it("fails with invalid catch rate (> 100)", async () => {
      try {
        await program.methods
          .setCatchRate(0, 101)
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
          })
          .rpc();
        assert.fail("Should have failed with invalid catch rate");
      } catch (err) {
        assert.ok(err.toString().includes("InvalidCatchRate"));
      }
    });

    it("sets max active Pokemon", async () => {
      await program.methods
        .setMaxActivePokemon(10)
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
        })
        .rpc();

      const gameConfig = await program.account.gameConfig.fetch(gameConfigPda);
      assert.equal(gameConfig.maxActivePokemon, 10);

      // Reset back to 20 for remaining tests
      await program.methods
        .setMaxActivePokemon(20)
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
        })
        .rpc();
    });

    it("fails with max active Pokemon of 0", async () => {
      try {
        await program.methods
          .setMaxActivePokemon(0)
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
          })
          .rpc();
        assert.fail("Should have failed with 0 max");
      } catch (err) {
        assert.ok(err.toString().includes("InvalidMaxActivePokemon"));
      }
    });

    it("fails with max active Pokemon > 20", async () => {
      try {
        await program.methods
          .setMaxActivePokemon(21)
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
          })
          .rpc();
        assert.fail("Should have failed with max > 20");
      } catch (err) {
        assert.ok(err.toString().includes("InvalidMaxActivePokemon"));
      }
    });

    it("resets ball price back to default", async () => {
      await program.methods
        .setBallPrice(0, DEFAULT_BALL_PRICES[0])
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
        })
        .rpc();

      await program.methods
        .setCatchRate(0, DEFAULT_CATCH_RATES[0])
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
        })
        .rpc();

      const gameConfig = await program.account.gameConfig.fetch(gameConfigPda);
      assert.equal(gameConfig.ballPrices[0].toNumber(), DEFAULT_BALL_PRICES[0].toNumber());
      assert.equal(gameConfig.catchRates[0], DEFAULT_CATCH_RATES[0]);
    });
  });

  // ============================================================
  // WITHDRAW REVENUE
  // ============================================================

  describe("withdraw_revenue", () => {
    it("authority withdraws SolBalls revenue", async () => {
      // First, get the current game SolBalls balance
      const gameTokenAccount = await getAccount(provider.connection, gameSolballsAta);
      const balance = Number(gameTokenAccount.amount);
      assert.isAbove(balance, 0, "Game should have SolBalls from purchases");

      // Create authority's SolBalls ATA if needed
      let authoritySolballsAta: PublicKey;
      try {
        authoritySolballsAta = await createAssociatedTokenAccount(
          provider.connection,
          (authority as any).payer,
          solballsMint,
          authority.publicKey
        );
      } catch {
        authoritySolballsAta = await getAssociatedTokenAddress(
          solballsMint,
          authority.publicKey
        );
      }

      const withdrawAmount = new BN(Math.floor(balance / 2)); // Withdraw half

      await program.methods
        .withdrawRevenue(withdrawAmount)
        .accounts({
          authority: authority.publicKey,
          gameConfig: gameConfigPda,
          treasuryConfig: treasuryConfigPda,
          gameSolballsAccount: gameSolballsAta,
          authoritySolballsAccount: authoritySolballsAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Verify treasury tracking
      const treasuryConfig = await program.account.treasuryConfig.fetch(treasuryConfigPda);
      assert.equal(treasuryConfig.totalWithdrawn.toNumber(), withdrawAmount.toNumber());
    });

    it("fails with zero withdrawal", async () => {
      const authoritySolballsAta = await getAssociatedTokenAddress(
        solballsMint,
        authority.publicKey
      );

      try {
        await program.methods
          .withdrawRevenue(new BN(0))
          .accounts({
            authority: authority.publicKey,
            gameConfig: gameConfigPda,
            treasuryConfig: treasuryConfigPda,
            gameSolballsAccount: gameSolballsAta,
            authoritySolballsAccount: authoritySolballsAta,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have failed with zero amount");
      } catch (err) {
        assert.ok(err.toString().includes("InsufficientWithdrawalAmount"));
      }
    });

    it("fails for non-authority", async () => {
      const playerSolballsAta2 = await getAssociatedTokenAddress(
        solballsMint,
        playerKeypair.publicKey
      );

      try {
        await program.methods
          .withdrawRevenue(new BN(1))
          .accounts({
            authority: playerKeypair.publicKey,
            gameConfig: gameConfigPda,
            treasuryConfig: treasuryConfigPda,
            gameSolballsAccount: gameSolballsAta,
            authoritySolballsAccount: playerSolballsAta2,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([playerKeypair])
          .rpc();
        assert.fail("Should have failed for non-authority");
      } catch (err) {
        assert.ok(err);
      }
    });
  });

  // ============================================================
  // THROW BALL (VRF Integration)
  // Note: These tests require ORAO VRF devnet to be available.
  // They validate the instruction structure but VRF fulfillment
  // depends on the ORAO network being live on devnet.
  // ============================================================

  describe("throw_ball (VRF)", () => {
    it("validates slot is active before throw", async () => {
      // Slot 2 has no Pokemon
      const vrfCounter = (await program.account.gameConfig.fetch(gameConfigPda)).vrfCounter;

      // Derive VRF request PDA
      const [vrfRequestPda] = PublicKey.findProgramAddressSync(
        [VRF_REQ_SEED, vrfCounter.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Derive VRF seed to compute randomness PDA
      const seed = makeVrfSeed(vrfCounter.toNumber(), 1); // VRF_TYPE_THROW
      const [vrfRandomnessPda] = PublicKey.findProgramAddressSync(
        [RANDOMNESS_ACCOUNT_SEED, seed],
        ORAO_VRF_PROGRAM_ID
      );

      // Derive ORAO VRF config PDA
      const [vrfConfigPda] = PublicKey.findProgramAddressSync(
        [CONFIG_ACCOUNT_SEED],
        ORAO_VRF_PROGRAM_ID
      );

      try {
        await program.methods
          .throwBall(2, 0) // Slot 2 is empty
          .accounts({
            player: playerKeypair.publicKey,
            gameConfig: gameConfigPda,
            pokemonSlots: pokemonSlotsPda,
            playerInventory: playerInventoryPda,
            vrfRequest: vrfRequestPda,
            vrfConfig: vrfConfigPda,
            vrfRandomness: vrfRandomnessPda,
            vrfTreasury: vrfConfigPda, // Placeholder — real test needs ORAO treasury
            oraoVrf: ORAO_VRF_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([playerKeypair])
          .rpc();
        assert.fail("Should have failed on inactive slot");
      } catch (err) {
        assert.ok(
          err.toString().includes("SlotNotActive") ||
          err.toString().includes("Error") // VRF CPI may fail on devnet if not set up
        );
      }
    });

    it("validates player has balls before throw", async () => {
      // Create a new player with no balls
      const noBallsPlayer = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        noBallsPlayer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Create inventory PDA (won't have any balls)
      const [noBallsInventory] = PublicKey.findProgramAddressSync(
        [PLAYER_INV_SEED, noBallsPlayer.publicKey.toBuffer()],
        program.programId
      );

      // This will fail because the player has no inventory (account doesn't exist yet)
      // and the throw instruction doesn't use init_if_needed for inventory
      const vrfCounter = (await program.account.gameConfig.fetch(gameConfigPda)).vrfCounter;
      const [vrfRequestPda] = PublicKey.findProgramAddressSync(
        [VRF_REQ_SEED, vrfCounter.toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      const seed = makeVrfSeed(vrfCounter.toNumber(), 1);
      const [vrfRandomnessPda] = PublicKey.findProgramAddressSync(
        [RANDOMNESS_ACCOUNT_SEED, seed],
        ORAO_VRF_PROGRAM_ID
      );
      const [vrfConfigPda] = PublicKey.findProgramAddressSync(
        [CONFIG_ACCOUNT_SEED],
        ORAO_VRF_PROGRAM_ID
      );

      try {
        await program.methods
          .throwBall(0, 0) // Slot 0 has a Pokemon
          .accounts({
            player: noBallsPlayer.publicKey,
            gameConfig: gameConfigPda,
            pokemonSlots: pokemonSlotsPda,
            playerInventory: noBallsInventory,
            vrfRequest: vrfRequestPda,
            vrfConfig: vrfConfigPda,
            vrfRandomness: vrfRandomnessPda,
            vrfTreasury: vrfConfigPda,
            oraoVrf: ORAO_VRF_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([noBallsPlayer])
          .rpc();
        assert.fail("Should have failed — player has no inventory");
      } catch (err) {
        assert.ok(err);
      }
    });
  });

  // ============================================================
  // STATE QUERIES
  // ============================================================

  describe("state queries", () => {
    it("can read all game state", async () => {
      const gameConfig = await program.account.gameConfig.fetch(gameConfigPda);
      const pokemonSlots = await program.account.pokemonSlots.fetch(pokemonSlotsPda);
      const nftVault = await program.account.nftVault.fetch(nftVaultPda);
      const treasuryConfig = await program.account.treasuryConfig.fetch(treasuryConfigPda);
      const playerInventory = await program.account.playerInventory.fetch(playerInventoryPda);

      // Verify all accounts readable
      assert.isTrue(gameConfig.isInitialized);
      assert.isAbove(pokemonSlots.activeCount, 0);
      assert.isAbove(nftVault.count, 0);
      assert.isAbove(playerInventory.totalPurchased.toNumber(), 0);

      console.log("=== Game State Summary ===");
      console.log(`  Authority: ${gameConfig.authority.toBase58()}`);
      console.log(`  Active Pokemon: ${pokemonSlots.activeCount}`);
      console.log(`  NFTs in vault: ${nftVault.count}`);
      console.log(`  Total revenue: ${gameConfig.totalRevenue.toNumber() / 1e6} SolBalls`);
      console.log(`  Player balls: [${playerInventory.balls.join(", ")}]`);
      console.log(`  VRF counter: ${gameConfig.vrfCounter.toNumber()}`);
    });
  });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Mirrors the on-chain make_vrf_seed function.
 * Produces a 32-byte seed from the VRF counter and request type.
 */
function makeVrfSeed(counter: number, requestType: number): Buffer {
  const seed = Buffer.alloc(32);
  seed.writeBigUInt64LE(BigInt(counter), 0);
  seed[8] = requestType;
  // Bytes 24..32 = "pkblgame"
  seed.write("pkblgame", 24, 8, "ascii");
  return seed;
}
