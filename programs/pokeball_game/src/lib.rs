use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;
pub mod errors;
pub mod events;
pub mod constants;

use instructions::*;

declare_id!("B93VJQKD5UW8qfNsLrQ4ZQvTG6AG7PZsR6o2WeBiboBZ");

#[program]
pub mod pokeball_game {
    use super::*;

    /// Initialize the game. Creates GameConfig, PokemonSlots, NftVault, TreasuryConfig.
    /// One-time call by the authority.
    pub fn initialize(
        ctx: Context<Initialize>,
        treasury: Pubkey,
        solballs_mint: Pubkey,
        usdc_mint: Pubkey,
        ball_prices: [u64; 4],
        catch_rates: [u8; 4],
    ) -> Result<()> {
        instructions::initialize::handler(ctx, treasury, solballs_mint, usdc_mint, ball_prices, catch_rates)
    }

    /// Player purchases balls by transferring SolBalls tokens.
    /// Auto-creates PlayerInventory PDA on first purchase.
    pub fn purchase_balls(
        ctx: Context<PurchaseBalls>,
        ball_type: u8,
        quantity: u32,
    ) -> Result<()> {
        instructions::purchase_balls::handler(ctx, ball_type, quantity)
    }

    /// Authority requests a random spawn via ORAO VRF.
    pub fn spawn_pokemon(
        ctx: Context<SpawnPokemon>,
        slot_index: u8,
    ) -> Result<()> {
        instructions::spawn_pokemon::handler(ctx, slot_index)
    }

    /// Authority spawns a Pokemon at specific coordinates (no VRF).
    pub fn force_spawn_pokemon(
        ctx: Context<ForceSpawnPokemon>,
        slot_index: u8,
        pos_x: u16,
        pos_y: u16,
    ) -> Result<()> {
        instructions::force_spawn_pokemon::handler(ctx, slot_index, pos_x, pos_y)
    }

    /// Authority repositions an existing Pokemon.
    pub fn reposition_pokemon(
        ctx: Context<RepositionPokemon>,
        slot_index: u8,
        new_pos_x: u16,
        new_pos_y: u16,
    ) -> Result<()> {
        instructions::reposition_pokemon::handler(ctx, slot_index, new_pos_x, new_pos_y)
    }

    /// Authority despawns a Pokemon from a slot.
    pub fn despawn_pokemon(
        ctx: Context<DespawnPokemon>,
        slot_index: u8,
    ) -> Result<()> {
        instructions::despawn_pokemon::handler(ctx, slot_index)
    }

    /// Player throws a ball at a Pokemon. Requests ORAO VRF for catch determination.
    pub fn throw_ball(
        ctx: Context<ThrowBall>,
        slot_index: u8,
        ball_type: u8,
    ) -> Result<()> {
        instructions::throw_ball::handler(ctx, slot_index, ball_type)
    }

    /// Anyone can call after ORAO fulfills randomness.
    /// Determines catch/miss for throws, sets position for spawns.
    pub fn consume_randomness(
        ctx: Context<ConsumeRandomness>,
    ) -> Result<()> {
        instructions::consume_randomness::handler(ctx)
    }

    /// Authority deposits a Metaplex NFT into the vault.
    pub fn deposit_nft(
        ctx: Context<DepositNft>,
    ) -> Result<()> {
        instructions::deposit_nft::handler(ctx)
    }

    /// Authority withdraws an NFT from the vault (admin recovery).
    pub fn withdraw_nft(
        ctx: Context<WithdrawNft>,
        nft_index: u8,
    ) -> Result<()> {
        instructions::withdraw_nft::handler(ctx, nft_index)
    }

    /// Authority updates ball price for a tier.
    pub fn set_ball_price(
        ctx: Context<AdminConfig>,
        ball_type: u8,
        new_price: u64,
    ) -> Result<()> {
        instructions::admin::set_ball_price_handler(ctx, ball_type, new_price)
    }

    /// Authority updates catch rate for a tier.
    pub fn set_catch_rate(
        ctx: Context<AdminConfig>,
        ball_type: u8,
        new_rate: u8,
    ) -> Result<()> {
        instructions::admin::set_catch_rate_handler(ctx, ball_type, new_rate)
    }

    /// Authority withdraws SolBalls revenue from game account.
    pub fn withdraw_revenue(
        ctx: Context<WithdrawRevenue>,
        amount: u64,
    ) -> Result<()> {
        instructions::withdraw_revenue::handler(ctx, amount)
    }

    /// Authority updates max active Pokemon soft cap.
    pub fn set_max_active_pokemon(
        ctx: Context<AdminConfig>,
        new_max: u8,
    ) -> Result<()> {
        instructions::admin::set_max_active_pokemon_handler(ctx, new_max)
    }
}
