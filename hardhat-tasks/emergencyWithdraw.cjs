/**
 * Emergency Withdraw Task
 *
 * DANGEROUS: Bypasses minimum reserve checks. Requires typed confirmation.
 *
 * Usage:
 *   npx hardhat emergencyWithdraw --contract PokeballGame --token APE --amount 1.0 --network apechain
 *   npx hardhat emergencyWithdraw --contract SlabNFTManager --token USDC.e --amount 50 --network apechain
 */

const { task, types } = require('hardhat/config');
const readline = require('readline');
const {
  header,
  subheader,
  info,
  success,
  warning,
  error,
  danger,
  formatAPE,
  formatUSDC,
} = require('./helpers/formatOutput.cjs');
const {
  POKEBALL_GAME_PROXY,
  SLAB_NFT_MANAGER_PROXY,
  USDC_ADDRESS,
  getPokeballGameBalances,
  getSlabNFTManagerBalances,
} = require('./helpers/getContractBalances.cjs');

const POKEBALL_GAME_ABI = [
  'function totalAPEReserve() external view returns (uint256)',
  'function accumulatedUSDCFees() external view returns (uint256)',
  'function owner() external view returns (address)',
  'function withdrawAllAPE() external',
  'function withdrawUSDCFees() external',
];

const SLAB_NFT_MANAGER_ABI = [
  'function apeReserve() external view returns (uint256)',
  'function owner() external view returns (address)',
  'function emergencyWithdrawAPE() external',
  'function emergencyWithdrawRevenue(uint256 amount) external',
  'function emergencyWithdrawAllRevenue() external',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

async function promptConfirmation(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toUpperCase() === 'YES');
    });
  });
}

task('emergencyWithdraw', 'DANGEROUS: Emergency withdraw bypassing minimum reserves')
  .addParam('contract', 'Contract name: PokeballGame or SlabNFTManager', undefined, types.string)
  .addParam('token', 'Token to withdraw: APE or USDC.e', undefined, types.string)
  .addParam('amount', 'Amount to withdraw (or "all")', undefined, types.string)
  .setAction(async (taskArgs, hre) => {
    const { contract, token, amount } = taskArgs;

    // Validate inputs
    const validContracts = ['PokeballGame', 'SlabNFTManager'];
    if (!validContracts.includes(contract)) {
      throw new Error(`Invalid contract: ${contract}. Must be one of: ${validContracts.join(', ')}`);
    }

    const validTokens = ['APE', 'USDC.e'];
    if (!validTokens.includes(token)) {
      throw new Error(`Invalid token: ${token}. Must be one of: ${validTokens.join(', ')}`);
    }

    const isAll = amount.toLowerCase() === 'all';

    header('⚠️  EMERGENCY WITHDRAW ⚠️');
    danger('This operation bypasses minimum reserve checks!');

    const [signer] = await hre.ethers.getSigners();
    info('Signer', signer.address);
    info('Contract', contract);
    info('Token', token);
    info('Amount', isAll ? 'ALL' : amount);
    console.log();

    let proxyAddress, currentBalance, withdrawFunction, formatFn;

    if (contract === 'PokeballGame') {
      proxyAddress = POKEBALL_GAME_PROXY;
      const gameContract = new hre.ethers.Contract(proxyAddress, POKEBALL_GAME_ABI, signer);

      // Verify ownership
      const owner = await gameContract.owner();
      if (signer.address.toLowerCase() !== owner.toLowerCase()) {
        error(`Signer ${signer.address} is not the owner!`);
        throw new Error('Only the contract owner can execute emergency withdraw');
      }

      if (token === 'APE') {
        currentBalance = await gameContract.totalAPEReserve();
        formatFn = formatAPE;
        withdrawFunction = async () => {
          // withdrawAllAPE drains everything
          return gameContract.withdrawAllAPE({ gasLimit: 200000 });
        };
      } else {
        currentBalance = await gameContract.accumulatedUSDCFees();
        formatFn = formatUSDC;
        withdrawFunction = async () => {
          // withdrawUSDCFees drains all fees
          return gameContract.withdrawUSDCFees({ gasLimit: 200000 });
        };
      }
    } else {
      proxyAddress = SLAB_NFT_MANAGER_PROXY;
      const managerContract = new hre.ethers.Contract(proxyAddress, SLAB_NFT_MANAGER_ABI, signer);

      // Verify ownership
      const owner = await managerContract.owner();
      if (signer.address.toLowerCase() !== owner.toLowerCase()) {
        error(`Signer ${signer.address} is not the owner!`);
        throw new Error('Only the contract owner can execute emergency withdraw');
      }

      if (token === 'APE') {
        currentBalance = await managerContract.apeReserve();
        formatFn = formatAPE;
        withdrawFunction = async () => {
          // emergencyWithdrawAPE drains all APE
          return managerContract.emergencyWithdrawAPE({ gasLimit: 200000 });
        };
      } else {
        const usdc = new hre.ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
        currentBalance = await usdc.balanceOf(proxyAddress);
        formatFn = formatUSDC;

        if (isAll) {
          withdrawFunction = async () => {
            return managerContract.emergencyWithdrawAllRevenue({ gasLimit: 200000 });
          };
        } else {
          const withdrawAmountUnits = hre.ethers.utils.parseUnits(amount, 6);
          if (withdrawAmountUnits.gt(currentBalance)) {
            throw new Error(
              `Requested ${formatUSDC(withdrawAmountUnits)} but only ${formatUSDC(currentBalance)} available`
            );
          }
          withdrawFunction = async () => {
            return managerContract.emergencyWithdrawRevenue(withdrawAmountUnits, { gasLimit: 200000 });
          };
        }
      }
    }

    // Show current state
    subheader('Current State');
    info('Contract', proxyAddress);
    info('Current Balance', formatFn(currentBalance));
    console.log();

    if (currentBalance.lte(0)) {
      warning('Nothing to withdraw - balance is zero');
      return;
    }

    // Calculate what will be withdrawn
    let withdrawAmount;
    if (token === 'APE' || isAll) {
      withdrawAmount = currentBalance;
    } else {
      withdrawAmount = hre.ethers.utils.parseUnits(amount, 6);
    }

    subheader('Withdrawal Plan');
    info('Will Withdraw', formatFn(withdrawAmount));
    info('Remaining After', formatFn(currentBalance.sub(withdrawAmount)));
    console.log();

    // Require explicit confirmation
    danger('THIS ACTION CANNOT BE UNDONE');
    console.log();
    warning('Type "YES" to confirm emergency withdrawal:');

    const confirmed = await promptConfirmation('> ');

    if (!confirmed) {
      error('Aborted - user did not confirm');
      return;
    }

    console.log();
    success('Confirmation received');

    // Execute withdrawal
    subheader('Executing Emergency Withdrawal');
    try {
      const tx = await withdrawFunction();
      info('TX Hash', tx.hash);
      console.log('Waiting for confirmation...');

      const receipt = await tx.wait();
      success(`Confirmed in block ${receipt.blockNumber}`);
      console.log();

      // Check new balance
      let newBalance;
      if (contract === 'PokeballGame') {
        const gameContract = new hre.ethers.Contract(proxyAddress, POKEBALL_GAME_ABI, signer);
        if (token === 'APE') {
          newBalance = await gameContract.totalAPEReserve();
        } else {
          newBalance = await gameContract.accumulatedUSDCFees();
        }
      } else {
        const managerContract = new hre.ethers.Contract(proxyAddress, SLAB_NFT_MANAGER_ABI, signer);
        if (token === 'APE') {
          newBalance = await managerContract.apeReserve();
        } else {
          const usdc = new hre.ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
          newBalance = await usdc.balanceOf(proxyAddress);
        }
      }

      subheader('Result');
      info('Previous Balance', formatFn(currentBalance));
      info('New Balance', formatFn(newBalance));
      info('Withdrawn', formatFn(currentBalance.sub(newBalance)));
      success('Emergency withdrawal complete!');
    } catch (err) {
      error(`Emergency withdrawal failed: ${err.message}`);
      throw err;
    }
  });

module.exports = {};
