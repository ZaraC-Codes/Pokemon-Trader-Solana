/**
 * Fund APE reserves for PokeballGame and SlabNFTManager
 *
 * Usage:
 *   npx hardhat run scripts/fund_ape_reserves.cjs --network apechain
 */
const hre = require('hardhat');

const POKEBALL_GAME_PROXY = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const SLAB_NFT_MANAGER_PROXY = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';

// Amount to deposit (in APE)
const POKEBALL_GAME_AMOUNT = '1'; // 1 APE
const SLAB_NFT_MANAGER_AMOUNT = '1'; // 1 APE

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const balance = await deployer.getBalance();
  console.log('Balance:', hre.ethers.utils.formatEther(balance), 'APE');
  console.log();

  // Fund PokeballGame APE reserve
  console.log('='.repeat(50));
  console.log('Funding PokeballGame APE Reserve');
  console.log('='.repeat(50));

  const gameABI = [
    'function depositAPEReserve() external payable',
    'function totalAPEReserve() external view returns (uint256)',
  ];
  const game = new hre.ethers.Contract(POKEBALL_GAME_PROXY, gameABI, deployer);

  const gameReserveBefore = await game.totalAPEReserve();
  console.log('Current reserve:', hre.ethers.utils.formatEther(gameReserveBefore), 'APE');

  const gameAmount = hre.ethers.utils.parseEther(POKEBALL_GAME_AMOUNT);
  console.log('Depositing:', POKEBALL_GAME_AMOUNT, 'APE...');

  const gameTx = await game.depositAPEReserve({ value: gameAmount, gasLimit: 100000 });
  console.log('TX:', gameTx.hash);
  await gameTx.wait();

  const gameReserveAfter = await game.totalAPEReserve();
  console.log('New reserve:', hre.ethers.utils.formatEther(gameReserveAfter), 'APE');
  console.log();

  // Fund SlabNFTManager APE reserve
  console.log('='.repeat(50));
  console.log('Funding SlabNFTManager APE Reserve');
  console.log('='.repeat(50));

  const managerABI = [
    'function depositAPEReserve() external payable',
    'function apeReserve() external view returns (uint256)',
  ];
  const manager = new hre.ethers.Contract(SLAB_NFT_MANAGER_PROXY, managerABI, deployer);

  const managerReserveBefore = await manager.apeReserve();
  console.log('Current reserve:', hre.ethers.utils.formatEther(managerReserveBefore), 'APE');

  const managerAmount = hre.ethers.utils.parseEther(SLAB_NFT_MANAGER_AMOUNT);
  console.log('Depositing:', SLAB_NFT_MANAGER_AMOUNT, 'APE...');

  const managerTx = await manager.depositAPEReserve({ value: managerAmount, gasLimit: 100000 });
  console.log('TX:', managerTx.hash);
  await managerTx.wait();

  const managerReserveAfter = await manager.apeReserve();
  console.log('New reserve:', hre.ethers.utils.formatEther(managerReserveAfter), 'APE');
  console.log();

  // Summary
  console.log('='.repeat(50));
  console.log('FUNDING COMPLETE');
  console.log('='.repeat(50));
  console.log('PokeballGame APE Reserve:', hre.ethers.utils.formatEther(gameReserveAfter), 'APE');
  console.log('SlabNFTManager APE Reserve:', hre.ethers.utils.formatEther(managerReserveAfter), 'APE');

  const finalBalance = await deployer.getBalance();
  console.log('Remaining wallet balance:', hre.ethers.utils.formatEther(finalBalance), 'APE');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
