/**
 * Withdraw USDC.e Reserve Task
 *
 * Withdraws USDC.e from SlabNFTManager while keeping a buffer for auto-buy.
 *
 * Usage:
 *   npx hardhat withdrawUsdceReserve --keep-buffer 100 --network apechain
 *   npx hardhat withdrawUsdceReserve --keep-buffer 0 --network apechain    # Withdraw ALL
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
  autoBuyStatus,
} = require('./helpers/formatOutput.cjs');
const {
  SLAB_NFT_MANAGER_PROXY,
  USDC_ADDRESS,
  getSlabNFTManagerBalances,
  getSignerInfo,
} = require('./helpers/getContractBalances.cjs');

const SLAB_NFT_MANAGER_WITHDRAW_ABI = [
  'function owner() external view returns (address)',
  'function emergencyWithdrawRevenue(uint256 amount) external',
  'function emergencyWithdrawAllRevenue() external',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

task('withdrawUsdceReserve', 'Withdraw USDC.e from SlabNFTManager (keeps buffer)')
  .addOptionalParam('keepBuffer', 'Minimum USDC.e to keep (default 100)', '100', types.string)
  .setAction(async (taskArgs, hre) => {
    const { keepBuffer } = taskArgs;

    header('WITHDRAW USDC.e RESERVE - SlabNFTManager');

    const [signer] = await hre.ethers.getSigners();
    const keepBufferUnits = hre.ethers.utils.parseUnits(keepBuffer, 6); // USDC.e has 6 decimals
    const autoBuyThreshold = hre.ethers.utils.parseUnits('51', 6);

    info('Signer', signer.address);
    info('Keep Buffer', formatUSDC(keepBufferUnits));
    console.log();

    // Get current state
    const manager = await getSlabNFTManagerBalances(hre);
    const managerContract = new hre.ethers.Contract(
      SLAB_NFT_MANAGER_PROXY,
      SLAB_NFT_MANAGER_WITHDRAW_ABI,
      signer
    );

    // Verify ownership
    subheader('Ownership Check');
    const owner = await managerContract.owner();
    info('Contract Owner', owner);
    if (signer.address.toLowerCase() !== owner.toLowerCase()) {
      error(`Signer ${signer.address} is not the owner!`);
      throw new Error('Only the contract owner can withdraw');
    }
    success('Signer is owner');
    console.log();

    // Check current balance
    subheader('Current State');
    info('Contract', SLAB_NFT_MANAGER_PROXY);
    info('USDC.e Balance', `${formatUSDC(manager.usdcBalance)} ${autoBuyStatus(manager.usdcBalance)}`);
    info('NFT Inventory', `${manager.inventoryCount.toString()} / 20`);
    console.log();

    // Check if withdrawing all (buffer = 0)
    const withdrawAll = keepBufferUnits.eq(0);

    // Calculate withdrawable amount
    let withdrawAmount;
    if (withdrawAll) {
      withdrawAmount = manager.usdcBalance;
    } else {
      withdrawAmount = manager.usdcBalance.gt(keepBufferUnits)
        ? manager.usdcBalance.sub(keepBufferUnits)
        : hre.ethers.BigNumber.from(0);
    }

    if (withdrawAmount.lte(0)) {
      warning(`Nothing to withdraw. Current balance (${formatUSDC(manager.usdcBalance)}) <= buffer (${formatUSDC(keepBufferUnits)})`);
      return;
    }

    const remainingAfter = manager.usdcBalance.sub(withdrawAmount);

    subheader('Withdrawal Plan');
    if (withdrawAll) {
      warning('MODE: Withdraw ALL USDC.e (buffer = 0)');
    }
    info('Will Withdraw', formatUSDC(withdrawAmount));
    info('Will Keep', formatUSDC(remainingAfter));
    info('Auto-Buy After', autoBuyStatus(remainingAfter));
    console.log();

    // Warn if auto-buy will be blocked
    if (remainingAfter.lt(autoBuyThreshold)) {
      warning(`After withdrawal, balance will be below $51 auto-buy threshold`);
    }

    // Execute withdrawal
    subheader('Executing Withdrawal');
    try {
      let tx;
      if (withdrawAll) {
        // Use emergencyWithdrawAllRevenue for withdrawing everything
        tx = await managerContract.emergencyWithdrawAllRevenue({ gasLimit: 200000 });
      } else {
        tx = await managerContract.emergencyWithdrawRevenue(withdrawAmount, { gasLimit: 200000 });
      }
      info('TX Hash', tx.hash);
      console.log('Waiting for confirmation...');

      const receipt = await tx.wait();
      success(`Confirmed in block ${receipt.blockNumber}`);
      console.log();

      // Check new balance
      const usdc = new hre.ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
      const newBalance = await usdc.balanceOf(SLAB_NFT_MANAGER_PROXY);

      subheader('Result');
      info('Previous Balance', formatUSDC(manager.usdcBalance));
      info('New Balance', `${formatUSDC(newBalance)} ${autoBuyStatus(newBalance)}`);
      info('Withdrawn', formatUSDC(manager.usdcBalance.sub(newBalance)));
      success('Withdrawal complete!');
    } catch (err) {
      error(`Withdrawal failed: ${err.message}`);
      throw err;
    }
  });

module.exports = {};
