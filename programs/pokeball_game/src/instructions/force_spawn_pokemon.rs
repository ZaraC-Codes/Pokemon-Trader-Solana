use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::GameError;
use crate::events::PokemonSpawned;
use crate::constants::*;

#[derive(Accounts)]
pub struct ForceSpawnPokemon<'info> {
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
}

pub fn handler(
    ctx: Context<ForceSpawnPokemon>,
    slot_index: u8,
    pos_x: u16,
    pos_y: u16,
) -> Result<()> {
    let slot_idx = slot_index as usize;

    // Validate slot index
    require!(slot_idx < MAX_POKEMON_SLOTS, GameError::InvalidSlotIndex);

    // Validate coordinates
    require!(pos_x <= MAX_COORDINATE, GameError::InvalidCoordinate);
    require!(pos_y <= MAX_COORDINATE, GameError::InvalidCoordinate);

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

    // Assign new Pokemon ID
    let game_config = &mut ctx.accounts.game_config;
    game_config.pokemon_id_counter = game_config.pokemon_id_counter
        .checked_add(1)
        .ok_or(GameError::MathOverflow)?;
    let pokemon_id = game_config.pokemon_id_counter;

    // Spawn the Pokemon
    let pokemon_slots = &mut ctx.accounts.pokemon_slots;
    let clock = Clock::get()?;

    pokemon_slots.slots[slot_idx] = PokemonSlot {
        is_active: true,
        pokemon_id,
        pos_x,
        pos_y,
        throw_attempts: 0,
        spawn_timestamp: clock.unix_timestamp,
    };
    pokemon_slots.active_count = pokemon_slots.active_count
        .checked_add(1)
        .ok_or(GameError::MathOverflow)?;

    emit!(PokemonSpawned {
        pokemon_id,
        slot_index,
        pos_x,
        pos_y,
    });

    msg!(
        "Force spawned Pokemon {} at slot {} ({}, {})",
        pokemon_id, slot_index, pos_x, pos_y
    );

    Ok(())
}
