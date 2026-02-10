/**
 * Task: returnPokemonNft
 *
 * Returns a single Pokemon NFT from the owner wallet back to SlabNFTManager.
 *
 * Usage:
 *   npx hardhat returnPokemonNft --token-id 123 --network apechain
 *
 * Flow:
 *   1. Check ownerOf(tokenId) matches the signer (owner wallet)
 *   2. Call safeTransferFrom(owner, SlabNFTManager, tokenId)
 *   3. Verify new owner is SlabNFTManager
 */

const { task } = require("hardhat/config");

// Contract addresses
const SLAB_NFT_ADDRESS = '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7';
const SLAB_NFT_MANAGER_PROXY = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';
const EXPECTED_OWNER = '0x47c11427B9f0DF4e8bdB674f5e23C8E994befC06';

// Minimal ERC-721 ABI for transfer operations
const ERC721_ABI = [
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function safeTransferFrom(address from, address to, uint256 tokenId) external',
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
];

task("returnPokemonNft", "Return a single Pokemon NFT to SlabNFTManager")
  .addParam("tokenId", "The NFT token ID to return")
  .setAction(async (taskArgs, hre) => {
    const { header, subheader, success, warning, error, info } = require("./helpers/formatOutput.cjs");

    header("Return Pokemon NFT to SlabNFTManager");

    const tokenId = taskArgs.tokenId;
    console.log();
    info(`Token ID: ${tokenId}`);
    info(`Slab NFT Contract: ${SLAB_NFT_ADDRESS}`);
    info(`SlabNFTManager Proxy: ${SLAB_NFT_MANAGER_PROXY}`);
    console.log();

    // Get signer
    const [signer] = await hre.ethers.getSigners();
    const signerAddress = await signer.getAddress();

    subheader("Signer Info");
    console.log(`  Address: ${signerAddress}`);

    if (signerAddress.toLowerCase() !== EXPECTED_OWNER.toLowerCase()) {
      error(`Signer ${signerAddress} is not the expected owner wallet!`);
      error(`Expected: ${EXPECTED_OWNER}`);
      console.log();
      return;
    }
    success(`Signer matches expected owner wallet`);
    console.log();

    // Connect to NFT contract
    const nftContract = new hre.ethers.Contract(SLAB_NFT_ADDRESS, ERC721_ABI, signer);

    // Get NFT info
    try {
      const name = await nftContract.name();
      const symbol = await nftContract.symbol();
      info(`NFT Collection: ${name} (${symbol})`);
    } catch (e) {
      warning(`Could not fetch NFT collection info: ${e.message}`);
    }

    // Check current owner
    subheader("Ownership Check");
    let currentOwner;
    try {
      currentOwner = await nftContract.ownerOf(tokenId);
      console.log(`  Current owner of token ${tokenId}: ${currentOwner}`);
    } catch (e) {
      error(`Failed to get owner of token ${tokenId}`);
      error(`Error: ${e.message}`);
      console.log();
      console.log("This token may not exist or the contract call failed.");
      return;
    }

    // Verify ownership
    if (currentOwner.toLowerCase() !== signerAddress.toLowerCase()) {
      console.log();
      error(`Token ${tokenId} is currently owned by ${currentOwner}`);
      error(`Expected owner: ${signerAddress}`);
      console.log();
      warning("Cannot transfer - you must own the NFT to return it.");
      warning("Transfer the NFT to the owner wallet first, then run this task again.");
      return;
    }

    success(`Ownership verified - token ${tokenId} is owned by signer`);
    console.log();

    // Execute transfer
    subheader("Executing Transfer");
    console.log(`  From: ${signerAddress}`);
    console.log(`  To:   ${SLAB_NFT_MANAGER_PROXY} (SlabNFTManager)`);
    console.log(`  Token ID: ${tokenId}`);
    console.log();

    try {
      const tx = await nftContract.safeTransferFrom(
        signerAddress,
        SLAB_NFT_MANAGER_PROXY,
        tokenId
      );

      console.log(`  Transaction hash: ${tx.hash}`);
      console.log("  Waiting for confirmation...");

      const receipt = await tx.wait();

      if (receipt.status === 1) {
        success(`Transfer confirmed in block ${receipt.blockNumber}`);
      } else {
        error("Transaction failed!");
        return;
      }
    } catch (e) {
      error(`Transfer failed: ${e.message}`);
      console.log();
      return;
    }

    // Verify new owner
    console.log();
    subheader("Verification");
    try {
      const newOwner = await nftContract.ownerOf(tokenId);
      console.log(`  New owner of token ${tokenId}: ${newOwner}`);

      if (newOwner.toLowerCase() === SLAB_NFT_MANAGER_PROXY.toLowerCase()) {
        success(`Token ${tokenId} successfully returned to SlabNFTManager!`);
      } else {
        warning(`Unexpected new owner: ${newOwner}`);
      }
    } catch (e) {
      warning(`Could not verify new owner: ${e.message}`);
    }

    console.log();
    info("The NFT is now back in the SlabNFTManager inventory pool.");
    info("Run 'npx hardhat checkReserves --network apechain' to verify inventory count.");
  });

module.exports = {};
