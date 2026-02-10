// Look up 0x48f5c3ed in common error databases
const { keccak256, toBytes } = require('viem');

// IPOPVRNG contract errors from ApeChain
// Based on common patterns in VRF/VRNG contracts
const vrngPatterns = [
  'InProgress()', 
  'RequestInProgress()',
  'AlreadyRequested()',
  'RequestActive()',
  'ActiveRequestExists()',
  'CannotRequestWhilePending()',
  'RequestStillPending()',
  'PreviousRequestPending()',
  'MustWaitForCallback()',
  'WaitForCallback()',
  'CallbackPending()',
  'RandomPending()',
  'NumberPending()',
  'RandomNumberPending()',
];

const targetSig = '0x48f5c3ed';

console.log('Looking for 0x48f5c3ed match...\n');
for (const err of vrngPatterns) {
  const hash = keccak256(toBytes(err)).slice(0, 10);
  const match = hash === targetSig ? '✅ MATCH!' : '';
  if (match) console.log(`FOUND: ${err}: ${hash}`);
}

// Also, 0x48f5c3ed could be from a library
// Check SafeERC20 patterns
const safePatterns = [
  'SafeTransferFailed()',
  'TransferFromFailed()',
  'SafeCallFailed()',
];

for (const err of safePatterns) {
  const hash = keccak256(toBytes(err)).slice(0, 10);
  const match = hash === targetSig ? '✅ MATCH!' : '';
  if (match) console.log(`FOUND: ${err}: ${hash}`);
}

// Let me try to decode using https://www.4byte.directory API equivalent
// 0x48f5c3ed = 1222329325 decimal
console.log('\nSearching for selector 0x48f5c3ed...');
console.log('Decimal:', parseInt('0x48f5c3ed', 16));

// Known: This is likely a common error. Let me check EIP-4337 and other standards
const eipErrors = [
  'FailedOp(uint256,string)',
  'FailedOpWithRevert(uint256,string,bytes)',
  'SignatureValidationFailed(address)',
  'ExecutionFailed()',
  'ExecutionReverted()',
  'CallFailed()',
];

for (const err of eipErrors) {
  const hash = keccak256(toBytes(err)).slice(0, 10);
  const match = hash === targetSig ? '✅ MATCH!' : '';
  if (match) console.log(`FOUND: ${err}: ${hash}`);
}
