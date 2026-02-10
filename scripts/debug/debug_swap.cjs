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

const POKEBALL_GAME = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const CAMELOT_ROUTER = '0xC69Dc28924930583024E067b2B3d773018F4EB52';
const WAPE = '0x48b62137EdfA95a428D35C09E44256a739F6B557';
const USDC = '0xF1815bd50389c46847f0Bda824eC8da914045D14';
const YOUR_ADDRESS = '0x7028bEe2182A4D1E48e317748B51F15CA9814803';

const pokeballAbi = parseAbi([
  'function purchaseBallsWithAPE(uint8 ballType, uint256 quantity) payable',
  'function apePriceUSD() view returns (uint256)',
  'function swapSlippageBps() view returns (uint256)',
  'function calculateAPEAmount(uint256 usdAmount) view returns (uint256)',
  'function ballPrices(uint8) view returns (uint256)',
]);

const camelotAbi = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) external payable returns (uint256 amountOut)',
]);

const wapeAbi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('DEBUG: v1.5.0 APE PURCHASE SWAP FAILURE');
  console.log('='.repeat(60));

  // 1. Check contract state
  console.log('\n[1] Contract State:');
  const apePriceUSD = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'apePriceUSD' });
  const slippageBps = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'swapSlippageBps' });
  const ballPrice = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'ballPrices', args: [0] });

  console.log('  APE Price USD (8 decimals):', apePriceUSD.toString(), '= $' + (Number(apePriceUSD) / 1e8).toFixed(4));
  console.log('  Slippage BPS:', slippageBps.toString(), '=', Number(slippageBps) / 100, '%');
  console.log('  Ball Price (6 decimals):', ballPrice.toString(), '= $' + (Number(ballPrice) / 1e6).toFixed(2));

  // 2. Calculate expected values
  console.log('\n[2] Expected Calculation for 1 Poke Ball:');
  const usdAmount = ballPrice; // 1_000_000 = $1.00
  const apeAmount = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'calculateAPEAmount', args: [usdAmount] });
  console.log('  USD Amount:', formatUnits(usdAmount, 6), 'USDC');
  console.log('  APE Amount needed:', formatEther(apeAmount), 'APE');

  // Calculate expected USDC out and minimum with slippage
  const expectedUSDC = usdAmount; // $1.00 = 1_000_000
  const minUsdcOut = (expectedUSDC * (10000n - slippageBps)) / 10000n;
  console.log('  Expected USDC out:', formatUnits(expectedUSDC, 6), 'USDC');
  console.log('  Min USDC out (with slippage):', formatUnits(minUsdcOut, 6), 'USDC');

  // 3. Check what Camelot would actually return
  console.log('\n[3] Camelot DEX Quote Check:');
  // First, let's see if there's liquidity and what rate we'd get
  // We'll try to simulate the swap directly on Camelot

  const swapParams = {
    tokenIn: WAPE,
    tokenOut: USDC,
    recipient: POKEBALL_GAME,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
    amountIn: apeAmount,
    amountOutMinimum: 0n, // Set to 0 to see actual output
    limitSqrtPrice: 0n,
  };

  console.log('  Simulating swap with amountOutMinimum=0...');

  try {
    // Simulate the Camelot swap to see actual output
    const result = await client.simulateContract({
      address: CAMELOT_ROUTER,
      abi: camelotAbi,
      functionName: 'exactInputSingle',
      args: [swapParams],
      account: POKEBALL_GAME, // Simulate from contract
    });
    console.log('  Camelot would return:', formatUnits(result.result, 6), 'USDC');
    console.log('  Contract expects minimum:', formatUnits(minUsdcOut, 6), 'USDC');

    if (result.result < minUsdcOut) {
      console.log('  ❌ SWAP WOULD FAIL: Output less than minimum!');
      console.log('  Shortfall:', formatUnits(minUsdcOut - result.result, 6), 'USDC');
    } else {
      console.log('  ✅ Swap would succeed');
    }
  } catch (err) {
    console.log('  ❌ Camelot simulation failed:', err.message);

    // Try with a different approach - maybe need WAPE balance first
    console.log('\n  Checking if issue is WAPE balance or pool...');
  }

  // 4. Try to simulate the full purchase
  console.log('\n[4] Simulating purchaseBallsWithAPE(0, 1):');
  const valueToSend = parseEther('1.5625'); // Same as frontend

  try {
    const result = await client.simulateContract({
      address: POKEBALL_GAME,
      abi: pokeballAbi,
      functionName: 'purchaseBallsWithAPE',
      args: [0, 1n],
      value: valueToSend,
      account: YOUR_ADDRESS,
    });
    console.log('  ✅ Simulation succeeded!');
  } catch (err) {
    console.log('  ❌ Simulation failed!');
    console.log('  Error:', err.message);

    // Parse the error to find revert reason
    if (err.message.includes('TooLittleReceived')) {
      console.log('\n  ROOT CAUSE: Camelot swap output is less than minUsdcOut');
      console.log('  The contract expects to receive at least', formatUnits(minUsdcOut, 6), 'USDC');
      console.log('  But the DEX pool gives less due to:');
      console.log('    - Low liquidity in WAPE/USDC.e pool');
      console.log('    - APE price in contract ($' + (Number(apePriceUSD) / 1e8).toFixed(4) + ') differs from DEX price');
      console.log('    - Slippage tolerance too tight (', Number(slippageBps) / 100, '%)');
    }
  }

  // 5. Check actual DEX price
  console.log('\n[5] Checking DEX Pool State:');
  // Let's query the pool directly to understand pricing
  try {
    // Check WAPE balance of the pool or get a quote for a tiny amount
    const testAmount = parseEther('0.1'); // Test with 0.1 APE
    const testParams = {
      tokenIn: WAPE,
      tokenOut: USDC,
      recipient: YOUR_ADDRESS,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
      amountIn: testAmount,
      amountOutMinimum: 0n,
      limitSqrtPrice: 0n,
    };

    // This might fail but let's try
    console.log('  Test swap 0.1 WAPE -> USDC...');
  } catch (err) {
    console.log('  Could not query DEX:', err.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSIS COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
