/**
 * Helper to get contract balances and state
 */

const POKEBALL_GAME_PROXY = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';
const SLAB_NFT_MANAGER_PROXY = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const USDC_ADDRESS = '0xF1815bd50389c46847f0Bda824eC8da914045D14';
const TREASURY_WALLET = '0x1D1d0E6eF415f2BAe0c21939c50Bc4ffBeb65c74';

const POKEBALL_GAME_ABI = [
  'function totalAPEReserve() external view returns (uint256)',
  'function accumulatedUSDCFees() external view returns (uint256)',
  'function accumulatedAPEFees() external view returns (uint256)',
  'function owner() external view returns (address)',
  'function treasuryWallet() external view returns (address)',
  'function withdrawUSDCFees() external',
  'function withdrawAPEFees() external',
  'function withdrawAllAPE() external',
];

const SLAB_NFT_MANAGER_ABI = [
  'function apeReserve() external view returns (uint256)',
  'function getInventoryCount() external view returns (uint256)',
  'function owner() external view returns (address)',
  'function treasuryWallet() external view returns (address)',
  'function emergencyWithdrawAPE() external',
  'function emergencyWithdrawRevenue(uint256 amount) external',
  'function emergencyWithdrawAllRevenue() external',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

async function getPokeballGameBalances(hre) {
  const [signer] = await hre.ethers.getSigners();

  const game = new hre.ethers.Contract(POKEBALL_GAME_PROXY, POKEBALL_GAME_ABI, signer);
  const usdc = new hre.ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

  const [
    apeReserve,
    accumulatedUSDCFees,
    accumulatedAPEFees,
    owner,
    treasuryWallet,
  ] = await Promise.all([
    game.totalAPEReserve(),
    game.accumulatedUSDCFees(),
    game.accumulatedAPEFees().catch(() => hre.ethers.BigNumber.from(0)), // May not exist
    game.owner(),
    game.treasuryWallet().catch(() => TREASURY_WALLET),
  ]);

  return {
    address: POKEBALL_GAME_PROXY,
    apeReserve,
    accumulatedUSDCFees,
    accumulatedAPEFees,
    owner,
    treasuryWallet,
    contract: game,
  };
}

async function getSlabNFTManagerBalances(hre) {
  const [signer] = await hre.ethers.getSigners();

  const manager = new hre.ethers.Contract(SLAB_NFT_MANAGER_PROXY, SLAB_NFT_MANAGER_ABI, signer);
  const usdc = new hre.ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

  const [
    apeReserve,
    usdcBalance,
    inventoryCount,
    owner,
    treasuryWallet,
  ] = await Promise.all([
    manager.apeReserve(),
    usdc.balanceOf(SLAB_NFT_MANAGER_PROXY),
    manager.getInventoryCount(),
    manager.owner(),
    manager.treasuryWallet().catch(() => TREASURY_WALLET),
  ]);

  return {
    address: SLAB_NFT_MANAGER_PROXY,
    apeReserve,
    usdcBalance,
    inventoryCount,
    owner,
    treasuryWallet,
    contract: manager,
  };
}

async function getTreasuryBalance(hre) {
  const [signer] = await hre.ethers.getSigners();
  const usdc = new hre.ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

  const balance = await usdc.balanceOf(TREASURY_WALLET);
  return {
    address: TREASURY_WALLET,
    usdcBalance: balance,
  };
}

async function getSignerInfo(hre) {
  const [signer] = await hre.ethers.getSigners();
  const balance = await signer.getBalance();
  return {
    address: signer.address,
    balance,
  };
}

module.exports = {
  POKEBALL_GAME_PROXY,
  SLAB_NFT_MANAGER_PROXY,
  USDC_ADDRESS,
  TREASURY_WALLET,
  POKEBALL_GAME_ABI,
  SLAB_NFT_MANAGER_ABI,
  ERC20_ABI,
  getPokeballGameBalances,
  getSlabNFTManagerBalances,
  getTreasuryBalance,
  getSignerInfo,
};
