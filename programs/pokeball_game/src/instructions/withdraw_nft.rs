use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_spl::associated_token::AssociatedToken;

use crate::state::*;
use crate::errors::GameError;
use crate::events::NftWithdrawn;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(nft_index: u8)]
pub struct WithdrawNft<'info> {
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

    /// Vault's NFT token account (source, PDA-owned).
    #[account(
        mut,
        constraint = vault_nft_account.mint == nft_vault.mints[nft_index as usize],
        constraint = vault_nft_account.amount == 1,
    )]
    pub vault_nft_account: Account<'info, TokenAccount>,

    /// Authority's NFT token account (destination).
    /// Created if it doesn't exist.
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = nft_mint,
        associated_token::authority = authority,
    )]
    pub authority_nft_account: Account<'info, TokenAccount>,

    /// The NFT mint.
    pub nft_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<WithdrawNft>, nft_index: u8) -> Result<()> {
    let nft_vault = &ctx.accounts.nft_vault;
    let idx = nft_index as usize;

    // Validate index
    require!(idx < nft_vault.count as usize, GameError::InvalidNftIndex);

    let nft_mint_key = nft_vault.mints[idx];

    // Transfer NFT from vault to authority using PDA signer
    let vault_seeds = &[
        NFT_VAULT_SEED,
        &[nft_vault.bump],
    ];
    let signer_seeds = &[&vault_seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault_nft_account.to_account_info(),
            to: ctx.accounts.authority_nft_account.to_account_info(),
            authority: ctx.accounts.nft_vault.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, 1)?;

    // Swap-and-pop removal from vault (O(1))
    let nft_vault = &mut ctx.accounts.nft_vault;
    let last_idx = (nft_vault.count - 1) as usize;
    if idx != last_idx {
        nft_vault.mints[idx] = nft_vault.mints[last_idx];
    }
    nft_vault.mints[last_idx] = Pubkey::default();
    nft_vault.count = nft_vault.count.saturating_sub(1);

    emit!(NftWithdrawn {
        nft_mint: nft_mint_key,
        vault_count: nft_vault.count,
    });

    msg!(
        "NFT {} withdrawn from vault. Vault count: {}",
        nft_mint_key, nft_vault.count
    );

    Ok(())
}
