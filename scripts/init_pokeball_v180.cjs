/**
 * Initialize PokeballGame v1.8.0 after upgrade
 */
const hre = require('hardhat');

const PROXY_ADDRESS = '0xB6e86aF8a85555c6Ac2D812c8B8BE8a60C1C432f';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);
  console.log('Balance:', hre.ethers.utils.formatEther(await deployer.getBalance()), 'APE');

  const game = await hre.ethers.getContractAt(
    'contracts/PokeballGameV8.sol:PokeballGame',
    PROXY_ADDRESS
  );

  // Use deployer as relayer for testing (can be changed later)
  const RELAYER_ADDRESS = deployer.address;

  console.log('');
  console.log('Calling initializeV180 with relayer address:', RELAYER_ADDRESS);

  try {
    const tx = await game.initializeV180(RELAYER_ADDRESS, { gasLimit: 200000 });
    console.log('TX:', tx.hash);
    await tx.wait();
    console.log('Initialization complete!');
  } catch (err) {
    if (err.message.includes('Already initialized')) {
      console.log('Already initialized (skipping)');
    } else {
      throw err;
    }
  }

  console.log('');
  console.log('Verifying...');

  const relayer = await game.relayerAddress();
  const totalAPEReserve = await game.totalAPEReserve();
  const throwFee = await game.getThrowFee();
  const activePokemon = await game.getActivePokemonCount();
  const nftInventory = await game.getNFTInventoryCount();

  console.log('Relayer Address:', relayer);
  console.log('Total APE Reserve:', hre.ethers.utils.formatEther(totalAPEReserve), 'APE');
  console.log('Throw Fee:', hre.ethers.utils.formatEther(throwFee), 'APE');
  console.log('Active Pokemon:', activePokemon.toString());
  console.log('NFT Inventory:', nftInventory.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
