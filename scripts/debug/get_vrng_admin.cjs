const { createPublicClient, http, parseAbi } = require('viem');

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

const POP_VRNG = '0x9eC728Fce50c77e0BeF7d34F1ab28a46409b7aF1';

async function main() {
  const abi = parseAbi([
    'function admin() view returns (address)',
  ]);
  
  try {
    const admin = await client.readContract({
      address: POP_VRNG,
      abi,
      functionName: 'admin',
    });
    console.log('POP VRNG Admin:', admin);
    console.log('\n⚠️  The VRNG admin needs to whitelist PokeballGame proxy:');
    console.log('   0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f');
  } catch (err) {
    console.log('Error:', err.message);
  }
}

main();
