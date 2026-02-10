use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use anchor_spl::associated_token::AssociatedToken;

use crate::state::*;
use crate::errors::GameError;
use crate::constants::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = GameConfig::LEN,
        seeds = [GAME_CONFIG_SEED],
        bump,
    )]
    pub game_config: Box<Account<'info, GameConfig>>,

    #[account(
        init,
        payer = authority,
        space = PokemonSlots::LEN,
        seeds = [POKEMON_SLOTS_SEED],
        bump,
    )]
    pub pokemon_slots: Box<Account<'info, PokemonSlots>>,

    #[account(
        init,
        payer = authority,
        space = NftVault::LEN,
        seeds = [NFT_VAULT_SEED],
        bump,
    )]
    pub nft_vault: Box<Account<'info, NftVault>>,

    #[account(
        init,
        payer = authority,
        space = TreasuryConfig::LEN,
        seeds = [TREASURY_SEED],
        bump,
    )]
    pub treasury_config: Account<'info, TreasuryConfig>,

    /// The SolBalls token mint.
    pub solballs_mint: Account<'info, Mint>,

    /// The game's SolBalls token account (PDA-owned ATA).
    /// Receives SolBalls from ball purchases.
    #[account(
        init,
        payer = authority,
        associated_token::mint = solballs_mint,
        associated_token::authority = game_config,
    )]
    pub game_solballs_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<Initialize>,
    treasury: Pubkey,
    solballs_mint: Pubkey,
    usdc_mint: Pubkey,
    ball_prices: [u64; 4],
    catch_rates: [u8; 4],
) -> Result<()> {
    // Validate ball prices
    for price in ball_prices.iter() {
        require!(*price > 0, GameError::ZeroBallPrice);
    }

    // Validate catch rates
    for rate in catch_rates.iter() {
        require!(*rate <= 100, GameError::InvalidCatchRate);
    }

    // Verify the solballs_mint matches the account passed in
    require!(
        ctx.accounts.solballs_mint.key() == solballs_mint,
        GameError::Unauthorized
    );

    // Initialize GameConfig
    let game_config = &mut ctx.accounts.game_config;
    game_config.authority = ctx.accounts.authority.key();
    game_config.treasury = treasury;
    game_config.solballs_mint = solballs_mint;
    game_config.usdc_mint = usdc_mint;
    game_config.ball_prices = ball_prices;
    game_config.catch_rates = catch_rates;
    game_config.max_active_pokemon = MAX_POKEMON_SLOTS as u8;
    game_config.pokemon_id_counter = 0;
    game_config.total_revenue = 0;
    game_config.is_initialized = true;
    game_config.vrf_counter = 0;
    game_config.bump = ctx.bumps.game_config;

    // Initialize PokemonSlots
    let pokemon_slots = &mut ctx.accounts.pokemon_slots;
    pokemon_slots.slots = [PokemonSlot::default(); MAX_POKEMON_SLOTS];
    pokemon_slots.active_count = 0;
    pokemon_slots.bump = ctx.bumps.pokemon_slots;

    // Initialize NftVault
    let nft_vault = &mut ctx.accounts.nft_vault;
    nft_vault.authority = ctx.accounts.authority.key();
    nft_vault.mints = [Pubkey::default(); MAX_POKEMON_SLOTS];
    nft_vault.count = 0;
    nft_vault.max_size = MAX_VAULT_SIZE;
    nft_vault.bump = ctx.bumps.nft_vault;

    // Initialize TreasuryConfig
    let treasury_config = &mut ctx.accounts.treasury_config;
    treasury_config.treasury_wallet = treasury;
    treasury_config.total_withdrawn = 0;
    treasury_config.bump = ctx.bumps.treasury_config;

    msg!("Game initialized. Authority: {}", ctx.accounts.authority.key());
    Ok(())
}
