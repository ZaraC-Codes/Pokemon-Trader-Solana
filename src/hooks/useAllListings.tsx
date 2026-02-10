import { Chain } from "wagmi/chains";
import {
  chainToConfig,
  chainToHandler,
  endpointsToChainId,
  otcAddress,
  supportedChains,
  swapContractConfig,
} from "../services/config";
import { useQuery } from "@tanstack/react-query";
import { OTCListing } from "../services/types";
import { getCollectionFetchFn } from "./useNFTBalances";
import { KNOWN_LISTING_IDS } from "../config/knownListings";
import { createPublicClient, http } from 'viem';

const BATCH_SIZE = 10; // Reduced from 500 to avoid rate limiting (429 errors)
const BATCH_DELAY_MS = 200; // Delay between batches in milliseconds
const MAX_RETRIES = 3; // Maximum retries for failed requests
const RETRY_DELAY_MS = 1000; // Initial retry delay in milliseconds

// Convert handler to address for comparison (handler is now address, not bytes)
function handlerToAddress(handler: string | undefined): string {
  if (!handler) return '';
  // Handler is now directly an address, not bytes
  return handler.toLowerCase();
}

// Optimized approach: Use the "listings" function to query specific listing IDs only
async function getListingsUsingSpecificIDs(
  chain: Chain,
  actualABI: any[],
  listingIDs: number[]
): Promise<any[]> {
  const allListings: any[] = [];
  
  // Create publicClient using viem (same as test script that works)
  const publicClient = createPublicClient({
    chain: chain as any,
    transport: http(chain.rpcUrls.default.http[0]),
  });
  
  // Create batches of listing IDs to query
  const batches = Math.ceil(listingIDs.length / BATCH_SIZE);
  console.log(`[getListingsUsingSpecificIDs] Will query ${listingIDs.length} specific listing IDs in ${batches} batches`);
  
  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const startIdx = batchIndex * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, listingIDs.length);
    const batchIDs = listingIDs.slice(startIdx, endIdx);
    
    try {
      // Helper function to retry a contract call with exponential backoff
      const retryContractCall = async (listingId: number, retryCount: number = 0): Promise<{ status: "success" | "failure", result?: any, error?: any, listingId: number }> => {
        try {
          const result = await publicClient.readContract({
            address: otcAddress[chain.id] as any,
            abi: actualABI as any,
            functionName: "listings",
            args: [BigInt(listingId)],
          });
          return { status: "success" as const, result, listingId };
        } catch (error: any) {
          // Check if it's a rate limit error (429) or timeout
          const isRateLimit = error?.statusCode === 429 || error?.message?.includes('429') || error?.message?.includes('Too Many Requests');
          const isTimeout = error?.message?.includes('timeout') || error?.name === 'TimeoutError';
          
          // Retry on rate limit or timeout errors
          if ((isRateLimit || isTimeout) && retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff
            // Only log retries for first few items to reduce console spam
            if (batchIndex === 0 && batchIDs.indexOf(listingId) < 3 && retryCount === 0) {
              console.warn(`[getListingsUsingSpecificIDs] Listing ${listingId} rate limited/timed out, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryContractCall(listingId, retryCount + 1);
          }
          
          // Suppress error logs for rate limit errors (already handled by retry logic)
          // Only log failures for first few in first batch and non-rate-limit errors
          if (!isRateLimit && batchIndex === 0 && batchIDs.indexOf(listingId) < 5) {
            console.warn(`[getListingsUsingSpecificIDs] Listing ${listingId} failed:`, error?.message?.substring(0, 100) || error);
          }
          return { status: "failure" as const, error, listingId };
        }
      };

      // Use direct publicClient.readContract calls with retry logic
      // Process in smaller chunks to avoid overwhelming the RPC
      const chunkSize = 5; // Process 5 at a time within each batch
      const results: Array<{ status: "success" | "failure", result?: any, error?: any, listingId: number }> = [];
      
      for (let chunkStart = 0; chunkStart < batchIDs.length; chunkStart += chunkSize) {
        const chunk = batchIDs.slice(chunkStart, chunkStart + chunkSize);
        const chunkResults = await Promise.all(
          chunk.map(listingId => retryContractCall(listingId))
        );
        results.push(...chunkResults);
        
        // Small delay between chunks to avoid rate limiting
        if (chunkStart + chunkSize < batchIDs.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      // Process results
      if (batchIndex === 0) {
        console.log(`[getListingsUsingSpecificIDs] Batch ${batchIndex + 1}: Received ${results.length} results from readContract`);
        const successCount = results.filter(r => r.status === "success").length;
        console.log(`[getListingsUsingSpecificIDs] Success: ${successCount}, Failures: ${results.length - successCount}`);
      }
      
      results.forEach((result) => {
        const listingId = result.listingId;
        
        if (result.status === "success" && result.result) {
          // The listings function returns an array: [destinationEndpoint, seller, tokenForSale, tokenToReceive]
          const resultArray = result.result as any;
          
          // Log first few results for debugging
          if (batchIndex === 0 && results.indexOf(result) < 3) {
            console.log(`[getListingsUsingSpecificIDs] Result for listing ${listingId}:`, {
              resultType: Array.isArray(resultArray) ? 'array' : typeof resultArray,
              length: Array.isArray(resultArray) ? resultArray.length : 'N/A',
            });
          }
          
          const destinationEndpoint = resultArray[0];
          const seller = resultArray[1];
          const tokenForSale = resultArray[2];
          const tokenToReceive = resultArray[3];
          
          // Check if listing exists (seller is not zero address)
          const isEmpty = !seller || seller === '0x0000000000000000000000000000000000000000';
          
          if (!isEmpty) {
            allListings.push({
              seller,
              destinationEndpoint,
              tokenForSale: {
                contractAddress: tokenForSale.contractAddress,
                handler: tokenForSale.handler,
                value: tokenForSale.value,
              },
              tokenToReceive: {
                contractAddress: tokenToReceive.contractAddress,
                handler: tokenToReceive.handler,
                value: tokenToReceive.value,
              },
              listingId,
              // Convert single tokens to arrays for backward compatibility
              tokensForSale: [{
                contractAddress: tokenForSale.contractAddress,
                handler: tokenForSale.handler,
                value: tokenForSale.value,
              }],
              tokensToReceive: [{
                contractAddress: tokenToReceive.contractAddress,
                handler: tokenToReceive.handler,
                value: tokenToReceive.value,
              }],
            });
          }
        }
      });
      
      if (batchIndex < 3 || allListings.length % 50 === 0) {
        console.log(`[getListingsUsingSpecificIDs] Batch ${batchIndex + 1}/${batches}: Found ${allListings.length} total valid listings so far`);
      }
      
      // Add delay between batches to avoid rate limiting (except for the last batch)
      if (batchIndex < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    } catch (error: any) {
      console.error(`[getListingsUsingSpecificIDs] Batch ${batchIndex + 1} failed:`, error);
      console.error(`[getListingsUsingSpecificIDs] Error details:`, {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 200),
      });
      // Continue with other batches
    }
  }
  
  console.log(`[getListingsUsingSpecificIDs] ✅ Found ${allListings.length} valid listings using "listings" function`);
  return allListings;
}

async function getListingsForChain(chain: Chain) {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAllListings.tsx:25',message:'getListingsForChain entry',data:{chainId:chain.id,chainName:chain.name,otcAddress:otcAddress[chain.id]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    const chainConfig = chainToConfig[chain.id];
    const contractAddr = otcAddress[chain.id];
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAllListings.tsx:29',message:'contract address verification',data:{chainId:chain.id,contractAddress:contractAddr,hasChainConfig:!!chainConfig,abiLength:swapContractConfig.abi.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    console.log(`[getListingsForChain] Fetching listings for chain ${chain.id}...`);
    
    // Use hardcoded ABI from config (Apescan API is returning 404)
    // The hardcoded ABI includes the 'listings' function which is what we need
    let actualABI: any[] = Array.from(swapContractConfig.abi) as any[];
    
    // Verify the hardcoded ABI has the listings function
    const hasListingsFunction = actualABI.some((f: any) => f.type === 'function' && f.name === 'listings');
    if (!hasListingsFunction) {
      console.error(`[getListingsForChain] ❌ Hardcoded ABI is missing 'listings' function!`);
      return [];
    }
    
    console.log(`[getListingsForChain] Using hardcoded ABI with ${actualABI.filter((f:any)=>f.type==='function').length} functions (including 'listings')`);
    
    // Use ONLY the "listings" function - no other contract calls (no nextListingId, no getAllUnclaimedListings)
    // Just use the known listing IDs directly
    console.log(`[getListingsForChain] Using ONLY "listings" function for ${KNOWN_LISTING_IDS.length} known listing IDs`);
    const results = await getListingsUsingSpecificIDs(chain, actualABI, [...KNOWN_LISTING_IDS]);
    console.log(`[getListingsForChain] ✅ Found ${results.length} listings using "listings" function`);
    return results;
  } catch (error: any) {
    // Only log unexpected errors (not the zero data error which we already handle)
    const errorMsg = error?.message || String(error);
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAllListings.tsx:267',message:'getListingsForChain outer catch',data:{chainId:chain.id,errorMessage:errorMsg.substring(0,200),errorName:error?.name,isZeroDataError:errorMsg.includes('zero data')||errorMsg.includes('Cannot decode zero data')||errorMsg.includes('AbiDecodingZeroDataError')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!errorMsg.includes('zero data') && !errorMsg.includes('Cannot decode zero data') && !errorMsg.includes('AbiDecodingZeroDataError')) {
      console.error(`[getListingsForChain] ❌ Unexpected error for chain ${chain.id}:`, error);
    }
    return [];
  }
}

async function getAllListings() {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAllListings.tsx:277',message:'getAllListings entry',data:{supportedChainsCount:supportedChains.length,chainIds:supportedChains.map(c=>c.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    console.log('[getAllListings] Starting to fetch listings...');
    const results = await Promise.all(
      supportedChains.map((val) => getListingsForChain(val))
    );

    const totalFetched = results.reduce((sum, arr) => sum + arr.length, 0);
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAllListings.tsx:284',message:'after fetching from all chains',data:{totalFetched,resultsPerChain:results.map((r,i)=>({chainId:supportedChains[i].id,count:r.length}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    console.log(`[getAllListings] Total listings fetched from contract: ${totalFetched}`);

    const filteredListings = results.flatMap((val, index) =>
      val
        .map((listing: any) => ({
          ...listing,
          srcChain: supportedChains[index].id,
          dstChain: endpointsToChainId[listing.destinationEndpoint],
        }))
    );

    console.log(`[getAllListings] Total listings after mapping: ${filteredListings.length}`);

    let keysToCollectionListing: Record<string, Set<number>> = {};
    let keysToHandler: Record<string, string> = {};
    let keysToChainId: Record<string, number> = {};
    let nftListingsCount = 0;

    filteredListings.forEach((listing, index) => {
      // Skip if missing required fields
      if (!listing.tokenForSale || !listing.tokenToReceive) {
        // #region agent log
        if (index < 5) {
          fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAllListings.tsx:371',message:'listing skipped missing fields',data:{index,hasTokenForSale:!!listing.tokenForSale,hasTokenToReceive:!!listing.tokenToReceive,listingId:listing.listingId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
        }
        // #endregion
        if (index < 3) {
          console.log(`[getAllListings] Listing ${index + 1} skipped: missing tokenForSale or tokenToReceive`);
        }
        return;
      }
      
      // Convert handler bytes to addresses for comparison
      const srcHandlerAddr = handlerToAddress(listing.tokenForSale?.handler);
      const destHandlerAddr = handlerToAddress(listing.tokenToReceive?.handler);
      
      const erc721Handler = chainToHandler[listing.srcChain]?.["ERC721"]?.toLowerCase();
      const erc1155Handler = chainToHandler[listing.srcChain]?.["ERC1155"]?.toLowerCase();
      const erc721HandlerDest = chainToHandler[listing.dstChain]?.["ERC721"]?.toLowerCase();
      const erc1155HandlerDest = chainToHandler[listing.dstChain]?.["ERC1155"]?.toLowerCase();
      
      const srcIsERC721 = srcHandlerAddr === erc721Handler;
      const srcIsERC1155 = srcHandlerAddr === erc1155Handler;
      const srcIsNft = srcIsERC721 || srcIsERC1155;
      
      const destIsERC721 = destHandlerAddr === erc721HandlerDest;
      const destIsERC1155 = destHandlerAddr === erc1155HandlerDest;
      const destIsNFT = destIsERC721 || destIsERC1155;
      
      // Debug logging for first few listings
      if (index < 3) {
        console.log(`[getAllListings] Listing ${index + 1} handler check:`, {
          srcHandler: listing.tokenForSale?.handler?.slice(0, 20) + '...',
          srcHandlerAddr,
          erc721Handler,
          erc1155Handler,
          srcIsERC721,
          srcIsERC1155,
          srcIsNft,
          destHandler: listing.tokenToReceive?.handler?.slice(0, 20) + '...',
          destHandlerAddr,
          erc721HandlerDest,
          erc1155HandlerDest,
          destIsERC721,
          destIsERC1155,
          destIsNFT,
        });
      }
      
      if (srcIsNft || destIsNFT) {
        nftListingsCount++;
        const nftTypes = [];
        if (srcIsERC721) nftTypes.push('src:ERC721');
        if (srcIsERC1155) nftTypes.push('src:ERC1155');
        if (destIsERC721) nftTypes.push('dest:ERC721');
        if (destIsERC1155) nftTypes.push('dest:ERC1155');
        if (index < 5) {
          console.log(`[getAllListings] ✅ NFT Listing ${index + 1} detected: ${nftTypes.join(', ')}`);
        }
      }
      if (srcIsNft) {
        if (!keysToCollectionListing[listing.tokenForSale.contractAddress]) {
          keysToCollectionListing[listing.tokenForSale.contractAddress] =
            new Set();
        }
        if (!keysToHandler[listing.tokenForSale.contractAddress]) {
          keysToHandler[listing.tokenForSale.contractAddress] =
            listing.tokenForSale.handler;
        }
        if (!keysToChainId[listing.tokenForSale.contractAddress]) {
          keysToChainId[listing.tokenForSale.contractAddress] =
            listing.srcChain;
        }
        keysToCollectionListing[listing.tokenForSale.contractAddress].add(
          listing.tokenForSale.value
        );
      }
      if (destIsNFT) {
        if (!keysToCollectionListing[listing.tokenToReceive.contractAddress]) {
          keysToCollectionListing[listing.tokenToReceive.contractAddress] =
            new Set();
        }
        if (!keysToHandler[listing.tokenToReceive.contractAddress]) {
          keysToHandler[listing.tokenToReceive.contractAddress] =
            listing.tokenToReceive.handler;
        }
        if (!keysToChainId[listing.tokenToReceive.contractAddress]) {
          keysToChainId[listing.tokenToReceive.contractAddress] =
            listing.dstChain;
        }
        keysToCollectionListing[listing.tokenToReceive.contractAddress].add(
          listing.tokenToReceive.value
        );
      }
    });

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAllListings.tsx:462',message:'after filtering and processing',data:{nftListingsCount,collectionCount:Object.keys(keysToCollectionListing).length,collections:Object.keys(keysToCollectionListing),totalFiltered:filteredListings.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    console.log(`[getAllListings] NFT listings found: ${nftListingsCount}`);
    console.log(`[getAllListings] Collections to fetch metadata for: ${Object.keys(keysToCollectionListing).length}`);

    let collectionToValueToData: Record<string, Record<number, any>> = {};

    for (var collectionAddress of Object.keys(keysToCollectionListing)) {
      const fn = getCollectionFetchFn(collectionAddress);
      if (fn) {
        const fetchedData = await fn(
          Array.from(keysToCollectionListing[collectionAddress]),
          keysToHandler[collectionAddress],
          keysToChainId[collectionAddress],
          collectionAddress
        );

        //eslint-disable-next-line no-loop-func
        fetchedData.map((val) => {
          if (!collectionToValueToData[collectionAddress]) {
            collectionToValueToData[collectionAddress] = {};
          }
          return (collectionToValueToData[collectionAddress][
            Number(val.tokenId)
          ] = val);
        });
      }
    }

    const finalListings = filteredListings.map((listing) => ({
      ...listing,
      extraBuyInfo:
        collectionToValueToData?.[listing.tokenForSale.contractAddress]?.[
        listing.tokenForSale.value
        ],
      extraSellInfo:
        collectionToValueToData?.[listing.tokenToReceive.contractAddress]?.[
        listing.tokenToReceive.value
        ],
    }));

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAllListings.tsx:435',message:'getAllListings complete',data:{finalCount:finalListings.length,totalFetched,afterMapping:filteredListings.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    console.log(`[getAllListings] ✅ Final listings count: ${finalListings.length}`);
    console.log(`[getAllListings] ==========================================`);
    
    return finalListings;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAllListings.tsx:439',message:'getAllListings error',data:{errorMessage:error instanceof Error?error.message:String(error),errorName:error instanceof Error?error.name:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    console.error('[getAllListings] ❌ Error:', error);
    return [];
  }
}

export function useAllListings() {
  const {
    data = [],
    isLoading,
    refetch,
  } = useQuery<OTCListing[]>({
    queryKey: [],
    queryFn: getAllListings,
  });

  return { data: data, isLoading, refetch };
}

// Export the function for direct use outside React components
export { getAllListings };
