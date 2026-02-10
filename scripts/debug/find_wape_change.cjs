/**
 * Find what changed with WAPE that blocks contracts
 */
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

const RPC_URL = "https://apechain.calderachain.xyz/http";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const WAPE = "0x48b62137EdfA95a428D35C09E44256a739F6B557";
const POKEBALL_GAME = "0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f";

async function main() {
  console.log("=== Finding when WAPE blocked contracts ===\n");
  
  const wapeAbi = ["function deposit() payable"];
  const wapeIface = new ethers.utils.Interface(wapeAbi);
  const depositData = wapeIface.encodeFunctionData("deposit", []);
  
  // Binary search for when deposit started failing
  const lastWorking = 32719353;  // Last successful deposit
  const current = await provider.getBlockNumber();
  
  console.log("Last known working block:", lastWorking);
  console.log("Current block:", current);
  
  // Test at specific blocks
  const testBlocks = [
    32719353,  // Last success
    32719354,  // Right after
    32719360,
    32719400,
    32719500,
    32720000,
    32721000,
    32722000,
    current
  ];
  
  console.log("\n=== Testing deposit at specific blocks ===");
  
  for (const block of testBlocks) {
    try {
      await provider.call({
        from: POKEBALL_GAME,
        to: WAPE,
        value: ethers.utils.parseEther("1"),
        data: depositData
      }, block);
      console.log("Block", block, ": WORKS");
    } catch (e) {
      console.log("Block", block, ": FAILS");
    }
  }
  
  // Check for Upgraded events on WAPE
  console.log("\n=== Checking for WAPE Upgraded events ===");
  
  const upgradedTopic = ethers.utils.id("Upgraded(address)");
  const upgradeLogs = await provider.getLogs({
    address: WAPE,
    topics: [upgradedTopic],
    fromBlock: 32710000,
    toBlock: current
  });
  
  console.log("Found", upgradeLogs.length, "Upgraded events");
  for (const log of upgradeLogs) {
    console.log("  Block:", log.blockNumber, "New impl:", "0x" + log.data.slice(26));
  }
  
  // Check for AdminChanged events
  const adminChangedTopic = ethers.utils.id("AdminChanged(address,address)");
  const adminLogs = await provider.getLogs({
    address: WAPE,
    topics: [adminChangedTopic],
    fromBlock: 32710000,
    toBlock: current
  });
  
  console.log("\nFound", adminLogs.length, "AdminChanged events");
  
  // Check for any event on WAPE between 32719353 and 32719360
  console.log("\n=== All WAPE events between 32719353-32719400 ===");
  
  const allLogs = await provider.getLogs({
    address: WAPE,
    fromBlock: 32719353,
    toBlock: 32719400
  });
  
  console.log("Found", allLogs.length, "events");
  for (const log of allLogs) {
    console.log("  Block:", log.blockNumber, "Topic[0]:", log.topics[0].slice(0, 20) + "...");
  }
  
  // Maybe the issue is eth_call simulation vs actual execution
  console.log("\n=== Comparing simulation vs reality ===");
  
  // The tx at 32719353 ACTUALLY succeeded (we have receipts)
  // But simulating NOW at that same block fails
  
  // This could mean:
  // 1. Simulation uses current state of contracts
  // 2. Or block-specific simulation has issues
  
  // Let's check if we can call view functions at historical blocks
  const balanceAbi = ["function balanceOf(address) view returns (uint256)"];
  const wape = new ethers.Contract(WAPE, balanceAbi, provider);
  
  const balBefore = await wape.balanceOf(POKEBALL_GAME, { blockTag: 32719352 });
  const balAfter = await wape.balanceOf(POKEBALL_GAME, { blockTag: 32719354 });
  
  console.log("\nPokeballGame WAPE balance:");
  console.log("  Block 32719352:", ethers.utils.formatEther(balBefore));
  console.log("  Block 32719354:", ethers.utils.formatEther(balAfter));
  console.log("  Difference:", ethers.utils.formatEther(balAfter.sub(balBefore)));
  
  // Now the big question: Can OTHER contracts call WAPE.deposit?
  // Or is it only PokeballGame that's blocked?
  console.log("\n=== Testing other contracts at historical blocks ===");
  
  const testContract = "0xC69Dc28924930583024E067b2B3d773018F4EB52"; // Camelot Router
  
  try {
    await provider.call({
      from: testContract,
      to: WAPE,
      value: ethers.utils.parseEther("1"),
      data: depositData
    }, 32719352);  // Before the "break"
    console.log("Camelot Router at block 32719352: CAN deposit");
  } catch (e) {
    console.log("Camelot Router at block 32719352: CANNOT deposit");
  }
  
  try {
    await provider.call({
      from: testContract,
      to: WAPE,
      value: ethers.utils.parseEther("1"),
      data: depositData
    }, 32719354);  // After the "break"
    console.log("Camelot Router at block 32719354: CAN deposit");
  } catch (e) {
    console.log("Camelot Router at block 32719354: CANNOT deposit");
  }
}

main().catch(console.error);
