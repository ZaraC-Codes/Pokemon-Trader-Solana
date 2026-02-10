const { keccak256, toBytes } = require('viem');
const fs = require('fs');

const targetSig = '0x48f5c3ed';

// Read V5 ABI and extract all error definitions
const abi = JSON.parse(fs.readFileSync('./contracts/abi/abi_PokeballGameV5.json', 'utf8'));
const errors = abi.filter(item => item.type === 'error');

console.log('Errors in V5 ABI:');
for (const err of errors) {
  const inputs = err.inputs.map(i => i.type).join(',');
  const sig = `${err.name}(${inputs})`;
  const hash = keccak256(toBytes(sig)).slice(0, 10);
  const match = hash === targetSig ? '✅ MATCH' : '';
  console.log(`  ${sig}: ${hash} ${match}`);
}

// Also check OpenZeppelin Initializable errors
const initErrors = [
  'InvalidInitialization()',
  'NotInitializing()',
];

console.log('\nOpenZeppelin Initializable:');
for (const err of initErrors) {
  const hash = keccak256(toBytes(err)).slice(0, 10);
  const match = hash === targetSig ? '✅ MATCH' : '';
  console.log(`  ${err}: ${hash} ${match}`);
}

// Check POPVRNG contract errors more specifically
const popErrors = [
  'PendingRandomRequest()',
  'InvalidRandomRequest()',
  'RandomRequestInProgress()',
  'RandomRequestPending()',
];

console.log('\nPOP VRNG:');
for (const err of popErrors) {
  const hash = keccak256(toBytes(err)).slice(0, 10);
  const match = hash === targetSig ? '✅ MATCH' : '';
  console.log(`  ${err}: ${hash} ${match}`);
}

// The error might be from the POPVRNG contract itself
// Let me check if there's a pending request
