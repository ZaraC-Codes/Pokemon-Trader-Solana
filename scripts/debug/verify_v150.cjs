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

const POKEBALL_GAME = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const SLAB_NFT_MANAGER = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const TREASURY = '0x1D1d0E6eF415f2BAe0c21939c50Bc4ffBeb65c74';
const YOUR_ADDRESS = '0x7028bEe2182A4D1E48e317748B51F15CA9814803';
const USDC_ADDRESS = '0xF1815bd50389c46847f0Bda824eC8da914045D14';

const pokeballAbi = parseAbi([
  'function getAllPlayerBalls(address player) view returns (uint256, uint256, uint256, uint256)',
  'function apePriceUSD() view returns (uint256)',
  'function accumulatedUSDCFees() view returns (uint256)',
  'function accumulatedAPEFees() view returns (uint256)',
  'function camelotRouter() view returns (address)',
  'function wape() view returns (address)',
  'function swapSlippageBps() view returns (uint256)',
  'function slabNFTManager() view returns (address)',
]);

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('v1.5.0 DEPLOYMENT VERIFICATION');
  console.log('='.repeat(60));
  
  try {
    // Check v1.5.0 config
    console.log('\n[v1.5.0 Config]');
    const router = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'camelotRouter' });
    const wape = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'wape' });
    const slippage = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'swapSlippageBps' });
    console.log('  Camelot Router:', router);
    console.log('  WAPE:', wape);
    console.log('  Slippage:', slippage.toString(), 'bps');
    
    // Check fees
    console.log('\n[Fee Tracking]');
    const usdcFees = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'accumulatedUSDCFees' });
    const apeFees = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'accumulatedAPEFees' });
    console.log('  Accumulated USDC Fees:', formatUnits(usdcFees, 6), 'USDC.e');
    console.log('  Accumulated APE Fees (legacy):', formatEther(apeFees), 'APE');
    
    // Check SlabNFTManager
    const manager = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'slabNFTManager' });
    console.log('\n[SlabNFTManager]');
    console.log('  Address:', manager);
    
    // Check USDC.e balance in SlabNFTManager
    const managerUSDC = await client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [SLAB_NFT_MANAGER] });
    console.log('  USDC.e Balance:', formatUnits(managerUSDC, 6), 'USDC.e');
    
    // Check your ball inventory
    const balls = await client.readContract({ address: POKEBALL_GAME, abi: pokeballAbi, functionName: 'getAllPlayerBalls', args: [YOUR_ADDRESS] });
    console.log('\n[Your Inventory]', YOUR_ADDRESS);
    console.log('  Poke Balls:', balls[0].toString());
    console.log('  Great Balls:', balls[1].toString());
    console.log('  Ultra Balls:', balls[2].toString());
    console.log('  Master Balls:', balls[3].toString());
    
    // Check contract balances
    console.log('\n[Contract Balances]');
    const contractAPE = await client.getBalance({ address: POKEBALL_GAME });
    const contractUSDC = await client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [POKEBALL_GAME] });
    console.log('  PokeballGame APE:', formatEther(contractAPE), 'APE');
    console.log('  PokeballGame USDC.e:', formatUnits(contractUSDC, 6), 'USDC.e');
    
    const treasuryUSDC = await client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [TREASURY] });
    console.log('  Treasury USDC.e:', formatUnits(treasuryUSDC, 6), 'USDC.e');
    
    console.log('\n' + '='.repeat(60));
    console.log('v1.5.0 READY FOR TESTING');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Make an APE purchase in the frontend');
    console.log('2. Watch for APESwappedToUSDC event');
    console.log('3. Check accumulatedUSDCFees increases by 3%');
    console.log('4. Check SlabNFTManager USDC.e balance increases by 97%');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
