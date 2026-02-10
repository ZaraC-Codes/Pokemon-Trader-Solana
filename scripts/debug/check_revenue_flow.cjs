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

const POKEBALL_GAME = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const SLAB_NFT_MANAGER = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const TREASURY = '0x1D1d0E6eF415f2BAe0c21939c50Bc4ffBeb65c74';

async function main() {
  console.log('='.repeat(60));
  console.log('REVENUE FLOW CHECK');
  console.log('='.repeat(60));
  
  // Check all balances
  const pokeballBalance = await client.getBalance({ address: POKEBALL_GAME });
  const managerBalance = await client.getBalance({ address: SLAB_NFT_MANAGER });
  const treasuryBalance = await client.getBalance({ address: TREASURY });
  
  console.log('\n[PokeballGame Contract]:', formatEther(pokeballBalance), 'APE');
  console.log('[SlabNFTManager]:', formatEther(managerBalance), 'APE');
  console.log('[Treasury]:', formatEther(treasuryBalance), 'APE');
  
  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS');
  console.log('='.repeat(60));
  
  const totalInContract = Number(formatEther(pokeballBalance));
  console.log('\nTotal APE received by contract:', totalInContract.toFixed(4), 'APE');
  console.log('Expected fee (3%):', (totalInContract * 0.03).toFixed(4), 'APE');
  console.log('Expected revenue (97%):', (totalInContract * 0.97).toFixed(4), 'APE');
  
  console.log('\n⚠️  NOTE: APE stays in PokeballGame contract until:');
  console.log('   - Owner calls withdrawAPEFees() to send 3% to treasury');
  console.log('   - Revenue (97%) is converted and sent to SlabNFTManager');
  console.log('   - (Current design keeps APE in contract for fee tracking)');
}

main();
