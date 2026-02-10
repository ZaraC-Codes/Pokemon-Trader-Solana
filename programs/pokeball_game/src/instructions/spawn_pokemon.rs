use anchor_lang::prelude::*;
use orao_solana_vrf::program::OraoVrf;
use orao_solana_vrf::CONFIG_ACCOUNT_SEED;

use crate::state::*;
use crate::errors::GameError;
use crate::constants::*;

/// Generate a unique VRF seed from the game config's counter.
pub fn make_vrf_seed(counter: u64, request_type: u8) -> [u8; 32] {
    let mut seed = [0u8; 32];
    let counter_bytes = counter.to_le_bytes();
    seed[..8].copy_from_slice(&counter_bytes);
    seed[8] = request_type;
    seed[24..32].copy_from_slice(b"pkblgame");
    seed
}

#[derive(Accounts)]
#[instruction(slot_index: u8)]
pub struct SpawnPokemon<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GAME_CONFIG_SEED],
        bump = game_config.bump,
        constraint = game_config.is_initialized @ GameError::NotInitialized,
        constraint = game_config.authority == authority.key() @ GameError::Unauthorized,
    )]
    pub game_config: Box<Account<'info, GameConfig>>,

    #[account(
        mut,
        seeds = [POKEMON_SLOTS_SEED],
        bump = pokemon_slots.bump,
    )]
    pub pokemon_slots: Box<Account<'info, PokemonSlots>>,

    /// VRF request PDA for tracking this spawn request.
    #[account(
        init,
        payer = authority,
        space = VrfRequest::LEN,
        seeds = [VRF_REQ_SEED, game_config.vrf_counter.to_le_bytes().as_ref()],
        bump,
    )]
    pub vrf_request: Account<'info, VrfRequest>,

    /// ORAO VRF network state.
    /// CHECK: Validated by the ORAO VRF program CPI.
    #[account(
        mut,
        seeds = [CONFIG_ACCOUNT_SEED],
        bump,
        seeds::program = orao_vrf.key(),
    )]
    pub vrf_config: AccountInfo<'info>,

    /// ORAO VRF randomness account — will be created by the CPI.
    /// CHECK: Created and validated by the ORAO VRF program.
    #[account(mut)]
    pub vrf_randomness: AccountInfo<'info>,

    /// ORAO VRF treasury to pay the 0.001 SOL fee.
    /// CHECK: Validated by the ORAO VRF program CPI.
    #[account(mut)]
    pub vrf_treasury: AccountInfo<'info>,

    pub orao_vrf: Program<'info, OraoVrf>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SpawnPokemon>,
    slot_index: u8,
) -> Result<()> {
    let slot_idx = slot_index as usize;

    // Validate slot index
    require!(slot_idx < MAX_POKEMON_SLOTS, GameError::InvalidSlotIndex);

    let pokemon_slots = &ctx.accounts.pokemon_slots;

    // Check slot is empty
    require!(
        !pokemon_slots.slots[slot_idx].is_active,
        GameError::SlotAlreadyOccupied
    );

    // Check max active count
    let game_config = &ctx.accounts.game_config;
    require!(
        pokemon_slots.active_count < game_config.max_active_pokemon,
        GameError::MaxActivePokemonReached
    );

    // Generate VRF seed
    let seed = make_vrf_seed(game_config.vrf_counter, VRF_TYPE_SPAWN);

    // CPI to ORAO VRF to request randomness (v2 API)
    let cpi_program = ctx.accounts.orao_vrf.to_account_info();
    let cpi_accounts = orao_solana_vrf::cpi::accounts::RequestV2 {
        payer: ctx.accounts.authority.to_account_info(),
        network_state: ctx.accounts.vrf_config.to_account_info(),
        treasury: ctx.accounts.vrf_treasury.to_account_info(),
        request: ctx.accounts.vrf_randomness.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    orao_solana_vrf::cpi::request_v2(cpi_ctx, seed)?;

    // Store VRF request state
    let vrf_request = &mut ctx.accounts.vrf_request;
    vrf_request.request_type = VRF_TYPE_SPAWN;
    vrf_request.player = ctx.accounts.authority.key();
    vrf_request.slot_index = slot_index;
    vrf_request.ball_type = 0;
    vrf_request.seed = seed;
    vrf_request.is_fulfilled = false;
    vrf_request.bump = ctx.bumps.vrf_request;

    // Increment VRF counter
    let game_config = &mut ctx.accounts.game_config;
    game_config.vrf_counter = game_config.vrf_counter
        .checked_add(1)
        .ok_or(GameError::MathOverflow)?;

    msg!(
        "VRF spawn requested for slot {}. Seed: {:?}",
        slot_index,
        seed
    );

    Ok(())
}
