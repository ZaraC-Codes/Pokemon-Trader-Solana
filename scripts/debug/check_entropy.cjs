/**
 * Check Pyth Entropy directly
 */

const { ethers } = require('hardhat');

const PYTH_ENTROPY = '0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320';
const PYTH_PROVIDER = '0x52DeaA1c84233F7bb8C8A45baeDE41091c616506';
const POKEBALL_GAME_PROXY = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';

const ENTROPY_ABI = [
  'function getFeeV2() view returns (uint128)',
  'function requestV2() payable returns (uint64)',
  'function requestWithCallbackV2(address provider, bytes32 userRandomNumber) payable returns (uint64)',
  'function getDefaultProvider() view returns (address)',
];

const POKEBALL_ABI = [
  'function entropy() view returns (address)',
  'function entropyProvider() view returns (address)',
  'function totalAPEReserve() view returns (uint256)',
];

async function main() {
  const [signer] = await ethers.getSigners();

  console.log('\n=== PYTH ENTROPY CHECK ===\n');
  console.log('Signer:', signer.address);

  // Check PokeballGame's entropy config
  const pokeballGame = new ethers.Contract(POKEBALL_GAME_PROXY, POKEBALL_ABI, signer);

  try {
    const entropy = await pokeballGame.entropy();
    console.log('PokeballGame.entropy():', entropy);
  } catch (e) {
    console.log('Failed to get entropy from PokeballGame:', e.message);
  }

  try {
    const provider = await pokeballGame.entropyProvider();
    console.log('PokeballGame.entropyProvider():', provider);
  } catch (e) {
    console.log('Failed to get entropyProvider from PokeballGame:', e.message);
  }

  // Check Entropy contract directly
  const entropyContract = new ethers.Contract(PYTH_ENTROPY, ENTROPY_ABI, signer);

  try {
    const fee = await entropyContract.getFeeV2();
    console.log('\nEntropy.getFeeV2():', ethers.utils.formatEther(fee), 'APE');
  } catch (e) {
    console.log('\nFailed to get fee:', e.message);
  }

  try {
    const defaultProvider = await entropyContract.getDefaultProvider();
    console.log('Entropy.getDefaultProvider():', defaultProvider);
  } catch (e) {
    console.log('Failed to get default provider:', e.message);
  }

  // Check PokeballGame's APE balance
  const apeBalance = await signer.provider.getBalance(POKEBALL_GAME_PROXY);
  console.log('\nPokeballGame native APE balance:', ethers.utils.formatEther(apeBalance), 'APE');

  const reserve = await pokeballGame.totalAPEReserve();
  console.log('PokeballGame.totalAPEReserve():', ethers.utils.formatEther(reserve), 'APE');

  if (apeBalance.lt(reserve)) {
    console.log('\n❌ WARNING: Native balance < tracked reserve! This is a problem.');
    console.log('   Native balance:', ethers.utils.formatEther(apeBalance));
    console.log('   Tracked reserve:', ethers.utils.formatEther(reserve));
    console.log('   Deficit:', ethers.utils.formatEther(reserve.sub(apeBalance)));
  }

  // Try to simulate requestV2 directly from PokeballGame
  console.log('\n--- Simulating Entropy.requestV2() from PokeballGame ---');

  const fee = await entropyContract.getFeeV2();
  console.log('Fee required:', ethers.utils.formatEther(fee), 'APE');

  // Check if PokeballGame can afford the fee
  if (apeBalance.lt(fee)) {
    console.log('❌ PokeballGame does NOT have enough native APE to pay the Entropy fee!');
    console.log('   Native balance:', ethers.utils.formatEther(apeBalance));
    console.log('   Fee required:  ', ethers.utils.formatEther(fee));
  } else {
    console.log('✅ PokeballGame has enough native APE for fee');
  }

  console.log('\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });
