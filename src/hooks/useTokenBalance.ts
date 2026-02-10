import { useCallback } from "react";
import { useActiveWeb3React } from "./useActiveWeb3React";
import { tokenContractConfig } from "../services/config";
import { useQuery } from "@tanstack/react-query";

export function useTokenBalance(tokenAddress?: string) {
  const { account, publicClient } = useActiveWeb3React();
  const getBalance = useCallback(async () => {
    try {
      if (!publicClient || !account || !tokenAddress) return BigInt(0);
      const balance = await publicClient.readContract({
        functionName: "balanceOf",
        address: tokenAddress as any,
        abi: tokenContractConfig.abi as any,
        args: [account],
      });
      return balance as bigint;
    } catch (error) {
      return BigInt(0);
    }
  }, [tokenAddress, account, publicClient]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: [tokenAddress, account, getBalance],
    queryFn: getBalance,
  });

  return { data, isLoading, refetch };
}
