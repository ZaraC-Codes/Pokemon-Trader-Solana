/**
 * Pokeball Game Relayer - Cloudflare Workers
 *
 * Handles gasless meta-transactions for throwBallFor() on PokeballGame v1.8.0.
 * Players sign EIP-712 messages, and this relayer submits transactions on their behalf.
 *
 * Deployment:
 * 1. cd relayer
 * 2. npm install
 * 3. wrangler secret put RELAYER_PRIVATE_KEY (enter your relayer wallet private key)
 * 4. wrangler deploy
 *
 * The relayer wallet must:
 * - Be set as the relayer address on the contract: setRelayerAddress(relayerAddress)
 * - Have sufficient APE for gas fees
 */

import { createPublicClient, createWalletClient, http, parseAbi, type Hex, encodeFunctionData } from 'viem';

// Environment interface
interface Env {
  RELAYER_PRIVATE_KEY: string;
  POKEBALL_GAME_ADDRESS: string;
  APECHAIN_CHAIN_ID: string;
  APECHAIN_RPC_URL: string;
}

// Request payload from frontend
interface ThrowBallForRequest {
  player: string;
  pokemonSlot: number;
  ballType: number;
  nonce: string; // bigint as string
  signature: string;
}

// Response types
interface SuccessResponse {
  success: true;
  txHash: string;
  requestId?: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// ABI for throwBallFor function
const POKEBALL_GAME_ABI = parseAbi([
  'function throwBallFor(address player, uint8 pokemonSlot, uint8 ballType, uint256 nonce, bytes signature) external returns (uint64 sequenceNumber)',
  'function getPlayerNonce(address player) external view returns (uint256)',
]);

// ApeChain configuration
const APECHAIN = {
  id: 33139,
  name: 'ApeChain',
  nativeCurrency: { name: 'APE', symbol: 'APE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://apechain.calderachain.xyz/http'] },
  },
} as const;

// CORS headers for frontend access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Validate Ethereum address
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Validate signature
function isValidSignature(signature: string): boolean {
  return /^0x[a-fA-F0-9]{130}$/.test(signature);
}

// Main handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only accept POST requests
    if (request.method !== 'POST') {
      return jsonResponse({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405);
    }

    try {
      // Parse request body
      const body = await request.json() as ThrowBallForRequest;
      console.log('[Relayer] Received request:', JSON.stringify(body));

      // Validate required fields
      if (!body.player || !body.signature) {
        return jsonResponse({ success: false, error: 'Missing required fields', code: 'INVALID_REQUEST' }, 400);
      }

      // Validate address format
      if (!isValidAddress(body.player)) {
        return jsonResponse({ success: false, error: 'Invalid player address', code: 'INVALID_ADDRESS' }, 400);
      }

      // Validate signature format
      if (!isValidSignature(body.signature)) {
        return jsonResponse({ success: false, error: 'Invalid signature format', code: 'INVALID_SIGNATURE' }, 400);
      }

      // Validate pokemonSlot (0-19)
      if (typeof body.pokemonSlot !== 'number' || body.pokemonSlot < 0 || body.pokemonSlot > 19) {
        return jsonResponse({ success: false, error: 'Invalid pokemonSlot (must be 0-19)', code: 'INVALID_SLOT' }, 400);
      }

      // Validate ballType (0-3)
      if (typeof body.ballType !== 'number' || body.ballType < 0 || body.ballType > 3) {
        return jsonResponse({ success: false, error: 'Invalid ballType (must be 0-3)', code: 'INVALID_BALL_TYPE' }, 400);
      }

      // Validate nonce
      let nonce: bigint;
      try {
        nonce = BigInt(body.nonce);
      } catch {
        return jsonResponse({ success: false, error: 'Invalid nonce format', code: 'INVALID_NONCE' }, 400);
      }

      // Check relayer private key is configured
      if (!env.RELAYER_PRIVATE_KEY) {
        console.error('[Relayer] RELAYER_PRIVATE_KEY not configured');
        return jsonResponse({ success: false, error: 'Relayer not configured', code: 'CONFIG_ERROR' }, 500);
      }

      // Create clients
      const rpcUrl = env.APECHAIN_RPC_URL || 'https://apechain.calderachain.xyz/http';
      const transport = http(rpcUrl);

      const publicClient = createPublicClient({
        chain: APECHAIN,
        transport,
      });

      // Import private key and create wallet client
      const { privateKeyToAccount } = await import('viem/accounts');
      const relayerAccount = privateKeyToAccount(env.RELAYER_PRIVATE_KEY as Hex);

      const walletClient = createWalletClient({
        account: relayerAccount,
        chain: APECHAIN,
        transport,
      });

      console.log('[Relayer] Using relayer address:', relayerAccount.address);

      // Verify nonce matches contract state
      const contractAddress = env.POKEBALL_GAME_ADDRESS as Hex;
      try {
        const contractNonce = await publicClient.readContract({
          address: contractAddress,
          abi: POKEBALL_GAME_ABI,
          functionName: 'getPlayerNonce',
          args: [body.player as Hex],
        });

        if (contractNonce !== nonce) {
          console.log('[Relayer] Nonce mismatch:', { provided: nonce.toString(), expected: contractNonce.toString() });
          return jsonResponse({
            success: false,
            error: `Nonce mismatch: expected ${contractNonce.toString()}, got ${nonce.toString()}`,
            code: 'NONCE_MISMATCH'
          }, 400);
        }
      } catch (err) {
        console.error('[Relayer] Failed to read nonce:', err);
        // Continue anyway - the contract will validate
      }

      // Submit transaction
      console.log('[Relayer] Submitting throwBallFor transaction...');

      const txHash = await walletClient.writeContract({
        address: contractAddress,
        abi: POKEBALL_GAME_ABI,
        functionName: 'throwBallFor',
        args: [
          body.player as Hex,
          body.pokemonSlot,
          body.ballType,
          nonce,
          body.signature as Hex,
        ],
      });

      console.log('[Relayer] Transaction submitted:', txHash);

      // Wait for receipt to get the sequence number
      let requestId: string | undefined;
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 60_000, // 60 second timeout
        });

        console.log('[Relayer] Transaction confirmed, status:', receipt.status);

        if (receipt.status === 'reverted') {
          return jsonResponse({
            success: false,
            error: 'Transaction reverted on-chain',
            code: 'TX_REVERTED'
          }, 500);
        }

        // Try to extract sequence number from logs
        // The ThrowAttempted event is emitted with the sequence number
        // For now, we just return the txHash - the frontend can watch for events

      } catch (receiptError) {
        console.error('[Relayer] Error waiting for receipt:', receiptError);
        // Still return success with txHash - the tx was submitted
      }

      return jsonResponse({
        success: true,
        txHash,
        requestId,
      });

    } catch (err) {
      console.error('[Relayer] Error:', err);

      // Parse error message for common cases
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      if (errorMessage.includes('InsufficientBalls')) {
        return jsonResponse({ success: false, error: 'Player has no balls of this type', code: 'INSUFFICIENT_BALLS' }, 400);
      }
      if (errorMessage.includes('InvalidSignature')) {
        return jsonResponse({ success: false, error: 'Invalid signature', code: 'INVALID_SIGNATURE' }, 400);
      }
      if (errorMessage.includes('InvalidNonce')) {
        return jsonResponse({ success: false, error: 'Invalid nonce', code: 'INVALID_NONCE' }, 400);
      }
      if (errorMessage.includes('PokemonNotActive')) {
        return jsonResponse({ success: false, error: 'No Pokemon in that slot', code: 'POKEMON_NOT_ACTIVE' }, 400);
      }
      if (errorMessage.includes('NoAttemptsRemaining')) {
        return jsonResponse({ success: false, error: 'Pokemon has no attempts remaining', code: 'NO_ATTEMPTS' }, 400);
      }
      if (errorMessage.includes('InsufficientAPEReserve')) {
        return jsonResponse({ success: false, error: 'Contract APE reserve too low', code: 'LOW_RESERVE' }, 500);
      }
      if (errorMessage.includes('OnlyRelayerOrOwner')) {
        return jsonResponse({ success: false, error: 'Relayer not authorized', code: 'UNAUTHORIZED' }, 403);
      }

      return jsonResponse({ success: false, error: errorMessage, code: 'INTERNAL_ERROR' }, 500);
    }
  },
};

// Helper to create JSON responses with CORS headers
function jsonResponse(data: SuccessResponse | ErrorResponse, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
