/**
 * Debug events - show raw event data
 */

require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');
const fs = require('fs');

const RPC_URL = process.env.APECHAIN_RPC_URL || 'https://apechain.calderachain.xyz/http';
const POKEBALL_GAME_PROXY = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';

const POKEBALL_ABI = JSON.parse(fs.readFileSync('./contracts/abi/abi_PokeballGameV6.json', 'utf-8'));

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const pokeballGame = new ethers.Contract(POKEBALL_GAME_PROXY, POKEBALL_ABI, provider);

  const currentBlock = await provider.getBlockNumber();
  console.log('Current block:', currentBlock);

  // Get all BallPurchased events from the last 5000 blocks
  const fromBlock = currentBlock - 5000;

  const purchaseFilter = pokeballGame.filters.BallPurchased();
  const purchaseEvents = await pokeballGame.queryFilter(purchaseFilter, fromBlock);

  console.log(`\nFound ${purchaseEvents.length} BallPurchased events\n`);

  for (const event of purchaseEvents) {
    console.log('Block:', event.blockNumber);
    console.log('TX:', event.transactionHash);
    console.log('Args:');
    console.log('  buyer:', event.args.buyer);
    console.log('  ballType:', event.args.ballType.toString());
    console.log('  quantity:', event.args.quantity.toString());
    console.log('  usedAPE:', event.args.usedAPE);
    console.log('  totalAmount (raw):', event.args.totalAmount.toString());
    console.log('  totalAmount (as USDC 6dec):', Number(event.args.totalAmount) / 1e6);
    console.log('  totalAmount (as APE 18dec):', ethers.formatEther(event.args.totalAmount));
    console.log('');
  }

  // Also check ThrowAttempted events
  console.log('\n--- ThrowAttempted Events ---\n');
  const throwFilter = pokeballGame.filters.ThrowAttempted();
  const throwEvents = await pokeballGame.queryFilter(throwFilter, fromBlock);

  console.log(`Found ${throwEvents.length} ThrowAttempted events\n`);

  for (const event of throwEvents) {
    console.log('Block:', event.blockNumber);
    console.log('TX:', event.transactionHash);
    console.log('Args:');
    console.log('  thrower:', event.args.thrower);
    console.log('  pokemonId:', event.args.pokemonId.toString());
    console.log('  ballType:', event.args.ballType?.toString());
    console.log('  requestId:', event.args.requestId.toString());
    console.log('');
  }

  // Check FailedCatch events
  console.log('\n--- FailedCatch Events ---\n');
  const failFilter = pokeballGame.filters.FailedCatch();
  const failEvents = await pokeballGame.queryFilter(failFilter, fromBlock);

  console.log(`Found ${failEvents.length} FailedCatch events\n`);

  for (const event of failEvents) {
    console.log('Block:', event.blockNumber);
    console.log('TX:', event.transactionHash);
    console.log('Args:');
    console.log('  thrower:', event.args.thrower);
    console.log('  pokemonId:', event.args.pokemonId.toString());
    console.log('  attemptsRemaining:', event.args.attemptsRemaining.toString());
    console.log('');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
