/**
 * Check APESwappedToUSDC events to see actual swap amounts
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
  const fromBlock = currentBlock - 20000;

  console.log('Checking APESwappedToUSDC events...\n');

  const swapFilter = pokeballGame.filters.APESwappedToUSDC();
  const swapEvents = await pokeballGame.queryFilter(swapFilter, fromBlock);

  console.log(`Found ${swapEvents.length} APESwappedToUSDC events\n`);

  let totalAPE = 0n;
  let totalUSDC = 0n;

  for (const event of swapEvents) {
    const apeAmount = event.args.apeAmount;
    const usdcAmount = event.args.usdcAmount;

    totalAPE += apeAmount;
    totalUSDC += usdcAmount;

    const effectiveRate = Number(usdcAmount) / Number(apeAmount) * 1e12;

    console.log(`Block ${event.blockNumber}:`);
    console.log(`  APE in: ${ethers.formatEther(apeAmount)} APE`);
    console.log(`  USDC out: ${Number(usdcAmount) / 1e6} USDC.e`);
    console.log(`  Effective rate: $${effectiveRate.toFixed(4)} per APE`);
    console.log(`  TX: ${event.transactionHash}`);
    console.log('');
  }

  console.log('─'.repeat(50));
  console.log('TOTALS:');
  console.log(`  Total APE swapped: ${ethers.formatEther(totalAPE)} APE`);
  console.log(`  Total USDC received: ${Number(totalUSDC) / 1e6} USDC.e`);
  if (totalAPE > 0n) {
    const avgRate = Number(totalUSDC) / Number(totalAPE) * 1e12;
    console.log(`  Average rate: $${avgRate.toFixed(4)} per APE`);
  }

  // Now check the split
  const fee = (totalUSDC * 3n) / 100n;
  const revenue = (totalUSDC * 97n) / 100n;
  console.log('\n[Expected Split (3%/97%)]');
  console.log(`  3% Fee: $${Number(fee) / 1e6} USDC.e`);
  console.log(`  97% Revenue: $${Number(revenue) / 1e6} USDC.e`);

  // Check actual balances
  const accumulatedFees = await pokeballGame.accumulatedUSDCFees();
  console.log('\n[Actual On-Chain]');
  console.log(`  Fee pool: $${Number(accumulatedFees) / 1e6} USDC.e`);

  // Check SlabNFTManager USDC balance
  const USDC_ADDRESS = '0xF1815bd50389c46847f0Bda824eC8da914045D14';
  const SLAB_NFT_MANAGER = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ['function balanceOf(address) view returns (uint256)'], provider);
  const slabBalance = await usdcContract.balanceOf(SLAB_NFT_MANAGER);
  console.log(`  SlabNFTManager: $${Number(slabBalance) / 1e6} USDC.e`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
