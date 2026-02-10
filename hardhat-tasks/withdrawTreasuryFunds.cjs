/**
 * Withdraw Treasury Funds Task
 *
 * Withdraws accumulated USDC.e fees (3%) from PokeballGame to treasury.
 *
 * Usage:
 *   npx hardhat withdrawTreasuryFunds --all --network apechain
 *   npx hardhat withdrawTreasuryFunds --amount 50 --network apechain
 */

const { task, types } = require('hardhat/config');
const {
  header,
  subheader,
  info,
  success,
  warning,
  error,
  formatUSDC,
} = require('./helpers/formatOutput.cjs');
const {
  POKEBALL_GAME_PROXY,
  getPokeballGameBalances,
  getSignerInfo,
} = require('./helpers/getContractBalances.cjs');

const POKEBALL_GAME_TREASURY_ABI = [
  'function accumulatedUSDCFees() external view returns (uint256)',
  'function owner() external view returns (address)',
  'function treasuryWallet() external view returns (address)',
  'function withdrawUSDCFees() external',
];

task('withdrawTreasuryFunds', 'Withdraw accumulated USDC.e fees from PokeballGame')
  .addOptionalParam('all', 'Withdraw all fees', false, types.boolean)
  .addOptionalParam('amount', 'Specific amount to withdraw (USD)', undefined, types.string)
  .setAction(async (taskArgs, hre) => {
    const { all, amount } = taskArgs;

    if (!all && !amount) {
      throw new Error('Must specify --all or --amount');
    }

    header('WITHDRAW TREASURY FUNDS - PokeballGame');

    const [signer] = await hre.ethers.getSigners();
    info('Signer', signer.address);
    console.log();

    // Get current state
    const gameContract = new hre.ethers.Contract(
      POKEBALL_GAME_PROXY,
      POKEBALL_GAME_TREASURY_ABI,
      signer
    );

    const [accumulatedFees, owner, treasuryWallet] = await Promise.all([
      gameContract.accumulatedUSDCFees(),
      gameContract.owner(),
      gameContract.treasuryWallet(),
    ]);

    // Verify ownership
    subheader('Ownership Check');
    info('Contract Owner', owner);
    if (signer.address.toLowerCase() !== owner.toLowerCase()) {
      error(`Signer ${signer.address} is not the owner!`);
      throw new Error('Only the contract owner can withdraw');
    }
    success('Signer is owner');
    console.log();

    // Check current balance
    subheader('Current State');
    info('Contract', POKEBALL_GAME_PROXY);
    info('Treasury Wallet', treasuryWallet);
    info('Accumulated Fees', formatUSDC(accumulatedFees));
    console.log();

    if (accumulatedFees.lte(0)) {
      warning('No fees to withdraw');
      return;
    }

    // Note: The contract's withdrawUSDCFees() withdraws ALL accumulated fees
    // There's no partial withdrawal function in the current contract
    if (!all && amount) {
      const requestedAmount = hre.ethers.utils.parseUnits(amount, 6);
      if (requestedAmount.lt(accumulatedFees)) {
        warning(
          `Note: PokeballGame only supports full withdrawal. ` +
          `Requested ${formatUSDC(requestedAmount)} but will withdraw all ${formatUSDC(accumulatedFees)}`
        );
      }
    }

    subheader('Withdrawal Plan');
    info('Will Withdraw', formatUSDC(accumulatedFees));
    info('Destination', treasuryWallet);
    console.log();

    // Execute withdrawal
    subheader('Executing Withdrawal');
    try {
      const tx = await gameContract.withdrawUSDCFees({ gasLimit: 200000 });
      info('TX Hash', tx.hash);
      console.log('Waiting for confirmation...');

      const receipt = await tx.wait();
      success(`Confirmed in block ${receipt.blockNumber}`);
      console.log();

      // Check new balance
      const newFees = await gameContract.accumulatedUSDCFees();

      subheader('Result');
      info('Previous Fees', formatUSDC(accumulatedFees));
      info('New Fees', formatUSDC(newFees));
      info('Withdrawn to Treasury', formatUSDC(accumulatedFees.sub(newFees)));
      success('Withdrawal complete!');
    } catch (err) {
      error(`Withdrawal failed: ${err.message}`);
      throw err;
    }
  });

module.exports = {};
