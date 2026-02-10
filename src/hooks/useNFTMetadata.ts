/**
 * useNFTMetadata Hook
 *
 * Fetches NFT metadata (name, image, description) from a token's tokenURI.
 * Handles IPFS URL conversion and caching.
 *
 * Usage:
 * ```tsx
 * const { metadata, isLoading, error, refetch } = useNFTMetadata(
 *   '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7',
 *   BigInt(123)
 * );
 * // metadata = { name: 'Pokemon Card #123', image: 'https://...', description: '...' }
 * ```
 */

import { useReadContract } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { erc721MABI } from '../config/abis/erc721M';
import { RELATED_CONTRACTS, APECHAIN_CHAIN_ID } from '../services/pokeballGameConfig';

// ============================================================
// TYPES
// ============================================================

export interface NFTMetadata {
  /** NFT name from metadata */
  name: string;
  /** NFT description from metadata */
  description?: string;
  /** Image URL (resolved from IPFS if needed) */
  image: string;
  /** Original image URL before IPFS conversion */
  rawImage?: string;
  /** Additional attributes from metadata */
  attributes?: Array<{ trait_type: string; value: string | number }>;
  /** Animation URL if present */
  animation_url?: string;
  /** External URL if present */
  external_url?: string;
}

export interface UseNFTMetadataResult {
  /** Fetched metadata or null if loading/error */
  metadata: NFTMetadata | null;
  /** True while fetching tokenURI or metadata */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch the metadata */
  refetch: () => void;
  /** Raw tokenURI from contract */
  tokenURI: string | null;
}

// ============================================================
// CONSTANTS
// ============================================================

/** Default Slab NFT contract address */
export const SLAB_NFT_ADDRESS = RELATED_CONTRACTS.SLAB_NFT;

/** IPFS gateways to try in order of preference */
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
];

/** Metadata fetch timeout in ms */
const FETCH_TIMEOUT = 10000;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Convert IPFS URL to HTTP gateway URL.
 * Handles ipfs://, /ipfs/, and raw CID formats.
 */
export function resolveIPFSUrl(url: string, gatewayIndex = 0): string {
  if (!url) return '';

  // Already an HTTP(S) URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  const gateway = IPFS_GATEWAYS[gatewayIndex] || IPFS_GATEWAYS[0];

  // ipfs:// protocol
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', gateway);
  }

  // /ipfs/ path
  if (url.startsWith('/ipfs/')) {
    return url.replace('/ipfs/', gateway);
  }

  // Raw CID (starts with Qm or bafy)
  if (url.startsWith('Qm') || url.startsWith('bafy')) {
    return `${gateway}${url}`;
  }

  // Return as-is if no IPFS pattern detected
  return url;
}

/**
 * Fetch JSON with timeout and retry logic.
 */
async function fetchWithTimeout(
  url: string,
  timeout: number = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch metadata JSON from tokenURI with IPFS gateway fallback.
 */
async function fetchMetadataJson(tokenURI: string): Promise<NFTMetadata> {
  let lastError: Error | null = null;

  // Try each IPFS gateway if the URL is IPFS-based
  const isIPFS =
    tokenURI.startsWith('ipfs://') ||
    tokenURI.startsWith('/ipfs/') ||
    tokenURI.startsWith('Qm') ||
    tokenURI.startsWith('bafy');

  const gatewaysToTry = isIPFS ? IPFS_GATEWAYS.length : 1;

  for (let i = 0; i < gatewaysToTry; i++) {
    const resolvedUrl = resolveIPFSUrl(tokenURI, i);

    try {
      const response = await fetchWithTimeout(resolvedUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();

      // Validate required fields
      if (!json.name && !json.image) {
        throw new Error('Invalid metadata: missing name and image');
      }

      // Resolve IPFS URLs in the metadata
      const metadata: NFTMetadata = {
        name: json.name || 'Unknown NFT',
        description: json.description,
        image: resolveIPFSUrl(json.image || ''),
        rawImage: json.image,
        attributes: json.attributes,
        animation_url: json.animation_url ? resolveIPFSUrl(json.animation_url) : undefined,
        external_url: json.external_url,
      };

      return metadata;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[useNFTMetadata] Gateway ${i + 1}/${gatewaysToTry} failed:`, lastError.message);
    }
  }

  throw lastError || new Error('Failed to fetch metadata');
}

// ============================================================
// MAIN HOOK
// ============================================================

/**
 * Hook to fetch NFT metadata from tokenURI.
 *
 * @param contractAddress - NFT contract address (defaults to Slab NFT)
 * @param tokenId - Token ID to fetch metadata for
 * @param enabled - Whether to enable the query (default: true)
 */
export function useNFTMetadata(
  contractAddress: `0x${string}` = SLAB_NFT_ADDRESS,
  tokenId: bigint | undefined,
  enabled: boolean = true
): UseNFTMetadataResult {
  // Step 1: Read tokenURI from contract
  const {
    data: tokenURI,
    isLoading: isLoadingURI,
    error: uriError,
    refetch: refetchURI,
  } = useReadContract({
    address: contractAddress,
    abi: erc721MABI,
    functionName: 'tokenURI',
    args: tokenId !== undefined ? [tokenId] : undefined,
    chainId: APECHAIN_CHAIN_ID,
    query: {
      enabled: enabled && tokenId !== undefined,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    },
  });

  // Step 2: Fetch metadata JSON from tokenURI
  const {
    data: metadata,
    isLoading: isLoadingMetadata,
    error: metadataError,
    refetch: refetchMetadata,
  } = useQuery({
    queryKey: ['nft-metadata', contractAddress, tokenId?.toString(), tokenURI],
    queryFn: async () => {
      if (!tokenURI) {
        throw new Error('No tokenURI available');
      }
      return fetchMetadataJson(tokenURI);
    },
    enabled: enabled && !!tokenURI,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
    retryDelay: 1000,
  });

  // Combine refetch functions
  const refetch = () => {
    refetchURI();
    refetchMetadata();
  };

  // Determine overall loading state
  const isLoading = isLoadingURI || isLoadingMetadata;

  // Combine errors
  const error = uriError
    ? `Failed to read tokenURI: ${uriError.message}`
    : metadataError
      ? `Failed to fetch metadata: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`
      : null;

  return {
    metadata: metadata ?? null,
    isLoading,
    error,
    refetch,
    tokenURI: tokenURI ?? null,
  };
}

/**
 * Hook specifically for Slab NFT metadata.
 * Convenience wrapper with the Slab NFT address pre-configured.
 */
export function useSlabNFTMetadata(
  tokenId: bigint | undefined,
  enabled: boolean = true
): UseNFTMetadataResult {
  return useNFTMetadata(SLAB_NFT_ADDRESS, tokenId, enabled);
}

export default useNFTMetadata;
