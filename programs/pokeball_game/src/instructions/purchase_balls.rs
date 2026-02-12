use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::*;
use crate::errors::GameError;
use crate::events::BallPurchased;
use crate::constants::*;

#[derive(Accounts)]
pub struct PurchaseBalls<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        seeds = [GAME_CONFIG_SEED],
        bump = game_config.bump,
        constraint = game_config.is_initialized @ GameError::NotInitialized,
    )]
    pub game_config: Box<Account<'info, GameConfig>>,

    /// Player's SolBalls token account (source).
    #[account(
        mut,
        constraint = player_token_account.owner == player.key(),
        constraint = player_token_account.mint == game_config.solballs_mint,
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    /// Game's SolBalls token account (destination, PDA-owned).
    #[account(
        mut,
        constraint = game_solballs_account.owner == game_config.key(),
        constraint = game_solballs_account.mint == game_config.solballs_mint,
    )]
    pub game_solballs_account: Account<'info, TokenAccount>,

    /// Player inventory PDA. Created on first purchase via init_if_needed.
    #[account(
        init_if_needed,
        payer = player,
        space = PlayerInventory::LEN,
        seeds = [PLAYER_INV_SEED, player.key().as_ref()],
        bump,
    )]
    pub player_inventory: Account<'info, PlayerInventory>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<PurchaseBalls>,
    ball_type: u8,
    quantity: u32,
) -> Result<()> {
    // Validate ball type
    require!(
        (ball_type as usize) < NUM_BALL_TYPES,
        GameError::InvalidBallType
    );

    // Validate quantity
    require!(quantity > 0, GameError::ZeroQuantity);

    let game_config = &ctx.accounts.game_config;
    let price_per_ball = game_config.ball_prices[ball_type as usize];

    // Calculate total cost (checked multiplication)
    let total_cost = (price_per_ball as u128)
        .checked_mul(quantity as u128)
        .ok_or(GameError::MathOverflow)?;

    // Ensure it fits in u64
    require!(total_cost <= u64::MAX as u128, GameError::MathOverflow);
    let total_cost = total_cost as u64;

    // Enforce maximum purchase amount per transaction (matches ApeChain MAX_PURCHASE_USD)
    require!(
        total_cost <= MAX_PURCHASE_AMOUNT,
        GameError::PurchaseExceedsMax
    );

    // Check player has sufficient balance
    require!(
        ctx.accounts.player_token_account.amount >= total_cost,
        GameError::InsufficientSolBalls
    );

    // Transfer SolBalls from player to game account
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.player_token_account.to_account_info(),
            to: ctx.accounts.game_solballs_account.to_account_info(),
            authority: ctx.accounts.player.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, total_cost)?;

    // Update player inventory
    let inventory = &mut ctx.accounts.player_inventory;
    if inventory.player == Pubkey::default() {
        // First-time initialization
        inventory.player = ctx.accounts.player.key();
        inventory.bump = ctx.bumps.player_inventory;
    }

    inventory.balls[ball_type as usize] = inventory.balls[ball_type as usize]
        .checked_add(quantity)
        .ok_or(GameError::MathOverflow)?;
    inventory.total_purchased = inventory.total_purchased
        .checked_add(quantity as u64)
        .ok_or(GameError::MathOverflow)?;

    // Update game revenue
    let game_config = &mut ctx.accounts.game_config;
    game_config.total_revenue = game_config.total_revenue
        .checked_add(total_cost)
        .ok_or(GameError::MathOverflow)?;

    // Emit event
    emit!(BallPurchased {
        buyer: ctx.accounts.player.key(),
        ball_type,
        quantity,
        total_cost,
    });

    msg!(
        "Player {} purchased {} balls of type {} for {} SolBalls",
        ctx.accounts.player.key(),
        quantity,
        ball_type,
        total_cost
    );

    Ok(())
}
