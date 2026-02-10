/**
 * Unified Deployment Script for PokeballGame + SlabNFTManager Proxies
 * @author Z33Fi ("Z33Fi Made It")
 *
 * Network: ApeChain Mainnet (Chain ID: 33139)
 * Pattern: UUPS Proxy (no separate ProxyAdmin needed)
 *
 * This script deploys both contracts as UUPS proxies and links them together.
 *
 * Usage:
 *   npx hardhat run contracts/deployment/deployProxies.js --network apechain
 *
 * Deployment Order:
 *   1. Deploy SlabNFTManager proxy (with pokeballGame = zero address)
 *   2. Deploy PokeballGame proxy (with slabNFTManager = zero address)
 *   3. Link: SlabNFTManager.setPokeballGame(pokeballGame)
 *   4. Link: PokeballGame.setSlabNFTManager(slabNFTManager)
 */

const { ethers, upgrades } = require("hardhat");

// ============ Contract Addresses (ApeChain Mainnet) ============

const ADDRESSES = {
  // Tokens
  USDC_E: "0xF1815bd50389c46847f0Bda824eC8da914045D14",
  APE: "0x4d224452801aced8b2f0aebe155379bb5d594381",

  // External Contracts
  SLAB_MACHINE: "0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466",
  SLAB_NFT: "0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7",
  POP_VRNG: "0x9eC728Fce50c77e0BeF7d34F1ab28a46409b7aF1",
};

// ============ Wallet Configuration ============
// From contracts/wallets.json

const WALLETS = {
  // Owner wallet - controls upgrades and admin functions
  OWNER: "0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06",

  // Treasury wallet - receives 3% platform fees
  TREASURY: "0x1D1d0E6eF415f2BAe0c21939c50Bc4ffBeb65c74",

  // NFT Revenue wallet - legacy parameter for PokeballGame
  NFT_REVENUE: "0x628376239B6ccb6F21d0a6E4196a18F98F86bd48",
};

// Initial APE price in USD (8 decimals)
// Example: $1.50 = 150000000
const INITIAL_APE_PRICE = 150000000; // $1.50 USD

// ============ Deployment Functions ============

async function deploySlabNFTManager(deployer) {
  console.log("\n--- Deploying SlabNFTManager ---\n");

  const SlabNFTManager = await ethers.getContractFactory("SlabNFTManager");

  // SlabNFTManager.initialize signature:
  // initialize(
  //   address _owner,
  //   address _treasury,
  //   address _usdce,
  //   address _slabMachine,
  //   address _slabNFT,
  //   address _pokeballGame  // Set to zero, will link later
  // )
  const slabNFTManager = await upgrades.deployProxy(
    SlabNFTManager,
    [
      WALLETS.OWNER,            // _owner
      WALLETS.TREASURY,         // _treasury
      ADDRESSES.USDC_E,         // _usdce
      ADDRESSES.SLAB_MACHINE,   // _slabMachine
      ADDRESSES.SLAB_NFT,       // _slabNFT
      ethers.ZeroAddress,       // _pokeballGame (zero for now)
    ],
    {
      initializer: "initialize",
      kind: "uups",
    }
  );

  await slabNFTManager.waitForDeployment();

  const proxyAddress = await slabNFTManager.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("SlabNFTManager deployed:");
  console.log("  Proxy:          ", proxyAddress);
  console.log("  Implementation: ", implAddress);

  return { proxy: slabNFTManager, proxyAddress, implAddress };
}

async function deployPokeballGame(deployer) {
  console.log("\n--- Deploying PokeballGame ---\n");

  const PokeballGame = await ethers.getContractFactory("PokeballGame");

  // PokeballGame.initialize signature (v1.1.0):
  // initialize(
  //   address _owner,
  //   address _treasury,
  //   address _nftRevenue,
  //   address _usdce,
  //   address _ape,
  //   address _vrng,
  //   address _slabNFT,
  //   uint256 _initialAPEPrice
  // )
  // Note: slabNFTManager is set separately via setSlabNFTManager()
  const pokeballGame = await upgrades.deployProxy(
    PokeballGame,
    [
      WALLETS.OWNER,            // _owner
      WALLETS.TREASURY,         // _treasury
      WALLETS.NFT_REVENUE,      // _nftRevenue (legacy)
      ADDRESSES.USDC_E,         // _usdce
      ADDRESSES.APE,            // _ape
      ADDRESSES.POP_VRNG,       // _vrng
      ADDRESSES.SLAB_NFT,       // _slabNFT
      INITIAL_APE_PRICE,        // _initialAPEPrice
    ],
    {
      initializer: "initialize",
      kind: "uups",
    }
  );

  await pokeballGame.waitForDeployment();

  const proxyAddress = await pokeballGame.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("PokeballGame deployed:");
  console.log("  Proxy:          ", proxyAddress);
  console.log("  Implementation: ", implAddress);

  return { proxy: pokeballGame, proxyAddress, implAddress };
}

async function linkContracts(pokeballGame, slabNFTManager, pgAddress, snmAddress) {
  console.log("\n--- Linking Contracts ---\n");

  // Link SlabNFTManager -> PokeballGame
  console.log("Setting PokeballGame on SlabNFTManager...");
  const tx1 = await slabNFTManager.setPokeballGame(pgAddress);
  await tx1.wait();
  console.log("  Done. TX:", tx1.hash);

  // Link PokeballGame -> SlabNFTManager
  console.log("Setting SlabNFTManager on PokeballGame...");
  const tx2 = await pokeballGame.setSlabNFTManager(snmAddress);
  await tx2.wait();
  console.log("  Done. TX:", tx2.hash);

  console.log("\nContracts linked successfully!");
}

async function verifyDeployment(pokeballGame, slabNFTManager, pgAddress, snmAddress) {
  console.log("\n--- Verifying Deployment State ---\n");

  // Verify SlabNFTManager state
  const snmOwner = await slabNFTManager.owner();
  const snmTreasury = await slabNFTManager.treasuryWallet();
  const snmPokeballGame = await slabNFTManager.pokeballGame();
  const snmPaused = await slabNFTManager.paused();

  console.log("SlabNFTManager State:");
  console.log("  Owner:        ", snmOwner);
  console.log("  Treasury:     ", snmTreasury);
  console.log("  PokeballGame: ", snmPokeballGame);
  console.log("  Paused:       ", snmPaused);

  // Verify PokeballGame state
  const pgOwner = await pokeballGame.owner();
  const pgTreasury = await pokeballGame.treasuryWallet();
  const pgSlabNFTManager = await pokeballGame.slabNFTManager();
  const pgAPEPrice = await pokeballGame.apePriceUSD();
  const pgPaused = await pokeballGame.paused();

  console.log("\nPokeballGame State:");
  console.log("  Owner:          ", pgOwner);
  console.log("  Treasury:       ", pgTreasury);
  console.log("  SlabNFTManager: ", pgSlabNFTManager);
  console.log("  APE Price (USD):", pgAPEPrice.toString());
  console.log("  Paused:         ", pgPaused);

  // Verify cross-links
  const linkOK = (
    snmPokeballGame.toLowerCase() === pgAddress.toLowerCase() &&
    pgSlabNFTManager.toLowerCase() === snmAddress.toLowerCase()
  );

  if (linkOK) {
    console.log("\n✅ Cross-contract links verified successfully!");
  } else {
    console.log("\n❌ WARNING: Cross-contract links mismatch!");
    console.log("  Expected PokeballGame on SNM:", pgAddress);
    console.log("  Got:", snmPokeballGame);
    console.log("  Expected SlabNFTManager on PG:", snmAddress);
    console.log("  Got:", pgSlabNFTManager);
  }

  return linkOK;
}

// ============ Main Deployment Function ============

async function main() {
  console.log("============================================");
  console.log("  Pokemon Trader - Unified Proxy Deployment");
  console.log("  Network: ApeChain Mainnet (33139)");
  console.log("  Pattern: UUPS Proxy");
  console.log("============================================");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "APE");

  // Validate deployer is the owner (recommended but not required)
  if (deployer.address.toLowerCase() !== WALLETS.OWNER.toLowerCase()) {
    console.log("\n⚠️  WARNING: Deployer is not the configured owner!");
    console.log("   Deployer:        ", deployer.address);
    console.log("   Configured owner:", WALLETS.OWNER);
    console.log("   The owner address will own the contracts, not the deployer.\n");
  }

  // Display configuration
  console.log("\n--- Configuration ---");
  console.log("Owner:       ", WALLETS.OWNER);
  console.log("Treasury:    ", WALLETS.TREASURY);
  console.log("NFT Revenue: ", WALLETS.NFT_REVENUE);
  console.log("USDC.e:      ", ADDRESSES.USDC_E);
  console.log("APE:         ", ADDRESSES.APE);
  console.log("SlabMachine: ", ADDRESSES.SLAB_MACHINE);
  console.log("Slab NFT:    ", ADDRESSES.SLAB_NFT);
  console.log("POP VRNG:    ", ADDRESSES.POP_VRNG);
  console.log("APE Price:   ", INITIAL_APE_PRICE, "(8 decimals)");

  // Deploy SlabNFTManager first
  const snm = await deploySlabNFTManager(deployer);

  // Deploy PokeballGame
  const pg = await deployPokeballGame(deployer);

  // Link the contracts together
  await linkContracts(pg.proxy, snm.proxy, pg.proxyAddress, snm.proxyAddress);

  // Verify deployment state
  const verified = await verifyDeployment(pg.proxy, snm.proxy, pg.proxyAddress, snm.proxyAddress);

  // Output summary
  console.log("\n============================================");
  console.log("  Deployment Summary");
  console.log("============================================\n");

  const deploymentInfo = {
    network: "ApeChain Mainnet (33139)",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      SlabNFTManager: {
        proxy: snm.proxyAddress,
        implementation: snm.implAddress,
      },
      PokeballGame: {
        proxy: pg.proxyAddress,
        implementation: pg.implAddress,
      },
    },
    verified: verified,
  };

  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Frontend integration output
  console.log("\n--- Frontend Integration ---\n");
  console.log("Add to your frontend config:\n");
  console.log(`const POKEBALL_GAME_ADDRESS = "${pg.proxyAddress}";`);
  console.log(`const SLAB_NFT_MANAGER_ADDRESS = "${snm.proxyAddress}";`);

  // Verification commands
  console.log("\n--- Contract Verification ---\n");
  console.log("Verify on Apescan:\n");
  console.log(`npx hardhat verify --network apechain ${pg.implAddress}`);
  console.log(`npx hardhat verify --network apechain ${snm.implAddress}`);

  // Post-deployment steps
  console.log("\n--- Post-Deployment Steps ---\n");
  console.log("1. Verify contracts on Apescan (commands above)");
  console.log("2. Spawn initial Pokemon:");
  console.log(`   await pokeballGame.forceSpawnPokemon(0, 100, 200)`);
  console.log(`   await pokeballGame.forceSpawnPokemon(1, 500, 300)`);
  console.log(`   await pokeballGame.forceSpawnPokemon(2, 800, 700)`);
  console.log("3. Set correct APE price from oracle if needed");
  console.log("4. Update frontend config with new addresses");
  console.log("5. Test ball purchase with small amount");

  return deploymentInfo;
}

// Execute deployment
main()
  .then((result) => {
    console.log("\n============================================");
    console.log("  Deployment Complete!");
    console.log("============================================\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n============================================");
    console.error("  Deployment Failed!");
    console.error("============================================\n");
    console.error(error);
    process.exit(1);
  });
