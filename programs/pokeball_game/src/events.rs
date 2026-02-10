use anchor_lang::prelude::*;

#[event]
pub struct BallPurchased {
    pub buyer: Pubkey,
    pub ball_type: u8,
    pub quantity: u32,
    pub total_cost: u64,
}

#[event]
pub struct ThrowAttempted {
    pub thrower: Pubkey,
    pub pokemon_id: u64,
    pub ball_type: u8,
    pub slot_index: u8,
    pub vrf_seed: [u8; 32],
}

#[event]
pub struct CaughtPokemon {
    pub catcher: Pubkey,
    pub pokemon_id: u64,
    pub slot_index: u8,
    pub nft_mint: Pubkey,
}

#[event]
pub struct FailedCatch {
    pub thrower: Pubkey,
    pub pokemon_id: u64,
    pub slot_index: u8,
    pub attempts_remaining: u8,
}

#[event]
pub struct PokemonSpawned {
    pub pokemon_id: u64,
    pub slot_index: u8,
    pub pos_x: u16,
    pub pos_y: u16,
}

#[event]
pub struct PokemonRelocated {
    pub pokemon_id: u64,
    pub slot_index: u8,
    pub old_x: u16,
    pub old_y: u16,
    pub new_x: u16,
    pub new_y: u16,
}

#[event]
pub struct PokemonDespawned {
    pub pokemon_id: u64,
    pub slot_index: u8,
}

#[event]
pub struct NftAwarded {
    pub winner: Pubkey,
    pub nft_mint: Pubkey,
    pub vault_remaining: u8,
}

#[event]
pub struct NftDeposited {
    pub nft_mint: Pubkey,
    pub vault_count: u8,
}

#[event]
pub struct NftWithdrawn {
    pub nft_mint: Pubkey,
    pub vault_count: u8,
}

#[event]
pub struct BallPriceUpdated {
    pub ball_type: u8,
    pub old_price: u64,
    pub new_price: u64,
}

#[event]
pub struct CatchRateUpdated {
    pub ball_type: u8,
    pub old_rate: u8,
    pub new_rate: u8,
}

#[event]
pub struct MaxActivePokemonUpdated {
    pub old_max: u8,
    pub new_max: u8,
}

#[event]
pub struct RevenueWithdrawn {
    pub recipient: Pubkey,
    pub amount: u64,
}
