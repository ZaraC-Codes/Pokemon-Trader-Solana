export interface Listing {
  listingId: number;
  seller: string;
  coinForSale: string;
  coinToReceive: string;
  amountForSale: string;
  amountToReceive: string;
  isCrossChain: boolean;
  destinationChainId: number;
}

type TokenDetails = {
  contractAddress: string;
  handler: string;
  value: bigint;
};

export interface OTCListing {
  destinationEndpoint: number;
  dstChain: number;
  listingId: number;
  seller: string;
  srcChain: number;
  /**
   * New contract shape: arrays. We keep the singular fields too for UI code that
   * expects exactly one token on each side.
   */
  tokensForSale?: TokenDetails[];
  tokensToReceive?: TokenDetails[];
  tokenForSale: TokenDetails;
  tokenToReceive: TokenDetails;
  extraBuyInfo?: any;
  extraSellInfo?: any;
}

// Legacy interface for backward compatibility
export interface TradeListing {
  id: bigint;
  seller: string;
  nftContract: string;
  tokenId: bigint;
  price: bigint;
  active: boolean;
  otcListing?: OTCListing;
}

// Export TokenDetails type alias for convenience
export type { TokenDetails };
