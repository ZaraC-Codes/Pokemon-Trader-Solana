const { createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

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
const YOUR_ADDRESS = '0x7028bEe2182A4D1E48e317748B51F15CA9814803';

const pokeballAbi = parseAbi([
  'function purchaseBallsWithAPE(uint8 ballType, uint256 quantity) payable',
]);

async function main() {
  console.log('='.repeat(60));
  console.log('GAS ESTIMATION TEST');
  console.log('='.repeat(60));

  const valueToSend = parseEther('1.5625');

  console.log('\n[1] Simulating purchaseBallsWithAPE(0, 1)...');
  try {
    const result = await client.simulateContract({
      address: POKEBALL_GAME,
      abi: pokeballAbi,
      functionName: 'purchaseBallsWithAPE',
      args: [0, 1n],
      value: valueToSend,
      account: YOUR_ADDRESS,
    });
    console.log('  ✅ Simulation succeeded');
  } catch (err) {
    console.log('  ❌ Simulation failed:', err.message.slice(0, 100));
    return;
  }

  console.log('\n[2] Estimating gas...');
  try {
    const gas = await client.estimateGas({
      account: YOUR_ADDRESS,
      to: POKEBALL_GAME,
      data: '0x', // Will be filled by estimateContractGas
      value: valueToSend,
    });

    // Use estimateContractGas for better accuracy
    const gasEstimate = await client.estimateContractGas({
      address: POKEBALL_GAME,
      abi: pokeballAbi,
      functionName: 'purchaseBallsWithAPE',
      args: [0, 1n],
      value: valueToSend,
      account: YOUR_ADDRESS,
    });

    console.log('  ✅ Gas estimate:', gasEstimate.toString(), 'gas units');

    // Get current gas price
    const gasPrice = await client.getGasPrice();
    const gasCostWei = gasEstimate * gasPrice;
    console.log('  Gas price:', formatEther(gasPrice * 1000000000n), 'Gwei');
    console.log('  Estimated cost:', formatEther(gasCostWei), 'APE');

    if (gasEstimate < 1000000n) {
      console.log('\n  ✅ REASONABLE GAS ESTIMATE (< 1M gas)');
    } else {
      console.log('\n  ⚠️  HIGH GAS ESTIMATE - may indicate issue');
    }

  } catch (err) {
    console.log('  ❌ Gas estimation failed:', err.message.slice(0, 150));
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
