/**
 * Initialize SlabNFTManager v2.4.0 after upgrade
 */
const hre = require('hardhat');

const PROXY_ADDRESS = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const PYTH_ENTROPY = '0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);
  console.log('Balance:', hre.ethers.utils.formatEther(await deployer.getBalance()), 'APE');

  const manager = await hre.ethers.getContractAt(
    'contracts/SlabNFTManagerV2_4.sol:SlabNFTManager',
    PROXY_ADDRESS
  );

  console.log('');
  console.log('Calling initializeV240 with entropy address:', PYTH_ENTROPY);

  try {
    const tx = await manager.initializeV240(PYTH_ENTROPY, { gasLimit: 200000 });
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

  const entropy = await manager.entropy();
  const provider = await manager.entropyProvider();
  const apeReserve = await manager.apeReserve();
  const stats = await manager.getStats();

  console.log('Entropy:', entropy);
  console.log('Provider:', provider);
  console.log('APE Reserve:', hre.ethers.utils.formatEther(apeReserve), 'APE');
  console.log('USDC Balance:', hre.ethers.utils.formatUnits(stats.balance, 6), 'USDC');
  console.log('Inventory Size:', stats.inventorySize.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
