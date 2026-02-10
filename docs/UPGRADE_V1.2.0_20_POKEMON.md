# PokeballGame Upgrade: v1.1.0 → v1.2.0 (20 Pokemon Support)

## Overview

This upgrade increases the maximum concurrent Pokemon spawns from 3 to 20, enabling a larger game world with more active Pokemon.

## Changes Summary

### Contract Changes

| Item | v1.1.0 | v1.2.0 |
|------|--------|--------|
| `MAX_ACTIVE_POKEMON` | 3 | 20 |
| `activePokemons` array | `Pokemon[3]` | `Pokemon[20]` |
| `getAllActivePokemons()` return | `Pokemon[3]` | `Pokemon[20]` |
| Valid slot indices | 0-2 | 0-19 |

### New Functions (v1.2.0)

```solidity
// Get count of currently active Pokemon (isActive == true)
function getActivePokemonCount() external view returns (uint8 count);

// Get array of slot indices that have active Pokemon
function getActivePokemonSlots() external view returns (uint8[] memory slots);
```

### ABI-Breaking Change

**`getAllActivePokemons()`** now returns `Pokemon[20]` instead of `Pokemon[3]`.

This is a **breaking change** that requires frontend updates.

## Storage Layout Compatibility

The upgrade is **storage-safe** because:

1. **Fixed arrays in Solidity**: When you declare `Pokemon[3]` vs `Pokemon[20]`, Solidity reserves contiguous storage slots. The proxy stores the actual data.

2. **Existing data preserved**: Slots 0-2 contain your existing Pokemon and remain unchanged. The data is stored at the same storage locations.

3. **New slots initialized**: Slots 3-19 will read as zero-initialized `Pokemon` structs:
   ```solidity
   Pokemon({
     id: 0,
     positionX: 0,
     positionY: 0,
     throwAttempts: 0,
     isActive: false,  // Key: these slots appear empty
     spawnTime: 0
   })
   ```

4. **No variable reordering**: All state variables remain in the same order, which is critical for UUPS upgrades.

## Upgrade Process

### Prerequisites

1. Owner wallet private key in `.env.local` as `DEPLOYER_PRIVATE_KEY`
2. Sufficient APE for gas (~0.01 APE)
3. Contract should NOT be paused
4. You must be the contract owner (`0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06`)

### How to Run the Upgrade

**Step 1: Verify your environment**

```bash
# Check you're in the project root
cd Pokemon-Trader

# Verify .env.local has the owner private key
cat .env.local | grep DEPLOYER_PRIVATE_KEY
# Should show: DEPLOYER_PRIVATE_KEY=0x...

# Verify contracts compile
npx hardhat compile
```

**Step 2: Run the upgrade**

```bash
npx hardhat run contracts/deployment/upgrade_PokeballGameV2.cjs --network apechain
```

**Step 3: Verify on Apescan (optional)**

After upgrade completes, verify the new implementation:

```bash
npx hardhat verify --network apechain <NEW_IMPL_ADDRESS>
```

The `<NEW_IMPL_ADDRESS>` is printed in the upgrade output.

### Expected Output (Success)

```
======================================================================
  PokeballGame UUPS Upgrade: v1.1.0 → v1.2.0
  MAX_ACTIVE_POKEMON: 3 → 20
======================================================================

📡 NETWORK VALIDATION
--------------------------------------------------
  Chain ID:       33139
  Expected:       33139
  ✓ Connected to ApeChain Mainnet

👤 DEPLOYER VALIDATION
--------------------------------------------------
  Deployer:       0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06
  Expected Owner: 0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06
  Balance:        X.XXX APE
  ✓ Sufficient balance for gas

📋 CONTRACT ADDRESSES
--------------------------------------------------
  Proxy Address:  0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f
  Expected:       0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f
  Old Impl:       0xb73A5eE21489c8b09f46538A5DA33146BD3E7D3e

🔐 OWNERSHIP VERIFICATION
--------------------------------------------------
  Contract Owner: 0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06
  ✓ Deployer is the contract owner
  Contract Paused: false
  ✓ Contract is not paused

📊 PRE-UPGRADE STATE
--------------------------------------------------
  MAX_ACTIVE_POKEMON: 3

  Active Pokemon (slots 0-2):
    Slot 0: ID=X, pos=(XXX, XXX), attempts=X
    Slot 1: (empty)
    Slot 2: (empty)

  Total active: X

🚀 DEPLOYING NEW IMPLEMENTATION
--------------------------------------------------
  Loading PokeballGame contract factory...
  ✓ Contract factory loaded

  Upgrading proxy to new implementation...
  (This deploys a new implementation and updates the proxy)

  ✓ UPGRADE COMPLETE!
  ┌─────────────────────────────────────────────────────────┐
  │ Proxy Address:          0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f │
  │ Old Implementation:     0xb73A5eE21489c8b09f46538A5DA33146BD3E7D3e │
  │ New Implementation:     0x...NEW_ADDRESS...                       │
  └─────────────────────────────────────────────────────────┘

✅ POST-UPGRADE VERIFICATION
--------------------------------------------------
  MAX_ACTIVE_POKEMON: 20
  ✓ MAX_ACTIVE_POKEMON = 20 (correct)

  Verifying existing Pokemon data preserved...
    ✓ Slot 0: Pokemon #X preserved

  Testing new v1.2.0 functions...

  📦 getAllActivePokemons():
    Returns array of length: 20
    ✓ Returns Pokemon[20] as expected
    Active Pokemon in array: X

  📦 getActivePokemonCount():
    Returns: X
    ✓ Matches array count

  📦 getActivePokemonSlots():
    Returns: [0]
    Length: X
    ✓ Length matches getActivePokemonCount()

  Verifying new slots 3-19 are accessible...
    Empty slots 3-19: 17/17
    ✓ All new slots accessible and empty

======================================================================
  🎉 UPGRADE SUCCESSFUL!
======================================================================

  Summary:
  ─────────────────────────────────────────────────────────────────
  Proxy Address:        0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f
  Old Implementation:   0xb73A5eE21489c8b09f46538A5DA33146BD3E7D3e
  New Implementation:   0x...NEW_ADDRESS...
  MAX_ACTIVE_POKEMON:   3 → 20
  Data Preserved:       Yes ✓
  Duration:             XX.Xs
  ─────────────────────────────────────────────────────────────────

  💾 Updating addresses.json with new implementation...
  ✓ addresses.json updated
```

### What the Script Does

1. **Network validation** - Confirms connected to ApeChain (33139)
2. **Deployer validation** - Checks balance and wallet address
3. **Ownership verification** - Confirms deployer is contract owner
4. **Pre-upgrade snapshot** - Records existing Pokemon in slots 0-2
5. **Deploy new implementation** - Compiles and deploys PokeballGameV2
6. **Upgrade proxy** - Points proxy to new implementation
7. **Post-upgrade verification**:
   - `MAX_ACTIVE_POKEMON` is now 20
   - Existing Pokemon data preserved
   - New slots 3-19 accessible and empty
   - `getAllActivePokemons()` returns 20-element array
   - `getActivePokemonCount()` works
   - `getActivePokemonSlots()` works
8. **Update addresses.json** - Records new implementation address

## Frontend Updates Required

### 1. Update ABI

Replace `abi_PokeballGame.json` with `abi_PokeballGameV2.json`:

```typescript
// src/hooks/pokeballGame/pokeballGameConfig.ts
import abi from '../../../contracts/abi/abi_PokeballGameV2.json';
```

### 2. Update TypeScript Types

```typescript
// Old (v1.1.0)
type PokemonSpawn = {
  id: bigint;
  positionX: bigint;
  positionY: bigint;
  throwAttempts: number;
  isActive: boolean;
  spawnTime: bigint;
};

// getAllActivePokemons() returned [Pokemon, Pokemon, Pokemon]
type GetAllActivePokemonsResult = [PokemonSpawn, PokemonSpawn, PokemonSpawn];

// New (v1.2.0) - BREAKING CHANGE
type GetAllActivePokemonsResult = PokemonSpawn[]; // Array of 20 elements
```

### 3. Update useGetPokemonSpawns Hook

```typescript
// src/hooks/pokeballGame/useGetPokemonSpawns.ts

// Before: Expected tuple of 3
const spawns = data as [PokemonSpawn, PokemonSpawn, PokemonSpawn];

// After: Array of 20
const spawns = data as PokemonSpawn[];
const activeSpawns = spawns.filter(p => p.isActive);
```

### 4. Update PokemonSpawnManager

```typescript
// src/game/managers/PokemonSpawnManager.ts

// Update config
const SPAWN_CONFIG = {
  MAX_ACTIVE_SPAWNS: 20,  // Was 3
  // ... rest unchanged
};

// Update syncFromContract to handle 20-element array
syncFromContract(contractSpawns: PokemonSpawn[]) {
  // contractSpawns is now length 20
  contractSpawns.forEach((spawn, slotIndex) => {
    if (spawn.isActive) {
      // ... create spawn
    }
  });
}
```

### 5. Update GameHUD Component

The HUD should handle displaying more Pokemon counts:

```typescript
// Consider using getActivePokemonCount() instead of filtering array
const { data: activeCount } = useContractRead({
  ...pokeballGameConfig,
  functionName: 'getActivePokemonCount',
});
```

### 6. Update Spawn Script

```javascript
// scripts/spawnInitialPokemon.cjs
// Can now spawn up to 20 Pokemon

const SLOTS_TO_SPAWN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // Example: spawn 10
```

## Gas Considerations

| Operation | Gas (3 slots) | Gas (20 slots) |
|-----------|---------------|----------------|
| `getAllActivePokemons()` | ~25k | ~120k |
| `getActivePokemonCount()` | N/A | ~45k |
| `getActivePokemonSlots()` | N/A | ~50k |
| `_findPokemonSlot()` | ~3k worst | ~20k worst |

**Recommendations:**
- Use `getActivePokemonCount()` when you only need the count
- Use `getActivePokemonSlots()` to get occupied slots efficiently
- Frontend should cache `getAllActivePokemons()` results (already uses 5s polling)

## Rollback Plan

If issues arise, you can deploy a new implementation with `MAX_ACTIVE_POKEMON = 3`:

```bash
# 1. Rename PokeballGameV2.sol back to PokeballGame.sol
# 2. Change MAX_ACTIVE_POKEMON back to 3
# 3. Run upgrade script again
```

**Note:** Any Pokemon spawned in slots 3-19 would become inaccessible (but data remains in storage).

## Testing Checklist

- [ ] Contract compiles successfully
- [ ] Upgrade script runs without errors
- [ ] `MAX_ACTIVE_POKEMON` returns 20
- [ ] Existing Pokemon in slots 0-2 preserved
- [ ] Can spawn Pokemon in slot 3-19
- [ ] `throwBall()` works with slot 0-19
- [ ] `getPokemon(19)` returns valid (empty) struct
- [ ] Frontend displays 20-slot array correctly
- [ ] Events emit correct slotIndex (0-19)

## Files Changed

### Contract Files
- `contracts/PokeballGameV2.sol` - New implementation (v1.2.0)
- `contracts/abi/abi_PokeballGameV2.json` - Updated ABI
- `contracts/deployment/upgrade_PokeballGameV2.cjs` - Upgrade script

### Frontend Files (need manual update)
- `src/hooks/pokeballGame/pokeballGameConfig.ts` - Import new ABI
- `src/hooks/pokeballGame/useGetPokemonSpawns.ts` - Handle 20-element array
- `src/game/managers/PokemonSpawnManager.ts` - Update MAX_ACTIVE_SPAWNS
- `src/components/PokeBallShop/GameHUD.tsx` - Handle larger counts

## Event Changes

The `PokemonSpawned` event `slotIndex` parameter now ranges 0-19:

```solidity
event PokemonSpawned(
    uint256 pokemonId,
    uint256 positionX,
    uint256 positionY,
    uint8 slotIndex  // Was 0-2, now 0-19
);
```

Ensure frontend event listeners handle the expanded range.
