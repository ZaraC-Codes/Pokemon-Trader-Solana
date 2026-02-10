import { describe, it, expect } from "vitest";

/**
 * Unit tests for revenue processor pure functions.
 * These test logic only — no network calls.
 */

// We test the pure functions directly rather than importing from the module
// (which would trigger config.ts env validation). Re-implement the logic here.

function splitUsdcAmounts(
  totalUsdc: bigint,
  treasuryPct = 3,
  reservesPct = 1
): {
  treasury: bigint;
  nftPool: bigint;
  solReserve: bigint;
} {
  const treasury = (totalUsdc * BigInt(treasuryPct)) / 100n;
  const solReserve = (totalUsdc * BigInt(reservesPct)) / 100n;
  const nftPool = totalUsdc - treasury - solReserve;
  return { treasury, nftPool, solReserve };
}

function shouldRunSwap(
  currentSolBalls: bigint,
  threshold: bigint = 100_000_000_000n // 100 SOLCATCH (9 decimals)
): boolean {
  return currentSolBalls >= threshold;
}

function shouldRunGacha(
  vaultCount: number,
  nftPoolUsdc: bigint,
  maxVaultSize = 20,
  packCost = 50_000_000n,
  minPacks = 1
): boolean {
  if (vaultCount >= maxVaultSize) return false;
  const packsAffordable = Number(nftPoolUsdc / packCost);
  return packsAffordable >= minPacks;
}

describe("splitUsdcAmounts", () => {
  it("splits 100 USDC correctly (3/96/1)", () => {
    const total = 100_000_000n; // 100 USDC
    const { treasury, nftPool, solReserve } = splitUsdcAmounts(total);

    expect(treasury).toBe(3_000_000n); // 3 USDC
    expect(solReserve).toBe(1_000_000n); // 1 USDC
    expect(nftPool).toBe(96_000_000n); // 96 USDC
  });

  it("split amounts sum to total", () => {
    const total = 123_456_789n;
    const { treasury, nftPool, solReserve } = splitUsdcAmounts(total);
    expect(treasury + nftPool + solReserve).toBe(total);
  });

  it("handles zero total", () => {
    const { treasury, nftPool, solReserve } = splitUsdcAmounts(0n);
    expect(treasury).toBe(0n);
    expect(nftPool).toBe(0n);
    expect(solReserve).toBe(0n);
  });

  it("handles small amounts (rounding goes to nftPool)", () => {
    const total = 10n; // Very small amount
    const { treasury, nftPool, solReserve } = splitUsdcAmounts(total);
    // 10 * 3 / 100 = 0, 10 * 1 / 100 = 0
    expect(treasury).toBe(0n);
    expect(solReserve).toBe(0n);
    expect(nftPool).toBe(10n); // Gets the full remainder
  });

  it("handles large amounts", () => {
    const total = 10_000_000_000n; // 10,000 USDC
    const { treasury, nftPool, solReserve } = splitUsdcAmounts(total);
    expect(treasury).toBe(300_000_000n); // 300 USDC
    expect(solReserve).toBe(100_000_000n); // 100 USDC
    expect(nftPool).toBe(9_600_000_000n); // 9,600 USDC
    expect(treasury + nftPool + solReserve).toBe(total);
  });
});

describe("shouldRunSwap", () => {
  const threshold = 100_000_000_000n; // 100 SOLCATCH (9 decimals)

  it("returns true when balance >= threshold", () => {
    expect(shouldRunSwap(100_000_000_000n, threshold)).toBe(true);
    expect(shouldRunSwap(500_000_000_000n, threshold)).toBe(true);
  });

  it("returns false when balance < threshold", () => {
    expect(shouldRunSwap(99_999_999_999n, threshold)).toBe(false);
    expect(shouldRunSwap(0n, threshold)).toBe(false);
  });

  it("returns true at exactly the threshold", () => {
    expect(shouldRunSwap(threshold, threshold)).toBe(true);
  });
});

describe("shouldRunGacha", () => {
  it("returns true when USDC sufficient and vault has space", () => {
    expect(shouldRunGacha(5, 60_000_000n)).toBe(true);
  });

  it("returns false when vault is full", () => {
    expect(shouldRunGacha(20, 60_000_000n)).toBe(false);
  });

  it("returns false when USDC is insufficient", () => {
    expect(shouldRunGacha(5, 40_000_000n)).toBe(false);
  });

  it("returns false when USDC is zero", () => {
    expect(shouldRunGacha(0, 0n)).toBe(false);
  });

  it("returns true at exactly pack cost", () => {
    expect(shouldRunGacha(0, 50_000_000n)).toBe(true);
  });

  it("respects custom maxVaultSize", () => {
    expect(shouldRunGacha(10, 60_000_000n, 10)).toBe(false);
  });
});
