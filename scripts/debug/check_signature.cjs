/**
 * Check Signature Verification for Gasless Throw
 *
 * Replicates the contract's signature verification to see if it will pass
 */

const { ethers } = require('hardhat');

const POKEBALL_GAME_PROXY = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const CHAIN_ID = 33139;

// Failing transaction parameters
const PLAYER = '0x7028bEe2182A4D1E48e317748B51F15CA9814803';
const POKEMON_SLOT = 3;
const BALL_TYPE = 1;
const NONCE = 15;
const SIGNATURE = '0x7b8ad0772f870823739f9a063a8d237cf7d993e3a8f83dd3b5eae0cf2a42131f6833eb77e66da5968ca9ab8be0c666068ef179f87e984f35556baf115b82ab801b';

async function main() {
  console.log('\n=== SIGNATURE VERIFICATION CHECK ===\n');

  // Replicate the contract's message hash computation
  // From PokeballGameV8.sol:
  // bytes32 messageHash = keccak256(abi.encodePacked(
  //     "\x19Ethereum Signed Message:\n32",
  //     keccak256(abi.encodePacked(player, pokemonSlot, ballType, nonce, block.chainid, address(this)))
  // ));

  // Step 1: Compute inner hash
  const innerHash = ethers.utils.solidityKeccak256(
    ['address', 'uint8', 'uint8', 'uint256', 'uint256', 'address'],
    [PLAYER, POKEMON_SLOT, BALL_TYPE, NONCE, CHAIN_ID, POKEBALL_GAME_PROXY]
  );
  console.log('Inner hash (keccak256 of packed data):', innerHash);

  // Step 2: Compute full message hash with Ethereum prefix
  const prefixedHash = ethers.utils.solidityKeccak256(
    ['string', 'bytes32'],
    ['\x19Ethereum Signed Message:\n32', innerHash]
  );
  console.log('Full message hash (with prefix):', prefixedHash);

  // Step 3: Recover signer from signature
  try {
    // Use ethers.utils.recoverAddress with the prefixed hash
    const recoveredAddress = ethers.utils.recoverAddress(prefixedHash, SIGNATURE);
    console.log('\nRecovered signer:', recoveredAddress);
    console.log('Expected player: ', PLAYER);
    console.log('Match:', recoveredAddress.toLowerCase() === PLAYER.toLowerCase() ? '✅ YES' : '❌ NO');
  } catch (e) {
    console.log('\nFailed to recover signer:', e.message);
  }

  // Also check what the contract's current nonce is for this player
  const [signer] = await ethers.getSigners();
  const contract = new ethers.Contract(POKEBALL_GAME_PROXY, [
    'function playerThrowNonces(address) view returns (uint256)',
    'function relayerAddress() view returns (address)',
  ], signer);

  try {
    const currentNonce = await contract.playerThrowNonces(PLAYER);
    console.log('\nCurrent on-chain nonce:', currentNonce.toString());
    console.log('Signature nonce:       ', NONCE);
    if (currentNonce.toString() !== NONCE.toString()) {
      console.log('❌ NONCE MISMATCH - Signature was generated for nonce', NONCE, 'but chain expects', currentNonce.toString());
    }
  } catch (e) {
    console.log('\nFailed to get nonce:', e.message);
  }

  try {
    const relayer = await contract.relayerAddress();
    console.log('\nRelayer address:', relayer);
  } catch (e) {
    console.log('\nFailed to get relayer:', e.message);
  }

  console.log('\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });
