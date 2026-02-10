use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::GameError;
use crate::events::*;
use crate::constants::*;

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GAME_CONFIG_SEED],
        bump = game_config.bump,
        constraint = game_config.is_initialized @ GameError::NotInitialized,
        constraint = game_config.authority == authority.key() @ GameError::Unauthorized,
    )]
    pub game_config: Box<Account<'info, GameConfig>>,
}

pub fn set_ball_price_handler(
    ctx: Context<AdminConfig>,
    ball_type: u8,
    new_price: u64,
) -> Result<()> {
    require!(
        (ball_type as usize) < NUM_BALL_TYPES,
        GameError::InvalidBallType
    );
    require!(new_price > 0, GameError::ZeroBallPrice);

    let game_config = &mut ctx.accounts.game_config;
    let old_price = game_config.ball_prices[ball_type as usize];
    game_config.ball_prices[ball_type as usize] = new_price;

    emit!(BallPriceUpdated {
        ball_type,
        old_price,
        new_price,
    });

    msg!(
        "Ball type {} price updated: {} -> {}",
        ball_type, old_price, new_price
    );

    Ok(())
}

pub fn set_catch_rate_handler(
    ctx: Context<AdminConfig>,
    ball_type: u8,
    new_rate: u8,
) -> Result<()> {
    require!(
        (ball_type as usize) < NUM_BALL_TYPES,
        GameError::InvalidBallType
    );
    require!(new_rate <= 100, GameError::InvalidCatchRate);

    let game_config = &mut ctx.accounts.game_config;
    let old_rate = game_config.catch_rates[ball_type as usize];
    game_config.catch_rates[ball_type as usize] = new_rate;

    emit!(CatchRateUpdated {
        ball_type,
        old_rate,
        new_rate,
    });

    msg!(
        "Ball type {} catch rate updated: {}% -> {}%",
        ball_type, old_rate, new_rate
    );

    Ok(())
}

pub fn set_max_active_pokemon_handler(
    ctx: Context<AdminConfig>,
    new_max: u8,
) -> Result<()> {
    require!(
        new_max >= 1 && new_max <= MAX_POKEMON_SLOTS as u8,
        GameError::InvalidMaxActivePokemon
    );

    let game_config = &mut ctx.accounts.game_config;
    let old_max = game_config.max_active_pokemon;
    game_config.max_active_pokemon = new_max;

    emit!(MaxActivePokemonUpdated {
        old_max,
        new_max,
    });

    msg!(
        "Max active Pokemon updated: {} -> {}",
        old_max, new_max
    );

    Ok(())
}
