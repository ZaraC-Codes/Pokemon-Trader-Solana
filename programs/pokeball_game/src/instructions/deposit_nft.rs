use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_spl::associated_token::AssociatedToken;

use crate::state::*;
use crate::errors::GameError;
use crate::events::NftDeposited;
use crate::constants::*;

#[derive(Accounts)]
pub struct DepositNft<'info> {
    #[account(mut)]
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
        seeds = [NFT_VAULT_SEED],
        bump = nft_vault.bump,
    )]
    pub nft_vault: Box<Account<'info, NftVault>>,

    /// The NFT mint (Metaplex NFT = SPL token with 0 decimals, supply 1).
    pub nft_mint: Account<'info, Mint>,

    /// Authority's NFT token account (source).
    #[account(
        mut,
        constraint = source_nft_account.owner == authority.key(),
        constraint = source_nft_account.mint == nft_mint.key(),
        constraint = source_nft_account.amount == 1,
    )]
    pub source_nft_account: Account<'info, TokenAccount>,

    /// Vault's NFT token account (destination, PDA-owned ATA).
    /// Created if it doesn't exist.
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = nft_mint,
        associated_token::authority = nft_vault,
    )]
    pub vault_nft_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositNft>) -> Result<()> {
    let nft_vault = &ctx.accounts.nft_vault;

    // Check vault isn't full
    require!(
        nft_vault.count < nft_vault.max_size,
        GameError::VaultFull
    );

    let nft_mint_key = ctx.accounts.nft_mint.key();

    // Transfer NFT from authority to vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.source_nft_account.to_account_info(),
            to: ctx.accounts.vault_nft_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, 1)?;

    // Add mint to vault tracking
    let nft_vault = &mut ctx.accounts.nft_vault;
    let next_idx = nft_vault.count as usize;
    nft_vault.mints[next_idx] = nft_mint_key;
    nft_vault.count = nft_vault.count
        .checked_add(1)
        .ok_or(GameError::MathOverflow)?;

    emit!(NftDeposited {
        nft_mint: nft_mint_key,
        vault_count: nft_vault.count,
    });

    msg!(
        "NFT {} deposited into vault. Vault count: {}",
        nft_mint_key, nft_vault.count
    );

    Ok(())
}
