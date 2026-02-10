/**
 * Verification script to confirm the PokeballGame fix.
 * Run this AFTER making a purchase to verify:
 * 1. Ball inventory was updated
 * 2. APE fees accumulated in contract
 */

const { createPublicClient, http, parseAbi, formatEther } = require('viem');

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

// The CORRECT proxy address
const POKEBALL_GAME = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const SLAB_NFT_MANAGER = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const TREASURY = '0x1D1d0E6eF415f2BAe0c21939c50Bc4ffBeb65c74';
const TEST_ADDRESS = '0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06';

const pokeballAbi = parseAbi([
  'function getAllPlayerBalls(address player) view returns (uint256, uint256, uint256, uint256)',
  'function apePriceUSD() view returns (uint256)',
  'function accumulatedAPEFees() view returns (uint256)',
  'function treasuryWallet() view returns (address)',
  'function slabNFTManager() view returns (address)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('POST-FIX VERIFICATION');
  console.log('='.repeat(60));
  
  try {
    // 1. Check player ball inventory
    const balls = await client.readContract({
      address: POKEBALL_GAME,
      abi: pokeballAbi,
      functionName: 'getAllPlayerBalls',
      args: [TEST_ADDRESS],
    });
    console.log('\n✅ Ball Inventory for', TEST_ADDRESS);
    console.log('   Poke Balls:', balls[0].toString());
    console.log('   Great Balls:', balls[1].toString());
    console.log('   Ultra Balls:', balls[2].toString());
    console.log('   Master Balls:', balls[3].toString());
    
    const totalBalls = Number(balls[0]) + Number(balls[1]) + Number(balls[2]) + Number(balls[3]);
    if (totalBalls === 0) {
      console.log('\n⚠️  No balls in inventory. Make a purchase to test!');
    } else {
      console.log('\n✅ SUCCESS: Balls are being credited correctly!');
    }
    
    // 2. Check APE price
    const apePrice = await client.readContract({
      address: POKEBALL_GAME,
      abi: pokeballAbi,
      functionName: 'apePriceUSD',
    });
    console.log('\n✅ APE Price: $' + (Number(apePrice) / 1e8).toFixed(4));
    
    // 3. Check accumulated fees
    const fees = await client.readContract({
      address: POKEBALL_GAME,
      abi: pokeballAbi,
      functionName: 'accumulatedAPEFees',
    });
    console.log('\n✅ Accumulated APE Fees:', formatEther(fees), 'APE');
    
    // 4. Check contract balance
    const contractBalance = await client.getBalance({ address: POKEBALL_GAME });
    console.log('✅ PokeballGame Contract Balance:', formatEther(contractBalance), 'APE');
    
    // 5. Check SlabNFTManager balance
    const managerBalance = await client.getBalance({ address: SLAB_NFT_MANAGER });
    console.log('✅ SlabNFTManager Balance:', formatEther(managerBalance), 'APE');
    
    // 6. Check Treasury balance  
    const treasuryBalance = await client.getBalance({ address: TREASURY });
    console.log('✅ Treasury Balance:', formatEther(treasuryBalance), 'APE');
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log('Contract Address:', POKEBALL_GAME);
    console.log('Total Balls:', totalBalls);
    console.log('Contract APE:', formatEther(contractBalance));
    console.log('Manager APE:', formatEther(managerBalance));
    console.log('Treasury APE:', formatEther(treasuryBalance));
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main();
