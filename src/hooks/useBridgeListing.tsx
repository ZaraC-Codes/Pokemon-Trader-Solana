import { Dispatch, SetStateAction, useCallback } from "react";
import { TokenAddress } from "../types";
import { useWriteContract } from "wagmi";
import { chainIdToEndpoint, otcAddress, swapContractConfig } from "../config";
import { serializeListing } from "../utilities/serialize";
import { isUserRejectedError } from "../utilities/isUserRejectedError";
import { useActiveWeb3React } from "./useActiveWeb3React";
import useNotification from "../utilities/notificationUtils";
// MaxUint256 constant (equivalent to ethers MaxUint256)
const MaxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

export function useBridgeListingFn(
  fromToken: TokenAddress,
  toToken: TokenAddress,
  amountFrom: bigint,
  amountTo: bigint,
  toChain: number,
  setLoading: Dispatch<SetStateAction<boolean>>,
  isCollectionOffer: boolean
) {
  const { account, chainId, publicClient } = useActiveWeb3React();
  const { writeContractAsync } = useWriteContract();
  const { showError, showInfo } = useNotification();

  return useCallback(async () => {
    try {
      setLoading(true);
      const destinationEndpoint = chainIdToEndpoint[toChain];
      const finalAmountTo = isCollectionOffer ? MaxUint256 : amountTo;

      const listing = serializeListing(
        account as string,
        fromToken,
        toToken,
        amountFrom,
        finalAmountTo,
        destinationEndpoint
      );

      const tx = await writeContractAsync({
        abi: swapContractConfig.abi,
        args: [listing],
        address: otcAddress[chainId] as any,
        functionName: "createListing",
        account: account,
      });
      await publicClient?.waitForTransactionReceipt({ hash: tx });
      return tx;
    } catch (error) {
      if (isUserRejectedError(error)) {
        // Avoid full-screen error overlays in dev for a normal cancel flow.
        showInfo("Transaction cancelled");
        return;
      }
      showError("Error occurred while creating listing");
      return;
    } finally {
      setLoading(false);
    }
  }, [
    fromToken,
    toToken,
    amountFrom,
    amountTo,
    account,
    writeContractAsync,
    chainId,
    publicClient,
    showError,
    setLoading,
    toChain,
    isCollectionOffer,
  ]);
}
