/**
 * Compare contract state at different points
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
const USDC = "0xF1815bd50389c46847f0Bda824eC8da914045D14";
const CAMELOT_ROUTER = "0xC69Dc28924930583024E067b2B3d773018F4EB52";
const SLAB_NFT_MANAGER = "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

// PokeballGame read functions
const GAME_ABI = [
  "function apePriceUSD() view returns (uint256)",
  "function camelotRouter() view returns (address)",
  "function wape() view returns (address)",
  "function slabNFTManager() view returns (address)",
  "function swapSlippageBps() view returns (uint256)"
];

async function checkState(blockTag, label) {
  console.log("\n=== State at", label, "(block", blockTag, ") ===");
  
  const wape = new ethers.Contract(WAPE, ERC20_ABI, provider);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, provider);
  const game = new ethers.Contract(POKEBALL_GAME, GAME_ABI, provider);
  
  // WAPE allowance from PokeballGame to Router
  const wapeAllowance = await wape.allowance(POKEBALL_GAME, CAMELOT_ROUTER, { blockTag });
  console.log("WAPE allowance (Game->Router):", wapeAllowance.eq(ethers.constants.MaxUint256) ? "MAX" : ethers.utils.formatEther(wapeAllowance));
  
  // USDC allowance from PokeballGame to SlabNFTManager
  const usdcAllowance = await usdc.allowance(POKEBALL_GAME, SLAB_NFT_MANAGER, { blockTag });
  console.log("USDC allowance (Game->Manager):", usdcAllowance.eq(ethers.constants.MaxUint256) ? "MAX" : ethers.utils.formatUnits(usdcAllowance, 6));
  
  // Contract config
  try {
    const apePrice = await game.apePriceUSD({ blockTag });
    console.log("APE Price:", Number(apePrice) / 1e8, "USD");
    
    const router = await game.camelotRouter({ blockTag });
    console.log("Router configured:", router);
    
    const wapeAddr = await game.wape({ blockTag });
    console.log("WAPE configured:", wapeAddr);
    
    const manager = await game.slabNFTManager({ blockTag });
    console.log("SlabNFTManager:", manager);
    
    const slippage = await game.swapSlippageBps({ blockTag });
    console.log("Swap Slippage:", slippage.toString(), "bps");
  } catch (e) {
    console.log("Config read error:", e.message);
  }
  
  // Balances
  const gameApe = await provider.getBalance(POKEBALL_GAME, blockTag);
  const gameWape = await wape.balanceOf(POKEBALL_GAME, { blockTag });
  const gameUsdc = await usdc.balanceOf(POKEBALL_GAME, { blockTag });
  
  console.log("Game APE balance:", ethers.utils.formatEther(gameApe));
  console.log("Game WAPE balance:", ethers.utils.formatEther(gameWape));
  console.log("Game USDC balance:", ethers.utils.formatUnits(gameUsdc, 6));
}

async function main() {
  // Before first USDC purchase
  await checkState(32719242, "Before first USDC purchase");
  
  // After first USDC purchase, before last successful APE
  await checkState(32719244, "After first USDC purchase");
  
  // After last successful APE purchase
  await checkState(32719354, "After last successful APE tx");
  
  // Current state
  const current = await provider.getBlockNumber();
  await checkState(current, "Current");
  
  // Let's also try to simulate the failed tx
  console.log("\n\n=== Simulating APE Purchase NOW ===");
  
  const gameAbi = require('./contracts/abi/abi_PokeballGameV6.json');
  const game = new ethers.Contract(POKEBALL_GAME, gameAbi, provider);
  
  // Calculate cost for 1 PokeBall with APE
  const apePrice = await game.apePriceUSD();
  console.log("Current APE price:", Number(apePrice) / 1e8, "USD");
  
  // $1 / APE price = APE needed
  const apeCost = ethers.utils.parseEther("1").mul(ethers.BigNumber.from(10).pow(8)).div(apePrice);
  console.log("APE needed for $1 PokeBall:", ethers.utils.formatEther(apeCost));
  
  // Try static call
  try {
    await game.callStatic.purchaseBallsWithAPE(0, 1, { 
      value: apeCost,
      from: "0x7028bEe2182A4D1E48e317748B51F15CA9814803"
    });
    console.log("Static call SUCCEEDED!");
  } catch (e) {
    console.log("Static call FAILED:", e.message);
    
    // Try to get more details
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }
}

main().catch(console.error);
