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

// PokeballGame proxy address
const POKEBALL_GAME = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';

// YOUR connected wallet address from console log
const YOUR_ADDRESS = '0x7028bEe2182A4D1E48e317748B51F15CA9814803';

const abi = parseAbi([
  'function getAllPlayerBalls(address player) view returns (uint256, uint256, uint256, uint256)',
  'function apePriceUSD() view returns (uint256)',
  'function accumulatedAPEFees() view returns (uint256)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('CHECKING YOUR WALLET INVENTORY');
  console.log('='.repeat(60));
  console.log('Contract:', POKEBALL_GAME);
  console.log('Your Address:', YOUR_ADDRESS);
  
  try {
    // Check YOUR ball inventory
    const balls = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'getAllPlayerBalls',
      args: [YOUR_ADDRESS],
    });
    console.log('\n[getAllPlayerBalls] For:', YOUR_ADDRESS);
    console.log('  Poke Balls:', balls[0].toString());
    console.log('  Great Balls:', balls[1].toString());
    console.log('  Ultra Balls:', balls[2].toString());
    console.log('  Master Balls:', balls[3].toString());
    
    const totalBalls = Number(balls[0]) + Number(balls[1]) + Number(balls[2]) + Number(balls[3]);
    if (totalBalls > 0) {
      console.log('\n✅ SUCCESS! You have', totalBalls, 'ball(s) in inventory!');
    } else {
      console.log('\n⚠️  No balls yet. Did MetaMask confirm the transaction?');
    }
    
    // Check APE price
    const apePrice = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'apePriceUSD',
    });
    console.log('\n[apePriceUSD]: $' + (Number(apePrice) / 1e8).toFixed(4));
    
    // Check accumulated fees
    const fees = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'accumulatedAPEFees',
    });
    console.log('[accumulatedAPEFees]:', formatEther(fees), 'APE');
    
    // Check contract balance
    const balance = await client.getBalance({ address: POKEBALL_GAME });
    console.log('[Contract APE balance]:', formatEther(balance), 'APE');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
