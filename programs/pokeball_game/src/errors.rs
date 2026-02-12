use anchor_lang::prelude::*;

#[error_code]
pub enum GameError {
    #[msg("Game has already been initialized")]
    AlreadyInitialized,

    #[msg("Game has not been initialized")]
    NotInitialized,

    #[msg("Invalid ball type. Must be 0-3 (Poke, Great, Ultra, Master)")]
    InvalidBallType,

    #[msg("Invalid catch rate. Must be 0-100")]
    InvalidCatchRate,

    #[msg("Insufficient ball balance for this throw")]
    InsufficientBalls,

    #[msg("Pokemon slot is not active")]
    SlotNotActive,

    #[msg("Pokemon slot is already occupied")]
    SlotAlreadyOccupied,

    #[msg("Invalid slot index. Must be 0-19")]
    InvalidSlotIndex,

    #[msg("Maximum throw attempts reached for this Pokemon")]
    MaxAttemptsReached,

    #[msg("Invalid coordinate. Must be 0-999")]
    InvalidCoordinate,

    #[msg("Maximum active Pokemon limit reached")]
    MaxActivePokemonReached,

    #[msg("Invalid max active Pokemon value. Must be 1-20")]
    InvalidMaxActivePokemon,

    #[msg("NFT vault is full (max 20)")]
    VaultFull,

    #[msg("NFT vault is empty")]
    VaultEmpty,

    #[msg("Invalid NFT index in vault")]
    InvalidNftIndex,

    #[msg("NFT mint not found in vault")]
    NftNotInVault,

    #[msg("Insufficient SolBalls balance for purchase")]
    InsufficientSolBalls,

    #[msg("Purchase quantity must be greater than 0")]
    ZeroQuantity,

    #[msg("Purchase exceeds maximum allowed per transaction")]
    PurchaseExceedsMax,

    #[msg("VRF request has already been fulfilled")]
    VrfAlreadyFulfilled,

    #[msg("VRF randomness not yet fulfilled by ORAO")]
    VrfNotFulfilled,

    #[msg("Invalid VRF request type")]
    InvalidVrfRequestType,

    #[msg("Insufficient withdrawal amount")]
    InsufficientWithdrawalAmount,

    #[msg("Numerical overflow in calculation")]
    MathOverflow,

    #[msg("Ball price must be greater than 0")]
    ZeroBallPrice,

    #[msg("Unauthorized: only authority can call this instruction")]
    Unauthorized,

    #[msg("NFT transfer accounts not found in remaining_accounts for the awarded mint")]
    NftTransferAccountsMissing,
}
