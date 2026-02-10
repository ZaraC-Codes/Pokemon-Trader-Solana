# UUPS Proxy Upgrade Guide

## Overview

Pokemon Trader uses the **UUPS (Universal Upgradeable Proxy Standard)** pattern for both core contracts:

- **PokeballGame** - Main game contract (v1.1.0)
- **SlabNFTManager** - NFT inventory manager (v1.0.0)

This guide explains how upgrades work and who can perform them.

## Why UUPS?

UUPS was chosen over the Transparent Proxy pattern because:

1. **Gas Efficiency** - No admin slot check on every call
2. **Simpler Architecture** - No separate ProxyAdmin contract needed
3. **Upgrade Logic in Implementation** - `_authorizeUpgrade()` controls who can upgrade
4. **OpenZeppelin Standard** - Well-audited and widely used

## How UUPS Works

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        USER                             │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  PROXY CONTRACT                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  • Stores all state variables                     │  │
│  │  • Delegates all calls to implementation          │  │
│  │  • Immutable proxy code (cannot be changed)       │  │
│  │  • Implementation address stored in ERC-1967 slot │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │ delegatecall
                          ▼
┌─────────────────────────────────────────────────────────┐
│               IMPLEMENTATION CONTRACT                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │  • Contains all logic/functions                   │  │
│  │  • _authorizeUpgrade() controls upgrade access    │  │
│  │  • Can be replaced with new version               │  │
│  │  • State lives in proxy, not here                 │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Concept

- The **proxy** holds all storage (state variables)
- The **implementation** holds all logic (functions)
- When you call a function, the proxy delegates to the implementation
- The implementation executes using the proxy's storage
- Upgrading changes which implementation the proxy points to

## Who Can Upgrade?

Both contracts implement `_authorizeUpgrade()` with the `onlyOwner` modifier:

```solidity
function _authorizeUpgrade(
    address newImplementation
) internal override onlyOwner {}
```

This means:

| Contract | Who Can Upgrade |
|----------|-----------------|
| PokeballGame | Contract owner (`0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06`) |
| SlabNFTManager | Contract owner (`0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06`) |

**Important**: Only the wallet address returned by `owner()` can perform upgrades. This is the address passed as `_owner` during `initialize()`.

## Upgrade Process

### High-Level Steps

1. **Develop** - Create the new implementation contract (e.g., `PokeballGameV2.sol`)
2. **Test** - Thoroughly test on testnet, including upgrade path
3. **Verify Storage** - Ensure storage layout is compatible
4. **Deploy** - Deploy new implementation via `upgrades.upgradeProxy()`
5. **Verify** - Confirm state preservation and new functionality
6. **Document** - Record the upgrade details

### Detailed Steps

#### Step 1: Create New Version

```solidity
// contracts/PokeballGameV2.sol
contract PokeballGameV2 is PokeballGame {
    // Add new state variables AFTER existing ones
    uint256 public newFeature;

    // Reduce __gap to account for new storage slots
    uint256[48] private __gap; // was [49]

    // Optional: reinitializer for new state
    function initializeV2(uint256 _newFeature) external reinitializer(2) {
        newFeature = _newFeature;
    }
}
```

#### Step 2: Storage Compatibility Rules

**DO:**
- Add new state variables at the end (before `__gap`)
- Reduce `__gap` size by the number of new slots
- Keep all existing variable types unchanged
- Keep all existing variables in the same order

**DON'T:**
- Remove existing state variables
- Reorder state variables
- Change types of existing variables
- Change inheritance order

#### Step 3: Run Upgrade Script

```bash
npx hardhat run contracts/deployment/upgrade_PokeballGame.js --network apechain
```

#### Step 4: Verify on Block Explorer

```bash
npx hardhat verify --network apechain <NEW_IMPLEMENTATION_ADDRESS>
```

## Storage Gap Pattern

Both contracts use the storage gap pattern for upgrade safety:

```solidity
// Reserved storage gap for future upgrades
uint256[49] private __gap;
```

This reserves 49 storage slots for future state variables. When adding a new variable:

```solidity
// Before: 49 slots reserved
uint256[49] private __gap;

// After adding 1 new uint256:
uint256 public newVariable;
uint256[48] private __gap; // Now 48 slots
```

## Emergency Procedures

### If Upgrade Fails

1. The proxy continues pointing to the old implementation
2. No state is lost
3. Fix the new implementation and retry

### If New Implementation Has Bug

1. Deploy a fixed version
2. Upgrade again to the fixed version
3. State persists through multiple upgrades

### Ownership Transfer

To change who can upgrade:

```solidity
// Current owner calls:
await contract.transferOwnership(newOwnerAddress);
```

**Warning**: Transfer ownership carefully. If transferred to an incorrect address, upgrade capability is lost.

## Verification Checklist

Before any upgrade:

- [ ] New contract compiles without errors
- [ ] Storage layout is compatible (no removed/reordered variables)
- [ ] `__gap` reduced by correct amount
- [ ] Tested on testnet with real upgrade
- [ ] All existing functions still work
- [ ] New functions work as expected
- [ ] State preserved after upgrade
- [ ] Owner address has ETH for gas
- [ ] Verified on block explorer after deployment

## Code References

### Proxy Deployment

```javascript
// Using OpenZeppelin Hardhat Upgrades
const contract = await upgrades.deployProxy(
  ContractFactory,
  [initializeArgs],
  { kind: "uups" }
);
```

### Upgrade Execution

```javascript
// Upgrade to new implementation
const upgraded = await upgrades.upgradeProxy(
  proxyAddress,
  NewContractFactory,
  { kind: "uups" }
);
```

### Get Implementation Address

```javascript
const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
```

## Contract Files

| File | Purpose |
|------|---------|
| `contracts/PokeballGame.sol` | Main game implementation |
| `contracts/SlabNFTManager.sol` | NFT manager implementation |
| `contracts/deployment/deployProxies.js` | Initial proxy deployment |
| `contracts/deployment/upgrade_PokeballGame.js` | Upgrade script example |

## Security Considerations

1. **Owner Key Security** - The owner key controls upgrades. Use a multisig in production.
2. **Audit New Versions** - Any upgrade can change all contract behavior.
3. **Test Thoroughly** - Always test upgrades on testnet first.
4. **Communicate Changes** - Inform users before significant upgrades.
5. **Time Locks** - Consider adding a time lock for upgrades in production.

## Support

For questions about upgrades:
- Review OpenZeppelin UUPS documentation
- Check `docs/` folder for additional guides
- Test on ApeChain testnet before mainnet
