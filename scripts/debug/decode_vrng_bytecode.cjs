const { createPublicClient, http, keccak256, toBytes } = require('viem');

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
  const code = await client.getCode({ address: POP_VRNG });
  
  // Extract all 4-byte selectors from the bytecode
  // They appear after PUSH4 opcodes (0x63)
  const selectors = new Set();
  for (let i = 0; i < code.length - 10; i++) {
    if (code.slice(i, i + 2) === '63') {
      const selector = '0x' + code.slice(i + 2, i + 10);
      if (/^0x[0-9a-f]{8}$/.test(selector)) {
        selectors.add(selector);
      }
    }
  }
  
  console.log('Function selectors found in POP VRNG bytecode:');
  console.log([...selectors].sort().join('\n'));
  
  // Look up known selectors
  const knownSelectors = {
    '0x48f5c3ed': 'InvalidCaller() error',
    '0x06fdde03': 'name()',
    '0x8da5cb5b': 'owner()',
    '0xf851a440': 'admin()',
    '0x13af4035': 'setOwner(address)',
    '0x704b6c02': 'setAdmin(address)',
    '0x40c3b187': 'addCaller(address)',
    '0x60ced26e': 'removeCaller(address)',
    '0xb6a5d7de': 'authorize(address)',
    '0x7cd07e47': 'getRandomNumber()',
    '0xdbdff2c1': 'getRandomness()',
    '0x1fe543e3': 'rawFulfillRandomness(bytes32,uint256)',
    '0x2f7918fb': 'requestRandomNumberWithTraceId(uint256)',
    '0x150b7a02': 'onERC721Received(address,address,uint256,bytes)',
  };
  
  console.log('\nKnown selectors:');
  for (const sel of [...selectors]) {
    if (knownSelectors[sel]) {
      console.log(`  ${sel}: ${knownSelectors[sel]}`);
    }
  }
  
  // Check what functions we can call
  console.log('\n\nAttempting to read storage slot 0 (often used for owner):');
  const slot0 = await client.getStorageAt({ address: POP_VRNG, slot: '0x0' });
  console.log('Slot 0:', slot0);
  
  // Check slots 1-5
  for (let i = 1; i <= 5; i++) {
    const slot = await client.getStorageAt({ 
      address: POP_VRNG, 
      slot: '0x' + i.toString(16).padStart(64, '0') 
    });
    if (slot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.log(`Slot ${i}:`, slot);
    }
  }
}

main().catch(console.error);
