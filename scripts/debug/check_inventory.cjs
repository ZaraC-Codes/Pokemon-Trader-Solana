const { createPublicClient, http, parseAbi } = require('viem');

// ApeChain config
const apeChain = {
  id: 33139,
  name: 'ApeChain',
  nativeCurrency: { name: 'APE', symbol: 'APE', decimals: 18 },
  rpcUrls: { default: { http: ['https://apechain.calderachain.xyz/http'] } },
  blockExplorers: { default: { name: 'Apescan', url: 'https://apescan.io' } },
};

const client = createPublicClient({
  chain: apeChain,
  transport: http(),
});

// PokeballGame proxy address
const POKEBALL_GAME = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';

// Test address - user's address  
const TEST_ADDRESS = '0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06';

// ABI for the functions we need
const abi = parseAbi([
  'function getAllPlayerBalls(address player) view returns (uint256, uint256, uint256, uint256)',
  'function apePriceUSD() view returns (uint256)',
  'function ownerWallet() view returns (address)',
  'function treasuryWallet() view returns (address)',
  'function slabNFTManager() view returns (address)',
  'function accumulatedAPEFees() view returns (uint256)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('ON-CHAIN CONTRACT STATE CHECK');
  console.log('='.repeat(60));
  
  try {
    // Check player ball inventory
    const balls = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'getAllPlayerBalls',
      args: [TEST_ADDRESS],
    });
    console.log('\n[getAllPlayerBalls] For:', TEST_ADDRESS);
    console.log('  Poke Balls:', balls[0].toString());
    console.log('  Great Balls:', balls[1].toString());
    console.log('  Ultra Balls:', balls[2].toString());
    console.log('  Master Balls:', balls[3].toString());
    
    // Check APE price
    const apePrice = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'apePriceUSD',
    });
    console.log('\n[apePriceUSD]:', apePrice.toString(), '(8 decimals, i.e. $' + (Number(apePrice) / 1e8).toFixed(4) + ')');
    
    // Check owner wallet
    const owner = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'ownerWallet',
    });
    console.log('\n[ownerWallet]:', owner);
    
    // Check treasury wallet
    const treasury = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'treasuryWallet',
    });
    console.log('[treasuryWallet]:', treasury);
    
    // Check SlabNFTManager
    const manager = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'slabNFTManager',
    });
    console.log('[slabNFTManager]:', manager);
    
    // Check accumulated APE fees
    const fees = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'accumulatedAPEFees',
    });
    console.log('\n[accumulatedAPEFees]:', fees.toString(), 'wei (', Number(fees) / 1e18, 'APE )');
    
    // Check contract APE balance
    const balance = await client.getBalance({ address: POKEBALL_GAME });
    console.log('[Contract APE balance]:', balance.toString(), 'wei (', Number(balance) / 1e18, 'APE )');
    
  } catch (err) {
    console.error('Error:', err.message);
    if (err.cause) console.error('Cause:', err.cause);
  }
}

main();
