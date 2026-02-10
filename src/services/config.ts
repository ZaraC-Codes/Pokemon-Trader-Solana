import { apeChainMainnet, config } from './apechainConfig';
import { CONTRACT_ADDRESSES } from './apechainConfig';
import type { Chain } from 'wagmi/chains';

// Chain configuration mapping - using wagmi config
export const chainToConfig: Record<number, typeof config> = {
  [apeChainMainnet.id]: config,
};

// OTC Address mapping
export const otcAddress: Record<number, string> = {
  [apeChainMainnet.id]: CONTRACT_ADDRESSES.OTC_MARKETPLACE,
};

// Supported chains - only ApeChain for now
export const supportedChains: Chain[] = [apeChainMainnet as Chain];

// Endpoint to chain ID mapping (LayerZero endpoints)
// Only ApeChain for now
export const endpointsToChainId: Record<number, number> = {
  30112: 33139,  // ApeChain (LayerZero endpoint ID - verify if needed)
};

// Chain ID to endpoint mapping (reverse of above)
export const chainIdToEndpoint: Record<number, number> = {
  33139: 30112,  // ApeChain
};

// Handler addresses mapping - ApeChain Mainnet
export const chainToHandler: Record<number, Record<string, string>> = {
  [apeChainMainnet.id]: {
    ERC721: '0xDcC301eCcCb0B13Bc49B34a756cD650eEb99F036',
    ERC1155: '0xC2448a90829Ca7DC25505Fa884B1602Ce7E3b2E2', // Keep existing if still valid
    ERC20: '0x5027F2e6E8271FeF7811d146Dd3F3319e2C76252',
  },
};

// NFT Utils address mapping - ApeChain Mainnet
export const chainToNFTUtils: Record<number, string> = {
  [apeChainMainnet.id]: '0xA063CB0ffD8907e59b1c74f95F724783eBF8C36b',
};

// NFT Utils ABI (for NFT metadata fetching)
export const nftUtils = {
  abi: [
    {
      inputs: [
        { internalType: 'address', name: 'collection', type: 'address' },
        { internalType: 'address', name: 'owner', type: 'address' },
        { internalType: 'uint256', name: 'totalSupply', type: 'uint256' },
      ],
      name: 'viewOwnedIds',
      outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'collection', type: 'address' },
        { internalType: 'uint256[]', name: 'tokenIds', type: 'uint256[]' },
      ],
      name: 'getNFTMetadata',
      outputs: [
        {
          components: [
            { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
            { internalType: 'string', name: 'name', type: 'string' },
            { internalType: 'string', name: 'image', type: 'string' },
            { internalType: 'string', name: 'description', type: 'string' },
          ],
          internalType: 'struct NFTMetadata[]',
          name: '',
          type: 'tuple[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const,
};

// ERC20 Token Contract Config (for balance queries)
export const tokenContractConfig = {
  abi: [
    {
      inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'decimals',
      outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'symbol',
      outputs: [{ internalType: 'string', name: '', type: 'string' }],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const,
};

// OTC Marketplace Contract ABI
// Based on the functions used: nextListingId, getAllUnclaimedListings, claimListing
export const swapContractConfig = {
  abi: [
    {
      inputs: [],
      name: 'nextListingId',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'startIndex', type: 'uint256' },
        { internalType: 'uint256', name: 'max', type: 'uint256' },
      ],
      name: 'getAllUnclaimedListings',
      outputs: [
        {
          components: [
            { internalType: 'uint32', name: 'destinationEndpoint', type: 'uint32' },
            { internalType: 'address', name: 'seller', type: 'address' },
            {
              components: [
                { internalType: 'address', name: 'contractAddress', type: 'address' },
                { internalType: 'address', name: 'handler', type: 'address' },
                { internalType: 'uint256', name: 'value', type: 'uint256' },
              ],
              internalType: 'struct IListing.Token',
              name: 'tokenForSale',
              type: 'tuple',
            },
            {
              components: [
                { internalType: 'address', name: 'contractAddress', type: 'address' },
                { internalType: 'address', name: 'handler', type: 'address' },
                { internalType: 'uint256', name: 'value', type: 'uint256' },
              ],
              internalType: 'struct IListing.Token',
              name: 'tokenToReceive',
              type: 'tuple',
            },
          ],
          internalType: 'struct IListing.Listing[]',
          name: '',
          type: 'tuple[]',
        },
        { internalType: 'uint256[]', name: '', type: 'uint256[]' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'nativeFee', type: 'uint256' },
        {
          components: [
            { internalType: 'uint256', name: '_listingId', type: 'uint256' },
            { internalType: 'uint256', name: 'destinationEndpoint', type: 'uint256' },
            {
              components: [
                { internalType: 'address', name: 'contractAddress', type: 'address' },
                { internalType: 'bytes', name: 'handler', type: 'bytes' },
                { internalType: 'uint256', name: 'value', type: 'uint256' },
              ],
              internalType: 'struct Token[]',
              name: 'tokensForSale',
              type: 'tuple[]',
            },
            {
              components: [
                { internalType: 'address', name: 'contractAddress', type: 'address' },
                { internalType: 'bytes', name: 'handler', type: 'bytes' },
                { internalType: 'uint256', name: 'value', type: 'uint256' },
              ],
              internalType: 'struct Token[]',
              name: 'tokensToReceive',
              type: 'tuple[]',
            },
          ],
          internalType: 'struct Listing',
          name: 'listing',
          type: 'tuple',
        },
        { internalType: 'bytes', name: 'srcOptions', type: 'bytes' },
        { internalType: 'bytes', name: 'lzOptions', type: 'bytes' },
      ],
      name: 'claimListing',
      outputs: [],
      stateMutability: 'payable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: 'listingId', type: 'uint256' }],
      name: 'closeListing',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'listings',
      outputs: [
        { internalType: 'uint32', name: 'destinationEndpoint', type: 'uint32' },
        { internalType: 'address', name: 'seller', type: 'address' },
        {
          components: [
            { internalType: 'address', name: 'contractAddress', type: 'address' },
            { internalType: 'address', name: 'handler', type: 'address' },
            { internalType: 'uint256', name: 'value', type: 'uint256' },
          ],
          internalType: 'struct IListing.Token',
          name: 'tokenForSale',
          type: 'tuple',
        },
        {
          components: [
            { internalType: 'address', name: 'contractAddress', type: 'address' },
            { internalType: 'address', name: 'handler', type: 'address' },
            { internalType: 'uint256', name: 'value', type: 'uint256' },
          ],
          internalType: 'struct IListing.Token',
          name: 'tokenToReceive',
          type: 'tuple',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const,
};
