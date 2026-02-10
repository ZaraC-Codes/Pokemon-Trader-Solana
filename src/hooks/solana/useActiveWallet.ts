/**
 * useActiveWallet Hook
 *
 * Replaces the EVM useActiveWeb3React hook.
 * Returns connected wallet pubkey as a string for use in components.
 */

import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useMemo } from 'react';

export function useActiveWallet() {
  const { publicKey, connected, wallet } = useWallet();
  const { connection } = useConnection();

  const account = useMemo(() => {
    return publicKey?.toBase58() ?? undefined;
  }, [publicKey]);

  return {
    connection,
    account,
    publicKey,
    connected,
    walletName: wallet?.adapter?.name,
  };
}
