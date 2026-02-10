const { createPublicClient, http, parseAbi, formatEther, formatUnits, parseEther } = require('viem');

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

// Correct addresses from Camelot docs
const ALGEBRA_FACTORY = '0x10aA510d94E094Bd643677bd2964c3EE085Daffc';
const QUOTER = '0x60A186019F81bFD04aFc16c9C01804a04E79e68B';
const SWAP_ROUTER = '0xC69Dc28924930583024E067b2B3d773018F4EB52';

const WAPE = '0x48b62137EdfA95a428D35C09E44256a739F6B557';
const USDC = '0xF1815bd50389c46847f0Bda824eC8da914045D14';

const factoryAbi = parseAbi([
  'function poolByPair(address tokenA, address tokenB) view returns (address pool)',
]);

const quoterAbi = parseAbi([
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) external returns (uint256 amountOut, uint16 fee)',
]);

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

const poolAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function liquidity() view returns (uint128)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('CHECKING ALGEBRA V3 POOLS ON APECHAIN');
  console.log('='.repeat(60));

  console.log('\n[1] Factory:', ALGEBRA_FACTORY);
  console.log('    Quoter:', QUOTER);
  console.log('    SwapRouter:', SWAP_ROUTER);

  // Check WAPE/USDC.e pool
  console.log('\n[2] Checking WAPE/USDC.e Pool:');
  try {
    const pool = await client.readContract({
      address: ALGEBRA_FACTORY,
      abi: factoryAbi,
      functionName: 'poolByPair',
      args: [WAPE, USDC],
    });

    console.log('    Pool address:', pool);

    if (pool === '0x0000000000000000000000000000000000000000') {
      console.log('    ❌ NO POOL EXISTS for WAPE/USDC.e!');
    } else {
      // Get pool details
      const wapeBalance = await client.readContract({ address: WAPE, abi: erc20Abi, functionName: 'balanceOf', args: [pool] });
      const usdcBalance = await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [pool] });
      const liquidity = await client.readContract({ address: pool, abi: poolAbi, functionName: 'liquidity' });

      console.log('    ✅ Pool exists!');
      console.log('    WAPE in pool:', formatEther(wapeBalance));
      console.log('    USDC in pool:', formatUnits(usdcBalance, 6));
      console.log('    Liquidity:', liquidity.toString());
    }
  } catch (err) {
    console.log('    Error:', err.message.slice(0, 100));
  }

  // Try getting a quote
  console.log('\n[3] Testing Quoter:');
  const testAmount = parseEther('1.5625'); // Same as 1 Poke Ball

  try {
    // Note: quoteExactInputSingle is a write function that returns values (uses staticCall)
    const result = await client.simulateContract({
      address: QUOTER,
      abi: quoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [WAPE, USDC, testAmount, 0n],
    });

    console.log('    Input:', formatEther(testAmount), 'WAPE');
    console.log('    Output:', formatUnits(result.result[0], 6), 'USDC');
    console.log('    Fee tier:', result.result[1].toString());
  } catch (err) {
    console.log('    Quoter error:', err.message.slice(0, 150));

    // If quoter fails, the pool likely doesn't exist or has no liquidity
    console.log('\n    ❌ Quote failed - pool may not exist or have insufficient liquidity');
  }

  // Check what pools DO exist
  console.log('\n[4] Checking Other Pools:');

  // Common intermediary tokens
  const tokens = [
    { name: 'WETH', address: '0x4200000000000000000000000000000000000006' },
    { name: 'APE (native wrapped)', address: '0xfC7B0bAdb1404412a747bC9bb6232E25098bE303' },
  ];

  for (const token of tokens) {
    console.log(`\n    ${token.name}/USDC.e:`);
    try {
      const pool = await client.readContract({
        address: ALGEBRA_FACTORY,
        abi: factoryAbi,
        functionName: 'poolByPair',
        args: [token.address, USDC],
      });
      console.log('      Pool:', pool);

      if (pool !== '0x0000000000000000000000000000000000000000') {
        const usdcBalance = await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [pool] });
        console.log('      USDC balance:', formatUnits(usdcBalance, 6));
      }
    } catch (err) {
      console.log('      Error:', err.message.slice(0, 80));
    }

    console.log(`    WAPE/${token.name}:`);
    try {
      const pool = await client.readContract({
        address: ALGEBRA_FACTORY,
        abi: factoryAbi,
        functionName: 'poolByPair',
        args: [WAPE, token.address],
      });
      console.log('      Pool:', pool);

      if (pool !== '0x0000000000000000000000000000000000000000') {
        const wapeBalance = await client.readContract({ address: WAPE, abi: erc20Abi, functionName: 'balanceOf', args: [pool] });
        console.log('      WAPE balance:', formatEther(wapeBalance));
      }
    } catch (err) {
      console.log('      Error:', err.message.slice(0, 80));
    }
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
