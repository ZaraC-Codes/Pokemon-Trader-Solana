/**
 * useActiveWeb3React Compatibility Hook
 *
 * Thin wrapper that provides the same interface as the old EVM hook
 * but uses Solana wallet adapter internally. This allows components
 * that haven't been fully ported yet to still work.
 */

import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useMemo } from 'react';

export const useActiveWeb3React = () => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();

  const account = useMemo(() => {
    return publicKey?.toBase58();
  }, [publicKey]);

  return {
    connection,
    account,
    publicKey,
    connected,
  };
};
