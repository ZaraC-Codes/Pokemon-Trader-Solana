import { useQuery } from "@tanstack/react-query";
import { useActiveWeb3React } from "../useActiveWeb3React";
import { getIPFSMetadata } from "./ipfs";
import { chainToNFTUtils } from "../../services/config";
import { getAlchemyNFTMetadataBatch } from "../../utils/alchemy";
import { getNFTData } from "./nft";
import { TokenAddress } from "../../types";
import { parseAbiItem } from "viem";

// ZeroAddress constant (equivalent to ethers ZeroAddress)
const ZeroAddress = '0x0000000000000000000000000000000000000000';

type FetchFn = (
  ids: (number | bigint)[],
  account?: string,
  chainId?: number,
  nftAddress?: string
) => Promise<any[]>;

export function getCollectionFetchFn(collection: string): FetchFn {
  // Only support ApeChain collections - use getNFTData for all ApeChain NFTs
  // This will use the ApeChain client configured in nft.ts
  return getNFTData;
}

// ApeChain NFT Collections total supply
// Add ApeChain collection addresses and their total supply here
const collectionToTotalSupply: Record<string, number> = {
  // ApeChain Pokemon Cards NFT Collection
  "0x8a981c2cfdd7fbc65395dd2c02ead94e9a2f65a7": 10000, // Default supply, update with actual value if known
};

// Collections that are not enumerable via the ERC721-style methods we use here.
// (We may still enumerate them via logs in some cases.)
const NON_ENUMERABLE_COLLECTIONS = new Set<string>([
  // (keep for truly non-enumerable collections if needed)
]);

// Safety: scanning ownerOf across totalSupply will quickly trigger provider rate limits.
const MAX_OWNEROF_ENUMERATION_SUPPLY = 2500;

// Safety: log scanning can be heavy; default to a recent window unless overridden.
const MAX_LOG_SCAN_BLOCKS = BigInt(250_000);

const ERC721_TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
);
const ERC1155_TRANSFER_SINGLE_EVENT = parseAbiItem(
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)"
);
const ERC1155_TRANSFER_BATCH_EVENT = parseAbiItem(
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)"
);

const getEnvFromBlock = (address: string) => {
  // ApeChain-specific from block configuration
  // Add ApeChain collection addresses here if needed
  // const a = address.toLowerCase();
  // if (a === "0x...") {
  //   const v = process.env.REACT_APP_APECHAIN_COLLECTION_FROM_BLOCK;
  //   return v ? BigInt(v) : null;
  // }
  return null;
};

async function getStartBlock(publicClient: any, nftAddress: string): Promise<bigint> {
  const latest = (await publicClient.getBlockNumber()) as bigint;
  const envStart = getEnvFromBlock(nftAddress);
  if (envStart !== null) return envStart;
  return latest > MAX_LOG_SCAN_BLOCKS ? latest - MAX_LOG_SCAN_BLOCKS : BigInt(0);
}

async function enumerateErc721IdsByLogs(
  publicClient: any,
  nftAddress: string,
  account: string
): Promise<bigint[]> {
  const fromBlock = await getStartBlock(publicClient, nftAddress);
  const toBlock = (await publicClient.getBlockNumber()) as bigint;

  // Fetch incoming/outgoing transfers and build an ownership set.
  const [incoming, outgoing] = await Promise.all([
    publicClient.getLogs({
      address: nftAddress as any,
      event: ERC721_TRANSFER_EVENT,
      args: { to: account as any },
      fromBlock,
      toBlock,
    }),
    publicClient.getLogs({
      address: nftAddress as any,
      event: ERC721_TRANSFER_EVENT,
      args: { from: account as any },
      fromBlock,
      toBlock,
    }),
  ]);

  // Note: This is best-effort if the wallet acquired NFTs before fromBlock.
  const owned = new Set<string>();
  for (const log of incoming ?? []) {
    owned.add((log.args as any).tokenId.toString());
  }
  for (const log of outgoing ?? []) {
    owned.delete((log.args as any).tokenId.toString());
  }
  return Array.from(owned).map((s) => BigInt(s));
}

async function enumerateErc1155IdsByLogs(
  publicClient: any,
  nftAddress: string,
  account: string
): Promise<bigint[]> {
  const fromBlock = await getStartBlock(publicClient, nftAddress);
  const toBlock = (await publicClient.getBlockNumber()) as bigint;

  const [inSingle, outSingle, inBatch, outBatch] = await Promise.all([
    publicClient.getLogs({
      address: nftAddress as any,
      event: ERC1155_TRANSFER_SINGLE_EVENT,
      args: { to: account as any },
      fromBlock,
      toBlock,
    }),
    publicClient.getLogs({
      address: nftAddress as any,
      event: ERC1155_TRANSFER_SINGLE_EVENT,
      args: { from: account as any },
      fromBlock,
      toBlock,
    }),
    publicClient.getLogs({
      address: nftAddress as any,
      event: ERC1155_TRANSFER_BATCH_EVENT,
      args: { to: account as any },
      fromBlock,
      toBlock,
    }),
    publicClient.getLogs({
      address: nftAddress as any,
      event: ERC1155_TRANSFER_BATCH_EVENT,
      args: { from: account as any },
      fromBlock,
      toBlock,
    }),
  ]);

  const balances = new Map<string, bigint>();
  const add = (id: bigint, delta: bigint) => {
    const k = id.toString();
    balances.set(k, (balances.get(k) ?? BigInt(0)) + delta);
  };

  for (const log of inSingle ?? []) {
    const { id, value } = log.args as any;
    add(id as bigint, value as bigint);
  }
  for (const log of outSingle ?? []) {
    const { id, value } = log.args as any;
    add(id as bigint, -(value as bigint));
  }
  for (const log of inBatch ?? []) {
    const { ids, values } = log.args as any;
    for (let i = 0; i < (ids?.length ?? 0); i++) add(ids[i], values[i]);
  }
  for (const log of outBatch ?? []) {
    const { ids, values } = log.args as any;
    for (let i = 0; i < (ids?.length ?? 0); i++) add(ids[i], -(values[i] as bigint));
  }

  return Array.from(balances.entries())
    .filter(([, bal]) => bal > BigInt(0))
    .map(([id]) => BigInt(id));
}

export function useOwnedNftIds(
  nftAddress: string,
  chainId: number,
  account: string,
  enabled: boolean = true
) {
  const { publicClient } = useActiveWeb3React();

  return useQuery({
    queryKey: ["ownedNftIds", account, nftAddress || ZeroAddress, chainId, publicClient],
    enabled: Boolean(enabled && account && nftAddress && chainId && publicClient),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 0,
    queryFn: async () => {
      try {
        if (!account || !nftAddress || !chainId || !publicClient) return [];

        if (NON_ENUMERABLE_COLLECTIONS.has(nftAddress.toLowerCase())) {
          // We cannot reliably enumerate owned IDs for these collections.
          return [];
        }

        // Special-case ERC1155 collections: enumerate IDs via logs (best-effort).
        // Add ApeChain ERC1155 collection addresses here if needed
        // if (nftAddress.toLowerCase() === "0x...") {
        //   const ids = await enumerateErc1155IdsByLogs(publicClient, nftAddress, account);
        //   const sanitized = Array.from(new Set(ids.filter((x) => x !== BigInt(0)).map((x) => x.toString()))).map((s) =>
        //     BigInt(s)
        //   );
        //   return sanitized;
        // }

        let ownedIds: bigint[] = [];

        if (account !== ZeroAddress) {
          try {
            // Try NFTUtils.viewOwnedIds first (faster for most collections)
            const totalSupply = collectionToTotalSupply[nftAddress] || 20000;
            ownedIds = (await publicClient.readContract({
              abi: nftUtils.abi,
              args: [nftAddress, account, totalSupply],
              address: chainToNFTUtils[chainId] as any,
              functionName: "viewOwnedIds",
              account: account as any,
            })) as unknown as bigint[];
          } catch (error) {
            // Fallback to standard ERC721 methods (balanceOf + tokenOfOwnerByIndex) / other fallbacks.
            try {
              let balance: bigint;
              try {
                balance = await publicClient.readContract({
                  abi: [
                    {
                      inputs: [{ internalType: "address", name: "owner", type: "address" }],
                      name: "balanceOf",
                      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
                      stateMutability: "view",
                      type: "function",
                    },
                  ],
                  address: nftAddress as any,
                  functionName: "balanceOf",
                  args: [account as any],
                }) as bigint;
              } catch {
                balance = BigInt(0);
              }

              if (Number(balance) > 0) {
                // Try tokenOfOwnerByIndex (ERC721Enumerable)
                try {
                  const tokenCalls = Array.from({ length: Number(balance) }, (_, index) => ({
                    address: nftAddress as any,
                    abi: [
                      {
                        inputs: [
                          { internalType: "address", name: "owner", type: "address" },
                          { internalType: "uint256", name: "index", type: "uint256" },
                        ],
                        name: "tokenOfOwnerByIndex",
                        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
                        stateMutability: "view",
                        type: "function",
                      },
                    ] as any,
                    functionName: "tokenOfOwnerByIndex",
                    args: [account as any, BigInt(index)],
                  }));

                  const tokenResults = await publicClient.multicall({
                    contracts: tokenCalls,
                  });

                  ownedIds = tokenResults
                    .filter((result) => result.status === "success")
                    .map((result) => result.result as bigint);
                } catch {
                  // Try tokensOfOwner / walletOfOwner if present
                  const listFns = ["tokensOfOwner", "walletOfOwner"] as const;
                  let found: bigint[] | null = null;
                  for (const fn of listFns) {
                    try {
                      const res = (await publicClient.readContract({
                        address: nftAddress as any,
                        abi: [
                          {
                            inputs: [{ internalType: "address", name: "owner", type: "address" }],
                            name: fn,
                            outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
                            stateMutability: "view",
                            type: "function",
                          },
                        ] as any,
                        functionName: fn,
                        args: [account as any],
                      })) as unknown as bigint[];

                      if (Array.isArray(res) && res.length > 0) {
                        found = res;
                        break;
                      }
                    } catch {
                      // try next
                    }
                  }
                  ownedIds = found ?? [];
                }
              } else {
                // If balanceOf isn't supported or is 0, we'll attempt transfer-log enumeration later.
                ownedIds = [];
              }
            } catch {
              ownedIds = [];
            }
          }
        }

        // Sanitize: remove 0s / duplicates
        ownedIds = ownedIds.filter((id) => id !== BigInt(0));
        ownedIds = Array.from(new Set(ownedIds.map((id) => id.toString()))).map((s) => BigInt(s));

        // If we still have nothing, try ERC721 Transfer logs as a last resort.
        if (ownedIds.length === 0 && account !== ZeroAddress) {
          try {
            const ids = await enumerateErc721IdsByLogs(publicClient, nftAddress, account);
            const sanitized = Array.from(new Set(ids.filter((x) => x !== BigInt(0)).map((x) => x.toString()))).map((s) =>
              BigInt(s)
            );
            if (sanitized.length > 0) ownedIds = sanitized;
          } catch {
            // ignore
          }
        }

        return ownedIds;
      } catch (error) {
        console.error(error);
        return [];
      }
    },
  });
}

export function useOwnedNfts(
  nftAddress: string,
  chainId: number,
  account: string,
  enabled: boolean = true
) {
  const { publicClient } = useActiveWeb3React();

  return useQuery({
    queryKey: [account, nftAddress || ZeroAddress, chainId, publicClient],
    enabled: Boolean(enabled && account && nftAddress && chainId && publicClient),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 0,
    queryFn: async () => {
      try {
        if (!account || !nftAddress || !chainId || !publicClient) return [];
        //@ts-ignore
        const collectionFetchFn = getCollectionFetchFn(nftAddress);

        if (NON_ENUMERABLE_COLLECTIONS.has(nftAddress.toLowerCase())) {
          // We cannot reliably enumerate owned IDs for these collections.
          // Users can still manually input an ID; metadata fetch is handled elsewhere.
          return [];
        }

        // Special-case ERC1155 collections: enumerate IDs via logs (best-effort).
        // Add ApeChain ERC1155 collection addresses here if needed
        // if (nftAddress.toLowerCase() === "0x...") {
        //   const ids = await enumerateErc1155IdsByLogs(publicClient, nftAddress, account);
        //   const sanitized = Array.from(new Set(ids.filter((x) => x !== BigInt(0)).map((x) => x.toString()))).map((s) =>
        //     BigInt(s)
        //   );
        //   return await collectionFetchFn(sanitized, account, chainId, nftAddress);
        // }
        
        let ownedIds: bigint[] = [];
        
        if (account !== ZeroAddress) {
          try {
            // Try NFTUtils.viewOwnedIds first (faster for most collections)
            const totalSupply = collectionToTotalSupply[nftAddress] || 20000;
            ownedIds = (await publicClient.readContract({
              abi: nftUtils.abi,
              args: [nftAddress, account, totalSupply],
              address: chainToNFTUtils[chainId] as any,
              functionName: "viewOwnedIds",
              account: account as any,
            })) as unknown as bigint[];
          } catch (error) {
            // Fallback to standard ERC721 methods (balanceOf + tokenOfOwnerByIndex)
            // This works better for proxy contracts or when NFTUtils fails
            console.warn(`NFTUtils.viewOwnedIds failed for ${nftAddress}, using fallback method:`, error);
            try {
              // Try ERC721 balanceOf first
              let balance: bigint;
              try {
                balance = await publicClient.readContract({
                  abi: [
                    {
                      inputs: [{ internalType: "address", name: "owner", type: "address" }],
                      name: "balanceOf",
                      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
                      stateMutability: "view",
                      type: "function",
                    },
                  ],
                  address: nftAddress as any,
                  functionName: "balanceOf",
                  args: [account as any],
                }) as bigint;
              } catch (erc721Error) {
                // If ERC721 balanceOf fails, try enumerating by checking ownerOf for token IDs
                // This works for contracts that support ownerOf but have non-standard balanceOf
                console.warn(`balanceOf failed for ${nftAddress}, trying ownerOf enumeration:`, erc721Error);
                try {
                  const totalSupply = collectionToTotalSupply[nftAddress] || 20000;
                  if (totalSupply > MAX_OWNEROF_ENUMERATION_SUPPLY) {
                    console.warn(
                      `Skipping ownerOf enumeration for ${nftAddress} (supply=${totalSupply}) to avoid rate limits. Use manual ID entry.`
                    );
                    ownedIds = [];
                    return await collectionFetchFn(ownedIds, account, chainId, nftAddress);
                  }
                  // Try to enumerate by checking ownerOf for a range of token IDs
                  // Use batch calls to check multiple tokens at once
                  const batchSize = 100; // Check 100 tokens at a time
                  const batches = Math.ceil(totalSupply / batchSize);
                  
                  for (let batch = 0; batch < batches; batch++) {
                    const startId = batch * batchSize;
                    const endId = Math.min(startId + batchSize, totalSupply);
                    const tokenCalls = Array.from({ length: endId - startId }, (_, i) => ({
                      address: nftAddress as any,
                      abi: [
                        {
                          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
                          name: "ownerOf",
                          outputs: [{ internalType: "address", name: "", type: "address" }],
                          stateMutability: "view",
                          type: "function",
                        },
                      ] as any,
                      functionName: "ownerOf",
                      args: [BigInt(startId + i)],
                    }));

                    const results = await publicClient.multicall({
                      contracts: tokenCalls,
                    });

                    results.forEach((result, index) => {
                      if (result.status === "success" && result.result) {
                        const owner = result.result as string;
                        if (typeof owner === "string" && owner.toLowerCase() === account.toLowerCase()) {
                          ownedIds.push(BigInt(startId + index));
                        }
                      }
                    });
                  }
                  
                  if (ownedIds.length > 0) {
                    // Found tokens using ownerOf enumeration
                    return await collectionFetchFn(ownedIds, account, chainId, nftAddress);
                  }
                  
                  // If no tokens found, return empty
                  ownedIds = [];
                  return await collectionFetchFn(ownedIds, account, chainId, nftAddress);
                } catch (enumError) {
                  console.error(`OwnerOf enumeration also failed for ${nftAddress}:`, enumError);
                  ownedIds = [];
                  return await collectionFetchFn(ownedIds, account, chainId, nftAddress);
                }
              }

              if (Number(balance) > 0) {
                // Try tokenOfOwnerByIndex (ERC721Enumerable)
                try {
                  const tokenCalls = Array.from({ length: Number(balance) }, (_, index) => ({
                    address: nftAddress as any,
                    abi: [
                      {
                        inputs: [
                          { internalType: "address", name: "owner", type: "address" },
                          { internalType: "uint256", name: "index", type: "uint256" },
                        ],
                        name: "tokenOfOwnerByIndex",
                        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
                        stateMutability: "view",
                        type: "function",
                      },
                    ] as any,
                    functionName: "tokenOfOwnerByIndex",
                    args: [account as any, BigInt(index)],
                  }));

                  const tokenResults = await publicClient.multicall({
                    contracts: tokenCalls,
                  });

                  ownedIds = tokenResults
                    .filter((result) => result.status === "success")
                    .map((result) => result.result as bigint);
                } catch (tokenOfOwnerError) {
                  // If tokenOfOwnerByIndex fails, the contract might not be enumerable.
                  // Many popular ERC721s expose `tokensOfOwner(address)` or `walletOfOwner(address)` as an alternative.
                  console.warn(
                    `tokenOfOwnerByIndex failed for ${nftAddress}, trying tokensOfOwner/walletOfOwner fallback:`,
                    tokenOfOwnerError
                  );
                  try {
                    const listFns = ["tokensOfOwner", "walletOfOwner"] as const;
                    let found: bigint[] | null = null;

                    for (const fn of listFns) {
                      try {
                        const res = (await publicClient.readContract({
                          address: nftAddress as any,
                          abi: [
                            {
                              inputs: [{ internalType: "address", name: "owner", type: "address" }],
                              name: fn,
                              outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
                              stateMutability: "view",
                              type: "function",
                            },
                          ] as any,
                          functionName: fn,
                          args: [account as any],
                        })) as unknown as bigint[];

                        if (Array.isArray(res) && res.length > 0) {
                          found = res;
                          break;
                        }
                      } catch {
                        // try next
                      }
                    }

                    ownedIds = found ?? [];
                  } catch (fallbackListError) {
                    console.warn(
                      `tokensOfOwner/walletOfOwner fallback failed for ${nftAddress}; treat as non-enumerable (manual ID entry):`,
                      fallbackListError
                    );
                    ownedIds = [];
                  }
                }
              } else {
                ownedIds = [];
              }
            } catch (fallbackError) {
              console.error(`Fallback method also failed for ${nftAddress}:`, fallbackError);
              ownedIds = [];
            }
          }
        }

        // Sanitize: some helpers return placeholder 0s or duplicates
        // (tokenId 0 is commonly invalid for these collections and causes uri/tokenURI to revert)
        ownedIds = ownedIds.filter((id) => id !== BigInt(0));
        ownedIds = Array.from(new Set(ownedIds.map((id) => id.toString()))).map((s) => BigInt(s));

        // If we still have nothing, try ERC721 Transfer logs as a last resort.
        // This covers non-enumerable ERC721 collections (e.g. many modern projects) without relying on custom ABIs.
        // Note: best-effort within a recent block window (see MAX_LOG_SCAN_BLOCKS / *_FROM_BLOCK envs).
        if (ownedIds.length === 0 && account !== ZeroAddress) {
          try {
            const ids = await enumerateErc721IdsByLogs(publicClient, nftAddress, account);
            const sanitized = Array.from(
              new Set(ids.filter((x) => x !== BigInt(0)).map((x) => x.toString()))
            ).map((s) => BigInt(s));
            if (sanitized.length > 0) ownedIds = sanitized;
          } catch (e) {
            // If this isn't an ERC721 contract (e.g. ERC1155), logs may not match; ignore.
            console.warn(`ERC721 Transfer-log enumeration failed for ${nftAddress}:`, e);
          }
        }
        
        return await collectionFetchFn(ownedIds, account, chainId, nftAddress);
      } catch (error) {
        console.error(error);
        return [];
      }
    },
  });
}

export function useNftInfo(
  nft: TokenAddress,
  id: number,
  shouldUpdate: boolean
) {
  const { account } = useActiveWeb3React();

  return useQuery({
    // Include account in the key when present, but don't block fetching when it's missing
    // (listing details should still be able to show metadata for public NFTs).
    queryKey: [account ?? "no-account", nft, id, shouldUpdate],
    queryFn: async () => {
      try {
        if (!nft || !nft.isNft || !shouldUpdate) return null;
        const collectionFetchFn = getCollectionFetchFn(nft.address);
        if (!collectionFetchFn) return null;

        // `getNFTData` requires nftAddress/chain/account; pass through consistently.
        const result = await collectionFetchFn(
          [id],
          account ?? ZeroAddress,
          nft.chainId ?? 0,
          nft.address
        );
        return result?.[0] || null;
      } catch (error) {
        return null;
      }
    },
  });
}
