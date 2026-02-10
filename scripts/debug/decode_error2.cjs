const { keccak256, toBytes } = require('viem');

const errorSig = '0x48f5c3ed';

// More errors to check - Uniswap/Camelot style
const moreErrors = [
  'InvalidRecipient()',
  'InvalidAmountIn()',
  'InvalidAmountOut()',
  'InsufficientOutputAmount()',
  'TooMuchRequested()',
  'TooLittleReceived()',
  'DeadlineExceeded()',
  'InvalidPath()',
  'LockFailure()',
  'Locked()',
  'LOK()', // "Locked" abbreviation in some AMMs
];

console.log('More error signatures:');
for (const err of moreErrors) {
  const hash = keccak256(toBytes(err)).slice(0, 10);
  const match = hash === errorSig ? '✅ MATCH' : '';
  console.log(`  ${err}: ${hash} ${match}`);
}

// Check for single word errors (common in older contracts)
const simpleErrors = [
  'LOCKED',
  'REENTRANCY',
  'EXPIRED',
  'OVERFLOW',
  'UNDERFLOW',
];

console.log('\nSimple string errors:');
for (const err of simpleErrors) {
  const hash = keccak256(toBytes(`${err}()`)).slice(0, 10);
  const match = hash === errorSig ? '✅ MATCH' : '';
  console.log(`  ${err}(): ${hash} ${match}`);
}

// Let me search common 4-byte database
console.log('\n0x48f5c3ed is likely a custom error. Let me check IPOPVRNG errors...');

const vrngErrors = [
  'RequestPending()',
  'RequestNotFound()',
  'InvalidRequestId()',
  'RandomnessNotAvailable()',
  'AlreadyFulfilled()',
];

for (const err of vrngErrors) {
  const hash = keccak256(toBytes(err)).slice(0, 10);
  const match = hash === errorSig ? '✅ MATCH' : '';
  console.log(`  ${err}: ${hash} ${match}`);
}
