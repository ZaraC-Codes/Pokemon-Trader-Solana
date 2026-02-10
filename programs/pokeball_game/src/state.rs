use anchor_lang::prelude::*;
use crate::constants::*;

/// Global game configuration. Single PDA for the entire game.
#[account]
pub struct GameConfig {
    /// Owner/admin wallet that can manage spawns, prices, and withdraw revenue.
    pub authority: Pubkey,
    /// Treasury wallet receiving 3% of revenue (off-chain split).
    pub treasury: Pubkey,
    /// SolBalls SPL token mint address.
    pub solballs_mint: Pubkey,
    /// USDC SPL token mint address.
    pub usdc_mint: Pubkey,
    /// Ball prices in SolBalls atomic units: [poke, great, ultra, master].
    pub ball_prices: [u64; 4],
    /// Catch rates 0-100 percent: [poke, great, ultra, master].
    pub catch_rates: [u8; 4],
    /// Soft cap on active Pokemon (1-20, default 20).
    pub max_active_pokemon: u8,
    /// Auto-incrementing Pokemon ID counter.
    pub pokemon_id_counter: u64,
    /// Total SolBalls received from all purchases.
    pub total_revenue: u64,
    /// Whether the game has been initialized.
    pub is_initialized: bool,
    /// VRF request counter for generating unique seeds.
    pub vrf_counter: u64,
    /// PDA bump seed.
    pub bump: u8,
}

impl GameConfig {
    /// Account space: 8 (discriminator) + fields
    pub const LEN: usize = 8  // discriminator
        + 32  // authority
        + 32  // treasury
        + 32  // solballs_mint
        + 32  // usdc_mint
        + (8 * 4)  // ball_prices
        + (1 * 4)  // catch_rates
        + 1   // max_active_pokemon
        + 8   // pokemon_id_counter
        + 8   // total_revenue
        + 1   // is_initialized
        + 8   // vrf_counter
        + 1;  // bump
}

/// Holds all 20 Pokemon spawn slots.
#[account]
pub struct PokemonSlots {
    /// Array of 20 Pokemon slots.
    pub slots: [PokemonSlot; MAX_POKEMON_SLOTS],
    /// Number of currently active Pokemon.
    pub active_count: u8,
    /// PDA bump seed.
    pub bump: u8,
}

impl PokemonSlots {
    pub const LEN: usize = 8  // discriminator
        + (PokemonSlot::LEN * MAX_POKEMON_SLOTS)  // slots
        + 1   // active_count
        + 1;  // bump
}

/// Individual Pokemon spawn data.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug)]
pub struct PokemonSlot {
    /// Whether this slot has an active Pokemon.
    pub is_active: bool,
    /// Unique Pokemon ID (from GameConfig.pokemon_id_counter).
    pub pokemon_id: u64,
    /// X position (0-999).
    pub pos_x: u16,
    /// Y position (0-999).
    pub pos_y: u16,
    /// Number of throw attempts against this Pokemon (0-3).
    pub throw_attempts: u8,
    /// Unix timestamp when this Pokemon was spawned.
    pub spawn_timestamp: i64,
}

impl PokemonSlot {
    pub const LEN: usize = 1  // is_active
        + 8   // pokemon_id
        + 2   // pos_x
        + 2   // pos_y
        + 1   // throw_attempts
        + 8;  // spawn_timestamp
}

/// Per-player ball inventory and lifetime stats.
#[account]
pub struct PlayerInventory {
    /// Player's wallet pubkey.
    pub player: Pubkey,
    /// Ball counts: [poke, great, ultra, master].
    pub balls: [u32; 4],
    /// Lifetime total balls purchased.
    pub total_purchased: u64,
    /// Lifetime total throws.
    pub total_throws: u64,
    /// Lifetime total successful catches.
    pub total_catches: u64,
    /// PDA bump seed.
    pub bump: u8,
}

impl PlayerInventory {
    pub const LEN: usize = 8  // discriminator
        + 32  // player
        + (4 * 4)  // balls
        + 8   // total_purchased
        + 8   // total_throws
        + 8   // total_catches
        + 1;  // bump
}

/// NFT vault tracking which Metaplex NFTs are held.
/// Actual NFTs are in PDA-owned token accounts (one ATA per mint).
#[account]
pub struct NftVault {
    /// Authority that can deposit/withdraw NFTs.
    pub authority: Pubkey,
    /// Mint addresses of NFTs currently in the vault (max 20).
    /// Using a fixed-size array to avoid Vec realloc issues.
    pub mints: [Pubkey; MAX_POKEMON_SLOTS],
    /// Number of NFTs currently in the vault.
    pub count: u8,
    /// Maximum vault capacity.
    pub max_size: u8,
    /// PDA bump seed.
    pub bump: u8,
}

impl NftVault {
    pub const LEN: usize = 8  // discriminator
        + 32  // authority
        + (32 * MAX_POKEMON_SLOTS)  // mints (20 * 32)
        + 1   // count
        + 1   // max_size
        + 1;  // bump
}

/// Treasury configuration for revenue tracking.
#[account]
pub struct TreasuryConfig {
    /// Treasury wallet pubkey.
    pub treasury_wallet: Pubkey,
    /// Total SolBalls withdrawn for revenue processing.
    pub total_withdrawn: u64,
    /// PDA bump seed.
    pub bump: u8,
}

impl TreasuryConfig {
    pub const LEN: usize = 8  // discriminator
        + 32  // treasury_wallet
        + 8   // total_withdrawn
        + 1;  // bump
}

/// Pending VRF request state. Created when VRF is requested,
/// read during consume_randomness.
#[account]
pub struct VrfRequest {
    /// Request type: 0 = spawn, 1 = throw.
    pub request_type: u8,
    /// Player who threw (or authority for spawn).
    pub player: Pubkey,
    /// Pokemon slot index.
    pub slot_index: u8,
    /// Ball type (for throws).
    pub ball_type: u8,
    /// The 32-byte seed used for the ORAO VRF request.
    pub seed: [u8; 32],
    /// Whether this request has been fulfilled.
    pub is_fulfilled: bool,
    /// PDA bump seed.
    pub bump: u8,
}

impl VrfRequest {
    pub const LEN: usize = 8  // discriminator
        + 1   // request_type
        + 32  // player
        + 1   // slot_index
        + 1   // ball_type
        + 32  // seed
        + 1   // is_fulfilled
        + 1;  // bump
}
