/**
 * Diagnose Gasless Throw Failure
 *
 * This script investigates why gasless throws are failing by:
 * 1. Checking PokeballGame state (relayer, nonce, APE reserve, ball inventory, Pokemon slot)
 * 2. Checking SlabNFTManager state (inventory count, inventory array, untracked NFTs)
 * 3. Simulating the failing throwBallFor call to get the exact revert reason
 *
 * Usage:
 *   node scripts/debug/diagnose_gasless_throw.cjs
 */

const { ethers } = require('hardhat');

// Contract addresses
const POKEBALL_GAME_PROXY = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const SLAB_NFT_MANAGER_PROXY = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const SLAB_NFT_ADDRESS = '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7';

// Failing transaction parameters from user report
const PLAYER = '0x7028bEe2182A4D1E48e317748B51F15CA9814803';
const RELAYER = '0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06';
const POKEMON_SLOT = 3;
const BALL_TYPE = 1; // Great Ball
const NONCE = 15;
const SIGNATURE = '0x7b8ad0772f870823739f9a063a8d237cf7d993e3a8f83dd3b5eae0cf2a42131f6833eb77e66da5968ca9ab8be0c666068ef179f87e984f35556baf115b82ab801b';

// ABIs
const POKEBALL_GAME_ABI = [
  'function relayerAddress() view returns (address)',
  'function playerThrowNonces(address) view returns (uint256)',
  'function totalAPEReserve() view returns (uint256)',
  'function getAllPlayerBalls(address) view returns (uint256[4])',
  'function activePokemons(uint8) view returns (uint256 id, uint16 posX, uint16 posY, uint8 throwAttempts, bool isActive)',
  'function slabNFTManager() view returns (address)',
  'function getThrowFee() view returns (uint256)',
  'function throwBallFor(address player, uint8 pokemonSlot, uint8 ballType, uint256 nonce, bytes signature)',
  'function maxActivePokemon() view returns (uint8)',
];

const SLAB_NFT_MANAGER_ABI = [
  'function getInventoryCount() view returns (uint256)',
  'function getInventory() view returns (uint256[])',
  'function canAutoPurchase() view returns (bool, uint256)',
  'function MAX_INVENTORY_SIZE() view returns (uint256)',
  'function pendingRequestCount() view returns (uint256)',
  'function apeReserve() view returns (uint256)',
];

const ERC721_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
];

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  GASLESS THROW FAILURE DIAGNOSTIC');
  console.log('='.repeat(70));

  const [signer] = await ethers.getSigners();
  console.log('\nDiagnostic run by:', signer.address);

  const pokeballGame = new ethers.Contract(POKEBALL_GAME_PROXY, POKEBALL_GAME_ABI, signer);
  const slabNFTManager = new ethers.Contract(SLAB_NFT_MANAGER_PROXY, SLAB_NFT_MANAGER_ABI, signer);
  const slabNFT = new ethers.Contract(SLAB_NFT_ADDRESS, ERC721_ABI, signer);

  // ===== SECTION 1: PokeballGame State =====
  console.log('\n' + '-'.repeat(70));
  console.log('  1. POKEBALL GAME STATE');
  console.log('-'.repeat(70));

  try {
    const configuredRelayer = await pokeballGame.relayerAddress();
    console.log('\n  Relayer Address (configured):', configuredRelayer);
    console.log('  Relayer Address (from tx):   ', RELAYER);
    console.log('  Match:', configuredRelayer.toLowerCase() === RELAYER.toLowerCase() ? '✅ YES' : '❌ NO');
  } catch (e) {
    console.log('\n  ❌ Failed to get relayer address:', e.message);
  }

  try {
    const currentNonce = await pokeballGame.playerThrowNonces(PLAYER);
    console.log('\n  Player Nonce (on-chain):', currentNonce.toString());
    console.log('  Player Nonce (in tx):   ', NONCE);
    console.log('  Match:', currentNonce.toString() === NONCE.toString() ? '✅ YES' : '❌ NO (stale nonce?)');
  } catch (e) {
    console.log('\n  ❌ Failed to get player nonce:', e.message);
  }

  try {
    const apeReserve = await pokeballGame.totalAPEReserve();
    const throwFee = await pokeballGame.getThrowFee();
    console.log('\n  APE Reserve:', ethers.utils.formatEther(apeReserve), 'APE');
    console.log('  Throw Fee:  ', ethers.utils.formatEther(throwFee), 'APE');
    console.log('  Sufficient: ', apeReserve.gte(throwFee) ? '✅ YES' : '❌ NO - INSUFFICIENT APE RESERVE');
  } catch (e) {
    console.log('\n  ❌ Failed to get APE reserve/fee:', e.message);
  }

  try {
    const balls = await pokeballGame.getAllPlayerBalls(PLAYER);
    console.log('\n  Player Ball Inventory:');
    console.log('    Poke Balls:   ', balls[0].toString());
    console.log('    Great Balls:  ', balls[1].toString(), BALL_TYPE === 1 ? '<-- USING THIS' : '');
    console.log('    Ultra Balls:  ', balls[2].toString());
    console.log('    Master Balls: ', balls[3].toString());
    console.log('  Has Ball Type', BALL_TYPE, ':', balls[BALL_TYPE].gt(0) ? '✅ YES' : '❌ NO - INSUFFICIENT BALLS');
  } catch (e) {
    console.log('\n  ❌ Failed to get ball inventory:', e.message);
  }

  try {
    const pokemon = await pokeballGame.activePokemons(POKEMON_SLOT);
    console.log('\n  Pokemon at Slot', POKEMON_SLOT, ':');
    console.log('    ID:            ', pokemon.id.toString());
    console.log('    Position:      ', `(${pokemon.posX}, ${pokemon.posY})`);
    console.log('    Throw Attempts:', pokemon.throwAttempts.toString(), '/ 3');
    console.log('    Is Active:     ', pokemon.isActive ? '✅ YES' : '❌ NO - POKEMON NOT ACTIVE');
    if (pokemon.throwAttempts >= 3) {
      console.log('    ❌ NO ATTEMPTS REMAINING');
    }
  } catch (e) {
    console.log('\n  ❌ Failed to get Pokemon slot:', e.message);
  }

  // ===== SECTION 2: SlabNFTManager State =====
  console.log('\n' + '-'.repeat(70));
  console.log('  2. SLAB NFT MANAGER STATE');
  console.log('-'.repeat(70));

  let inventoryCount = 0;
  let inventoryArray = [];

  try {
    inventoryCount = await slabNFTManager.getInventoryCount();
    console.log('\n  Inventory Count:', inventoryCount.toString());
  } catch (e) {
    console.log('\n  ❌ Failed to get inventory count:', e.message);
  }

  try {
    inventoryArray = await slabNFTManager.getInventory();
    console.log('  Inventory Array:', inventoryArray.length, 'items');
    if (inventoryArray.length > 0) {
      console.log('    Token IDs:', inventoryArray.map(id => id.toString()).join(', '));
    }
  } catch (e) {
    console.log('  ❌ Failed to get inventory array:', e.message);
  }

  try {
    const maxSize = await slabNFTManager.MAX_INVENTORY_SIZE();
    console.log('  Max Inventory:  ', maxSize.toString());
  } catch (e) {
    console.log('  ❌ Failed to get max inventory size:', e.message);
  }

  try {
    const [canPurchase, threshold] = await slabNFTManager.canAutoPurchase();
    console.log('\n  Can Auto-Purchase:', canPurchase ? '✅ YES' : '❌ NO');
    console.log('  Threshold:        ', ethers.utils.formatUnits(threshold, 6), 'USDC.e');
  } catch (e) {
    console.log('\n  ❌ Failed to get auto-purchase status:', e.message);
  }

  try {
    const pendingCount = await slabNFTManager.pendingRequestCount();
    console.log('\n  Pending VRF Requests:', pendingCount.toString());
    if (pendingCount.gt(0)) {
      console.log('  ⚠️  WARNING: Pending requests may indicate stuck state');
    }
  } catch (e) {
    console.log('\n  ❌ Failed to get pending request count:', e.message);
  }

  try {
    const managerApeReserve = await slabNFTManager.apeReserve();
    console.log('\n  SlabNFTManager APE Reserve:', ethers.utils.formatEther(managerApeReserve), 'APE');
  } catch (e) {
    console.log('\n  ❌ Failed to get manager APE reserve:', e.message);
  }

  // ===== SECTION 3: Check for Untracked NFTs =====
  console.log('\n' + '-'.repeat(70));
  console.log('  3. UNTRACKED NFT CHECK');
  console.log('-'.repeat(70));

  try {
    const actualBalance = await slabNFT.balanceOf(SLAB_NFT_MANAGER_PROXY);
    console.log('\n  Actual NFT Balance (balanceOf):   ', actualBalance.toString());
    console.log('  Tracked Inventory (getInventory):', inventoryArray.length);

    const difference = actualBalance.toNumber() - inventoryArray.length;
    if (difference > 0) {
      console.log('\n  ⚠️  MISMATCH DETECTED!');
      console.log('  Untracked NFTs:', difference);
      console.log('  This could cause issues - consider using recoverUntrackedNFT()');
    } else if (difference < 0) {
      console.log('\n  ❌ CRITICAL: Inventory shows more than actual balance!');
      console.log('  This is a serious state corruption issue.');
    } else {
      console.log('\n  ✅ Inventory matches actual balance');
    }
  } catch (e) {
    console.log('\n  ❌ Failed to check NFT balance:', e.message);
  }

  // ===== SECTION 4: Simulate throwBallFor =====
  console.log('\n' + '-'.repeat(70));
  console.log('  4. SIMULATING throwBallFor()');
  console.log('-'.repeat(70));

  console.log('\n  Parameters:');
  console.log('    Player:      ', PLAYER);
  console.log('    Pokemon Slot:', POKEMON_SLOT);
  console.log('    Ball Type:   ', BALL_TYPE);
  console.log('    Nonce:       ', NONCE);
  console.log('    Signature:   ', SIGNATURE.slice(0, 20) + '...');

  try {
    // Use callStatic to simulate without sending transaction
    const result = await pokeballGame.callStatic.throwBallFor(
      PLAYER,
      POKEMON_SLOT,
      BALL_TYPE,
      NONCE,
      SIGNATURE
    );
    console.log('\n  ✅ Simulation SUCCEEDED!');
    console.log('  This means the transaction should work now.');
    console.log('  Result:', result);
  } catch (e) {
    console.log('\n  ❌ Simulation FAILED');
    console.log('  Error Message:', e.message);

    // Try to extract revert reason
    if (e.error && e.error.message) {
      console.log('  Inner Error:', e.error.message);
    }
    if (e.reason) {
      console.log('  Revert Reason:', e.reason);
    }
    if (e.errorName) {
      console.log('  Error Name:', e.errorName);
    }
    if (e.errorArgs) {
      console.log('  Error Args:', e.errorArgs);
    }

    // Try to decode custom error
    if (e.data) {
      console.log('  Error Data:', e.data);
      // Known error selectors
      const errorSelectors = {
        '0x17fb2066': 'NotAuthorizedRelayer',
        '0x8b3c7f4c': 'InvalidSignature',
        '0x756688fe': 'PokemonNotActive(uint8 slot)',
        '0x3e239e1a': 'NoAttemptsRemaining(uint8 slot)',
        '0x1c26714c': 'InsufficientBalls(uint8 ballType, uint256 required, uint256 available)',
        '0x356680b7': 'InsufficientAPEReserve()',
      };

      const selector = e.data.slice(0, 10);
      if (errorSelectors[selector]) {
        console.log('  Decoded Error:', errorSelectors[selector]);
      }
    }
  }

  // ===== SECTION 5: Summary =====
  console.log('\n' + '='.repeat(70));
  console.log('  DIAGNOSTIC SUMMARY');
  console.log('='.repeat(70));

  console.log('\n  Check these potential issues:');
  console.log('  1. Is the relayer address correctly configured?');
  console.log('  2. Is the nonce current (not stale from previous attempt)?');
  console.log('  3. Does PokeballGame have enough APE reserve for Entropy fee?');
  console.log('  4. Does the player have the ball type being thrown?');
  console.log('  5. Is the Pokemon slot active with attempts remaining?');
  console.log('  6. Are there untracked NFTs in SlabNFTManager?');
  console.log('  7. Is the signature valid for the given parameters?');

  console.log('\n' + '='.repeat(70) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });
