use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::GameError;
use crate::events::PokemonDespawned;
use crate::constants::*;

#[derive(Accounts)]
pub struct DespawnPokemon<'info> {
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
    ctx: Context<DespawnPokemon>,
    slot_index: u8,
) -> Result<()> {
    let slot_idx = slot_index as usize;

    // Validate slot index
    require!(slot_idx < MAX_POKEMON_SLOTS, GameError::InvalidSlotIndex);

    let pokemon_slots = &mut ctx.accounts.pokemon_slots;
    let slot = &pokemon_slots.slots[slot_idx];

    // Check slot is active
    require!(slot.is_active, GameError::SlotNotActive);

    let pokemon_id = slot.pokemon_id;

    // Clear the slot
    pokemon_slots.slots[slot_idx] = PokemonSlot::default();
    pokemon_slots.active_count = pokemon_slots.active_count.saturating_sub(1);

    emit!(PokemonDespawned {
        pokemon_id,
        slot_index,
    });

    msg!("Despawned Pokemon {} from slot {}", pokemon_id, slot_index);

    Ok(())
}
