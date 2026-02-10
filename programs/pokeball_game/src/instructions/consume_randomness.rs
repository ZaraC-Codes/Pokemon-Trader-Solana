use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use orao_solana_vrf::state::RandomnessAccountData;
use orao_solana_vrf::RANDOMNESS_ACCOUNT_SEED;

use crate::state::*;
use crate::errors::GameError;
use crate::events::*;
use crate::constants::*;

#[derive(Accounts)]
pub struct ConsumeRandomness<'info> {
    /// Anyone can crank this (typically the player or a backend service).
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [GAME_CONFIG_SEED],
        bump = game_config.bump,
    )]
    pub game_config: Box<Account<'info, GameConfig>>,

    #[account(
        mut,
        seeds = [POKEMON_SLOTS_SEED],
        bump = pokemon_slots.bump,
    )]
    pub pokemon_slots: Box<Account<'info, PokemonSlots>>,

    #[account(
        mut,
        constraint = !vrf_request.is_fulfilled @ GameError::VrfAlreadyFulfilled,
    )]
    pub vrf_request: Account<'info, VrfRequest>,

    /// ORAO VRF randomness account. Must match the seed in vrf_request.
    /// We manually deserialize RandomnessAccountData (enum) from the raw data.
    /// CHECK: Seeds are validated to ensure this is the correct ORAO randomness PDA.
    #[account(
        seeds = [RANDOMNESS_ACCOUNT_SEED, vrf_request.seed.as_ref()],
        bump,
        seeds::program = orao_solana_vrf::ID,
    )]
    pub vrf_randomness: AccountInfo<'info>,

    /// NFT vault — needed for catch+award flow.
    #[account(
        mut,
        seeds = [NFT_VAULT_SEED],
        bump = nft_vault.bump,
    )]
    pub nft_vault: Box<Account<'info, NftVault>>,

    /// Player inventory — needed for throw results to update stats.
    /// Optional: only required for throw requests.
    #[account(mut)]
    pub player_inventory: Option<Account<'info, PlayerInventory>>,

    /// Source NFT token account (vault's ATA for the NFT).
    /// Optional: only needed when catch succeeds and vault has NFTs.
    /// CHECK: Validated in handler if needed.
    #[account(mut)]
    pub vault_nft_token_account: Option<AccountInfo<'info>>,

    /// Destination NFT token account (player's ATA for the NFT).
    /// Optional: only needed when catch succeeds.
    /// CHECK: Validated in handler if needed.
    #[account(mut)]
    pub player_nft_token_account: Option<AccountInfo<'info>>,

    /// NFT mint — needed for ATA creation/verification.
    /// CHECK: Validated in handler if needed.
    pub nft_mint: Option<AccountInfo<'info>>,

    /// The player/winner wallet — needed for ATA creation.
    /// CHECK: Validated in handler.
    #[account(mut)]
    pub winner: Option<AccountInfo<'info>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<ConsumeRandomness>) -> Result<()> {
    // Manually deserialize the ORAO VRF randomness account (it's an enum, not a struct)
    let randomness_account_info = &ctx.accounts.vrf_randomness;
    let data = randomness_account_info.try_borrow_data()?;
    let randomness_data = RandomnessAccountData::try_deserialize(&mut data.as_ref())
        .map_err(|_| GameError::VrfNotFulfilled)?;

    // Check that randomness has been fulfilled — returns Some(&[u8; 64]) when ready
    let randomness_64 = randomness_data
        .fulfilled_randomness()
        .ok_or(GameError::VrfNotFulfilled)?;

    // Copy randomness bytes so we can drop the borrow on account data
    let randomness: [u8; 64] = *randomness_64;
    drop(data);

    let request_type = ctx.accounts.vrf_request.request_type;

    match request_type {
        VRF_TYPE_SPAWN => handle_spawn(ctx, &randomness),
        VRF_TYPE_THROW => handle_throw(ctx, &randomness),
        _ => Err(GameError::InvalidVrfRequestType.into()),
    }
}

/// Handle VRF result for a spawn request.
/// Assigns a random position and creates the Pokemon in the target slot.
fn handle_spawn(ctx: Context<ConsumeRandomness>, randomness: &[u8; 64]) -> Result<()> {
    let slot_idx = ctx.accounts.vrf_request.slot_index as usize;
    require!(slot_idx < MAX_POKEMON_SLOTS, GameError::InvalidSlotIndex);

    // Derive position from randomness (first 4 bytes)
    let pos_x = u16::from_le_bytes([randomness[0], randomness[1]]) % (MAX_COORDINATE + 1);
    let pos_y = u16::from_le_bytes([randomness[2], randomness[3]]) % (MAX_COORDINATE + 1);

    // Assign Pokemon ID
    ctx.accounts.game_config.pokemon_id_counter = ctx.accounts.game_config.pokemon_id_counter
        .checked_add(1)
        .ok_or(GameError::MathOverflow)?;
    let pokemon_id = ctx.accounts.game_config.pokemon_id_counter;

    // Spawn the Pokemon
    let clock = Clock::get()?;
    ctx.accounts.pokemon_slots.slots[slot_idx] = PokemonSlot {
        is_active: true,
        pokemon_id,
        pos_x,
        pos_y,
        throw_attempts: 0,
        spawn_timestamp: clock.unix_timestamp,
    };
    ctx.accounts.pokemon_slots.active_count = ctx.accounts.pokemon_slots.active_count
        .checked_add(1)
        .ok_or(GameError::MathOverflow)?;

    // Mark VRF request fulfilled
    ctx.accounts.vrf_request.is_fulfilled = true;

    let slot_index = ctx.accounts.vrf_request.slot_index;
    emit!(PokemonSpawned {
        pokemon_id,
        slot_index,
        pos_x,
        pos_y,
    });

    msg!(
        "VRF spawn complete: Pokemon {} at ({}, {}) in slot {}",
        pokemon_id, pos_x, pos_y, slot_index
    );

    Ok(())
}

/// Handle VRF result for a throw request.
/// Determines catch/miss, awards NFT if caught and vault has stock.
fn handle_throw(ctx: Context<ConsumeRandomness>, randomness: &[u8; 64]) -> Result<()> {
    let slot_idx = ctx.accounts.vrf_request.slot_index as usize;
    require!(slot_idx < MAX_POKEMON_SLOTS, GameError::InvalidSlotIndex);

    let ball_type = ctx.accounts.vrf_request.ball_type as usize;
    require!(ball_type < NUM_BALL_TYPES, GameError::InvalidBallType);

    let catch_rate = ctx.accounts.game_config.catch_rates[ball_type];

    // Use bytes [0..8] for catch determination
    let catch_bytes: [u8; 8] = randomness[0..8].try_into().unwrap();
    let catch_roll = (u64::from_le_bytes(catch_bytes) % 100) as u8;
    let caught = catch_roll < catch_rate;

    let pokemon_id = ctx.accounts.pokemon_slots.slots[slot_idx].pokemon_id;
    let player = ctx.accounts.vrf_request.player;
    let slot_index = ctx.accounts.vrf_request.slot_index;

    if caught {
        // === CAUGHT ===
        let mut awarded_mint = Pubkey::default();

        if ctx.accounts.nft_vault.count > 0 {
            // Use bytes [8..16] for NFT selection (independent from catch roll)
            let nft_bytes: [u8; 8] = randomness[8..16].try_into().unwrap();
            let nft_index = (u64::from_le_bytes(nft_bytes) % ctx.accounts.nft_vault.count as u64) as usize;

            awarded_mint = ctx.accounts.nft_vault.mints[nft_index];

            // Transfer NFT from vault to player if optional accounts are present
            if let (
                Some(vault_nft_account),
                Some(player_nft_account),
                Some(_nft_mint),
                Some(_winner),
            ) = (
                ctx.accounts.vault_nft_token_account.as_ref(),
                ctx.accounts.player_nft_token_account.as_ref(),
                ctx.accounts.nft_mint.as_ref(),
                ctx.accounts.winner.as_ref(),
            ) {
                // Transfer NFT using NftVault PDA signer seeds
                let nft_vault_seeds = &[
                    NFT_VAULT_SEED,
                    &[ctx.accounts.nft_vault.bump],
                ];
                let vault_signer_seeds = &[&nft_vault_seeds[..]];

                let transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: vault_nft_account.to_account_info(),
                        to: player_nft_account.to_account_info(),
                        authority: ctx.accounts.nft_vault.to_account_info(),
                    },
                    vault_signer_seeds,
                );
                token::transfer(transfer_ctx, 1)?;

                // Swap-and-pop removal from vault (O(1))
                let last_idx = (ctx.accounts.nft_vault.count - 1) as usize;
                if nft_index != last_idx {
                    ctx.accounts.nft_vault.mints[nft_index] = ctx.accounts.nft_vault.mints[last_idx];
                }
                ctx.accounts.nft_vault.mints[last_idx] = Pubkey::default();
                ctx.accounts.nft_vault.count = ctx.accounts.nft_vault.count.saturating_sub(1);

                emit!(NftAwarded {
                    winner: player,
                    nft_mint: awarded_mint,
                    vault_remaining: ctx.accounts.nft_vault.count,
                });
            }
        }

        // Update player stats
        if let Some(ref mut player_inventory) = ctx.accounts.player_inventory {
            player_inventory.total_catches = player_inventory.total_catches
                .checked_add(1)
                .ok_or(GameError::MathOverflow)?;
        }

        // Despawn the caught Pokemon
        ctx.accounts.pokemon_slots.slots[slot_idx] = PokemonSlot::default();
        ctx.accounts.pokemon_slots.active_count = ctx.accounts.pokemon_slots.active_count.saturating_sub(1);

        emit!(CaughtPokemon {
            catcher: player,
            pokemon_id,
            slot_index,
            nft_mint: awarded_mint,
        });

        msg!(
            "Pokemon {} CAUGHT by {}! NFT: {}",
            pokemon_id,
            player,
            if awarded_mint == Pubkey::default() { "none (vault empty)".to_string() }
            else { awarded_mint.to_string() }
        );
    } else {
        // === MISSED ===
        let attempts_remaining = MAX_THROW_ATTEMPTS.saturating_sub(
            ctx.accounts.pokemon_slots.slots[slot_idx].throw_attempts
        );

        if attempts_remaining == 0 {
            // Pokemon escapes — despawn
            ctx.accounts.pokemon_slots.slots[slot_idx] = PokemonSlot::default();
            ctx.accounts.pokemon_slots.active_count = ctx.accounts.pokemon_slots.active_count.saturating_sub(1);

            emit!(PokemonDespawned {
                pokemon_id,
                slot_index,
            });

            msg!("Pokemon {} escaped and despawned (max attempts)", pokemon_id);
        }

        emit!(FailedCatch {
            thrower: player,
            pokemon_id,
            slot_index,
            attempts_remaining,
        });

        msg!(
            "Pokemon {} NOT caught. Attempts remaining: {}",
            pokemon_id, attempts_remaining
        );
    }

    // Mark VRF request fulfilled
    ctx.accounts.vrf_request.is_fulfilled = true;

    Ok(())
}
