const { createPublicClient, http } = require('viem');

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

// Use full ABI from file
const abi = require('./contracts/abi/abi_PokeballGameV5.json');

async function main() {
  console.log('Checking active Pokemon slots...\n');
  
  try {
    const count = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'getActivePokemonCount',
    });
    console.log('Active Pokemon count:', count);
  } catch (err) {
    console.log('getActivePokemonCount error:', err.message.slice(0, 100));
  }
  
  try {
    const slots = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'getActivePokemonSlots',
    });
    console.log('Active slots:', slots.map(s => Number(s)));
    console.log('Is slot 18 in list?', slots.map(s => Number(s)).includes(18));
  } catch (err) {
    console.log('getActivePokemonSlots error:', err.message.slice(0, 100));
  }
  
  try {
    const all = await client.readContract({
      address: POKEBALL_GAME,
      abi,
      functionName: 'getAllActivePokemons',
    });
    console.log('\nAll Pokemon (showing active only):');
    for (let i = 0; i < 20; i++) {
      if (all[i].isActive) {
        console.log(`  Slot ${i}: ID=${all[i].id}, pos=(${all[i].posX},${all[i].posY}), attempts=${all[i].attemptCount}`);
      }
    }
    
    // Check slot 18 specifically
    console.log('\nSlot 18 details:', all[18]);
  } catch (err) {
    console.log('getAllActivePokemons error:', err.message.slice(0, 100));
  }
}

main().catch(console.error);
