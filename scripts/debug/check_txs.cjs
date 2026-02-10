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

// The correct proxy address
const POKEBALL_GAME = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const TEST_ADDRESS = '0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06';

// BallPurchased event signature
const abi = parseAbi([
  'event BallPurchased(address indexed buyer, uint8 ballType, uint256 quantity, bool usedAPE, uint256 totalAmount)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('SEARCHING FOR BallPurchased EVENTS');
  console.log('='.repeat(60));
  console.log('Contract:', POKEBALL_GAME);
  console.log('Buyer:', TEST_ADDRESS);
  
  const currentBlock = await client.getBlockNumber();
  console.log('Current block:', currentBlock.toString());
  
  // Search last 50000 blocks
  const fromBlock = currentBlock - 50000n;
  
  try {
    const logs = await client.getLogs({
      address: POKEBALL_GAME,
      event: abi[0],
      args: { buyer: TEST_ADDRESS },
      fromBlock,
      toBlock: currentBlock,
    });
    
    console.log('\nFound', logs.length, 'BallPurchased events from this buyer');
    
    for (const log of logs) {
      console.log('\n---');
      console.log('Block:', log.blockNumber.toString());
      console.log('TxHash:', log.transactionHash);
      console.log('Ball Type:', log.args.ballType);
      console.log('Quantity:', log.args.quantity.toString());
      console.log('Used APE:', log.args.usedAPE);
      console.log('Total Amount:', formatEther(log.args.totalAmount), 'APE/USDC');
    }
    
    if (logs.length === 0) {
      console.log('\nNo BallPurchased events found on this contract for this buyer.');
      console.log('The purchases may have gone to a different contract address.');
    }
    
  } catch (err) {
    console.error('Error fetching logs:', err.message);
  }
}

main();
