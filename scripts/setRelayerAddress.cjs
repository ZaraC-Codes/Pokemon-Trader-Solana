/**
 * Set Relayer Address on PokeballGame v1.8.0
 *
 * This script authorizes a relayer wallet to call throwBallFor() on behalf of players.
 *
 * Usage:
 *   npx hardhat run scripts/setRelayerAddress.cjs --network apechain
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY - Owner wallet private key
 *   RELAYER_ADDRESS - (optional) Relayer wallet address to authorize
 *
 * If RELAYER_ADDRESS is not set, the script will use the owner wallet as the relayer.
 * This is useful for testing but NOT recommended for production.
 */

const hre = require('hardhat');
const { ethers } = hre;
const fs = require('fs');
const path = require('path');

// Load addresses
const addressesPath = path.join(__dirname, '..', 'contracts', 'addresses.json');
const addresses = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

// Load wallets
const walletsPath = path.join(__dirname, '..', 'contracts', 'wallets.json');
const wallets = JSON.parse(fs.readFileSync(walletsPath, 'utf8'));

// Load ABI
const abiPath = path.join(__dirname, '..', 'contracts', 'abi', 'abi_PokeballGameV8.json');
const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SET RELAYER ADDRESS - PokeballGame v1.8.0');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Get signer
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  console.log('Signer:', signerAddress);

  // Verify signer is owner
  if (signerAddress.toLowerCase() !== wallets.wallets.owner.toLowerCase()) {
    console.error('');
    console.error('❌ ERROR: Signer is not the contract owner');
    console.error('   Expected:', wallets.wallets.owner);
    console.error('   Got:', signerAddress);
    process.exit(1);
  }
  console.log('✅ Signer is contract owner');

  // Get contract
  const pokeballGameAddress = addresses.contracts.pokeballGame.proxy;
  const pokeballGame = new ethers.Contract(
    pokeballGameAddress,
    abi,
    signer
  );
  console.log('');
  console.log('Contract:', pokeballGameAddress);

  // Get relayer address from env or use signer
  const relayerAddress = process.env.RELAYER_ADDRESS || signerAddress;
  console.log('');
  console.log('Relayer to authorize:', relayerAddress);

  if (relayerAddress.toLowerCase() === signerAddress.toLowerCase()) {
    console.log('');
    console.log('⚠️  WARNING: Using owner wallet as relayer');
    console.log('   This is OK for testing, but NOT recommended for production.');
    console.log('   For production, create a dedicated relayer wallet with limited funds.');
  }

  // Check current relayer
  let currentRelayer;
  try {
    currentRelayer = await pokeballGame.relayerAddress();
    console.log('');
    console.log('Current relayer:', currentRelayer);

    if (currentRelayer.toLowerCase() === relayerAddress.toLowerCase()) {
      console.log('');
      console.log('✅ Relayer already set to this address. No action needed.');
      return;
    }
  } catch (err) {
    console.log('');
    console.log('Note: Could not read current relayer (function may not exist in older versions)');
  }

  // Set relayer address
  console.log('');
  console.log('Setting relayer address...');

  try {
    const tx = await pokeballGame.setRelayerAddress(relayerAddress);
    console.log('Transaction hash:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('');
    console.log('✅ Relayer address set successfully!');
    console.log('   Block:', receipt.blockNumber);
    console.log('   Gas used:', receipt.gasUsed.toString());
  } catch (err) {
    console.error('');
    console.error('❌ Failed to set relayer address:', err.message);

    if (err.message.includes('OnlyOwner')) {
      console.error('   The signer is not the contract owner.');
    } else if (err.message.includes('setRelayerAddress')) {
      console.error('   The function may not exist. Is the contract upgraded to v1.8.0?');
    }

    process.exit(1);
  }

  // Verify
  console.log('');
  console.log('Verifying...');
  const newRelayer = await pokeballGame.relayerAddress();
  console.log('New relayer address:', newRelayer);

  if (newRelayer.toLowerCase() === relayerAddress.toLowerCase()) {
    console.log('');
    console.log('✅ Verification passed!');
  } else {
    console.error('');
    console.error('❌ Verification failed! Address mismatch.');
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  NEXT STEPS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('1. Deploy the relayer to Cloudflare Workers:');
  console.log('   cd relayer');
  console.log('   wrangler login');
  console.log('   wrangler secret put RELAYER_PRIVATE_KEY');
  console.log('   npm run deploy');
  console.log('');
  console.log('2. Update .env with the relayer URL:');
  console.log('   VITE_GASLESS_DEV_MODE=false');
  console.log('   VITE_RELAYER_API_URL=https://pokeball-relayer.YOUR_SUBDOMAIN.workers.dev');
  console.log('');
  console.log('3. Fund the relayer wallet with APE for gas fees');
  console.log('');
  console.log('4. Ensure PokeballGame has APE reserves:');
  console.log('   npx hardhat checkReserves --network apechain');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
