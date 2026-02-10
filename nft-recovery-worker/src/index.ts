/**
 * NFT Recovery Worker - Cloudflare Workers
 *
 * Automatically detects and recovers untracked NFTs in SlabNFTManager.
 *
 * Problem: SlabMachine uses transferFrom() instead of safeTransferFrom() when
 * sending NFTs after VRF callback. This means onERC721Received() is never called,
 * and NFTs arrive in the contract without being tracked in the nftInventory array.
 *
 * Solution: This worker runs every minute via Cron Trigger and:
 * 1. Checks if SlabNFTManager has untracked NFTs (balanceOf > inventoryCount)
 * 2. Finds the specific untracked token IDs via getUntrackedNFTs()
 * 3. Calls batchRecoverUntrackedNFTs() to add them to inventory
 * 4. Resets pendingRequestCount if stuck
 *
 * Deployment:
 * 1. cd nft-recovery-worker
 * 2. npm install
 * 3. wrangler secret put RELAYER_PRIVATE_KEY (same key as pokeball-relayer)
 * 4. wrangler deploy
 *
 * The wallet must be the owner of SlabNFTManager (0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ============================================================
// TYPES
// ============================================================

interface Env {
  RELAYER_PRIVATE_KEY: string;
  SLAB_NFT_MANAGER_ADDRESS: string;
  SLAB_NFT_ADDRESS: string;
  APECHAIN_RPC_URL: string;
  SCAN_START_ID: string;
  SCAN_END_ID: string;
}

// ============================================================
// CONTRACT ABIS
// ============================================================

const SLAB_NFT_MANAGER_ABI = parseAbi([
  // Read functions
  'function getInventoryCount() view returns (uint256)',
  'function pendingRequestCount() view returns (uint256)',
  'function getInventory() view returns (uint256[])',
  'function getUntrackedNFTs(uint256 startId, uint256 endId) view returns (uint256[])',
  'function owner() view returns (address)',
  // Write functions
  'function batchRecoverUntrackedNFTs(uint256[] tokenIds) external',
  'function resetPendingRequestCount() external',
]);

const ERC721_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
]);

// ApeChain definition
const apeChain = {
  id: 33139,
  name: 'ApeChain',
  nativeCurrency: { name: 'APE', symbol: 'APE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://apechain.calderachain.xyz/http'] },
  },
};

// ============================================================
// MAIN LOGIC
// ============================================================

async function checkAndRecoverNFTs(env: Env): Promise<string> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(msg);
  };

  try {
    const rpcUrl = env.APECHAIN_RPC_URL || 'https://apechain.calderachain.xyz/http';
    const slabNFTManagerAddress = env.SLAB_NFT_MANAGER_ADDRESS as Hex;
    const slabNFTAddress = env.SLAB_NFT_ADDRESS as Hex;
    const scanStartId = BigInt(env.SCAN_START_ID || '0');
    const scanEndId = BigInt(env.SCAN_END_ID || '500');

    // Create clients
    const publicClient = createPublicClient({
      chain: apeChain as any,
      transport: http(rpcUrl),
    });

    // Step 1: Quick check — does contract own more NFTs than it tracks?
    const [actualBalance, inventoryCount, pendingCount] = await Promise.all([
      publicClient.readContract({
        address: slabNFTAddress,
        abi: ERC721_ABI,
        functionName: 'balanceOf',
        args: [slabNFTManagerAddress],
      }),
      publicClient.readContract({
        address: slabNFTManagerAddress,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'getInventoryCount',
      }),
      publicClient.readContract({
        address: slabNFTManagerAddress,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'pendingRequestCount',
      }),
    ]);

    log(`Status: balance=${actualBalance}, tracked=${inventoryCount}, pending=${pendingCount}`);

    // If balanceOf matches inventory count, no untracked NFTs exist
    if (actualBalance === inventoryCount && pendingCount === 0n) {
      log('All NFTs tracked. No recovery needed.');
      return logs.join('\n');
    }

    const untrackedCount = actualBalance - inventoryCount;
    if (untrackedCount <= 0n && pendingCount === 0n) {
      log('No untracked NFTs and no stuck pending requests.');
      return logs.join('\n');
    }

    log(`Found ${untrackedCount} untracked NFT(s) and ${pendingCount} stuck pending request(s)`);

    // Step 2: Find the specific untracked token IDs
    const untrackedNFTs = await publicClient.readContract({
      address: slabNFTManagerAddress,
      abi: SLAB_NFT_MANAGER_ABI,
      functionName: 'getUntrackedNFTs',
      args: [scanStartId, scanEndId],
    });

    log(`getUntrackedNFTs(${scanStartId}-${scanEndId}) found: [${untrackedNFTs.map(id => id.toString()).join(', ')}]`);

    if (untrackedNFTs.length === 0 && pendingCount === 0n) {
      log('No untracked NFTs found in scan range. May need to expand SCAN_END_ID.');
      return logs.join('\n');
    }

    // Step 3: Create wallet client for write operations
    if (!env.RELAYER_PRIVATE_KEY) {
      log('ERROR: RELAYER_PRIVATE_KEY not set. Cannot recover NFTs.');
      return logs.join('\n');
    }

    const privateKey = env.RELAYER_PRIVATE_KEY.startsWith('0x')
      ? env.RELAYER_PRIVATE_KEY as Hex
      : `0x${env.RELAYER_PRIVATE_KEY}` as Hex;

    const account = privateKeyToAccount(privateKey);
    log(`Recovery wallet: ${account.address}`);

    // Verify we're the owner
    const contractOwner = await publicClient.readContract({
      address: slabNFTManagerAddress,
      abi: SLAB_NFT_MANAGER_ABI,
      functionName: 'owner',
    });

    if (contractOwner.toLowerCase() !== account.address.toLowerCase()) {
      log(`ERROR: Wallet ${account.address} is not the contract owner (${contractOwner}). Cannot recover.`);
      return logs.join('\n');
    }

    const walletClient = createWalletClient({
      account,
      chain: apeChain as any,
      transport: http(rpcUrl),
    });

    // Step 4: Recover untracked NFTs
    if (untrackedNFTs.length > 0) {
      log(`Recovering ${untrackedNFTs.length} untracked NFT(s): [${untrackedNFTs.map(id => id.toString()).join(', ')}]`);

      const recoverHash = await walletClient.writeContract({
        address: slabNFTManagerAddress,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'batchRecoverUntrackedNFTs',
        args: [untrackedNFTs],
      });

      log(`Recovery tx sent: ${recoverHash}`);

      const recoverReceipt = await publicClient.waitForTransactionReceipt({
        hash: recoverHash,
        timeout: 60_000,
      });

      if (recoverReceipt.status === 'success') {
        log(`Recovery SUCCESS. Gas used: ${recoverReceipt.gasUsed}`);
      } else {
        log(`Recovery REVERTED. Tx: ${recoverHash}`);
      }
    }

    // Step 5: Reset pending request count if stuck
    if (pendingCount > 0n) {
      // Re-check after recovery — pending count might still be stuck
      const currentPending = await publicClient.readContract({
        address: slabNFTManagerAddress,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'pendingRequestCount',
      });

      if (currentPending > 0n) {
        log(`Resetting stuck pendingRequestCount (currently ${currentPending})`);

        const resetHash = await walletClient.writeContract({
          address: slabNFTManagerAddress,
          abi: SLAB_NFT_MANAGER_ABI,
          functionName: 'resetPendingRequestCount',
        });

        log(`Reset tx sent: ${resetHash}`);

        const resetReceipt = await publicClient.waitForTransactionReceipt({
          hash: resetHash,
          timeout: 60_000,
        });

        if (resetReceipt.status === 'success') {
          log(`Reset SUCCESS. Gas used: ${resetReceipt.gasUsed}`);
        } else {
          log(`Reset REVERTED. Tx: ${resetHash}`);
        }
      }
    }

    // Step 6: Final verification
    const [finalCount, finalPending, finalInventory] = await Promise.all([
      publicClient.readContract({
        address: slabNFTManagerAddress,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'getInventoryCount',
      }),
      publicClient.readContract({
        address: slabNFTManagerAddress,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'pendingRequestCount',
      }),
      publicClient.readContract({
        address: slabNFTManagerAddress,
        abi: SLAB_NFT_MANAGER_ABI,
        functionName: 'getInventory',
      }),
    ]);

    log(`Final state: inventory=${finalCount}, pending=${finalPending}, NFTs=[${finalInventory.map(id => id.toString()).join(', ')}]`);
    log('Recovery complete.');

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log(`ERROR: ${errMsg}`);
  }

  return logs.join('\n');
}

// ============================================================
// WORKER EXPORT
// ============================================================

export default {
  /**
   * Cron Trigger handler — runs every minute.
   * Checks for untracked NFTs and auto-recovers them.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[NFT Recovery] Cron triggered at ${new Date(event.scheduledTime).toISOString()}`);
    const result = await checkAndRecoverNFTs(env);
    console.log(result);
  },

  /**
   * HTTP handler — allows manual triggering and health checks.
   * GET / — returns status
   * POST /recover — triggers manual recovery
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      try {
        const rpcUrl = env.APECHAIN_RPC_URL || 'https://apechain.calderachain.xyz/http';
        const publicClient = createPublicClient({
          chain: apeChain as any,
          transport: http(rpcUrl),
        });

        const [actualBalance, inventoryCount, pendingCount] = await Promise.all([
          publicClient.readContract({
            address: env.SLAB_NFT_ADDRESS as Hex,
            abi: ERC721_ABI,
            functionName: 'balanceOf',
            args: [env.SLAB_NFT_MANAGER_ADDRESS as Hex],
          }),
          publicClient.readContract({
            address: env.SLAB_NFT_MANAGER_ADDRESS as Hex,
            abi: SLAB_NFT_MANAGER_ABI,
            functionName: 'getInventoryCount',
          }),
          publicClient.readContract({
            address: env.SLAB_NFT_MANAGER_ADDRESS as Hex,
            abi: SLAB_NFT_MANAGER_ABI,
            functionName: 'pendingRequestCount',
          }),
        ]);

        const untracked = actualBalance - inventoryCount;

        return new Response(
          JSON.stringify({
            status: 'ok',
            worker: 'nft-recovery-worker',
            contract: env.SLAB_NFT_MANAGER_ADDRESS,
            actualNFTBalance: actualBalance.toString(),
            trackedInventory: inventoryCount.toString(),
            untrackedNFTs: untracked.toString(),
            pendingRequests: pendingCount.toString(),
            needsRecovery: untracked > 0n || pendingCount > 0n,
          }),
          {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }
    }

    // Manual recovery trigger
    if (url.pathname === '/recover' && request.method === 'POST') {
      const result = await checkAndRecoverNFTs(env);
      return new Response(
        JSON.stringify({ status: 'completed', log: result }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
