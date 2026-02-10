import { erc721MABI } from '../../config/abis/erc721M';
import { getContract } from 'viem';
// import { erc721MABI } from '@/config/abis/erc721M';
import { createPublicClient, http } from 'viem';
import { apeChainMainnet, ALCHEMY_RPC_URL } from '../../services/apechainConfig';
import { getAlchemyNFTMetadataBatch } from '../../utils/alchemy';
// MaxUint256 constant (equivalent to ethers MaxUint256)
const MaxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

const client = createPublicClient({
  chain: apeChainMainnet,
  // Use ApeChain RPC URL
  transport: http(ALCHEMY_RPC_URL),
});

// ApeChain NFT Collections metadata base URLs
// Add ApeChain-specific collection metadata URLs here if needed
const BASE_METADATA_BY_COLLECTION: Record<string, string> = {
  // Add ApeChain collection metadata URLs here
};

interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
}

const getHttpUrl = (url: string) => {
  if (!url) return url;
  if (url.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${url.slice("ipfs://".length)}`;
  if (url.startsWith("ar://")) return `https://arweave.net/${url.slice("ar://".length)}`;
  // legacy variant seen in the repo
  if (url.includes("ar:/")) return `https://arweave.net/${url.split("ar://")[1]}`;
  return url;
};

const resolveErc1155Template = (uri: string, id: bigint) => {
  // ERC1155 metadata URI can contain "{id}" which must be replaced by lowercase hex, 64 chars, no 0x
  if (!uri?.includes("{id}")) return uri;
  const hex = id.toString(16).padStart(64, "0");
  return uri.replaceAll("{id}", hex);
};

const parseDataUriJson = (uri: string) => {
  const prefix = "data:application/json;base64,";
  if (!uri?.startsWith(prefix)) return null;
  try {
    const b64 = uri.slice(prefix.length);
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const shouldProxyFirst = (url: string) => {
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase();
    // These hosts are known to fail in-browser due to CORS/403, but work via our server proxy.
    if (host === "storage.hv-mtl.com") return true;
    if (host === "api.otherside.xyz") return true;
    return false;
  } catch {
    return false;
  }
};

const getMetadataProxyUrls = (url: string) => {
  // IMPORTANT:
  // - For HV-MTL/AMPs, direct browser fetch is blocked by CORS (no ACAO header).
  // - On Vercel, we have a first-party serverless proxy at /api/metadata.
  // So we ALWAYS try same-origin /api/metadata first, then fall back to any configured backend base.

  const candidates: string[] = [];
  const encoded = encodeURIComponent(url);

  // Same-origin absolute (best for Vercel + any integrated deployments)
  if (typeof window !== "undefined" && window.location?.origin) {
    candidates.push(`${window.location.origin}/api/metadata?url=${encoded}`);
  }

  // Same-origin relative (works in dev if proxying /api, or when served from same host)
  candidates.push(`/api/metadata?url=${encoded}`);

  // Optional configured backend base URL (older deployments / separate backend host)
  const base = process.env.REACT_APP_SERVER_BASE_URL;
  if (base && base.trim() !== "") {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
    candidates.push(`${trimmed}/api/metadata?url=${encoded}`);
  }

  // Deduplicate while preserving order
  return Array.from(new Set(candidates));
};

const fetchJsonWithProxyFallback = async (url: string) => {
  const maybeJson = parseDataUriJson(url);
  if (maybeJson) return maybeJson;
  
  const tryFetch = async (fetchUrl: string) => {
    const res = await fetch(fetchUrl);
    const contentType = res.headers.get("content-type") || "";
    
    // Check if response is actually JSON
    if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
      const text = await res.text();
      // If it's HTML (error page), throw a more descriptive error
      if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        throw new Error(`Received HTML instead of JSON from ${fetchUrl}`);
      }
      // Try to parse as JSON anyway (some servers don't set content-type correctly)
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response from ${fetchUrl}`);
      }
    }
    
    return await res.json();
  };
  
  const proxyUrls = getMetadataProxyUrls(url);

  // If we know the origin will fail in-browser, go proxy-first to avoid noisy console CORS errors.
  if (shouldProxyFirst(url) && proxyUrls.length) {
    let lastError: any = null;
    for (const proxyUrl of proxyUrls) {
      try {
        return await tryFetch(proxyUrl);
      } catch (proxyError) {
        lastError = proxyError;
      }
    }
    // If proxy fails, fall back to direct (best-effort).
    return await tryFetch(url);
  }
  
  try {
    return await tryFetch(url);
  } catch (e) {
    if (!proxyUrls.length) throw e;

    let lastError: any = null;
    for (const proxyUrl of proxyUrls) {
    try {
      return await tryFetch(proxyUrl);
    } catch (proxyError) {
        lastError = proxyError;
      }
    }

    throw new Error(
      `Failed to fetch metadata from ${url} and proxies ${proxyUrls.join(", ")}: ${lastError}`
    );
  }
};

export const getNFTData = async (
  ids: (number | bigint | string)[],
  account: string,
  chainId: number,
  nftAddress: string
): Promise<NFTMetadata[]> => {
  try {
    // Filter out invalid IDs and MaxUint256 IDs (collection offers)
    const toSafeBigInt = (v: any): bigint | null => {
      try {
        // Treat UI placeholders like "-" as invalid
        if (typeof v === "string" && v.trim() === "-") return null;
        const b = BigInt(v);
        return b;
      } catch {
        return null;
      }
    };

    const validIds = ids
      .map(toSafeBigInt)
      .filter((b): b is bigint => b !== null && b !== MaxUint256);
    
    if (validIds.length === 0) {
      return [];
    }

    // Validate nftAddress before using it
    if (!nftAddress || typeof nftAddress !== "string") {
      console.error("Invalid nftAddress provided to getNFTData:", nftAddress);
      return [];
    }

    const contract = getContract({
      address: nftAddress as `0x${string}`,
      abi: erc721MABI,
      client: client,
    });

    // Try Alchemy NFT API first (preferred method)
    try {
      console.log(`[getNFTData] Fetching metadata for ${validIds.length} tokens from Alchemy NFT API...`);
      const alchemyResults = await getAlchemyNFTMetadataBatch(nftAddress, validIds);
      
      // Check if we got valid results from Alchemy
      const validAlchemyResults = alchemyResults.filter(r => r.name || r.image);
      if (validAlchemyResults.length > 0) {
        console.log(`[getNFTData] Successfully fetched ${validAlchemyResults.length}/${validIds.length} tokens from Alchemy`);
        
        // Map Alchemy results to our format
        const results = alchemyResults.map((alchemyData, index) => {
          const id = validIds[index];
          return {
            name: alchemyData.name || `NFT #${Number(id)}`,
            description: alchemyData.description || '',
            image: alchemyData.image ? getHttpUrl(alchemyData.image) : '',
            attributes: alchemyData.attributes || [],
            tokenId: Number(id),
            displayId: Number(id),
          };
        });
        
        return results;
      }
    } catch (alchemyError) {
      console.warn('[getNFTData] Alchemy API failed, falling back to tokenURI method:', alchemyError);
    }

    // Fallback: Use tokenURI/uri method if Alchemy fails
    // ApeChain NFT collections
    const baseMetadataUrl = BASE_METADATA_BY_COLLECTION[nftAddress.toLowerCase()];

    const results = await Promise.all(
      validIds.map(async (id) => {
        try {
          // Preferred: known base metadata URLs (faster + avoids tokenURI/uri issues)
          if (baseMetadataUrl) {
            const url = `${baseMetadataUrl}${id.toString()}`;
            const metadata: any = await fetchJsonWithProxyFallback(url);
            if (metadata?.image) metadata.image = getHttpUrl(resolveErc1155Template(metadata.image, id));
            if (metadata?.animation_url)
              metadata.animation_url = getHttpUrl(resolveErc1155Template(metadata.animation_url, id));

            return {
              ...metadata,
              tokenId: Number(id),
              displayId: Number(id),
            };
          }

          // Get token URI - try tokenURI first, fallback to uri (for ERC1155 or custom implementations)
          let tokenURI: string;
          try {
            tokenURI = await contract.read.tokenURI([id]);
          } catch (error) {
            // Fallback to uri function if tokenURI doesn't exist
            tokenURI = await contract.read.uri([id]);
          }

          tokenURI = resolveErc1155Template(tokenURI, id);
          tokenURI = getHttpUrl(tokenURI);

          const metadata: any = await fetchJsonWithProxyFallback(tokenURI);

          if (metadata?.image) metadata.image = getHttpUrl(resolveErc1155Template(metadata.image, id));

          return {
            ...metadata,
            tokenId: Number(id),
            displayId: Number(id),
          };
        } catch (error) {
          console.error(`Error fetching metadata for token ${id}:`, error);
          return {
            name: `NFT #${Number(id)}`,
            description: 'Metadata not available',
            image: '',
            tokenId: Number(id),
            displayId: Number(id),
          };
        }
      })
    );

    return results;
  } catch (error) {
    console.error('Error in getNFTData:', error);
    // Never crash the UI for metadata issues; just return empty.
    return [];
  }
};
