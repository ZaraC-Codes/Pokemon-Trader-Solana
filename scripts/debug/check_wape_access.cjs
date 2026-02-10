/**
 * Check WAPE access control - is contract calling blocked?
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
  console.log("=== Checking if WAPE blocks contract callers ===\n");
  
  // WAPE might check if caller is a contract using:
  // require(tx.origin == msg.sender) - blocks contracts
  // Or have a whitelist/blacklist
  
  // Check if various known contracts can deposit
  const knownContracts = [
    { name: "PokeballGame", address: POKEBALL_GAME },
    { name: "SlabNFTManager", address: "0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71" },
    { name: "Camelot Router", address: "0xC69Dc28924930583024E067b2B3d773018F4EB52" },
    { name: "Algebra Pool", address: "0xD54DBBBfaADca6A4D985Cd08c27E24C8a06433A0" },
  ];
  
  const wapeAbi = ["function deposit() payable"];
  const wapeIface = new ethers.utils.Interface(wapeAbi);
  const depositData = wapeIface.encodeFunctionData("deposit", []);
  
  for (const c of knownContracts) {
    try {
      await provider.call({
        from: c.address,
        to: WAPE,
        value: ethers.utils.parseEther("1"),
        data: depositData
      });
      console.log(c.name + ": CAN deposit");
    } catch (e) {
      console.log(c.name + ": CANNOT deposit");
    }
  }
  
  // Check some EOAs that have interacted with WAPE before
  console.log("\n=== Checking known EOAs ===");
  
  // Get some addresses that successfully deposited to WAPE
  const depositTopic = ethers.utils.id("Deposit(address,uint256)");
  const logs = await provider.getLogs({
    address: WAPE,
    topics: [depositTopic],
    fromBlock: 32719000,
    toBlock: 32720000
  });
  
  console.log("Found", logs.length, "Deposit events in block range 32719000-32720000");
  
  const uniqueDepositors = new Set();
  for (const log of logs.slice(0, 10)) {
    const depositor = "0x" + log.topics[1].slice(26);
    uniqueDepositors.add(depositor);
  }
  
  console.log("Unique depositors:", Array.from(uniqueDepositors));
  
  // Test if these can still deposit
  for (const addr of Array.from(uniqueDepositors).slice(0, 3)) {
    try {
      await provider.call({
        from: addr,
        to: WAPE,
        value: ethers.utils.parseEther("1"),
        data: depositData
      });
      console.log(addr.slice(0, 10) + "...: CAN deposit");
    } catch (e) {
      console.log(addr.slice(0, 10) + "...: CANNOT deposit");
    }
  }
  
  // Key question: Did PokeballGame EVER successfully call WAPE.deposit?
  console.log("\n=== Checking PokeballGame's WAPE deposit history ===");
  
  // The PokeballGame wraps APE -> WAPE internally
  // Let's check Deposit events where dst = PokeballGame
  const gameDepositLogs = await provider.getLogs({
    address: WAPE,
    topics: [
      depositTopic,
      ethers.utils.hexZeroPad(POKEBALL_GAME.toLowerCase(), 32)
    ],
    fromBlock: 32710000,
    toBlock: await provider.getBlockNumber()
  });
  
  console.log("PokeballGame WAPE.deposit events:", gameDepositLogs.length);
  
  if (gameDepositLogs.length > 0) {
    console.log("\nFirst deposit by PokeballGame:");
    const firstLog = gameDepositLogs[0];
    console.log("  Block:", firstLog.blockNumber);
    console.log("  Tx:", firstLog.transactionHash);
    
    console.log("\nLast deposit by PokeballGame:");
    const lastLog = gameDepositLogs[gameDepositLogs.length - 1];
    console.log("  Block:", lastLog.blockNumber);
    console.log("  Tx:", lastLog.transactionHash);
  }
  
  // Maybe WAPE allows contracts that have previous activity?
  // Or there's a whitelist based on some criteria?
  console.log("\n=== Checking if WAPE has whitelist storage ===");
  
  // Common whitelist mapping at slot 0, 1, etc.
  // mapping(address => bool) at slot X means:
  // storage = keccak256(address . X)
  
  for (let slot = 0; slot <= 10; slot++) {
    // Check if PokeballGame is in a mapping at this slot
    const key = ethers.utils.solidityKeccak256(
      ["address", "uint256"],
      [POKEBALL_GAME, slot]
    );
    const value = await provider.getStorageAt(WAPE, key);
    if (value !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log("Slot", slot, "has value for PokeballGame:", value);
    }
    
    // Also check for USER
    const keyUser = ethers.utils.solidityKeccak256(
      ["address", "uint256"],
      [USER, slot]
    );
    const valueUser = await provider.getStorageAt(WAPE, keyUser);
    if (valueUser !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log("Slot", slot, "has value for USER:", valueUser);
    }
  }
  
  // Check the implementation directly
  console.log("\n=== Checking WAPE implementation storage ===");
  const implCode = await provider.getCode(WAPE_IMPL);
  
  // Let's look for specific function selectors in the code
  const depositSelector = "0xd0e30db0"; // deposit()
  const withdrawSelector = "0x2e1a7d4d"; // withdraw(uint256)
  
  if (implCode.includes(depositSelector.slice(2))) {
    console.log("Implementation has deposit() selector");
  }
  
  // Maybe there's an "onlyEOA" modifier?
  // This would be: extcodesize(caller) == 0
  // In bytecode, this is EXTCODESIZE ISZERO pattern
  if (implCode.includes("3b")) { // EXTCODESIZE opcode
    console.log("Implementation uses EXTCODESIZE (might check for contracts!)");
  }
  
  // Check if implementation has admin functions
  console.log("\n=== Trying to read WAPE admin functions ===");
  
  const adminAbi = [
    "function owner() view returns (address)",
    "function admin() view returns (address)",
    "function paused() view returns (bool)",
    "function allowList(address) view returns (bool)",
    "function isAllowed(address) view returns (bool)"
  ];
  
  const wape = new ethers.Contract(WAPE, adminAbi, provider);
  
  for (const func of ["owner", "admin", "paused"]) {
    try {
      const result = await wape[func]();
      console.log(func + "():", result);
    } catch (e) {
      // Function doesn't exist
    }
  }
  
  // Check allowList/isAllowed for PokeballGame and USER
  for (const func of ["allowList", "isAllowed"]) {
    try {
      const resultGame = await wape[func](POKEBALL_GAME);
      console.log(func + "(PokeballGame):", resultGame);
    } catch (e) {
      // Function doesn't exist
    }
    try {
      const resultUser = await wape[func](USER);
      console.log(func + "(USER):", resultUser);
    } catch (e) {
      // Function doesn't exist
    }
  }
}

main().catch(console.error);
