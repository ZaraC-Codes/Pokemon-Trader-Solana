import {
  useAccount,
  useChainId,
  usePublicClient,
  UsePublicClientReturnType,
} from "wagmi";

export const useActiveWeb3React = (
  impersonatedAccount?: string | undefined
) => {
  const publicClient: UsePublicClientReturnType = usePublicClient();
  const account = useAccount();
  const chainId = useChainId();

  return {
    publicClient,
    account: (impersonatedAccount || account.address) as `0x${string}`,
    chainId,
  };
};
