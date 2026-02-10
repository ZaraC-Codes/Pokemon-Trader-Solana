/**
 * Investigate WAPE proxy and deposit failure
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
const WAPE_IMPL = "0xd22ba2ff50d5c086d4bc34e9612b92fcbf8c1152";
const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";
const USER = "0x7028bEe2182A4D1E48e317748B51F15CA9814803";

async function main() {
  console.log("=== Investigating WAPE Proxy ===\n");
  
  // Check if implementation changed
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  
  const implBefore = await provider.getStorageAt(WAPE, IMPL_SLOT, 32719352);
  const implNow = await provider.getStorageAt(WAPE, IMPL_SLOT);
  
  console.log("Implementation before (block 32719352):", implBefore);
  console.log("Implementation now:", implNow);
  console.log("Implementation changed:", implBefore !== implNow);
  
  // Check WAPE implementation code
  const implCode = await provider.getCode(WAPE_IMPL);
  console.log("\nWAPE implementation code size:", implCode.length / 2, "bytes");
  
  // Try deposit from different addresses
  const wapeAbi = [
    "function deposit() payable",
    "function withdraw(uint256) external",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)",
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
    "function totalSupply() view returns (uint256)"
  ];
  
  const wape = new ethers.Contract(WAPE, wapeAbi, provider);
  const wapeIface = new ethers.utils.Interface(wapeAbi);
  
  console.log("\n=== Testing deposit from various addresses ===");
  
  // Test from random EOA
  const randomEOA = "0x1234567890123456789012345678901234567890";
  try {
    await provider.call({
      from: randomEOA,
      to: WAPE,
      value: ethers.utils.parseEther("1"),
      data: wapeIface.encodeFunctionData("deposit", [])
    });
    console.log("deposit from random EOA: WORKS");
  } catch (e) {
    console.log("deposit from random EOA: FAILS -", e.reason || e.message.slice(0, 80));
  }
  
  // Test from user's wallet
  try {
    await provider.call({
      from: USER,
      to: WAPE,
      value: ethers.utils.parseEther("1"),
      data: wapeIface.encodeFunctionData("deposit", [])
    });
    console.log("deposit from USER: WORKS");
  } catch (e) {
    console.log("deposit from USER: FAILS -", e.reason || e.message.slice(0, 80));
  }
  
  // Test from PokeballGame
  try {
    await provider.call({
      from: POKEBALL_GAME,
      to: WAPE,
      value: ethers.utils.parseEther("1"),
      data: wapeIface.encodeFunctionData("deposit", [])
    });
    console.log("deposit from POKEBALL_GAME: WORKS");
  } catch (e) {
    console.log("deposit from POKEBALL_GAME: FAILS -", e.reason || e.message.slice(0, 80));
  }
  
  // Check if PokeballGame has some restriction
  console.log("\n=== Checking PokeballGame code ===");
  const gameCode = await provider.getCode(POKEBALL_GAME);
  console.log("PokeballGame code size:", gameCode.length / 2, "bytes");
  
  // Check if WAPE has a blacklist or whitelist
  console.log("\n=== Checking WAPE for access control ===");
  
  // Some WAPE contracts have allowListed mapping
  // Check common storage slots for access control
  
  // Check if there's an "authorized" or "allowed" mapping
  // In Solidity, mapping storage = keccak256(key . slot)
  const slot0 = await provider.getStorageAt(WAPE, 0);
  const slot1 = await provider.getStorageAt(WAPE, 1);
  const slot2 = await provider.getStorageAt(WAPE, 2);
  const slot3 = await provider.getStorageAt(WAPE, 3);
  const slot4 = await provider.getStorageAt(WAPE, 4);
  const slot5 = await provider.getStorageAt(WAPE, 5);
  
  console.log("Slot 0:", slot0);
  console.log("Slot 1:", slot1);
  console.log("Slot 2:", slot2);
  console.log("Slot 3:", slot3);
  console.log("Slot 4:", slot4);
  console.log("Slot 5:", slot5);
  
  // Check total supply
  const totalSupply = await wape.totalSupply();
  console.log("\nWAPE total supply:", ethers.utils.formatEther(totalSupply));
  
  // Check if WAPE has some on-chain restriction
  // Let's see what functions it has
  console.log("\n=== Checking WAPE proxy admin ===");
  const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  const adminSlot = await provider.getStorageAt(WAPE, ADMIN_SLOT);
  console.log("Admin slot:", adminSlot);
  if (adminSlot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.log("Admin address:", "0x" + adminSlot.slice(26));
  }
  
  // Check implementation at block that worked vs now
  console.log("\n=== Implementation Code Comparison ===");
  const implCodeBefore = await provider.getCode(WAPE_IMPL, 32719352);
  const implCodeNow = await provider.getCode(WAPE_IMPL);
  console.log("Implementation code same:", implCodeBefore === implCodeNow);
  
  // Maybe the implementation itself is a proxy?
  const implImplSlot = await provider.getStorageAt(WAPE_IMPL, IMPL_SLOT);
  console.log("Implementation's implementation slot:", implImplSlot);
  
  // Test a simple read vs write
  console.log("\n=== Simple Transfer Test ===");
  // Can PokeballGame transfer WAPE? (It has 0 balance, so would fail, but error should be balance-related)
  try {
    await provider.call({
      from: POKEBALL_GAME,
      to: WAPE,
      data: wapeIface.encodeFunctionData("transfer", [USER, ethers.utils.parseEther("1")])
    });
    console.log("transfer from POKEBALL_GAME: would succeed (unexpected!)");
  } catch (e) {
    console.log("transfer from POKEBALL_GAME: FAILS -", e.reason || e.message.slice(0, 80));
  }
  
  // Check if the issue is receiving ETH/APE
  console.log("\n=== Check if WAPE can receive native APE ===");
  // The WAPE contract should have receive() or fallback()
  try {
    await provider.call({
      from: USER,
      to: WAPE,
      value: ethers.utils.parseEther("1"),
      data: "0x"  // Empty data = just send native token
    });
    console.log("Sending APE to WAPE (empty data): WORKS");
  } catch (e) {
    console.log("Sending APE to WAPE (empty data): FAILS -", e.reason || e.message.slice(0, 80));
  }
}

main().catch(console.error);
