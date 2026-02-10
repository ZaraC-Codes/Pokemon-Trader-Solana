use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::*;
use crate::errors::GameError;
use crate::events::RevenueWithdrawn;
use crate::constants::*;

#[derive(Accounts)]
pub struct WithdrawRevenue<'info> {
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
        seeds = [TREASURY_SEED],
        bump = treasury_config.bump,
    )]
    pub treasury_config: Account<'info, TreasuryConfig>,

    /// Game's SolBalls token account (source, PDA-owned).
    #[account(
        mut,
        constraint = game_solballs_account.owner == game_config.key(),
        constraint = game_solballs_account.mint == game_config.solballs_mint,
    )]
    pub game_solballs_account: Account<'info, TokenAccount>,

    /// Authority's SolBalls token account (destination).
    #[account(
        mut,
        constraint = authority_solballs_account.owner == authority.key(),
        constraint = authority_solballs_account.mint == game_config.solballs_mint,
    )]
    pub authority_solballs_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<WithdrawRevenue>, amount: u64) -> Result<()> {
    require!(amount > 0, GameError::InsufficientWithdrawalAmount);

    // Check the game has enough SolBalls
    require!(
        ctx.accounts.game_solballs_account.amount >= amount,
        GameError::InsufficientWithdrawalAmount
    );

    // Transfer SolBalls from game PDA to authority using PDA signer
    let config_seeds = &[
        GAME_CONFIG_SEED,
        &[ctx.accounts.game_config.bump],
    ];
    let signer_seeds = &[&config_seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.game_solballs_account.to_account_info(),
            to: ctx.accounts.authority_solballs_account.to_account_info(),
            authority: ctx.accounts.game_config.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, amount)?;

    // Update treasury tracking
    let treasury_config = &mut ctx.accounts.treasury_config;
    treasury_config.total_withdrawn = treasury_config.total_withdrawn
        .checked_add(amount)
        .ok_or(GameError::MathOverflow)?;

    emit!(RevenueWithdrawn {
        recipient: ctx.accounts.authority.key(),
        amount,
    });

    msg!(
        "Withdrawn {} SolBalls to authority {}",
        amount, ctx.accounts.authority.key()
    );

    Ok(())
}
