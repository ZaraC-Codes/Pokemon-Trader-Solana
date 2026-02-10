/**
 * Check Reserves Task
 *
 * Displays current state of APE reserves and USDC.e balances for
 * PokeballGame and SlabNFTManager contracts.
 *
 * Usage:
 *   npx hardhat checkReserves --network apechain
 */

const { task } = require('hardhat/config');
const {
  header,
  subheader,
  info,
  formatAPE,
  formatUSDC,
  healthStatus,
  autoBuyStatus,
} = require('./helpers/formatOutput.cjs');
const {
  getPokeballGameBalances,
  getSlabNFTManagerBalances,
  getTreasuryBalance,
  getSignerInfo,
} = require('./helpers/getContractBalances.cjs');

task('checkReserves', 'Check APE reserves and USDC.e balances for all contracts')
  .setAction(async (taskArgs, hre) => {
    header('RESERVE STATUS CHECK');

    // Get signer info
    const signer = await getSignerInfo(hre);
    subheader('Signer');
    info('Address', signer.address);
    info('Balance', formatAPE(signer.balance));
    console.log();

    // PokeballGame v1.8.0
    subheader('PokeballGame v1.8.0');
    const game = await getPokeballGameBalances(hre);
    info('Proxy', game.address);
    info('Owner', game.owner);
    info('Treasury', game.treasuryWallet);
    console.log();
    info('APE Reserve', `${formatAPE(game.apeReserve)} ${healthStatus(game.apeReserve)}`);
    info('USDC.e Fees (3%)', formatUSDC(game.accumulatedUSDCFees));
    if (game.accumulatedAPEFees.gt(0)) {
      info('Legacy APE Fees', formatAPE(game.accumulatedAPEFees));
    }
    console.log();

    // SlabNFTManager v2.4.0
    subheader('SlabNFTManager v2.4.0');
    const manager = await getSlabNFTManagerBalances(hre);
    info('Proxy', manager.address);
    info('Owner', manager.owner);
    info('Treasury', manager.treasuryWallet);
    console.log();
    info('APE Reserve', `${formatAPE(manager.apeReserve)} ${healthStatus(manager.apeReserve)}`);
    info('USDC.e Balance', `${formatUSDC(manager.usdcBalance)} ${autoBuyStatus(manager.usdcBalance)}`);
    info('NFT Inventory', `${manager.inventoryCount.toString()} / 20`);
    console.log();

    // Treasury
    subheader('Treasury Wallet');
    const treasury = await getTreasuryBalance(hre);
    info('Address', treasury.address);
    info('USDC.e Balance', formatUSDC(treasury.usdcBalance));
    console.log();

    // Summary
    subheader('Summary');
    const totalApe = game.apeReserve.add(manager.apeReserve);
    const totalUsdc = game.accumulatedUSDCFees.add(manager.usdcBalance);
    info('Total APE in Contracts', formatAPE(totalApe));
    info('Total USDC.e in Contracts', formatUSDC(totalUsdc));
    info('Treasury USDC.e', formatUSDC(treasury.usdcBalance));
    console.log();
  });

module.exports = {};
