/**
 * EthereumPhone (dGen1) Wagmi Connector
 *
 * Custom Wagmi connector for EthereumPhone dGen1 devices running ethOS.
 * The dGen1 is an Android device with a system wallet built on ERC-4337
 * Account Abstraction.
 *
 * Device Specifications:
 * - Square screen (1:1 aspect ratio, ~300x300px viewport)
 * - Touchscreen only (no keyboard/mouse)
 * - Android-based ethOS operating system
 * - System wallet using ERC-4337 bundler transactions
 *
 * Detection:
 * - Primary: window.ethereum.isEthereumPhone flag
 * - Secondary: window.__ETHOS_WALLET__ flag
 * - Tertiary: User agent contains "ethos" or "ethereumphone"
 *
 * Key Methods:
 * - getAddress(): Get wallet address
 * - signMessage(): Sign messages with optional personal_sign type
 * - sendTransaction(): Single or batched transactions
 * - changeChain(): Switch chains with bundler RPC update
 *
 * Environment Variables:
 * - VITE_BUNDLER_RPC_URL: ERC-4337 bundler endpoint (optional)
 *
 * Touchscreen Considerations:
 * - All interactive elements must be touch-friendly (min 44px targets)
 * - No hover-only interactions
 * - Use active/pressed states instead of hover
 *
 * ThirdWeb v5 Compatibility:
 * - This connector works alongside ThirdWeb's checkout functionality
 * - No conflicts - Wagmi handles connection, ThirdWeb handles payments
 */

import { createConnector } from 'wagmi';
import type { CreateConnectorFn } from 'wagmi';
import type { Address, Chain, Hex } from 'viem';
import {
  isEthereumPhoneAvailable,
  getEthereumPhoneProvider,
  getBundlerRpcUrl,
  getDGen1Diagnostic,
} from '../utils/walletDetection';

// ============================================================
// TYPES
// ============================================================

/** Configuration options for EthereumPhone connector */
export interface EthereumPhoneConnectorOptions {
  /** Custom bundler RPC URL for ERC-4337 transactions */
  bundlerRpcUrl?: string;
}

/** Provider interface for ethOS wallet */
interface EthOSProvider {
  isEthereumPhone?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
}

// ============================================================
// CONSTANTS
// ============================================================

/** Unique identifier for this connector */
const CONNECTOR_ID = 'ethereumPhone';

/** Human-readable wallet name */
const CONNECTOR_NAME = 'dGen1 Wallet';

/** Base64-encoded placeholder icon (orange phone shape) */
const CONNECTOR_ICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHg9IjI1IiB5PSI1IiB3aWR0aD0iNTAiIGhlaWdodD0iOTAiIHJ4PSI4IiBmaWxsPSIjRkY2NjAwIi8+CjxyZWN0IHg9IjMwIiB5PSIxNSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjYwIiByeD0iNCIgZmlsbD0iIzFhMWEyZSIvPgo8Y2lyY2xlIGN4PSI1MCIgY3k9Ijg1IiByPSI1IiBmaWxsPSIjMWExYTJlIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI0ZGNjYwMCIgZm9udC1zaXplPSIxNnB4IiBmb250LWZhbWlseT0ibW9ub3NwYWNlIj5FVEg8L3RleHQ+Cjwvc3ZnPg==';

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get the EthOS provider with proper typing.
 * @returns The provider or undefined if not available
 */
function getTypedProvider(): EthOSProvider | undefined {
  if (!isEthereumPhoneAvailable()) {
    console.log('[ethereumPhoneConnector] dGen1 not available');
    return undefined;
  }

  const provider = getEthereumPhoneProvider();
  if (!provider) {
    return undefined;
  }

  // Cast to our internal provider interface
  return provider as unknown as EthOSProvider;
}

// ============================================================
// CONNECTOR IMPLEMENTATION
// ============================================================

/**
 * Create an EthereumPhone dGen1 Wagmi connector.
 *
 * @param options - Optional connector configuration
 * @returns Wagmi connector for dGen1 devices
 */
export function ethereumPhoneConnector(
  options: EthereumPhoneConnectorOptions = {}
): CreateConnectorFn {
  const bundlerRpcUrl = options.bundlerRpcUrl ?? getBundlerRpcUrl();

  return createConnector((config) => ({
    id: CONNECTOR_ID,
    name: CONNECTOR_NAME,
    type: 'ethereumPhone',
    icon: CONNECTOR_ICON,

    // --------------------------------------------------------
    // Connection Methods
    // --------------------------------------------------------

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async connect(params?: any): Promise<any> {
      const { chainId, isReconnecting, withCapabilities } = params || {};
      console.log('[ethereumPhoneConnector] connect() called, chainId:', chainId);

      const provider = getTypedProvider();
      if (!provider) {
        throw new Error('EthereumPhone wallet not available. This feature requires a dGen1 device.');
      }

      // Request accounts from ethOS wallet
      let accounts: Address[] = [];

      if (isReconnecting) {
        accounts = (await this.getAccounts().catch(() => [])) as Address[];
      }

      if (!accounts.length) {
        const requestedAccounts = await provider.request({
          method: 'eth_requestAccounts',
        }) as Address[];
        accounts = requestedAccounts;
      }

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from dGen1 wallet');
      }

      // Get current chain ID
      let currentChainId = await this.getChainId();

      // Switch chain if requested and different
      if (chainId && chainId !== currentChainId) {
        try {
          await this.switchChain?.({ chainId });
          currentChainId = chainId;
        } catch (error) {
          console.warn('[ethereumPhoneConnector] Chain switch failed:', error);
          // Continue with current chain if switch fails
        }
      }

      console.log('[ethereumPhoneConnector] Connected:', {
        account: accounts[0],
        chainId: currentChainId,
        bundlerRpcUrl,
        isDGen1: true,
      });

      // Log connection diagnostic
      try {
        const diagnostic = await getDGen1Diagnostic();
        console.log('[ethereumPhoneConnector] Post-connection diagnostic:', JSON.stringify({
          ...diagnostic,
          connectedAddress: accounts[0],
          connectedChainId: currentChainId,
        }, null, 2));
      } catch {
        // Ignore diagnostic errors on connect
      }

      // Return type compatible with wagmi's conditional accounts type
      // When withCapabilities is true, return account objects; otherwise return addresses
      return {
        accounts: withCapabilities
          ? accounts.map((address) => ({ address, capabilities: {} }))
          : accounts,
        chainId: currentChainId,
      };
    },

    async disconnect() {
      console.log('[ethereumPhoneConnector] disconnect() called');
      // ethOS wallet doesn't have a disconnect method - just clear local state
      // The system wallet remains connected at OS level
    },

    // --------------------------------------------------------
    // Account Methods
    // --------------------------------------------------------

    async getAccounts() {
      const provider = getTypedProvider();
      if (!provider) {
        return [];
      }

      try {
        const accounts = await provider.request({
          method: 'eth_accounts',
        }) as Address[];
        return accounts;
      } catch {
        return [];
      }
    },

    async getChainId() {
      const provider = getTypedProvider();
      if (!provider) {
        // Return ApeChain as default
        return 33139;
      }

      try {
        const chainIdHex = await provider.request({
          method: 'eth_chainId',
        }) as string;
        return parseInt(chainIdHex, 16);
      } catch {
        return 33139; // Default to ApeChain
      }
    },

    async isAuthorized() {
      if (!isEthereumPhoneAvailable()) {
        return false;
      }

      try {
        const accounts = await this.getAccounts();
        return accounts.length > 0;
      } catch {
        return false;
      }
    },

    // --------------------------------------------------------
    // Provider Methods
    // --------------------------------------------------------

    async getProvider() {
      return getTypedProvider();
    },

    // --------------------------------------------------------
    // Chain Methods
    // --------------------------------------------------------

    async switchChain({ chainId }: { chainId: number }) {
      console.log('[ethereumPhoneConnector] switchChain() called, chainId:', chainId);

      const provider = getTypedProvider();
      if (!provider) {
        throw new Error('Provider not available');
      }

      const chain = config.chains.find((c: Chain) => c.id === chainId);
      if (!chain) {
        throw new Error(`Chain ${chainId} not configured`);
      }

      const chainIdHex = `0x${chainId.toString(16)}` as Hex;

      // For ApeChain, use the known good RPC URL
      // This is critical for dGen1 as ethOS needs a working RPC for bundler operations
      let rpcUrl = chain.rpcUrls.default.http[0];
      if (chainId === 33139) {
        // ApeChain - use reliable public RPC
        rpcUrl = 'https://rpc.apechain.com/http';
        console.log('[ethereumPhoneConnector] Using ApeChain RPC:', rpcUrl);
      }

      try {
        // Try to switch to the chain
        console.log('[ethereumPhoneConnector] Attempting wallet_switchEthereumChain...');
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
        console.log('[ethereumPhoneConnector] wallet_switchEthereumChain succeeded');
      } catch (error: unknown) {
        const switchError = error as { code?: number; message?: string };
        console.log('[ethereumPhoneConnector] switchChain error:', {
          code: switchError.code,
          message: switchError.message,
        });

        // Chain not added to wallet - try to add it
        if (switchError.code === 4902) {
          console.log('[ethereumPhoneConnector] Chain not found, adding via wallet_addEthereumChain...');

          const addChainParams = {
            chainId: chainIdHex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [rpcUrl],
            blockExplorerUrls: chain.blockExplorers
              ? [chain.blockExplorers.default.url]
              : undefined,
          };

          console.log('[ethereumPhoneConnector] wallet_addEthereumChain params:', addChainParams);

          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [addChainParams],
          });

          console.log('[ethereumPhoneConnector] wallet_addEthereumChain succeeded');
        } else {
          throw error;
        }
      }

      console.log('[ethereumPhoneConnector] Chain switched to:', chainId);

      // Emit chain changed event
      config.emitter.emit('change', { chainId });

      return chain;
    },

    // --------------------------------------------------------
    // Event Handlers
    // --------------------------------------------------------

    onAccountsChanged(accounts: string[]) {
      console.log('[ethereumPhoneConnector] Accounts changed:', accounts);
      if (accounts.length === 0) {
        config.emitter.emit('disconnect');
      } else {
        config.emitter.emit('change', { accounts: accounts as readonly Address[] });
      }
    },

    onChainChanged(chainIdHex: string) {
      const chainId = parseInt(chainIdHex, 16);
      console.log('[ethereumPhoneConnector] Chain changed:', chainId);
      config.emitter.emit('change', { chainId });
    },

    onDisconnect(error?: Error) {
      console.log('[ethereumPhoneConnector] Disconnected', error ? `Error: ${error.message}` : '');
      config.emitter.emit('disconnect');
    },

    // --------------------------------------------------------
    // Setup & Teardown
    // --------------------------------------------------------

    async setup() {
      console.log('[ethereumPhoneConnector] setup() called');
      console.log('[ethereumPhoneConnector] Bundler RPC:', bundlerRpcUrl);

      // Log comprehensive diagnostic on setup
      try {
        const diagnostic = await getDGen1Diagnostic();
        console.log('[ethereumPhoneConnector] === dGen1 SETUP DIAGNOSTIC ===');
        console.log('[ethereumPhoneConnector] Diagnostic:', JSON.stringify(diagnostic, null, 2));

        if (!diagnostic.hasBundlerUrl) {
          console.warn('[ethereumPhoneConnector] ⚠️ WARNING: VITE_BUNDLER_RPC_URL not configured!');
          console.warn('[ethereumPhoneConnector] dGen1 ERC-4337 transactions require a bundler RPC.');
          console.warn('[ethereumPhoneConnector] For ApeChain (33139), set: VITE_BUNDLER_RPC_URL=<your-bundler-url>');
        }

        // Log provider detection details
        console.log('[ethereumPhoneConnector] Provider detection:', {
          isEthereumPhoneAvailable: isEthereumPhoneAvailable(),
          'window.ethereum?.isEthereumPhone': (window as unknown as { ethereum?: { isEthereumPhone?: boolean } }).ethereum?.isEthereumPhone,
          'window.__ETHOS_WALLET__': (window as unknown as { __ETHOS_WALLET__?: boolean }).__ETHOS_WALLET__,
          userAgent: navigator.userAgent,
        });
      } catch (diagError) {
        console.error('[ethereumPhoneConnector] Failed to get diagnostic:', diagError);
      }

      const provider = getTypedProvider();
      if (provider?.on) {
        // Wrap handlers to match provider's expected signature
        provider.on('accountsChanged', (...args: unknown[]) => {
          const accounts = args[0] as string[];
          this.onAccountsChanged(accounts);
        });
        provider.on('chainChanged', (...args: unknown[]) => {
          const chainIdHex = args[0] as string;
          this.onChainChanged(chainIdHex);
        });
        provider.on('disconnect', (...args: unknown[]) => {
          const error = args[0] as Error | undefined;
          this.onDisconnect(error);
        });
      }
    },
  }));
}

export default ethereumPhoneConnector;
