/**
 * Trace the throwBallFor call step by step
 */

const { ethers } = require('hardhat');

const POKEBALL_GAME_PROXY = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const PYTH_ENTROPY = '0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320';

const PLAYER = '0x7028bEe2182A4D1E48e317748B51F15CA9814803';
const POKEMON_SLOT = 3;
const BALL_TYPE = 1;
const NONCE = 15;
const SIGNATURE = '0x7b8ad0772f870823739f9a063a8d237cf7d993e3a8f83dd3b5eae0cf2a42131f6833eb77e66da5968ca9ab8be0c666068ef179f87e984f35556baf115b82ab801b';

const POKEBALL_ABI = [
  'function playerThrowNonces(address) view returns (uint256)',
  'function relayerAddress() view returns (address)',
  'function totalAPEReserve() view returns (uint256)',
  'function playerBalls(address, uint8) view returns (uint256)',
  'function entropy() view returns (address)',
  'function getThrowFee() view returns (uint128)',
  'function throwBallFor(address player, uint8 pokemonSlot, uint8 ballType, uint256 nonce, bytes signature) returns (uint64)',
];

const ENTROPY_ABI = [
  'function getFeeV2() view returns (uint128)',
];

async function main() {
  const [signer] = await ethers.getSigners();

  console.log('\n=== STEP-BY-STEP THROW TRACE ===\n');
  console.log('Signer (relayer):', signer.address);

  const pokeballGame = new ethers.Contract(POKEBALL_GAME_PROXY, POKEBALL_ABI, signer);

  // Step 1: Check relayer authorization
  console.log('\n--- Step 1: Relayer Check ---');
  try {
    const relayer = await pokeballGame.relayerAddress();
    console.log('Configured relayer:', relayer);
    console.log('Our address:       ', signer.address);
    console.log('Authorized:', relayer.toLowerCase() === signer.address.toLowerCase() ? '✅' : '❌');
  } catch (e) {
    console.log('Failed:', e.message);
  }

  // Step 2: Check nonce
  console.log('\n--- Step 2: Nonce Check ---');
  try {
    const nonce = await pokeballGame.playerThrowNonces(PLAYER);
    console.log('On-chain nonce:', nonce.toString());
    console.log('Signature nonce:', NONCE);
    console.log('Match:', nonce.toString() === NONCE.toString() ? '✅' : '❌');
  } catch (e) {
    console.log('Failed:', e.message);
  }

  // Step 3: Check player balls
  console.log('\n--- Step 3: Ball Inventory ---');
  try {
    const ballCount = await pokeballGame.playerBalls(PLAYER, BALL_TYPE);
    console.log(`Player has ${ballCount.toString()} balls of type ${BALL_TYPE}`);
    console.log('Has ball:', ballCount.gt(0) ? '✅' : '❌');
  } catch (e) {
    console.log('Failed:', e.message);
  }

  // Step 4: Check APE reserve vs fee
  console.log('\n--- Step 4: APE Reserve vs Fee ---');
  try {
    const reserve = await pokeballGame.totalAPEReserve();
    const fee = await pokeballGame.getThrowFee();
    console.log('APE Reserve:', ethers.utils.formatEther(reserve), 'APE');
    console.log('Entropy Fee:', ethers.utils.formatEther(fee), 'APE');
    console.log('Sufficient:', reserve.gte(fee) ? '✅' : '❌');
  } catch (e) {
    console.log('Failed:', e.message);
  }

  // Step 5: Check Entropy contract
  console.log('\n--- Step 5: Entropy Contract ---');
  try {
    const entropyAddr = await pokeballGame.entropy();
    console.log('Entropy address:', entropyAddr);
    console.log('Expected:       ', PYTH_ENTROPY);
    console.log('Match:', entropyAddr.toLowerCase() === PYTH_ENTROPY.toLowerCase() ? '✅' : '❌');

    const entropyContract = new ethers.Contract(entropyAddr, ENTROPY_ABI, signer);
    const feeFromEntropy = await entropyContract.getFeeV2();
    console.log('Fee from Entropy.getFeeV2():', ethers.utils.formatEther(feeFromEntropy), 'APE');
  } catch (e) {
    console.log('Failed:', e.message);
  }

  // Step 6: Try staticcall to get exact revert
  console.log('\n--- Step 6: Static Call Simulation ---');
  try {
    const result = await pokeballGame.callStatic.throwBallFor(
      PLAYER,
      POKEMON_SLOT,
      BALL_TYPE,
      NONCE,
      SIGNATURE,
      { gasLimit: 500000 }
    );
    console.log('✅ Static call SUCCEEDED! Sequence number:', result.toString());
  } catch (e) {
    console.log('❌ Static call FAILED');
    console.log('Error name:', e.errorName || 'unknown');
    console.log('Error args:', e.errorArgs || 'none');
    console.log('Message:', e.message.slice(0, 300));
    if (e.data && e.data !== '0x') {
      console.log('Revert data:', e.data);
      // Try to decode known error selectors
      const knownErrors = {
        '0x756688fe': 'PokemonNotActive(uint256 pokemonId)',
        '0x3e239e1a': 'NoAttemptsRemaining(uint8 slot)',
        '0x1c26714c': 'InsufficientBalls(BallType ballType, uint256 required, uint256 available)',
        '0x17fb2066': 'NotAuthorizedRelayer()',
        '0x8b3c7f4c': 'InvalidSignature()',
        '0x94280d62': 'InvalidNonce()',
        '0x356680b7': 'InsufficientAPEReserve(uint256 required, uint256 available)',
      };
      const selector = e.data.slice(0, 10);
      if (knownErrors[selector]) {
        console.log('Decoded error:', knownErrors[selector]);
      }
    }
  }

  // Step 7: Try estimateGas
  console.log('\n--- Step 7: Gas Estimation ---');
  try {
    const gas = await pokeballGame.estimateGas.throwBallFor(
      PLAYER,
      POKEMON_SLOT,
      BALL_TYPE,
      NONCE,
      SIGNATURE
    );
    console.log('✅ Gas estimate:', gas.toString());
  } catch (e) {
    console.log('❌ Gas estimation failed:', e.message.slice(0, 200));
  }

  console.log('\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });
