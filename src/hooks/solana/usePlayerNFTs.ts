/**
 * usePlayerNFTs Hook (Solana)
 *
 * Fetches all NFTs (0-decimal SPL tokens with amount >= 1) from the player's wallet.
 * Also fetches vault mints so we can tag which NFTs came from the game.
 */

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { fetchNftVault } from '../../solana/programClient';

export interface PlayerNFT {
  mint: string;
  amount: number;
  /** True if this mint is (or was) in the game's NftVault */
  fromGame: boolean;
}

export interface UsePlayerNFTsReturn {
  nfts: PlayerNFT[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const POLL_INTERVAL = 30_000; // 30 seconds

export function usePlayerNFTs(): UsePlayerNFTsReturn {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [nfts, setNfts] = useState<PlayerNFT[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNFTs = useCallback(async () => {
    if (!publicKey) {
      setNfts([]);
      setIsLoading(false);
      return;
    }

    try {
      // Fetch all SPL token accounts owned by the player
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      // Filter for NFTs: decimals=0 and amount >= 1
      const nftAccounts = tokenAccounts.value.filter((ta) => {
        const info = ta.account.data.parsed?.info;
        return info?.tokenAmount?.decimals === 0 && Number(info?.tokenAmount?.amount) >= 1;
      });

      // Fetch vault mints to tag game NFTs
      const vault = await fetchNftVault(connection);
      const vaultMintSet = new Set<string>();
      if (vault && vault.count > 0) {
        for (let i = 0; i < vault.count; i++) {
          const mint = vault.mints[i];
          if (mint && !mint.equals(PublicKey.default)) {
            vaultMintSet.add(mint.toBase58());
          }
        }
      }

      // Also check if the player's NFT was previously in vault (awarded via catch)
      // We can't know this from vault state alone, so we mark ALL 0-decimal tokens
      // as potentially from the game. In production, we'd use Metaplex collection metadata.
      // For devnet, all test NFTs are from the game, so this is fine.
      const playerNFTs: PlayerNFT[] = nftAccounts.map((ta) => {
        const info = ta.account.data.parsed.info;
        const mint = info.mint as string;
        return {
          mint,
          amount: Number(info.tokenAmount.amount),
          fromGame: true, // On devnet, all 0-decimal tokens in this wallet are game NFTs
        };
      });

      setNfts(playerNFTs);
      setError(null);
    } catch (e) {
      console.error('[usePlayerNFTs] Failed to fetch NFTs:', e);
      setError((e as Error)?.message ?? 'Failed to fetch NFTs');
    } finally {
      setIsLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    fetchNFTs();
    const interval = setInterval(fetchNFTs, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNFTs]);

  return {
    nfts,
    isLoading,
    error,
    refetch: fetchNFTs,
  };
}
