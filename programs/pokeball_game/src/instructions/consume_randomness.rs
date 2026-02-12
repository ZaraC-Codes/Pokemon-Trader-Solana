use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
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

    /// The player/winner wallet — needed as destination owner for NFT transfer.
    /// CHECK: Validated against vrf_request.player in handler.
    #[account(mut)]
    pub winner: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: groups of 3 per vault NFT:
    //   [0] NFT mint (AccountInfo, read-only)
    //   [1] Vault's ATA for this mint (AccountInfo, writable)
    //   [2] Player's ATA for this mint (AccountInfo, writable)
}

pub fn handler<'info>(ctx: Context<'_, '_, 'info, 'info, ConsumeRandomness<'info>>) -> Result<()> {
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
fn handle_spawn<'info>(ctx: Context<'_, '_, 'info, 'info, ConsumeRandomness<'info>>, randomness: &[u8; 64]) -> Result<()> {
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
fn handle_throw<'info>(ctx: Context<'_, '_, 'info, 'info, ConsumeRandomness<'info>>, randomness: &[u8; 64]) -> Result<()> {
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
        let mut nft_transferred = false;

        if ctx.accounts.nft_vault.count > 0 {
            // Use bytes [8..16] for NFT selection (independent from catch roll)
            let nft_bytes: [u8; 8] = randomness[8..16].try_into().unwrap();
            let nft_index = (u64::from_le_bytes(nft_bytes) % ctx.accounts.nft_vault.count as u64) as usize;

            awarded_mint = ctx.accounts.nft_vault.mints[nft_index];

            // ALWAYS remove NFT from vault FIRST (prevents double-award).
            // Even if remaining_accounts don't contain the right transfer accounts,
            // the vault is updated atomically so no other catch can select this NFT.
            let last_idx = (ctx.accounts.nft_vault.count - 1) as usize;
            if nft_index != last_idx {
                ctx.accounts.nft_vault.mints[nft_index] = ctx.accounts.nft_vault.mints[last_idx];
            }
            ctx.accounts.nft_vault.mints[last_idx] = Pubkey::default();
            ctx.accounts.nft_vault.count = ctx.accounts.nft_vault.count.saturating_sub(1);

            // Search remaining_accounts for the awarded mint's transfer accounts.
            // Layout: groups of 3 [nft_mint, vault_ata, player_ata].
            // The frontend passes ALL vault NFTs; the program picks the winner here.
            let remaining = &ctx.remaining_accounts;
            let num_nft_groups = remaining.len() / 3;

            for i in 0..num_nft_groups {
                let ra_mint = &remaining[i * 3];
                let ra_vault_ata = &remaining[i * 3 + 1];
                let ra_player_ata = &remaining[i * 3 + 2];

                if ra_mint.key() == awarded_mint {
                    // Validate token account ownership (must be SPL Token program)
                    require!(
                        *ra_vault_ata.owner == token::ID,
                        GameError::NftTransferAccountsMissing
                    );
                    require!(
                        *ra_player_ata.owner == token::ID,
                        GameError::NftTransferAccountsMissing
                    );

                    // Transfer 1 NFT from vault ATA to player ATA
                    let nft_vault_seeds = &[
                        NFT_VAULT_SEED,
                        &[ctx.accounts.nft_vault.bump],
                    ];
                    let vault_signer_seeds = &[&nft_vault_seeds[..]];

                    let transfer_ctx = CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ra_vault_ata.to_account_info(),
                            to: ra_player_ata.to_account_info(),
                            authority: ctx.accounts.nft_vault.to_account_info(),
                        },
                        vault_signer_seeds,
                    );
                    token::transfer(transfer_ctx, 1)?;

                    nft_transferred = true;
                    break;
                }
            }

            emit!(NftAwarded {
                winner: player,
                nft_mint: awarded_mint,
                vault_remaining: ctx.accounts.nft_vault.count,
            });

            if !nft_transferred {
                msg!(
                    "WARNING: NFT {} removed from vault but transfer accounts not provided. Backend sweep required.",
                    awarded_mint
                );
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
            "Pokemon {} CAUGHT by {}! NFT: {} (transferred: {})",
            pokemon_id,
            player,
            if awarded_mint == Pubkey::default() { "none (vault empty)".to_string() }
            else { awarded_mint.to_string() },
            nft_transferred
        );
    } else {
        // === MISSED ===
        // Increment throw_attempts HERE (moved from throw_ball — matches ApeChain behavior).
        // This ensures unresolved VRF requests don't consume attempts.
        ctx.accounts.pokemon_slots.slots[slot_idx].throw_attempts = ctx.accounts.pokemon_slots.slots[slot_idx]
            .throw_attempts
            .checked_add(1)
            .ok_or(GameError::MathOverflow)?;

        let throw_attempts = ctx.accounts.pokemon_slots.slots[slot_idx].throw_attempts;

        if throw_attempts >= MAX_THROW_ATTEMPTS {
            // ApeChain behavior: RELOCATE the Pokemon (new random position, reset attempts).
            // Pokemon survives — it just moves to a new location with fresh attempts.
            let old_x = ctx.accounts.pokemon_slots.slots[slot_idx].pos_x;
            let old_y = ctx.accounts.pokemon_slots.slots[slot_idx].pos_y;

            // Use randomness bytes [16..20] for relocation position
            // (independent from catch roll [0..8] and NFT selection [8..16])
            let new_x = u16::from_le_bytes([randomness[16], randomness[17]]) % (MAX_COORDINATE + 1);
            let new_y = u16::from_le_bytes([randomness[18], randomness[19]]) % (MAX_COORDINATE + 1);

            ctx.accounts.pokemon_slots.slots[slot_idx].pos_x = new_x;
            ctx.accounts.pokemon_slots.slots[slot_idx].pos_y = new_y;
            ctx.accounts.pokemon_slots.slots[slot_idx].throw_attempts = 0;

            emit!(PokemonRelocated {
                pokemon_id,
                slot_index,
                old_x,
                old_y,
                new_x,
                new_y,
            });

            // After relocation: throw_attempts reset to 0, so attempts_remaining = 3
            emit!(FailedCatch {
                thrower: player,
                pokemon_id,
                slot_index,
                attempts_remaining: MAX_THROW_ATTEMPTS,
            });

            msg!(
                "Pokemon {} relocated from ({}, {}) to ({}, {}). Attempts reset to {}",
                pokemon_id, old_x, old_y, new_x, new_y, MAX_THROW_ATTEMPTS
            );
        } else {
            // Normal miss — Pokemon stays at same position
            let attempts_remaining = MAX_THROW_ATTEMPTS - throw_attempts;

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
    }

    // Mark VRF request fulfilled
    ctx.accounts.vrf_request.is_fulfilled = true;

    Ok(())
}
