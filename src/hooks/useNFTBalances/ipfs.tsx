import { chainToConfig, nftContractConfig } from "../../services/config";
import { serializeNFTAttributes } from "../../utilities/serialize";
import { multicall } from "@wagmi/core";

const getIPFSUrl = (url: string) => {
  if (url.includes("ipfs://")) {
    return `https://ipfs.io/ipfs/${url.split("ipfs://")[1]}`;
  }
  if (url.includes("ar:/")) {
    return `https://arweave.net/${url.split("ar://")[1]}`;
  }
  return url;
};

export const getIPFSMetadata = async (
  id: any[],
  _: string,
  chainId: number,
  nftAddress: string
): Promise<any[]> => {
  try {
    const chainConfig = chainToConfig[chainId];
    
    // Try tokenURI first
    const calls = id.map((val) => ({
      functionName: "tokenURI",
      address: nftAddress as any,
      abi: nftContractConfig.abi as any,
      args: [val],
    }));
    let results = await multicall(chainConfig, {
      contracts: calls,
    });
    
    // If tokenURI fails, try uri function (for ERC1155 or custom implementations)
    const hasFailures = results.some((r) => r.status === "failure");
    if (hasFailures) {
      const uriCalls = id.map((val) => ({
        functionName: "uri",
        address: nftAddress as any,
        abi: nftContractConfig.abi as any,
        args: [val],
      }));
      const uriResults = await multicall(chainConfig, {
        contracts: uriCalls,
      });
      // Use uri results where tokenURI failed
      results = results.map((result, index) => 
        result.status === "failure" ? uriResults[index] : result
      );
    }
    const metadataCalls = results.map(async (data, index) => {
      if (data.status === "success") {
        let res = data.result as string;
        //@ts-ignore
        res = getIPFSUrl(data.result);
        const result = await fetch(res, {
          signal: AbortSignal.timeout(5000),
        });
        return await result.json();
      }
      return new Promise((res) => res({ tokenId: id[index] }));
    });
    const res = await Promise.all(metadataCalls);
    return res.map((val, index) => {
      return {
        tokenId: Number(id[index]),
        ...serializeNFTAttributes(val?.attributes || []),
        image: val?.image ? getIPFSUrl(val?.image) : "",
      };
    });
  } catch (error) {
    console.log(error);
    return id.map((val) => ({ tokenId: Number(val) }));
  }
};
