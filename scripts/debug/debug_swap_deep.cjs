const { createPublicClient, http, parseAbi, formatEther, formatUnits, parseEther, encodeFunctionData } = require('viem');

const apeChain = {
  id: 33139,
  name: 'ApeChain',
  nativeCurrency: { name: 'APE', symbol: 'APE', decimals: 18 },
  rpcUrls: { default: { http: ['https://apechain.calderachain.xyz/http'] } },
};

const client = createPublicClient({
  chain: apeChain,
  transport: http(),
});

const POKEBALL_GAME = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const CAMELOT_ROUTER = '0xC69Dc28924930583024E067b2B3d773018F4EB52';
const WAPE = '0x48b62137EdfA95a428D35C09E44256a739F6B557';
const USDC = '0xF1815bd50389c46847f0Bda824eC8da914045D14';
const YOUR_ADDRESS = '0x7028bEe2182A4D1E48e317748B51F15CA9814803';

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

const pokeballAbi = parseAbi([
  'function purchaseBallsWithAPE(uint8 ballType, uint256 quantity) payable',
  'function apePriceUSD() view returns (uint256)',
  'function swapSlippageBps() view returns (uint256)',
  'function calculateAPEAmount(uint256 usdAmount) view returns (uint256)',
  'function ballPrices(uint8) view returns (uint256)',
  'function wape() view returns (address)',
  'function camelotRouter() view returns (address)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('DEEP DEBUG: v1.5.0 SWAP FAILURE');
  console.log('='.repeat(60));

  // 1. Check contract state
  console.log('\n[1] Contract Configuration:');
  const wapeAddr = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'wape' });
  const routerAddr = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'camelotRouter' });
  console.log('  WAPE address:', wapeAddr);
  console.log('  Router address:', routerAddr);
  console.log('  Expected WAPE:', WAPE);
  console.log('  Expected Router:', CAMELOT_ROUTER);

  // 2. Check WAPE balance of contract (should be 0 before swap)
  console.log('\n[2] Contract WAPE Balance:');
  const wapeBalance = await client.readContract({ address: WAPE, abi: erc20Abi, functionName: 'balanceOf', args: [POKEBALL_GAME] });
  console.log('  PokeballGame WAPE balance:', formatEther(wapeBalance), 'WAPE');

  // 3. Check WAPE allowance
  console.log('\n[3] WAPE Allowance (PokeballGame → Camelot):');
  const allowance = await client.readContract({ address: WAPE, abi: erc20Abi, functionName: 'allowance', args: [POKEBALL_GAME, CAMELOT_ROUTER] });
  console.log('  Allowance:', allowance > 10n**50n ? 'MAX (unlimited)' : formatEther(allowance));

  // 4. Check Camelot pool liquidity
  console.log('\n[4] Camelot Pool Check:');
  // Try to get pool info
  const factoryAbi = parseAbi([
    'function poolByPair(address, address) view returns (address)',
  ]);
  const CAMELOT_FACTORY = '0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B'; // Algebra factory on ApeChain

  try {
    const pool = await client.readContract({
      address: CAMELOT_FACTORY,
      abi: factoryAbi,
      functionName: 'poolByPair',
      args: [WAPE, USDC],
    });
    console.log('  WAPE/USDC Pool:', pool);

    if (pool === '0x0000000000000000000000000000000000000000') {
      console.log('  ❌ NO POOL EXISTS for WAPE/USDC!');
      console.log('  This is likely the root cause - need to swap via APE/USDC path instead');
    } else {
      // Check pool liquidity
      const poolWape = await client.readContract({ address: WAPE, abi: erc20Abi, functionName: 'balanceOf', args: [pool] });
      const poolUsdc = await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [pool] });
      console.log('  Pool WAPE balance:', formatEther(poolWape), 'WAPE');
      console.log('  Pool USDC balance:', formatUnits(poolUsdc, 6), 'USDC');
    }
  } catch (err) {
    console.log('  Could not query factory:', err.message);
  }

  // 5. Try native APE route instead
  console.log('\n[5] Alternative: Check APE/USDC Pool (native):');
  // On ApeChain, native APE might have a different path
  // Let's check if there's a WAPE/USDC.e pair or if we need multi-hop

  // 6. Check quoter for best path
  console.log('\n[6] Checking Swap Paths:');
  const quoterAbi = parseAbi([
    'function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) view returns (uint256 amountOut, uint16 fee)',
  ]);
  const QUOTER = '0xd1A7fd63C7F6C8FaF3d7E9C5c1c3c82fc6F1c5aB'; // Camelot quoter on ApeChain

  const testAmount = parseEther('1.5625');
  console.log('  Test amount:', formatEther(testAmount), 'WAPE');

  try {
    const quote = await client.readContract({
      address: QUOTER,
      abi: quoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [WAPE, USDC, testAmount, 0n],
    });
    console.log('  Quote result:', formatUnits(quote[0], 6), 'USDC');
    console.log('  Fee tier:', quote[1].toString());
  } catch (err) {
    console.log('  Quoter failed:', err.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSIS');
  console.log('='.repeat(60));
  console.log('\nThe "STF" (SafeTransferFrom) error from Camelot typically means:');
  console.log('1. No liquidity pool exists for the token pair');
  console.log('2. Insufficient liquidity to execute the swap');
  console.log('3. Pool is paused or has restrictions');
  console.log('\nPossible solutions:');
  console.log('1. Use a different swap path (e.g., WAPE → native → USDC)');
  console.log('2. Use a different DEX with WAPE/USDC liquidity');
  console.log('3. Skip the swap for now and accept APE directly');
}

main().catch(console.error);
