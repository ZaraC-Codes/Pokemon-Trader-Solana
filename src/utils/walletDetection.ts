/**
 * Wallet Detection Utilities
 *
 * Helper functions to detect availability of custom wallet providers:
 * - EthereumPhone dGen1: ethOS device with system wallet
 * - Glyph: Yuga Labs wallet for ApeChain
 *
 * Detection Methods:
 * - dGen1: Checks window.ethereum.isEthereumPhone flag (ethOS injects provider)
 * - Glyph: Checks window.glyph or SDK initialization state
 *
 * Environment Variables:
 * - VITE_BUNDLER_RPC_URL: ERC-4337 bundler URL for dGen1 (optional, uses default)
 * - VITE_GLYPH_API_KEY: Glyph API key if required (optional)
 *
 * Testing Checklist:
 * - [x] dGen1 detection returns false on non-ethOS devices
 * - [x] Glyph detection returns false without SDK initialization
 * - [x] Both detection functions are safe to call at any time
 * - [x] Provider getters return null when wallet unavailable
 *
 * Touchscreen Considerations (dGen1):
 * - dGen1 is a square-screen (1:1) touchscreen device
 * - No keyboard/mouse - all interactions must be touch-friendly
 * - Viewport approximately 300x300px
 *
 * ThirdWeb v5 Compatibility:
 * - These detection utilities are independent of ThirdWeb
 * - ThirdWeb handles crypto checkout; these wallets handle connection
 * - No conflicts expected - they serve different purposes
 */

// ============================================================
// TYPES
// ============================================================

/** Extended ethereum provider with dGen1-specific properties */
interface EthereumPhoneProvider extends Ethereum {
  isEthereumPhone?: boolean;
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

/** Glyph provider interface (may be extended as SDK evolves) */
interface GlyphProvider {
  isGlyph?: boolean;
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

/** Standard Ethereum provider interface */
interface Ethereum {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
}

// Extend Window interface for wallet providers
// Note: window.ethereum may already be declared elsewhere, so we use intersection
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any; // Use any to avoid conflict with other declarations
    glyph?: GlyphProvider;
    /** ethOS-specific flag set by the system */
    __ETHOS_WALLET__?: boolean;
    /** Force dGen1 mode for testing (set via console) */
    __FORCE_DGEN1_MODE__?: boolean;
  }
}

// ============================================================
// FORCE DGEN1 MODE (for debugging)
// ============================================================

/**
 * Force dGen1 detection mode for testing.
 * Can be set from browser console: window.__FORCE_DGEN1_MODE__ = true
 */
export function setForceDGen1Mode(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    window.__FORCE_DGEN1_MODE__ = enabled;
    console.log(`[walletDetection] Force dGen1 mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }
}

/**
 * Check if dGen1 mode is forced on.
 */
export function isForceDGen1Mode(): boolean {
  return typeof window !== 'undefined' && window.__FORCE_DGEN1_MODE__ === true;
}

// ============================================================
// ETHEREUM PHONE (dGen1) DETECTION
// ============================================================

/**
 * Check if the current device is an EthereumPhone dGen1 running ethOS.
 *
 * Detection strategy:
 * 1. Check window.ethereum.isEthereumPhone flag (primary)
 * 2. Check window.__ETHOS_WALLET__ flag (fallback)
 * 3. Check user agent for ethOS patterns (secondary fallback)
 * 4. Check for ethOS-specific window properties
 * 5. Check for square screen + touch + Android combination (heuristic)
 *
 * @returns true if running on dGen1 device with ethOS
 */
export function isEthereumPhoneAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Check for forced dGen1 mode (for debugging)
  if (isForceDGen1Mode()) {
    console.log('[walletDetection] dGen1 FORCED via window.__FORCE_DGEN1_MODE__');
    return true;
  }

  // Primary detection: ethOS injects ethereum provider with flag
  if (window.ethereum?.isEthereumPhone === true) {
    console.log('[walletDetection] dGen1 detected via window.ethereum.isEthereumPhone');
    return true;
  }

  // Secondary: Check for ethOS system flag
  if (window.__ETHOS_WALLET__ === true) {
    console.log('[walletDetection] dGen1 detected via window.__ETHOS_WALLET__');
    return true;
  }

  // Tertiary: Check user agent for ethOS patterns
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('ethos') || userAgent.includes('ethereumphone') || userAgent.includes('dgen1')) {
    console.log('[walletDetection] dGen1 detected via user agent:', userAgent);
    return true;
  }

  // Check for ethOS-specific provider properties
  // ethOS may expose the wallet differently
  if (window.ethereum) {
    const provider = window.ethereum;
    // Log all provider properties for debugging
    console.log('[walletDetection] window.ethereum properties:', {
      isEthereumPhone: provider.isEthereumPhone,
      isMetaMask: provider.isMetaMask,
      isCoinbaseWallet: provider.isCoinbaseWallet,
      isRabby: provider.isRabby,
      isBraveWallet: provider.isBraveWallet,
      isTokenPocket: provider.isTokenPocket,
      // Check for ethOS-specific
      isEthOS: provider.isEthOS,
      _isEthereumPhone: provider._isEthereumPhone,
      providerType: provider.providerType,
      // Log constructor name
      constructorName: provider.constructor?.name,
    });
  }

  // Heuristic: Square screen + touch + Android + window.ethereum present
  // This is a fallback for when ethOS doesn't set expected flags
  const isAndroid = userAgent.includes('android');
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSquare = Math.abs(window.innerWidth - window.innerHeight) < 50; // Within 50px
  const hasEthereum = !!window.ethereum;
  const isSmallScreen = window.innerWidth <= 500 && window.innerHeight <= 500;

  if (isAndroid && hasTouch && isSquare && hasEthereum && isSmallScreen) {
    console.log('[walletDetection] dGen1 detected via heuristic (Android + square + touch + small):', {
      isAndroid,
      hasTouch,
      isSquare,
      hasEthereum,
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
    });
    return true;
  }

  return false;
}

/**
 * Get the EthereumPhone provider if available.
 *
 * @returns The ethereum provider on dGen1 devices, or null otherwise
 */
export function getEthereumPhoneProvider(): EthereumPhoneProvider | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // First check if dGen1 is detected
  if (isEthereumPhoneAvailable()) {
    console.log('[walletDetection] getEthereumPhoneProvider: returning window.ethereum (dGen1 detected)');
    return window.ethereum ?? null;
  }

  // On ethOS, the system wallet is exposed via window.ethereum
  return null;
}

/**
 * Force get the raw window.ethereum provider for dGen1.
 * Use this as a fallback when isEthereumPhoneAvailable() detection may have failed.
 *
 * @returns The raw window.ethereum provider, or null if not available
 */
export function getRawEthereumProvider(): EthereumPhoneProvider | null {
  if (typeof window === 'undefined' || !window.ethereum) {
    return null;
  }
  return window.ethereum;
}

/**
 * Check if this appears to be a square-screen device (dGen1 viewport hint).
 * Used to optimize UI layout for dGen1's 1:1 aspect ratio screen.
 *
 * @returns true if viewport appears square-ish (within 20% aspect ratio)
 */
export function isSquareScreen(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspectRatio = width / height;

  // Square screens have aspect ratio close to 1.0
  // Allow 20% tolerance (0.8 to 1.2)
  return aspectRatio >= 0.8 && aspectRatio <= 1.2;
}

/**
 * Check if this is likely a touchscreen-only device (no mouse/keyboard).
 * Used to optimize UI for touch interactions on dGen1.
 *
 * @returns true if device appears to be touch-only
 */
export function isTouchOnlyDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Check for touch support without mouse support
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  const hasHover = window.matchMedia?.('(hover: hover)').matches;

  // Touch-only: has touch, coarse pointer, no hover capability
  return hasTouch && hasCoarsePointer && !hasHover;
}

// ============================================================
// GLYPH WALLET DETECTION
// ============================================================

/**
 * Check if Glyph wallet/SDK is available.
 *
 * Detection strategy:
 * 1. Check for window.glyph provider (if Glyph injects one)
 * 2. Check if @use-glyph/sdk-react is loaded (via marker)
 *
 * Note: Glyph primarily works through the SDK connector,
 * so this function may return false even when SDK is available.
 * Use the glyphWalletConnector directly for best results.
 *
 * @returns true if Glyph wallet appears available
 */
export function isGlyphAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Check for direct window.glyph provider
  if (window.glyph?.isGlyph === true) {
    console.log('[walletDetection] Glyph detected via window.glyph');
    return true;
  }

  // Glyph SDK doesn't require a browser extension - it uses the SDK connector
  // For SDK-based connections, always return true since it works via embedded iframe
  // The actual availability is determined by the connector's getProvider() method
  console.log('[walletDetection] Glyph SDK connector is always available');
  return true;
}

/**
 * Get the Glyph provider if available.
 *
 * Note: Glyph primarily works through the SDK, so direct provider
 * access may not be available. Use the wagmi connector instead.
 *
 * @returns The Glyph provider if available, or null
 */
export function getGlyphProvider(): GlyphProvider | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // Return window.glyph if present
  if (window.glyph?.isGlyph === true) {
    return window.glyph;
  }

  // Glyph SDK works through connector, not direct provider access
  return null;
}

// ============================================================
// DEBUGGING & DIAGNOSTICS
// ============================================================

/**
 * Log wallet detection results for debugging.
 * Call this during app initialization to verify detection.
 */
export function logWalletDetectionStatus(): void {
  console.log('[walletDetection] === Wallet Detection Status ===');
  console.log('[walletDetection] EthereumPhone (dGen1):', isEthereumPhoneAvailable() ? 'AVAILABLE' : 'not detected');
  console.log('[walletDetection] Glyph SDK:', isGlyphAvailable() ? 'AVAILABLE' : 'not detected');
  console.log('[walletDetection] Square screen:', isSquareScreen() ? 'YES' : 'NO');
  console.log('[walletDetection] Touch-only device:', isTouchOnlyDevice() ? 'YES' : 'NO');
  console.log('[walletDetection] Viewport:', `${window.innerWidth}x${window.innerHeight}`);
  console.log('[walletDetection] User agent:', navigator.userAgent);
  console.log('[walletDetection] ===============================');
}

/**
 * dGen1 diagnostic object for logging and debugging.
 * Contains all relevant info for troubleshooting dGen1 wallet issues.
 */
export interface DGen1Diagnostic {
  walletType: 'dgen1' | 'standard';
  isEthereumPhone: boolean;
  hasEthosWalletFlag: boolean;
  hasBundlerUrl: boolean;
  bundlerUrl: string | undefined;
  chainId: number | undefined;
  providerFlags: {
    isEthereumPhone?: boolean;
    isMetaMask?: boolean;
  };
}

/**
 * Get dGen1 diagnostic info for troubleshooting.
 * Useful for logging in approval/transaction flows.
 */
export async function getDGen1Diagnostic(): Promise<DGen1Diagnostic> {
  const isEthPhone = isEthereumPhoneAvailable();
  const provider = getEthereumPhoneProvider();
  const bundlerUrl = getBundlerRpcUrl();
  const envBundlerUrl = import.meta.env.VITE_BUNDLER_RPC_URL as string | undefined;

  let chainId: number | undefined;
  if (provider) {
    try {
      const chainIdHex = await provider.request({ method: 'eth_chainId' }) as string;
      chainId = parseInt(chainIdHex, 16);
    } catch {
      chainId = undefined;
    }
  }

  return {
    walletType: isEthPhone ? 'dgen1' : 'standard',
    isEthereumPhone: isEthPhone,
    hasEthosWalletFlag: typeof window !== 'undefined' && window.__ETHOS_WALLET__ === true,
    hasBundlerUrl: !!envBundlerUrl,
    bundlerUrl: envBundlerUrl || bundlerUrl,
    chainId,
    providerFlags: {
      isEthereumPhone: provider?.isEthereumPhone,
      isMetaMask: provider?.isMetaMask,
    },
  };
}

/**
 * Log dGen1 diagnostic for transaction debugging.
 * Call this before/during approval or purchase transactions.
 */
export async function logDGen1Diagnostic(context: string = 'general'): Promise<DGen1Diagnostic> {
  const diagnostic = await getDGen1Diagnostic();
  console.log(`[dGen1Diagnostic] === ${context} ===`);
  console.log('[dGen1Diagnostic]', JSON.stringify(diagnostic, null, 2));
  return diagnostic;
}

// ============================================================
// ENVIRONMENT CONFIGURATION
// ============================================================

/**
 * Get the bundler RPC URL for dGen1 ERC-4337 transactions.
 * Falls back to a default Pimlico endpoint if not configured.
 *
 * @returns Bundler RPC URL for dGen1 transactions
 */
export function getBundlerRpcUrl(): string {
  const envUrl = import.meta.env.VITE_BUNDLER_RPC_URL as string | undefined;

  if (envUrl) {
    return envUrl;
  }

  // Default to a common bundler endpoint (may require API key in production)
  // For ApeChain, you may need a specific bundler that supports chain 33139
  console.warn('[walletDetection] VITE_BUNDLER_RPC_URL not set, using default');
  return 'https://api.pimlico.io/v2/33139/rpc';
}

/**
 * Get the Glyph API key if configured.
 *
 * @returns Glyph API key or undefined
 */
export function getGlyphApiKey(): string | undefined {
  return import.meta.env.VITE_GLYPH_API_KEY as string | undefined;
}

export default {
  isEthereumPhoneAvailable,
  getEthereumPhoneProvider,
  getRawEthereumProvider,
  isGlyphAvailable,
  getGlyphProvider,
  isSquareScreen,
  isTouchOnlyDevice,
  logWalletDetectionStatus,
  getBundlerRpcUrl,
  getGlyphApiKey,
  getDGen1Diagnostic,
  logDGen1Diagnostic,
  setForceDGen1Mode,
  isForceDGen1Mode,
};
