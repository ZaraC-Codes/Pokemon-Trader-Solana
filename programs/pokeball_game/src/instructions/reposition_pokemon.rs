use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::GameError;
use crate::events::PokemonRelocated;
use crate::constants::*;

#[derive(Accounts)]
pub struct RepositionPokemon<'info> {
    pub authority: Signer<'info>,

    #[account(
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
    ctx: Context<RepositionPokemon>,
    slot_index: u8,
    new_pos_x: u16,
    new_pos_y: u16,
) -> Result<()> {
    let slot_idx = slot_index as usize;

    // Validate slot index
    require!(slot_idx < MAX_POKEMON_SLOTS, GameError::InvalidSlotIndex);

    // Validate coordinates
    require!(new_pos_x <= MAX_COORDINATE, GameError::InvalidCoordinate);
    require!(new_pos_y <= MAX_COORDINATE, GameError::InvalidCoordinate);

    let pokemon_slots = &mut ctx.accounts.pokemon_slots;
    let slot = &mut pokemon_slots.slots[slot_idx];

    // Check slot is active
    require!(slot.is_active, GameError::SlotNotActive);

    let old_x = slot.pos_x;
    let old_y = slot.pos_y;
    let pokemon_id = slot.pokemon_id;

    // Reposition and reset throw attempts
    slot.pos_x = new_pos_x;
    slot.pos_y = new_pos_y;
    slot.throw_attempts = 0;

    emit!(PokemonRelocated {
        pokemon_id,
        slot_index,
        old_x,
        old_y,
        new_x: new_pos_x,
        new_y: new_pos_y,
    });

    msg!(
        "Repositioned Pokemon {} from ({}, {}) to ({}, {})",
        pokemon_id, old_x, old_y, new_pos_x, new_pos_y
    );

    Ok(())
}
