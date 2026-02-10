/**
 * Verify Fee/Revenue Distribution for PokeballGame v1.7.0
 *
 * This script checks:
 * 1. PokeballGame accumulated fees and balances
 * 2. SlabNFTManager revenue pool and NFT purchases
 * 3. Treasury wallet balances
 * 4. Recent purchase events and calculated splits
 *
 * Revenue Flow (v1.5.0+):
 *   Ball purchases → 3% to accumulatedUSDCFees, 97% to SlabNFTManager
 *
 * Entropy Fees (v1.6.0+):
 *   Players pay ~0.073 APE per throwBall() directly via msg.value
 *   This goes to Pyth Entropy, NOT to the contract's fee pools
 *   The contract does NOT hold an APE buffer for entropy fees
 */

require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');
const fs = require('fs');

// ApeChain RPC
const RPC_URL = process.env.APECHAIN_RPC_URL || 'https://apechain.calderachain.xyz/http';

// Contract addresses
const POKEBALL_GAME_PROXY = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const SLAB_NFT_MANAGER_PROXY = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const TREASURY_WALLET = '0x1D1d0E6eF415f2BAe0c21939c50Bc4ffBeb65c74';
const USDC_ADDRESS = '0xF1815bd50389c46847f0Bda824eC8da914045D14';
const PLAYER_ADDRESS = '0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06';

// Load ABIs
const POKEBALL_ABI = JSON.parse(fs.readFileSync('./contracts/abi/abi_PokeballGameV6.json', 'utf-8'));
const SLAB_NFT_MANAGER_ARTIFACT = JSON.parse(fs.readFileSync('./contracts/abi/abi_SlabNFTManager.json', 'utf-8'));
// SlabNFTManager ABI is inside a Hardhat artifact format
const SLAB_NFT_MANAGER_ABI = SLAB_NFT_MANAGER_ARTIFACT.abi || SLAB_NFT_MANAGER_ARTIFACT;

// ERC-20 ABI for USDC.e
const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function main() {
  console.log('='.repeat(70));
  console.log('FEE/REVENUE DISTRIBUTION VERIFICATION - PokeballGame v1.7.0');
  console.log('='.repeat(70));

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Contract instances
  const pokeballGame = new ethers.Contract(POKEBALL_GAME_PROXY, POKEBALL_ABI, provider);
  const slabNFTManager = new ethers.Contract(SLAB_NFT_MANAGER_PROXY, SLAB_NFT_MANAGER_ABI, provider);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);

  // ============================================================
  // SECTION 1: PokeballGame Contract State
  // ============================================================
  console.log('\n' + '─'.repeat(70));
  console.log('1. POKEBALLGAME CONTRACT STATE');
  console.log('─'.repeat(70));
  console.log('Proxy:', POKEBALL_GAME_PROXY);

  // Read accumulated USDC fees
  const accumulatedUSDCFees = await pokeballGame.accumulatedUSDCFees();
  console.log('\n[Fee Pool]');
  console.log('  accumulatedUSDCFees:', formatUSDC(accumulatedUSDCFees));

  // Read native APE balance
  const pokeballGameAPEBalance = await provider.getBalance(POKEBALL_GAME_PROXY);
  console.log('\n[Native APE Balance]');
  console.log('  Contract APE:', ethers.formatEther(pokeballGameAPEBalance), 'APE');

  // Read USDC.e balance (should be minimal if revenue is forwarded)
  const pokeballGameUSDCBalance = await usdc.balanceOf(POKEBALL_GAME_PROXY);
  console.log('\n[USDC.e Balance]');
  console.log('  Contract USDC.e:', formatUSDC(pokeballGameUSDCBalance));

  // ============================================================
  // SECTION 2: Recent BallPurchased Events
  // ============================================================
  console.log('\n' + '─'.repeat(70));
  console.log('2. RECENT BALLPURCHASED EVENTS');
  console.log('─'.repeat(70));

  // Get recent blocks (last ~10000 blocks = ~5.5 hours)
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = currentBlock - 10000;

  const purchaseFilter = pokeballGame.filters.BallPurchased();
  const purchaseEvents = await pokeballGame.queryFilter(purchaseFilter, fromBlock);

  let allPurchases = [];
  let totalAPEPaid = 0n;
  let totalUSDCPaid = 0n;

  console.log(`\nFound ${purchaseEvents.length} BallPurchased events in last ~2000 blocks`);

  // Ball prices (from contract defaults)
  const ballPricesUSDC = [1_000_000n, 10_000_000n, 25_000_000n, 49_900_000n]; // in 6 decimals

  for (const event of purchaseEvents) {
    const { buyer, ballType, quantity, usedAPE, totalAmount } = event.args;

    // totalAmount is APE (18 decimals) when usedAPE=true, or USDC (6 decimals) when false
    // We need to calculate USDC equivalent from the ball price * quantity
    const ballPrice = ballPricesUSDC[Number(ballType)];
    const usdcEquivalent = ballPrice * BigInt(quantity);

    allPurchases.push({
      buyer: buyer.toLowerCase(),
      block: event.blockNumber,
      ballType: Number(ballType),
      quantity: Number(quantity),
      usedAPE,
      totalAmount, // raw value from event
      usdcEquivalent, // calculated USDC value
      txHash: event.transactionHash,
    });

    if (usedAPE) {
      totalAPEPaid += totalAmount;
    } else {
      totalUSDCPaid += totalAmount;
    }
  }

  // Filter for player's purchases
  const playerPurchases = allPurchases.filter(p => p.buyer === PLAYER_ADDRESS.toLowerCase());

  console.log('\n[All Recent Purchases]');
  for (const p of allPurchases) {
    const ballNames = ['Poké Ball', 'Great Ball', 'Ultra Ball', 'Master Ball'];
    const isPlayer = p.buyer === PLAYER_ADDRESS.toLowerCase();
    const marker = isPlayer ? '→ YOU' : '';
    if (p.usedAPE) {
      console.log(`  Block ${p.block}: ${p.quantity}x ${ballNames[p.ballType]} = ${ethers.formatEther(p.totalAmount)} APE (→ ${formatUSDC(p.usdcEquivalent)}) ${marker}`);
    } else {
      console.log(`  Block ${p.block}: ${p.quantity}x ${ballNames[p.ballType]} = ${formatUSDC(p.totalAmount)} direct ${marker}`);
    }
    console.log(`    Buyer: ${p.buyer.slice(0, 10)}...`);
    console.log(`    TX: ${p.txHash.slice(0, 20)}...`);
  }

  // Calculate total USDC.e equivalent from all purchases
  const totalUSDCEquivalent = allPurchases.reduce((sum, p) => sum + p.usdcEquivalent, 0n);

  // Calculate expected splits
  const expectedFees = (totalUSDCEquivalent * 3n) / 100n;
  const expectedRevenue = (totalUSDCEquivalent * 97n) / 100n;

  console.log('\n[Calculated Splits from ALL Recent Purchases]');
  console.log('  Total ball value (at fixed prices):', formatUSDC(totalUSDCEquivalent));
  console.log('  APE paid (swapped to USDC.e):', ethers.formatEther(totalAPEPaid), 'APE');
  console.log('  USDC.e paid directly:', formatUSDC(totalUSDCPaid));

  // Check APESwappedToUSDC events for actual swap amounts
  console.log('\n[Actual APE→USDC.e Swaps]');
  const swapFilter = pokeballGame.filters.APESwappedToUSDC();
  const swapEvents = await pokeballGame.queryFilter(swapFilter, fromBlock);

  let totalSwappedAPE = 0n;
  let totalReceivedUSDC = 0n;

  for (const event of swapEvents) {
    totalSwappedAPE += event.args.apeAmount;
    totalReceivedUSDC += event.args.usdcAmount;
    const rate = Number(event.args.usdcAmount) / Number(event.args.apeAmount) * 1e12;
    console.log(`  Block ${event.blockNumber}: ${ethers.formatEther(event.args.apeAmount)} APE → ${formatUSDC(event.args.usdcAmount)} (rate: $${rate.toFixed(4)}/APE)`);
  }

  console.log(`  Total swapped: ${ethers.formatEther(totalSwappedAPE)} APE → ${formatUSDC(totalReceivedUSDC)}`);

  // Calculate expected splits based on ACTUAL swap results
  const actualExpectedFees = (totalReceivedUSDC * 3n) / 100n;
  const actualExpectedRevenue = (totalReceivedUSDC * 97n) / 100n;

  console.log('\n[Expected Splits from ACTUAL Swap Results]');
  console.log('  Total USDC.e received from swaps:', formatUSDC(totalReceivedUSDC));
  console.log('  Expected 3% fees:', formatUSDC(actualExpectedFees));
  console.log('  Expected 97% revenue:', formatUSDC(actualExpectedRevenue));

  // ============================================================
  // SECTION 3: SlabNFTManager State
  // ============================================================
  console.log('\n' + '─'.repeat(70));
  console.log('3. SLABNFTMANAGER CONTRACT STATE');
  console.log('─'.repeat(70));
  console.log('Proxy:', SLAB_NFT_MANAGER_PROXY);

  // Read USDC.e balance
  const slabNFTManagerUSDCBalance = await usdc.balanceOf(SLAB_NFT_MANAGER_PROXY);
  console.log('\n[USDC.e Balance (Revenue Pool)]');
  console.log('  Revenue pool:', formatUSDC(slabNFTManagerUSDCBalance));
  console.log('  NFT purchase threshold: $51.00 USDC.e');
  console.log('  Status:', Number(slabNFTManagerUSDCBalance) >= 51_000_000n ? '✅ Ready to purchase NFT' : '⏳ Accumulating revenue');

  // Read NFT inventory
  const inventoryCount = await slabNFTManager.getInventoryCount();
  console.log('\n[NFT Inventory]');
  console.log('  Current inventory:', inventoryCount.toString(), 'NFTs');

  // Check recent events
  console.log('\n[Recent SlabNFTManager Events]');

  try {
    const revenueFilter = slabNFTManager.filters.RevenueDeposited();
    const revenueEvents = await slabNFTManager.queryFilter(revenueFilter, fromBlock);
    console.log(`  RevenueDeposited events: ${revenueEvents.length}`);

    if (revenueEvents.length > 0) {
      const latest = revenueEvents[revenueEvents.length - 1];
      console.log(`    Latest: ${formatUSDC(latest.args.amount)} at block ${latest.blockNumber}`);
    }
  } catch (e) {
    console.log('  Could not query RevenueDeposited events');
  }

  try {
    const purchaseInitFilter = slabNFTManager.filters.NFTPurchaseInitiated();
    const purchaseInitEvents = await slabNFTManager.queryFilter(purchaseInitFilter, fromBlock);
    console.log(`  NFTPurchaseInitiated events: ${purchaseInitEvents.length}`);

    if (purchaseInitEvents.length > 0) {
      for (const e of purchaseInitEvents) {
        console.log(`    RequestId: ${e.args.requestId}, Amount: ${formatUSDC(e.args.amount)}`);
      }
    }
  } catch (e) {
    console.log('  Could not query NFTPurchaseInitiated events');
  }

  try {
    const nftReceivedFilter = slabNFTManager.filters.NFTReceived();
    const nftReceivedEvents = await slabNFTManager.queryFilter(nftReceivedFilter, fromBlock);
    console.log(`  NFTReceived events: ${nftReceivedEvents.length}`);

    if (nftReceivedEvents.length > 0) {
      for (const e of nftReceivedEvents) {
        console.log(`    TokenId: ${e.args.tokenId}, Inventory size: ${e.args.inventorySize}`);
      }
    }
  } catch (e) {
    console.log('  Could not query NFTReceived events');
  }

  // ============================================================
  // SECTION 4: Treasury Wallet
  // ============================================================
  console.log('\n' + '─'.repeat(70));
  console.log('4. TREASURY WALLET');
  console.log('─'.repeat(70));
  console.log('Address:', TREASURY_WALLET);

  const treasuryAPEBalance = await provider.getBalance(TREASURY_WALLET);
  const treasuryUSDCBalance = await usdc.balanceOf(TREASURY_WALLET);

  console.log('\n[Current Balances]');
  console.log('  APE:', ethers.formatEther(treasuryAPEBalance), 'APE');
  console.log('  USDC.e:', formatUSDC(treasuryUSDCBalance));

  console.log('\n[Fee Withdrawal Status]');
  console.log('  Pending fees in PokeballGame:', formatUSDC(accumulatedUSDCFees));
  console.log('  Call withdrawUSDCFees() to transfer to treasury');

  // ============================================================
  // SECTION 5: Throw Events (should NOT affect revenue)
  // ============================================================
  console.log('\n' + '─'.repeat(70));
  console.log('5. THROW EVENTS (Entropy Fee Only)');
  console.log('─'.repeat(70));

  const throwFilter = pokeballGame.filters.ThrowAttempted();
  const throwEvents = await pokeballGame.queryFilter(throwFilter, fromBlock);

  let playerThrows = throwEvents.filter(e =>
    e.args.thrower.toLowerCase() === PLAYER_ADDRESS.toLowerCase()
  );

  console.log(`\nFound ${throwEvents.length} total throws, ${playerThrows.length} from your address`);
  console.log('Throws consume balls + Entropy fee (~0.073 APE). They do NOT affect USDC.e pools.');

  for (const t of playerThrows) {
    console.log(`  Block ${t.blockNumber}: Pokemon ID ${t.args.pokemonId}, Sequence ${t.args.requestId}`);
  }

  // Check FailedCatch events
  const failFilter = pokeballGame.filters.FailedCatch();
  const failEvents = await pokeballGame.queryFilter(failFilter, fromBlock);
  const playerFails = failEvents.filter(e =>
    e.args.thrower.toLowerCase() === PLAYER_ADDRESS.toLowerCase()
  );

  console.log(`\n[Catch Results]`);
  console.log(`  FailedCatch events for you: ${playerFails.length}`);
  for (const f of playerFails) {
    console.log(`    Pokemon ${f.args.pokemonId}: ${f.args.attemptsRemaining} attempts remaining`);
  }

  // ============================================================
  // SECTION 6: Summary
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  console.log('\n[Revenue Flow Verification]');
  console.log('  Total USDC.e from swaps:', formatUSDC(totalReceivedUSDC));
  console.log('  ├─ 3% fees (expected):', formatUSDC(actualExpectedFees));
  console.log('  │  └─ Actual in fee pool:', formatUSDC(accumulatedUSDCFees));
  console.log('  └─ 97% revenue (expected):', formatUSDC(actualExpectedRevenue));
  console.log('     └─ Actual in SlabNFTManager:', formatUSDC(slabNFTManagerUSDCBalance));

  // Verification
  console.log('\n[Verification]');
  if (totalReceivedUSDC > 0n) {
    const feeDiff = accumulatedUSDCFees > actualExpectedFees
      ? accumulatedUSDCFees - actualExpectedFees
      : actualExpectedFees - accumulatedUSDCFees;

    if (feeDiff < 100n) { // Within $0.0001 tolerance
      console.log('  ✅ Fee pool matches expected 3% (within tolerance)');
    } else {
      console.log(`  ⚠️  Fee pool differs from expected by ${formatUSDC(feeDiff)}`);
    }

    const revenueDiff = slabNFTManagerUSDCBalance > actualExpectedRevenue
      ? slabNFTManagerUSDCBalance - actualExpectedRevenue
      : actualExpectedRevenue - slabNFTManagerUSDCBalance;

    if (revenueDiff < 100n) { // Within $0.0001 tolerance
      console.log('  ✅ Revenue pool matches expected 97% (within tolerance)');
    } else {
      console.log(`  ⚠️  Revenue pool differs from expected by ${formatUSDC(revenueDiff)}`);
    }
  } else {
    console.log('  ℹ️  No swaps in query window to verify');
  }

  console.log('\n[Current On-Chain Balances]');
  console.log('  PokeballGame:');
  console.log('    APE (native):', ethers.formatEther(pokeballGameAPEBalance), 'APE');
  console.log('    USDC.e (fee pool):', formatUSDC(accumulatedUSDCFees));
  console.log('  SlabNFTManager:');
  console.log('    USDC.e (revenue):', formatUSDC(slabNFTManagerUSDCBalance));
  console.log('    NFT inventory:', inventoryCount.toString(), 'NFTs');
  console.log('  Treasury:');
  console.log('    APE:', ethers.formatEther(treasuryAPEBalance), 'APE');
  console.log('    USDC.e:', formatUSDC(treasuryUSDCBalance));

  console.log('\n[Statement for Judges]');
  console.log('─'.repeat(70));
  console.log(`"Every ball purchase splits 3% to a fee pool (currently ${formatUSDC(accumulatedUSDCFees)})`);
  console.log(`and 97% to an NFT revenue pool (currently ${formatUSDC(slabNFTManagerUSDCBalance)}),`);
  console.log('both on-chain in USDC.e. Revenue automatically accumulates in SlabNFTManager');
  console.log('to buy NFTs when the balance reaches $51, and fees can be withdrawn to the');
  console.log('treasury in one transaction."');
  console.log('─'.repeat(70));

  console.log('\n' + '='.repeat(70));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(70));
}

function formatUSDC(amount) {
  const value = Number(amount) / 1_000_000;
  return `$${value.toFixed(6)} USDC.e`;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
