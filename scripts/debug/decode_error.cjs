const { createPublicClient, http, parseAbi, decodeErrorResult, keccak256, toBytes } = require('viem');

// Check error selector
const errorSig = '0x48f5c3ed';
console.log('Error signature:', errorSig);

// Common error signatures
const errors = [
  'InvalidShortString()',
  'StringTooLong(string)',
  'PokemonNotActive(uint8)',
  'InsufficientBalls(uint8,uint256,uint256)',
  'MaxAttemptsReached(uint256)',
  'VRNGCallbackFailed()',
  'NotVRNG()',
  'Unauthorized()',
  'NoNFTAvailable()',
  'SlippageExceeded(uint256,uint256)',
  'InsufficientAPESent(uint256,uint256)',
  'ZeroAddress()',
  'InvalidBallType()',
  'InvalidPokemonSlot()',
];

console.log('\nChecking against known error signatures:');
for (const err of errors) {
  const hash = keccak256(toBytes(err)).slice(0, 10);
  const match = hash === errorSig ? '✅ MATCH' : '';
  console.log(`  ${err}: ${hash} ${match}`);
}

// Also check some OZ errors
const ozErrors = [
  'OwnableUnauthorizedAccount(address)',
  'OwnableInvalidOwner(address)',
  'EnforcedPause()',
  'ExpectedPause()',
  'ReentrancyGuardReentrantCall()',
  'FailedInnerCall()',
];

console.log('\nOpenZeppelin errors:');
for (const err of ozErrors) {
  const hash = keccak256(toBytes(err)).slice(0, 10);
  const match = hash === errorSig ? '✅ MATCH' : '';
  console.log(`  ${err}: ${hash} ${match}`);
}
