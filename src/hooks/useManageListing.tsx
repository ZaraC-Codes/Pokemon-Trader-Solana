import { OTCListing } from "../services/types";
import { Dispatch, SetStateAction, useCallback } from "react";
import { useActiveWeb3React } from "./useActiveWeb3React";
import { useWriteContract } from "wagmi";
import useNotification from "../utilities/notificationUtils";
import {
  chainIdToEndpoint,
  chainToConfig,
  otcAddress,
  swapContractConfig,
} from "../services/config";
import { apeChainMainnet } from "../services/apechainConfig";
import { readContract } from "@wagmi/core";
import { useQueryClient } from "@tanstack/react-query";

type ClaimResult = {
  txHash: `0x${string}`;
  receipt: any;
  isSameChain: boolean;
};

type UseManageListingOptions = {
  /** Defaults to true (current behavior). If false, caller can show a reveal UI before closing. */
  closeOnSuccess?: boolean;
  /** Called after the tx is confirmed (receipt available). */
  onClaimed?: (result: ClaimResult) => void | Promise<void>;
};

// ZeroHash equivalent
const ZeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export function useManageListing(
  listing: OTCListing,
  setLoading: Dispatch<SetStateAction<boolean>>,
  onClose: any,
  refetchListings: any,
  collectionOfferNFTID?: number,
  manageOptions?: UseManageListingOptions
) {
  const { account, chainId, publicClient } = useActiveWeb3React();
  const { writeContractAsync } = useWriteContract();
  const { showSuccess, showError } = useNotification();
  const queryClient = useQueryClient();

  const invalidateOwnedNfts = useCallback(() => {
    if (!account) return;

    const a1 = listing.tokenForSale?.contractAddress?.toLowerCase?.();
    const a2 = listing.tokenToReceive?.contractAddress?.toLowerCase?.();

    queryClient.invalidateQueries({
      predicate: (q) => {
        const key = q.queryKey as any[];
        if (!Array.isArray(key) || key.length < 2) return false;

        const isOwnedNftsKey = String(key[0]).toLowerCase() === account.toLowerCase();
        if (isOwnedNftsKey) {
          const addr = String(key[1] ?? "").toLowerCase();
          return Boolean((a1 && addr === a1) || (a2 && addr === a2));
        }

        const isOwnedNftIdsKey = String(key[0]) === "ownedNftIds" && String(key[1]).toLowerCase() === account.toLowerCase();
        if (isOwnedNftIdsKey) {
          const addr = String(key[2] ?? "").toLowerCase();
          return Boolean((a1 && addr === a1) || (a2 && addr === a2));
        }

        return false;
      },
    });
  }, [account, listing, queryClient]);

  const claimListing = useCallback(async () => {
    if (!account || !chainId) {
      showError("Please connect your wallet");
      return;
    }

    setLoading(true);
    try {
      // Simplified version for same-chain claims
      // For cross-chain, you'd need LayerZero integration
      const isSameChain = listing.srcChain === chainId;
      
      if (!isSameChain) {
        showError("Cross-chain claims not yet supported in this simplified version");
        setLoading(false);
        return;
      }

      // Simple same-chain claim
      const claimListingParams = {
        _listingId: listing.listingId,
        destinationEndpoint: chainIdToEndpoint[listing.srcChain] || chainIdToEndpoint[apeChainMainnet.id],
        tokensForSale: listing.tokensForSale || (listing.tokenForSale ? [listing.tokenForSale] : []),
        tokensToReceive: [
          collectionOfferNFTID
            ? { ...listing.tokenToReceive!, value: BigInt(collectionOfferNFTID) }
            : listing.tokenToReceive!,
        ],
      };

      const tx = await writeContractAsync({
        abi: swapContractConfig.abi,
        args: [
          BigInt(0), // nativeFee (0 for same chain)
          claimListingParams,
          ZeroHash, // srcOptions (empty for same chain)
          ZeroHash, // lzOptions (empty for same chain)
        ],
        address: otcAddress[chainId] as any,
        functionName: "claimListing",
        value: BigInt(0), // No native fee for same-chain
      });

      const receipt = await publicClient?.waitForTransactionReceipt({ hash: tx });
      showSuccess(
        "Successfully claimed listing, the amount should reflect in your wallet shortly"
      );
      invalidateOwnedNfts();
      refetchListings();

      try {
        await manageOptions?.onClaimed?.({ txHash: tx, receipt, isSameChain: true });
      } catch (e) {
        console.warn("onClaimed callback failed:", e);
      }

      if (manageOptions?.closeOnSuccess !== false) {
        onClose();
      }
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes('0xf4d678b8')) {
        showError("You must own at least one HV-MTL / HV-MTL Activated / AMPs NFT to trade on this platform");
      } else {
        showError(error?.message || "An error occurred while claiming listing");
      }
    } finally {
      setLoading(false);
    }
  }, [
    listing,
    writeContractAsync,
    setLoading,
    publicClient,
    showSuccess,
    showError,
    collectionOfferNFTID,
    account,
    chainId,
    refetchListings,
    onClose,
    invalidateOwnedNfts,
    manageOptions,
  ]);

  const cancelListing = useCallback(async () => {
    if (!account || !chainId) {
      showError("Please connect your wallet");
      return;
    }

    setLoading(true);
    try {
      const tx = await writeContractAsync({
        abi: swapContractConfig.abi,
        args: [listing.listingId],
        address: otcAddress[chainId] as any,
        functionName: "closeListing",
      });

      await publicClient?.waitForTransactionReceipt({ hash: tx });
      showSuccess("Successfully cancelled listing");
      invalidateOwnedNfts();
      refetchListings();
      onClose();
    } catch (error: any) {
      showError(error?.message || "An error occurred while cancelling your listing");
    } finally {
      setLoading(false);
    }
  }, [
    listing,
    writeContractAsync,
    setLoading,
    publicClient,
    showSuccess,
    showError,
    account,
    chainId,
    refetchListings,
    onClose,
    invalidateOwnedNfts,
  ]);

  return { claimListing, cancelListing };
}
