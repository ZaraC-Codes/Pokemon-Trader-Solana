import { TokenAddress } from "../services/types";
import { useQuery } from "@tanstack/react-query";
import { useActiveWeb3React } from "./useActiveWeb3React";
import { chainToConfig, nftContractConfig } from "../services/config";
// ZeroAddress constant (equivalent to ethers ZeroAddress)
const ZeroAddress = '0x0000000000000000000000000000000000000000';
import { readContract } from "@wagmi/core";

export function useNftExists(token: TokenAddress | null, index?: bigint) {
  const { account } = useActiveWeb3React();

  return useQuery({
    queryKey: [account, token, Number(index)],
    queryFn: async () => {
      try {
        // Don't check if index is 0, undefined, or not a bigint
        if (!account || !token || !token.isNft || typeof index !== "bigint" || index === BigInt(0)) {
          return false;
        }

        const chainConfig = chainToConfig[token.chainId];
        const owner = await readContract(chainConfig, {
          abi: nftContractConfig.abi,
          args: [index],
          address: token.address as any,
          functionName: "ownerOf",
          account: account,
        });
        return owner !== ZeroAddress;
      } catch (error: any) {
        // Handle ERC721NonexistentToken error gracefully
        if (error?.name === "ContractFunctionRevertedError" || 
            error?.name === "ContractFunctionExecutionError" ||
            error?.shortMessage?.includes("revert") ||
            error?.message?.includes("ERC721NonexistentToken")) {
          return false;
        }
        console.error("Error checking NFT existence:", error);
        return false;
      }
    },
    enabled: account !== undefined && token !== null && token.isNft && typeof index === "bigint" && index !== BigInt(0),
  });
}
