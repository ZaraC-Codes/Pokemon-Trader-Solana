// Alchemy NFT API utilities
import { ALCHEMY_API_KEY } from '../services/apechainConfig';

const ALCHEMY_BASE_URL = 'https://apechain-mainnet.g.alchemy.com';

/**
 * Fetch NFT metadata from Alchemy NFT API
 * Uses Alchemy's NFT API v3 endpoint
 */
export async function getAlchemyNFTMetadata(
  contractAddress: string,
  tokenId: bigint | number
): Promise<{
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
} | null> {
  try {
    // Alchemy NFT API v3 uses GET requests with query parameters
    const url = `${ALCHEMY_BASE_URL}/nft/v3/${ALCHEMY_API_KEY}/getNFTMetadata?contractAddress=${contractAddress}&tokenId=${tokenId.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`Alchemy API error for token ${tokenId}:`, response.statusText);
      return null;
    }

    const data = await response.json();
    
    // Alchemy returns metadata in a specific format
    // Response structure: { contract, tokenUri, media, metadata, timeLastUpdated }
    const metadata = data.metadata || {};
    const media = data.media || {};
    
    // Extract image URL - prefer media.gateway, fallback to metadata.image
    const imageUrl = media.gateway || 
                     media.thumbnail || 
                     metadata.image || 
                     (typeof metadata.image === 'string' ? metadata.image : '') ||
                     '';
    
    return {
      name: metadata.name || data.name || `Token #${tokenId}`,
      description: metadata.description || data.description || '',
      image: imageUrl,
      attributes: metadata.attributes || metadata.traits || [],
    };
  } catch (error) {
    console.error('Error fetching NFT metadata from Alchemy:', error);
    return null;
  }
}

/**
 * Get all NFTs owned by an address for a specific contract using Alchemy NFT API
 * Uses the getNFTsForOwner endpoint (correct endpoint name per Alchemy docs)
 * Reference: https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-ownership-endpoints/get-nf-ts-for-owner-v-3
 */
export async function getAlchemyNFTsForOwner(
  contractAddress: string,
  ownerAddress: string,
  chainId?: number
): Promise<Array<{
  tokenId: number;
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
}>> {
  try {
    // Alchemy NFT API v3 endpoint for getting NFTs owned by an address
    // Correct endpoint: getNFTsForOwner (not getNFTs)
    // Format: /nft/v3/{apiKey}/getNFTsForOwner?owner={address}&contractAddresses[]={contract}&withMetadata=true
    const url = new URL(`${ALCHEMY_BASE_URL}/nft/v3/${ALCHEMY_API_KEY}/getNFTsForOwner`);
    url.searchParams.append('owner', ownerAddress);
    url.searchParams.append('contractAddresses[]', contractAddress);
    url.searchParams.append('withMetadata', 'true');
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Alchemy API error for owner ${ownerAddress}:`, response.status, errorText);
      return [];
    }

    const data = await response.json();
    
    // Alchemy getNFTsForOwner returns: { ownedNfts: [...], totalCount: number, pageKey?: string }
    // Each NFT has: { contract, tokenId, tokenType, name, description, image, raw, collection, etc. }
    const ownedNfts = data.ownedNfts || [];
    
    return ownedNfts.map((nft: any) => {
      // Parse tokenId - can be string (hex or decimal) or number
      let tokenId = 0;
      if (nft.tokenId !== undefined) {
        if (typeof nft.tokenId === 'string') {
          // Handle hex strings (0x...) or decimal strings
          if (nft.tokenId.startsWith('0x')) {
            tokenId = parseInt(nft.tokenId, 16);
          } else {
            tokenId = parseInt(nft.tokenId, 10);
          }
        } else {
          tokenId = Number(nft.tokenId);
        }
      } else if (nft.id?.tokenId !== undefined) {
        // Fallback to id.tokenId format
        if (typeof nft.id.tokenId === 'string') {
          tokenId = nft.id.tokenId.startsWith('0x') 
            ? parseInt(nft.id.tokenId, 16) 
            : parseInt(nft.id.tokenId, 10);
        } else {
          tokenId = Number(nft.id.tokenId);
        }
      }
      
      // Extract image URL - Alchemy v3 API structure
      // image object has: { cachedUrl, thumbnailUrl, pngUrl, contentType, size, originalUrl }
      let imageUrl = '';
      if (nft.image) {
        if (typeof nft.image === 'string') {
          imageUrl = nft.image;
        } else if (nft.image.cachedUrl) {
          imageUrl = nft.image.cachedUrl;
        } else if (nft.image.thumbnailUrl) {
          imageUrl = nft.image.thumbnailUrl;
        } else if (nft.image.originalUrl) {
          imageUrl = nft.image.originalUrl;
        }
      }
      
      // Extract metadata - can be in raw.metadata or directly in nft
      const rawMetadata = nft.raw?.metadata || nft.metadata || {};
      const attributes = rawMetadata.attributes || rawMetadata.traits || nft.attributes || [];
      
      return {
        tokenId,
        name: nft.name || rawMetadata.name || `Token #${tokenId}`,
        description: nft.description || rawMetadata.description || '',
        image: imageUrl,
        attributes: attributes,
      };
    });
  } catch (error) {
    console.error('Error fetching NFTs for owner from Alchemy:', error);
    return [];
  }
}

/**
 * Fetch multiple NFT metadata from Alchemy
 * Alchemy doesn't have a true batch endpoint, so we'll batch individual requests
 */
export async function getAlchemyNFTMetadataBatch(
  contractAddress: string,
  tokenIds: (bigint | number)[]
): Promise<Array<{
  tokenId: number;
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
}>> {
  try {
    // Batch requests in parallel (limit to 10 at a time to avoid rate limits)
    const batchSize = 10;
    const results: Array<{
      tokenId: number;
      name?: string;
      description?: string;
      image?: string;
      attributes?: Array<{ trait_type: string; value: string | number }>;
    }> = [];

    for (let i = 0; i < tokenIds.length; i += batchSize) {
      const batch = tokenIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (id) => {
          const metadata = await getAlchemyNFTMetadata(contractAddress, id);
          return {
            tokenId: Number(id),
            name: metadata?.name,
            description: metadata?.description,
            image: metadata?.image,
            attributes: metadata?.attributes,
          };
        })
      );
      results.push(...batchResults);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < tokenIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  } catch (error) {
    console.error('Error fetching batch NFT metadata from Alchemy:', error);
    // Fallback to individual requests
    return Promise.all(
      tokenIds.map(async (id) => {
        const metadata = await getAlchemyNFTMetadata(contractAddress, id);
        return {
          tokenId: Number(id),
          name: metadata?.name,
          description: metadata?.description,
          image: metadata?.image,
          attributes: metadata?.attributes,
        };
      })
    );
  }
}
