import { createPublicClient, http, type Address, decodeEventLog } from 'viem';
import { readContract, multicall } from '@wagmi/core';
import { apeChainMainnet } from './apechainConfig';
import { CONTRACT_ADDRESSES } from './apechainConfig';
import { chainToConfig, otcAddress, supportedChains, swapContractConfig, endpointsToChainId, chainToHandler } from './config';
import type { OTCListing, TradeListing } from './types';

// Re-export types for backward compatibility
export type { TradeListing, OTCListing } from './types';

// ZeroAddress equivalent
const ZeroAddress = '0x0000000000000000000000000000000000000000';

// Try to fetch ABI from Apescan (ApeChain's block explorer) API or Tenderly RPC
async function fetchABIFromExplorer(contractAddress: Address): Promise<any[] | null> {
  // Method 1: Try ApeChain Explorer API (Apescan - ApeChain-specific)
  // Note: ApeChain Explorer API may have CORS issues, so we'll use generic ABI patterns as fallback
  try {
    console.log('[ContractService] Attempting to fetch ABI from ApeChain Explorer API...');
    
    // Try V2 API first (recommended by ApeChain docs)
    try {
      const response = await fetch(
        `https://api.apescan.io/v2/api?module=contract&action=getabi&address=${contractAddress}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          // Note: CORS may block this, so we'll catch and use fallback
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.status === '1' && data.result) {
          try {
            const abi = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
            console.log('[ContractService] Successfully fetched ABI from ApeChain Explorer V2');
            return abi;
          } catch (e) {
            return data.result;
          }
        }
      }
    } catch (v2Error: any) {
      // V2 failed, try V1
      if (v2Error.message?.includes('CORS') || v2Error.message?.includes('NetworkError') || v2Error.name === 'TypeError') {
        console.log('[ContractService] ApeChain Explorer API not accessible (CORS/Network), will use generic ABI patterns');
        return null;
      }
      
      try {
        const v1Response = await fetch(
          `https://api.apescan.io/api?module=contract&action=getabi&address=${contractAddress}`
        );
        
        if (v1Response.ok) {
          const v1Data = await v1Response.json();
          if (v1Data.status === '1' && v1Data.result) {
            try {
              const abi = typeof v1Data.result === 'string' ? JSON.parse(v1Data.result) : v1Data.result;
              console.log('[ContractService] Successfully fetched ABI from ApeChain Explorer V1');
              return abi;
            } catch (e) {
              return v1Data.result;
            }
          }
        }
      } catch (v1Error) {
        // Both failed, will use generic ABI
        console.log('[ContractService] ApeChain Explorer API not accessible, will use generic ABI patterns');
        return null;
      }
    }
  } catch (error: any) {
    // Handle all errors gracefully - network errors, CORS, etc.
    if (error.message?.includes('CORS') || error.message?.includes('NetworkError') || error.name === 'TypeError') {
      console.log('[ContractService] ApeChain Explorer API not accessible (CORS/Network), will use generic ABI patterns');
    } else if (error.message?.includes('JSON') || error.message?.includes('parse') || error instanceof SyntaxError) {
      console.warn('[ContractService] ApeChain Explorer API returned invalid JSON, will use generic ABI patterns');
    } else {
      console.log('[ContractService] Error fetching ABI from ApeChain Explorer, will use generic ABI patterns:', error.message || error);
    }
  }
  
  return null;

  // Method 2: Try Tenderly RPC method (if available via your RPC provider)
  try {
    const publicClient = createPublicClient({
      chain: apeChainMainnet,
      transport: http(),
    });
    
    // @ts-ignore - Tenderly-specific RPC method
    const abi = await publicClient.request({
      method: 'tenderly_getContractAbi',
      params: [contractAddress],
    });
    if (abi) {
      return abi as any[];
    }
  } catch (error) {
    // Tenderly RPC might not be available
  }
  
  return null;
}

// Generic marketplace ABI patterns based on observed contract methods
// From Apescan: "Claim Listing", "Close Listing", "createListing" methods are visible
const GENERIC_MARKETPLACE_ABI_PATTERNS = [
  // Pattern 1: getAllListings
  {
    inputs: [],
    name: 'getAllListings',
    outputs: [{ type: 'tuple[]', components: [] }],
    stateMutability: 'view',
    type: 'function',
  },
  // Pattern 2: getListingsByCollection
  {
    inputs: [{ name: 'nftContract', type: 'address' }],
    name: 'getListingsByCollection',
    outputs: [{ type: 'tuple[]', components: [] }],
    stateMutability: 'view',
    type: 'function',
  },
  // Pattern 3: listings mapping (public mapping view)
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'listings',
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'seller', type: 'address' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Observed from Apescan transactions: createListing
  {
    inputs: [{ 
      name: '_listing',
      type: 'tuple',
      components: [
        { name: 'id', type: 'uint256' },
        { name: 'seller', type: 'address' },
        { name: 'nftContract', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'price', type: 'uint256' },
        { name: 'active', type: 'bool' },
      ]
    }],
    name: 'createListing',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Observed: Claim Listing
  {
    inputs: [{ name: 'listingId', type: 'uint256' }],
    name: 'claimListing',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  // Observed: Close Listing
  {
    inputs: [{ name: 'listingId', type: 'uint256' }],
    name: 'closeListing',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Common events - ListingCreated observed in transactions
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
      { indexed: true, name: 'seller', type: 'address' },
      { indexed: true, name: 'nftContract', type: 'address' },
      { indexed: false, name: 'tokenId', type: 'uint256' },
      { indexed: false, name: 'price', type: 'uint256' },
    ],
    name: 'ListingCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
      { indexed: true, name: 'buyer', type: 'address' },
    ],
    name: 'ListingClaimed',
    type: 'event',
  },
] as const;

// Types are now in types.ts

export class ContractService {
  private publicClient;
  private marketplaceABI: any[] | null = null;
  private abiFetchAttempted = false;

  constructor() {
    this.publicClient = createPublicClient({
      chain: apeChainMainnet,
      transport: http(),
    });
  }

  private async getMarketplaceABI(): Promise<any[]> {
    if (this.marketplaceABI) {
      console.log('[ContractService] Using cached ABI');
      return this.marketplaceABI;
    }

    if (!this.abiFetchAttempted) {
      this.abiFetchAttempted = true;
      console.log('[ContractService] Attempting to fetch ABI from explorer...');
      const fetchedABI = await fetchABIFromExplorer(CONTRACT_ADDRESSES.OTC_MARKETPLACE as Address);
      if (fetchedABI) {
        console.log('[ContractService] Successfully fetched ABI from explorer, functions:', fetchedABI.filter((item: any) => item.type === 'function').length);
        this.marketplaceABI = fetchedABI;
        return this.marketplaceABI;
      } else {
        console.warn('[ContractService] Failed to fetch ABI from explorer, using generic patterns');
      }
    }

    // Fallback to generic patterns
    console.log('[ContractService] Using generic ABI patterns');
    return GENERIC_MARKETPLACE_ABI_PATTERNS as any[];
  }

  async getAllListings(): Promise<TradeListing[]> {
    try {
      console.log('[ContractService] Fetching all listings from OTC Marketplace...');
      console.log('[ContractService] Contract address:', CONTRACT_ADDRESSES.OTC_MARKETPLACE);
      
      const abi = await this.getMarketplaceABI();
      console.log('[ContractService] ABI loaded, length:', abi.length);
      
      const listings = await this.publicClient.readContract({
        address: CONTRACT_ADDRESSES.OTC_MARKETPLACE as Address,
        abi: abi,
        functionName: 'getAllListings',
      });
      
      console.log('[ContractService] Raw listings response:', listings);
      console.log('[ContractService] Listings type:', typeof listings);
      console.log('[ContractService] Is array:', Array.isArray(listings));
      
      if (Array.isArray(listings)) {
        console.log('[ContractService] Number of listings:', listings.length);
        const activeListings = (listings as any[]).filter((l: any) => l?.active !== false);
        console.log('[ContractService] Active listings:', activeListings.length);
        
        activeListings.forEach((listing, index) => {
          console.log(`[ContractService] Listing ${index}:`, {
            id: listing.id?.toString(),
            seller: listing.seller,
            nftContract: listing.nftContract,
            tokenId: listing.tokenId?.toString(),
            price: listing.price?.toString(),
            active: listing.active,
          });
        });
        
        return activeListings as TradeListing[];
      } else {
        console.warn('[ContractService] getAllListings did not return an array:', listings);
        return [];
      }
    } catch (error) {
      console.error('[ContractService] Error fetching all listings:', error);
      console.log('[ContractService] Falling back to event-based fetching...');
      // Fallback: try reading from events
      return this.getListingsFromEvents();
    }
  }

  async getListingsByCollection(collectionAddress: Address): Promise<TradeListing[]> {
    try {
      console.log('[ContractService] Fetching listings by collection...');
      console.log('[ContractService] Collection address:', collectionAddress);
      
      const abi = await this.getMarketplaceABI();
      const listings = await this.publicClient.readContract({
        address: CONTRACT_ADDRESSES.OTC_MARKETPLACE as Address,
        abi: abi,
        functionName: 'getListingsByCollection',
        args: [collectionAddress],
      });
      
      console.log('[ContractService] Raw collection listings:', listings);
      
      if (Array.isArray(listings)) {
        const filtered = (listings as any[]).filter((l: any) => l?.active !== false && 
          l?.nftContract?.toLowerCase() === collectionAddress.toLowerCase());
        console.log('[ContractService] Filtered active listings for collection:', filtered.length);
        return filtered as TradeListing[];
      } else {
        console.warn('[ContractService] getListingsByCollection did not return an array');
        return [];
      }
    } catch (error) {
      console.error('[ContractService] Error fetching listings by collection:', error);
      console.log('[ContractService] Falling back to event-based fetching...');
      // Fallback: read from events and filter by collection
      const allListings = await this.getListingsFromEvents();
      const filtered = allListings.filter(
        (listing) => listing.nftContract.toLowerCase() === collectionAddress.toLowerCase()
      );
      console.log('[ContractService] Event-based listings for collection:', filtered.length);
      return filtered;
    }
  }

  private async getListingsFromEvents(): Promise<TradeListing[]> {
    try {
      console.log('[ContractService] Fetching listings from events...');
      // Try to read ListingCreated events as fallback
      // This is a generic approach that works even without ABI
      const logs = await this.publicClient.getLogs({
        address: CONTRACT_ADDRESSES.OTC_MARKETPLACE as Address,
        event: {
          type: 'event',
          name: 'ListingCreated',
          inputs: [
            { indexed: true, name: 'id', type: 'uint256' },
            { indexed: true, name: 'seller', type: 'address' },
            { indexed: true, name: 'nftContract', type: 'address' },
            { indexed: false, name: 'tokenId', type: 'uint256' },
            { indexed: false, name: 'price', type: 'uint256' },
          ],
        },
        fromBlock: 'earliest',
      });

      console.log('[ContractService] Event logs found:', logs.length);

      // Transform logs to listings
      // Note: This is a simplified approach - actual implementation may vary
      const listings: TradeListing[] = logs.map((log: any) => ({
        id: log.args.id || BigInt(0),
        seller: log.args.seller || '0x0',
        nftContract: log.args.nftContract || '0x0',
        tokenId: log.args.tokenId || BigInt(0),
        price: log.args.price || BigInt(0),
        active: true, // Assume active if we can't check
      }));

      console.log('[ContractService] Parsed listings from events:', listings.length);
      listings.forEach((listing, index) => {
        console.log(`[ContractService] Event listing ${index}:`, {
          id: listing.id.toString(),
          seller: listing.seller,
          nftContract: listing.nftContract,
          tokenId: listing.tokenId.toString(),
          price: listing.price.toString(),
        });
      });

      return listings;
    } catch (error) {
      console.error('[ContractService] Error fetching listings from events:', error);
      return [];
    }
  }

  async getActiveListingsForCollection(): Promise<TradeListing[]> {
    console.log('[ContractService] Getting active listings for collection:', CONTRACT_ADDRESSES.NFT_COLLECTION);
    const listings = await this.getListingsByCollection(CONTRACT_ADDRESSES.NFT_COLLECTION as Address);
    console.log('[ContractService] Final active listings count:', listings.length);
    return listings;
  }

  // Use the exact same approach as useAllListings hook
  async getAllUnclaimedListings(): Promise<OTCListing[]> {
    try {
      console.log('[ContractService] Fetching all unclaimed listings using wagmi (same as hooks)...');
      
      // Import and use the exact same function from the hooks
      const { getAllListings } = await import('../hooks/useAllListings');
      const allListings = await getAllListings();
      
      console.log('[ContractService] Fetched listings count:', allListings.length);
      return allListings;
    } catch (error) {
      console.error('[ContractService] Error fetching all unclaimed listings:', error);
      return [];
    }
  }
  
  // Test method to verify contract connection
  async testContractConnection(): Promise<void> {
    console.log('[ContractService] Testing contract connection...');
    console.log('[ContractService] OTC Marketplace:', CONTRACT_ADDRESSES.OTC_MARKETPLACE);
    console.log('[ContractService] NFT Collection:', CONTRACT_ADDRESSES.NFT_COLLECTION);
    
    try {
      const code = await this.publicClient.getBytecode({
        address: CONTRACT_ADDRESSES.OTC_MARKETPLACE as Address,
      });
      console.log('[ContractService] Contract code exists:', code ? 'Yes' : 'No');
      console.log('[ContractService] Contract code length:', code?.length || 0);
    } catch (error) {
      console.error('[ContractService] Error checking contract code:', error);
    }
    
    // Try to fetch ABI
    try {
      const abi = await this.getMarketplaceABI();
      console.log('[ContractService] ABI fetched successfully, functions:', abi.filter((item: any) => item.type === 'function').length);
    } catch (error) {
      console.error('[ContractService] Error fetching ABI:', error);
    }
  }
}

export const contractService = new ContractService();
