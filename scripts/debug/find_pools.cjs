const { createPublicClient, http, parseAbi, formatEther, formatUnits } = require('viem');

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

// Token addresses on ApeChain
const WAPE = '0x48b62137EdfA95a428D35C09E44256a739F6B557';
const USDC = '0xF1815bd50389c46847f0Bda824eC8da914045D14';
const WETH = '0x4200000000000000000000000000000000000006'; // Common bridged WETH
const DAI = '0x2F3EE0d9b4c4B4E0E0E8B4E4b4E4E4E4E4E4E4e4'; // Placeholder

// Camelot V3 Algebra Factory
const ALGEBRA_FACTORY = '0x87Ea5738b72d08D0F7eCA1a97F9e75D8D7bc1C5e'; // Correct for ApeChain

const factoryAbi = parseAbi([
  'function poolByPair(address tokenA, address tokenB) view returns (address pool)',
]);

const poolAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function liquidity() view returns (uint128)',
  'function globalState() view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1)',
]);

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

async function checkPool(factory, tokenA, tokenB, nameA, nameB) {
  try {
    const pool = await client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: 'poolByPair',
      args: [tokenA, tokenB],
    });

    if (pool === '0x0000000000000000000000000000000000000000') {
      console.log(`  ${nameA}/${nameB}: NO POOL`);
      return null;
    }

    console.log(`  ${nameA}/${nameB}: ${pool}`);

    // Get pool details
    const liquidity = await client.readContract({ address: pool, abi: poolAbi, functionName: 'liquidity' });
    const balA = await client.readContract({ address: tokenA, abi: erc20Abi, functionName: 'balanceOf', args: [pool] });
    const balB = await client.readContract({ address: tokenB, abi: erc20Abi, functionName: 'balanceOf', args: [pool] });

    console.log(`    Liquidity: ${liquidity.toString()}`);
    console.log(`    ${nameA} balance: ${formatEther(balA)}`);

    // Get decimals for tokenB
    let decB = 18;
    try {
      decB = await client.readContract({ address: tokenB, abi: erc20Abi, functionName: 'decimals' });
    } catch {}
    console.log(`    ${nameB} balance: ${formatUnits(balB, decB)}`);

    return pool;
  } catch (err) {
    console.log(`  ${nameA}/${nameB}: Error - ${err.message.slice(0, 100)}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('FINDING LIQUIDITY POOLS ON APECHAIN');
  console.log('='.repeat(60));

  // Try different factory addresses (Camelot/Algebra)
  const factories = [
    { name: 'Algebra V1.9', address: '0x87Ea5738b72d08D0F7eCA1a97F9e75D8D7bc1C5e' },
    { name: 'Camelot V3', address: '0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B' },
  ];

  for (const factory of factories) {
    console.log(`\n[${factory.name}] Factory: ${factory.address}`);

    // Check if factory exists
    try {
      const code = await client.getCode({ address: factory.address });
      if (!code || code === '0x') {
        console.log('  Factory not deployed at this address');
        continue;
      }
    } catch {
      continue;
    }

    await checkPool(factory.address, WAPE, USDC, 'WAPE', 'USDC.e');
  }

  // Check Uniswap V2 style pools (Camelot V2)
  console.log('\n[Camelot V2 Factory] Checking...');
  const v2FactoryAbi = parseAbi([
    'function getPair(address tokenA, address tokenB) view returns (address pair)',
  ]);
  const V2_FACTORY = '0x5ab6a5D9aB78F23891C3A4FE4E6bf6E3e1faE3da'; // Common address

  try {
    const pair = await client.readContract({
      address: V2_FACTORY,
      abi: v2FactoryAbi,
      functionName: 'getPair',
      args: [WAPE, USDC],
    });
    console.log('  WAPE/USDC.e V2 pair:', pair);
  } catch (err) {
    console.log('  V2 factory error:', err.message.slice(0, 80));
  }

  // Alternative: Check known pools from DEX screener/GeckoTerminal
  console.log('\n[Known Pools from DEX Screener]');
  const knownPools = [
    '0x49a45519f513d620fef6490240861b467594f3be', // APE/WAPE
    '0xb1cb718fadef31ab29df8d55ea5768ea4d622e8d', // CULT/WAPE
  ];

  for (const pool of knownPools) {
    try {
      const token0 = await client.readContract({ address: pool, abi: poolAbi, functionName: 'token0' });
      const token1 = await client.readContract({ address: pool, abi: poolAbi, functionName: 'token1' });
      console.log(`  Pool ${pool}:`);
      console.log(`    token0: ${token0}`);
      console.log(`    token1: ${token1}`);
    } catch (err) {
      console.log(`  Pool ${pool}: ${err.message.slice(0, 60)}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('CONCLUSION');
  console.log('='.repeat(60));
  console.log('\nIf no WAPE/USDC.e pool exists, options are:');
  console.log('1. Create the pool (requires liquidity)');
  console.log('2. Use multi-hop swap: WAPE → ETH → USDC.e');
  console.log('3. Fall back to v1.4.x behavior (keep APE, don\'t swap)');
  console.log('4. Accept APE directly and let users swap manually');
}

main().catch(console.error);
