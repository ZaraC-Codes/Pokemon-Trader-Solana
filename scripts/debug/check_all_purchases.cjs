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

const TEST_ADDRESS = '0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06';

// BallPurchased event signature - search ALL contracts
const abi = parseAbi([
  'event BallPurchased(address indexed buyer, uint8 ballType, uint256 quantity, bool usedAPE, uint256 totalAmount)',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('SEARCHING FOR ALL BallPurchased EVENTS (any contract)');
  console.log('='.repeat(60));
  console.log('Buyer:', TEST_ADDRESS);
  
  const currentBlock = await client.getBlockNumber();
  console.log('Current block:', currentBlock.toString());
  
  // Search last 100000 blocks (~2.3 days)
  const fromBlock = currentBlock - 100000n;
  
  try {
    // Search without address filter to find ALL BallPurchased events from this buyer
    const logs = await client.getLogs({
      event: abi[0],
      args: { buyer: TEST_ADDRESS },
      fromBlock,
      toBlock: currentBlock,
    });
    
    console.log('\nFound', logs.length, 'BallPurchased events from this buyer (any contract)');
    
    // Group by contract address
    const byContract = {};
    for (const log of logs) {
      const addr = log.address.toLowerCase();
      if (!byContract[addr]) byContract[addr] = [];
      byContract[addr].push(log);
    }
    
    for (const [addr, contractLogs] of Object.entries(byContract)) {
      console.log('\n' + '='.repeat(60));
      console.log('CONTRACT:', addr);
      console.log('Events:', contractLogs.length);
      
      // Check balance of this contract
      const balance = await client.getBalance({ address: addr });
      console.log('APE Balance:', formatEther(balance), 'APE');
      
      for (const log of contractLogs) {
        console.log('\n  ---');
        console.log('  Block:', log.blockNumber.toString());
        console.log('  TxHash:', log.transactionHash);
        console.log('  Ball Type:', log.args.ballType);
        console.log('  Quantity:', log.args.quantity.toString());
        console.log('  Used APE:', log.args.usedAPE);
        console.log('  Total Amount:', formatEther(log.args.totalAmount), 'APE/USDC');
      }
    }
    
    if (logs.length === 0) {
      console.log('\nNo BallPurchased events found from this buyer on ANY contract.');
    }
    
  } catch (err) {
    console.error('Error fetching logs:', err.message);
  }
}

main();
