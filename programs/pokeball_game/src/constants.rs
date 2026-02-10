/// Maximum number of Pokemon that can be active at once (hard cap).
pub const MAX_POKEMON_SLOTS: usize = 20;

/// Maximum coordinate value for Pokemon positions (0-999).
pub const MAX_COORDINATE: u16 = 999;

/// Maximum throw attempts per Pokemon before despawn.
pub const MAX_THROW_ATTEMPTS: u8 = 3;

/// Maximum number of NFTs the vault can hold.
pub const MAX_VAULT_SIZE: u8 = 20;

/// Number of ball types (Poke, Great, Ultra, Master).
pub const NUM_BALL_TYPES: usize = 4;

/// VRF request type: spawn
pub const VRF_TYPE_SPAWN: u8 = 0;

/// VRF request type: throw
pub const VRF_TYPE_THROW: u8 = 1;

/// PDA seeds
pub const GAME_CONFIG_SEED: &[u8] = b"game_config";
pub const POKEMON_SLOTS_SEED: &[u8] = b"pokemon_slots";
pub const PLAYER_INV_SEED: &[u8] = b"player_inv";
pub const NFT_VAULT_SEED: &[u8] = b"nft_vault";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const VRF_REQ_SEED: &[u8] = b"vrf_req";
pub const GAME_SOLBALLS_SEED: &[u8] = b"game_solballs";

/// Default ball prices in SolBalls atomic units (placeholder — admin configurable)
pub const DEFAULT_BALL_PRICES: [u64; 4] = [
    1_000_000,    // Poke Ball: 1 SolBalls (assuming 6 decimals)
    10_000_000,   // Great Ball: 10 SolBalls
    25_000_000,   // Ultra Ball: 25 SolBalls
    49_900_000,   // Master Ball: 49.90 SolBalls
];

/// Default catch rates (percent, 0-100)
pub const DEFAULT_CATCH_RATES: [u8; 4] = [2, 20, 50, 99];
