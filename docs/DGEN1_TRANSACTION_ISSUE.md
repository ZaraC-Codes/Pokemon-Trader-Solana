# dGen1 (EthereumPhone) Transaction Issue - Troubleshooting Document

## Overview

We're building a Pokemon-themed NFT game on ApeChain (chainId: 33139) that allows players to purchase PokeBalls using either native APE or USDC.e (ERC-20). The game needs to support the **dGen1** device, which is the EthereumPhone running **ethOS**.

## The Problem

When attempting to send an ERC-20 token approval transaction (USDC.e `approve()`) from a dGen1 device, the transaction fails with:

```
INVALID PARAMETERS WERE PROVIDED TO THE RPC METHOD
```

The approval transaction never reaches the wallet confirmation UI - it fails immediately at the RPC level.

## Important Clarification: Integration Approach

### What We ARE Doing (Correct Approach)
- **Web dApp** running in the ethOS built-in browser (modified Firefox fork)
- Using the **injected `window.ethereum` provider** that ethOS provides
- Wagmi connector (`ethereumPhoneConnector.ts`) wraps `window.ethereum`
- All transactions go through `window.ethereum.request()` or similar provider methods

### What We Are NOT Doing
- **NOT** importing or using `EthereumPhone/WalletSDK` (Android/Kotlin SDK)
- **NOT** importing or using `EthereumPhone/WalletSDK-react-native`
- These native SDKs are for **native mobile apps**, not browser-based dApps

### How We Use Native SDK Docs
The native SDK repositories serve only as **documentation reference** to understand:
- Expected transaction parameter format (`to`, `value`, `data`)
- Bundler RPC configuration for ERC-4337
- How the ethOS system wallet processes transactions

We then apply this knowledge to our `window.ethereum` calls.

## Device & Environment Details

### dGen1 / EthereumPhone
- **Device**: dGen1 (EthereumPhone) - a hardware wallet phone
- **OS**: ethOS (Ethereum-native mobile operating system)
- **Browser**: Built-in browser which is a **modified fork of Firefox**
- **Wallet Architecture**: ERC-4337 Account Abstraction (smart contract wallet)
- **Screen**: Square 1:1 aspect ratio (~480x480px), touchscreen only
- **Provider Injection**: ethOS injects `window.ethereum` provider into the browser

### Detection Method
We detect dGen1 via the injected provider:
```javascript
// Primary detection
window.ethereum?.isEthereumPhone === true

// Secondary detection
window.__ETHOS_WALLET__ === true

// Tertiary: User agent patterns
userAgent.includes('ethos') || userAgent.includes('ethereumphone') || userAgent.includes('dgen1')

// Heuristic fallback (square screen Android with ethereum provider)
isAndroid && hasTouch && isSquareScreen && hasEthereum && isSmallScreen
```

### Network
- **Chain**: ApeChain Mainnet
- **Chain ID**: 33139
- **Native Token**: APE (like ETH on Ethereum - NOT an ERC-20)
- **USDC.e Address**: `0xF1815bd50389c46847f0Bda824eC8da914045D14`

## What We're Trying To Do

Execute a standard ERC-20 `approve()` transaction via the injected provider:
```javascript
// Get provider from wagmi connector (wraps window.ethereum)
const provider = await connector?.getProvider();

// Build approve() call data
const approveCallData = encodeFunctionData({
  abi: erc20Abi,
  functionName: 'approve',
  args: [spenderAddress, maxUint256], // Unlimited approval
});

// Transaction parameters
const txParams = {
  from: userAddress.toLowerCase(),
  to: '0xf1815bd50389c46847f0bda824ec8da914045d14', // USDC.e
  data: approveCallData,
};

// Send via injected provider
const txHash = await provider.request({
  method: 'eth_sendTransaction',
  params: [txParams],
});
```

## Current Implementation

### Transaction Helper Logic
We try multiple provider methods since ethOS may use a non-standard API:

```javascript
const provider = await connector?.getProvider();
const txParams = {
  from: account.toLowerCase(),
  to: tokenAddress.toLowerCase(),
  data: approveCallData,
  // No value (approve is not payable)
  // No gas/gasPrice (let provider estimate)
  // No chainId (determined by connected network)
};

let txHash;
let lastError;

// Method 1: Standard EIP-1193 provider.request()
if (typeof provider.request === 'function') {
  try {
    txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });
  } catch (err) {
    lastError = err;
  }
}

// Method 2: Direct sendTransaction method (non-standard)
if (!txHash && typeof provider.sendTransaction === 'function') {
  try {
    txHash = await provider.sendTransaction(txParams);
  } catch (err) {
    lastError = err;
  }
}

// Method 3: Legacy provider.send() (older web3 style)
if (!txHash && typeof provider.send === 'function') {
  try {
    txHash = await provider.send('eth_sendTransaction', [txParams]);
  } catch (err) {
    lastError = err;
  }
}

if (!txHash) {
  throw lastError;
}
```

### Debug Panel
Since we can't access console logs on the dGen1 device, we display debug info on-screen:
- `isDGen1: true/false`
- `isApproving: true/false`
- `lastStep: idle | building_tx | sending_tx | request_failed | trying_sendTransaction | sendTransaction_failed | trying_send | send_failed | tx_submitted | error`
- `hash: 0x...` (if successful)
- `error: ...` (the error message)
- `Provider: req:true/false send:true/false sendTx:true/false`

### Provider Inspection
Before sending, we log what methods the ethOS provider exposes:
```javascript
const providerInfo = {
  keys: Object.keys(provider).slice(0, 10),
  hasRequest: typeof provider.request === 'function',
  hasSend: typeof provider.send === 'function',
  hasSendAsync: typeof provider.sendAsync === 'function',
  hasSendTransaction: typeof provider.sendTransaction === 'function',
  isEthereumPhone: provider.isEthereumPhone,
};
```

## Attempted Solutions

### Attempt 1: Standard Wagmi `writeContract`
Used wagmi's abstraction:
```javascript
writeContract({
  address: tokenAddress,
  abi: erc20Abi,
  functionName: 'approve',
  args: [spenderAddress, maxUint256],
});
```
**Result**: Failed on dGen1.

### Attempt 2: Direct `eth_sendTransaction` with Full Params
```javascript
const txParams = {
  from: account,
  to: tokenAddress,
  data: approveCallData,
  value: '0x0',
  chainId: '0x8173', // 33139 in hex
};
```
**Result**: `INVALID PARAMETERS WERE PROVIDED TO THE RPC METHOD`

### Attempt 3: Remove `chainId` Parameter
`chainId` is not a valid `eth_sendTransaction` parameter:
```javascript
const txParams = {
  from: account,
  to: tokenAddress,
  data: approveCallData,
  value: '0x0',
};
```
**Result**: Same error

### Attempt 4: Lowercase Addresses + Remove Zero Value
```javascript
const txParams = {
  from: account.toLowerCase(),
  to: tokenAddress.toLowerCase(),
  data: approveCallData,
  // No 'value' field
};
```
**Result**: Same error

### Attempt 5: Multiple Provider Methods
Try `request()`, then `sendTransaction()`, then `send()`:
**Result**: Awaiting testing on device

## Environment Configuration

### Bundler RPC (Optional)
For ERC-4337 account abstraction, a bundler URL can be configured:
```env
VITE_BUNDLER_RPC_URL=https://your-bundler-endpoint-for-apechain
```
This is set in the web app's environment, NOT via native SDK initialization.

## Questions to Investigate

1. **What exact parameter format does the ethOS browser provider expect?**
   - Is there documentation for the injected `window.ethereum` API?
   - Does it differ from standard EIP-1193?

2. **Does ethOS route browser transactions through its bundler internally?**
   - If so, is there a specific format required?
   - Do we need to send UserOperations instead of regular transactions?

3. **Are there any ethOS-specific RPC methods we should use?**
   - Instead of `eth_sendTransaction`, maybe something like `ethos_sendTransaction`?

4. **Is there logging available in the ethOS browser?**
   - Can we access devtools or logs on the device somehow?

## Code Locations

All relevant code is in our repository (no native SDK imports):

| File | Purpose |
|------|---------|
| `src/hooks/pokeballGame/useTokenApproval.ts` | Token approval logic with dGen1 multi-method handling |
| `src/hooks/pokeballGame/usePurchaseBalls.ts` | Ball purchase logic with dGen1 handling |
| `src/utils/walletDetection.ts` | dGen1 detection utilities |
| `src/connectors/ethereumPhoneConnector.ts` | Wagmi connector wrapping `window.ethereum` |
| `src/components/PokeBallShop/PokeBallShop.tsx` | UI with visible debug panel |

## Verification: No Native SDK Imports

Confirmed via grep - **no native SDK imports** in the codebase:
```bash
$ grep -r "walletsdk" --include="*.ts" src/
# No results

$ grep -r "WalletSDK" --include="*.ts" src/
# No results
```

All dGen1 integration uses the browser-injected `window.ethereum` provider only.

## Summary

We need to discover the correct way to send transactions through the ethOS browser's injected `window.ethereum` provider. The standard EIP-1193 `eth_sendTransaction` method is failing with "INVALID PARAMETERS" even with minimal parameters.

**Key insight needed**: What exact parameter format and/or RPC method does the ethOS browser provider expect for sending transactions from the web dApp?

If you have experience with ethOS browser integration or ERC-4337 smart account wallets in browsers, any guidance on the correct transaction format would be greatly appreciated.
