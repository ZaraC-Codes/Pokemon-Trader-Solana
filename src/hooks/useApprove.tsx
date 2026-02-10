import { useCallback, useMemo } from "react";
import { getNFTSmartContract, getTokenSmartContract } from "../shared";
import { useActiveWeb3React } from "./useActiveWeb3React";
import { useReadContract, useWriteContract } from "wagmi";
import { nftContractConfig, tokenContractConfig } from "../config";
import useNotification from "../utilities/notificationUtils";
import { isUserRejectedError } from "../utilities/isUserRejectedError";

export enum ApprovalState {
  UNKNOWN = "UNKNOWN",
  NOT_APPROVED = "NOT_APPROVED",
  PENDING = "PENDING",
  APPROVED = "APPROVED",
}

function useNFTAllowances(nftAddress: string | undefined, operator: string) {
  const { account } = useActiveWeb3React();

  const { data, isLoading, refetch } = useReadContract({
    address: nftAddress as any,
    args: [account, operator],
    abi: nftContractConfig.abi,
    functionName: "isApprovedForAll",
  });

  return {
    data: data as boolean,
    isLoading,
    mutate: refetch,
  };
}

function useTokenAllowance(tokenAddress: string | undefined, operator: string) {
  const { account } = useActiveWeb3React();
  const { data, isLoading, refetch } = useReadContract({
    address: tokenAddress as any,
    args: [account, operator],
    abi: tokenContractConfig.abi,
    functionName: "allowance",
  });

  return {
    data: data as bigint,
    isLoading,
    mutate: refetch,
  };
}

// returns a variable indicating the state of the approval and a function which approves if necessary or early returns
export function useApproveToken(
  tokenAddress: string | undefined,
  amountToApprove: bigint,
  spender?: string
): [ApprovalState, () => Promise<void>, boolean] {
  const { publicClient } = useActiveWeb3React();
  const {
    data: currentAllowance,
    mutate,
    isLoading,
  } = useTokenAllowance(tokenAddress, spender as string);
  const { showSuccess, showError } = useNotification();

  const { writeContractAsync } = useWriteContract();

  // check the current approval status
  const approvalState: ApprovalState = useMemo(() => {
    if (!amountToApprove || !spender) return ApprovalState.UNKNOWN;
    // if (amountToApprove.currency.isNative) return ApprovalState.APPROVED;
    // we might not have enough data to know whether or not we need to approve
    if (typeof currentAllowance !== "bigint") return ApprovalState.UNKNOWN;

    // amountToApprove will be defined if currentAllowance is
    return currentAllowance < amountToApprove
      ? ApprovalState.NOT_APPROVED
      : ApprovalState.APPROVED;
  }, [amountToApprove, currentAllowance, spender]);

  const approve = useCallback(async (): Promise<void> => {
    const tokenContract = await getTokenSmartContract(tokenAddress as string);
    if (!tokenContract) {
      console.error("token contract not configured");
      return;
    }
    if (approvalState !== ApprovalState.NOT_APPROVED) {
      console.error("approve was called unnecessarily");
      return;
    }
    if (!tokenAddress) {
      console.error("no token");
      return;
    }
    if (!tokenContract) {
      console.error("tokenContract is null");
      return;
    }
    if (!amountToApprove) {
      console.error("missing amount to approve");
      return;
    }
    if (!spender) {
      console.error("no spender");
      return;
    }

    try {
      const tx = await writeContractAsync({
        address: tokenAddress as any,
        args: [spender, amountToApprove],
        abi: tokenContractConfig.abi,
        functionName: "approve",
      });

      if (tx) {
        await publicClient?.waitForTransactionReceipt({ hash: tx });
        showSuccess("Successfully approved tokens");
        mutate();
      }
    } catch (error) {
      if (isUserRejectedError(error)) return;
      showError("Error while approving tokens");
    }
  }, [
    approvalState,
    tokenAddress,
    amountToApprove,
    spender,
    writeContractAsync,
    publicClient,
    showSuccess,
    showError,
    mutate,
  ]);

  return useMemo(
    () => [approvalState, approve, isLoading],
    [approvalState, approve, isLoading]
  );
}

// returns a variable indicating the state of the approval and a function which approves if necessary or early returns
export function useApproveNFTCollection(
  nftAddress: string | undefined,
  operator: string
): [ApprovalState, () => Promise<void>, boolean] {
  const { publicClient } = useActiveWeb3React();
  const {
    data: isApprovedForAll,
    mutate,
    isLoading,
  } = useNFTAllowances(nftAddress, operator);

  // check the current approval status
  const approvalState: ApprovalState = useMemo(() => {
    if (!operator) return ApprovalState.UNKNOWN;
    return !isApprovedForAll
      ? ApprovalState.NOT_APPROVED
      : ApprovalState.APPROVED;
  }, [isApprovedForAll, operator]);

  const { showSuccess, showError } = useNotification();

  const { writeContractAsync } = useWriteContract();

  const approve = useCallback(async (): Promise<void> => {
    const nftContract = await getNFTSmartContract(nftAddress as string);
    if (approvalState !== ApprovalState.NOT_APPROVED) {
      console.error("approve was called unnecessarily");
      return;
    }
    if (!nftContract) {
      console.error("nftContract is null");
      return;
    }

    try {
      const tx = await writeContractAsync({
        address: nftAddress as any,
        args: [operator, true],
        abi: nftContractConfig.abi,
        functionName: "setApprovalForAll",
      });

      if (tx) {
        await publicClient?.waitForTransactionReceipt({ hash: tx });
        showSuccess("Successfully approved nft collection");
        mutate();
      }
    } catch (error) {
      if (isUserRejectedError(error)) return;
      showError("Error while approving nft collection");
    }
  }, [
    approvalState,
    operator,
    mutate,
    nftAddress,
    writeContractAsync,
    showSuccess,
    showError,
    publicClient,
  ]);

  return useMemo(
    () => [approvalState, approve, isLoading],
    [approvalState, approve, isLoading]
  );
}
