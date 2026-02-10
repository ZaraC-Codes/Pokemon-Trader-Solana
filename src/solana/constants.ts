/**
 * Solana Program Constants
 *
 * PDA seeds, program IDs, and game constants for the pokeball_game Anchor program.
 */

import { PublicKey } from '@solana/web3.js';

// ============================================================
// PROGRAM IDS
// ============================================================

export const POKEBALL_GAME_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_POKEBALL_GAME_PROGRAM_ID || 'B93VJQKD5UW8qfNsLrQ4ZQvTG6AG7PZsR6o2WeBiboBZ'
);

export const ORAO_VRF_PROGRAM_ID = new PublicKey(
  'VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y'
);

// ============================================================
// TOKEN MINTS
// ============================================================

export const SOLBALLS_MINT = new PublicKey(
  import.meta.env.VITE_SOLBALLS_MINT || '11111111111111111111111111111111'
);

export const USDC_MINT = new PublicKey(
  import.meta.env.VITE_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

// ============================================================
// PDA SEEDS
// ============================================================

export const GAME_CONFIG_SEED = 'game_config';
export const POKEMON_SLOTS_SEED = 'pokemon_slots';
export const PLAYER_INV_SEED = 'player_inv';
export const NFT_VAULT_SEED = 'nft_vault';
export const TREASURY_SEED = 'treasury';
export const VRF_REQ_SEED = 'vrf_req';
export const GAME_SOLBALLS_SEED = 'game_solballs';

// ============================================================
// GAME CONSTANTS
// ============================================================

export const MAX_POKEMON_SLOTS = 20;
export const MAX_COORDINATE = 999;
export const MAX_THROW_ATTEMPTS = 3;
export const MAX_VAULT_SIZE = 20;
export const NUM_BALL_TYPES = 4;

export const VRF_TYPE_SPAWN = 0;
export const VRF_TYPE_THROW = 1;

// Token decimals
export const SOLBALLS_DECIMALS = 6;

// ============================================================
// BALL TYPES
// ============================================================

export type BallType = 0 | 1 | 2 | 3;

export const BALL_NAMES: Record<BallType, string> = {
  0: 'Poke Ball',
  1: 'Great Ball',
  2: 'Ultra Ball',
  3: 'Master Ball',
};

export const DEFAULT_BALL_PRICES: Record<BallType, number> = {
  0: 1_000_000,    // 1.0 SolBalls
  1: 10_000_000,   // 10.0 SolBalls
  2: 25_000_000,   // 25.0 SolBalls
  3: 49_900_000,   // 49.9 SolBalls
};

export const DEFAULT_CATCH_RATES: Record<BallType, number> = {
  0: 2,
  1: 20,
  2: 50,
  3: 99,
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

export function getBallTypeName(ballType: BallType): string {
  return BALL_NAMES[ballType] ?? 'Unknown Ball';
}

export function getBallPriceDisplay(priceAtomicUnits: number): number {
  return priceAtomicUnits / 10 ** SOLBALLS_DECIMALS;
}

export function getCatchRatePercent(ballType: BallType): number {
  return DEFAULT_CATCH_RATES[ballType] ?? 0;
}

// ============================================================
// PDA DERIVATION HELPERS
// ============================================================

export function getGameConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(GAME_CONFIG_SEED)],
    POKEBALL_GAME_PROGRAM_ID
  );
}

export function getPokemonSlotsPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(POKEMON_SLOTS_SEED)],
    POKEBALL_GAME_PROGRAM_ID
  );
}

export function getPlayerInventoryPDA(player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PLAYER_INV_SEED), player.toBuffer()],
    POKEBALL_GAME_PROGRAM_ID
  );
}

export function getNftVaultPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(NFT_VAULT_SEED)],
    POKEBALL_GAME_PROGRAM_ID
  );
}

export function getTreasuryConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(TREASURY_SEED)],
    POKEBALL_GAME_PROGRAM_ID
  );
}

export function getVrfRequestPDA(seed: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(VRF_REQ_SEED), seed],
    POKEBALL_GAME_PROGRAM_ID
  );
}
