/**
 * Withdraw APE Reserve Task
 *
 * Withdraws APE from contract reserves while keeping a minimum balance.
 *
 * Usage:
 *   npx hardhat withdrawApeReserve --contract PokeballGame --keep-minimum 0.5 --network apechain
 *   npx hardhat withdrawApeReserve --contract SlabNFTManager --keep-minimum 0.5 --network apechain
 */

const { task, types } = require('hardhat/config');
const {
  header,
  subheader,
  info,
  success,
  warning,
  error,
  formatAPE,
} = require('./helpers/formatOutput.cjs');
const {
  POKEBALL_GAME_PROXY,
  SLAB_NFT_MANAGER_PROXY,
  getPokeballGameBalances,
  getSlabNFTManagerBalances,
  getSignerInfo,
} = require('./helpers/getContractBalances.cjs');

// Extended ABIs with withdrawal functions
const POKEBALL_GAME_WITHDRAW_ABI = [
  'function totalAPEReserve() external view returns (uint256)',
  'function owner() external view returns (address)',
  'function withdrawAPEFees() external',
];

const SLAB_NFT_MANAGER_WITHDRAW_ABI = [
  'function apeReserve() external view returns (uint256)',
  'function owner() external view returns (address)',
  'function emergencyWithdrawAPE() external',
];

task('withdrawApeReserve', 'Withdraw APE from contract reserve (keeps minimum)')
  .addParam('contract', 'Contract name: PokeballGame or SlabNFTManager', undefined, types.string)
  .addOptionalParam('keepMinimum', 'Minimum APE to keep in reserve', '0.5', types.string)
  .setAction(async (taskArgs, hre) => {
    const { contract, keepMinimum } = taskArgs;

    // Validate contract name
    const validContracts = ['PokeballGame', 'SlabNFTManager'];
    if (!validContracts.includes(contract)) {
      throw new Error(`Invalid contract: ${contract}. Must be one of: ${validContracts.join(', ')}`);
    }

    header(`WITHDRAW APE RESERVE - ${contract}`);

    const [signer] = await hre.ethers.getSigners();
    const keepMinimumWei = hre.ethers.utils.parseEther(keepMinimum);

    info('Signer', signer.address);
    info('Keep Minimum', formatAPE(keepMinimumWei));
    console.log();

    let proxyAddress, currentReserve, owner, withdrawFunction;

    if (contract === 'PokeballGame') {
      proxyAddress = POKEBALL_GAME_PROXY;
      const gameContract = new hre.ethers.Contract(proxyAddress, POKEBALL_GAME_WITHDRAW_ABI, signer);
      currentReserve = await gameContract.totalAPEReserve();
      owner = await gameContract.owner();

      // PokeballGame.withdrawAPEFees() already keeps 0.1 APE minimum internally
      // But we'll enforce our own minimum
      withdrawFunction = async () => {
        // This function withdraws (totalAPEReserve - 0.1 APE) to treasury
        // We need to check if that would leave less than keepMinimum
        const internalMinimum = hre.ethers.utils.parseEther('0.1');
        const wouldWithdraw = currentReserve.gt(internalMinimum)
          ? currentReserve.sub(internalMinimum)
          : hre.ethers.BigNumber.from(0);

        if (currentReserve.sub(wouldWithdraw).lt(keepMinimumWei)) {
          throw new Error(
            `Withdrawal would leave ${formatAPE(currentReserve.sub(wouldWithdraw))} ` +
            `which is less than minimum ${formatAPE(keepMinimumWei)}`
          );
        }

        return gameContract.withdrawAPEFees({ gasLimit: 200000 });
      };
    } else {
      proxyAddress = SLAB_NFT_MANAGER_PROXY;
      const managerContract = new hre.ethers.Contract(proxyAddress, SLAB_NFT_MANAGER_WITHDRAW_ABI, signer);
      currentReserve = await managerContract.apeReserve();
      owner = await managerContract.owner();

      // SlabNFTManager.emergencyWithdrawAPE() withdraws ALL APE
      // We need to check if we're okay with that
      withdrawFunction = async () => {
        if (keepMinimumWei.gt(0)) {
          throw new Error(
            `SlabNFTManager.emergencyWithdrawAPE() withdraws ALL APE. ` +
            `Cannot keep minimum of ${formatAPE(keepMinimumWei)}. ` +
            `Use --keep-minimum 0 if you want to withdraw everything.`
          );
        }
        return managerContract.emergencyWithdrawAPE({ gasLimit: 200000 });
      };
    }

    // Verify ownership
    subheader('Ownership Check');
    info('Contract Owner', owner);
    if (signer.address.toLowerCase() !== owner.toLowerCase()) {
      error(`Signer ${signer.address} is not the owner!`);
      throw new Error('Only the contract owner can withdraw');
    }
    success('Signer is owner');
    console.log();

    // Check current reserve
    subheader('Current State');
    info('Contract', proxyAddress);
    info('Current Reserve', formatAPE(currentReserve));
    console.log();

    // Calculate withdrawable amount
    const withdrawAmount = currentReserve.gt(keepMinimumWei)
      ? currentReserve.sub(keepMinimumWei)
      : hre.ethers.BigNumber.from(0);

    if (withdrawAmount.lte(0)) {
      warning(`Nothing to withdraw. Current reserve (${formatAPE(currentReserve)}) <= minimum (${formatAPE(keepMinimumWei)})`);
      return;
    }

    subheader('Withdrawal Plan');
    info('Will Withdraw', formatAPE(withdrawAmount));
    info('Will Keep', formatAPE(keepMinimumWei));
    console.log();

    // Execute withdrawal
    subheader('Executing Withdrawal');
    try {
      const tx = await withdrawFunction();
      info('TX Hash', tx.hash);
      console.log('Waiting for confirmation...');

      const receipt = await tx.wait();
      success(`Confirmed in block ${receipt.blockNumber}`);
      console.log();

      // Check new balance
      let newReserve;
      if (contract === 'PokeballGame') {
        const gameContract = new hre.ethers.Contract(proxyAddress, POKEBALL_GAME_WITHDRAW_ABI, signer);
        newReserve = await gameContract.totalAPEReserve();
      } else {
        const managerContract = new hre.ethers.Contract(proxyAddress, SLAB_NFT_MANAGER_WITHDRAW_ABI, signer);
        newReserve = await managerContract.apeReserve();
      }

      subheader('Result');
      info('Previous Reserve', formatAPE(currentReserve));
      info('New Reserve', formatAPE(newReserve));
      info('Withdrawn', formatAPE(currentReserve.sub(newReserve)));
      success('Withdrawal complete!');
    } catch (err) {
      error(`Withdrawal failed: ${err.message}`);
      throw err;
    }
  });

module.exports = {};
