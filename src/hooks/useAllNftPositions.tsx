import { useCallback } from "react";
import { useActiveWeb3React } from "./useActiveWeb3React";
import { nftContractConfig } from "../config";
import { useQuery } from "@tanstack/react-query";

export function useAllNftPositions(nftCollection: string) {
  const { account, publicClient } = useActiveWeb3React();

  const getPositions = useCallback(async () => {
    if (!publicClient || !account) return [];
    const balance = await publicClient.readContract({
      functionName: "balanceOf",
      address: nftCollection as any,
      abi: nftContractConfig.abi as any,
      args: [account],
    });
    const calls = new Array(balance).fill({}).map((_, index) => ({
      address: nftCollection as any,
      abi: nftContractConfig.abi as any,
      functionName: "tokenOfOwnerByIndex",
      args: [account, index],
    }));
    const result = await publicClient.multicall({
      contracts: calls,
    });
    return result.flatMap((data) => {
      if (data.status === "success") {
        //@ts-ignore
        return [Number(data.result)];
      }
      return [];
    });
  }, [nftCollection, account, publicClient]);

  const {
    data = [],
    isLoading,
    refetch,
  } = useQuery<number[]>({
    queryKey: [getPositions],
    queryFn: getPositions,
  });

  return { data, isLoading, refetch };
}
