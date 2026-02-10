/**
 * Task: returnPokemonBatch
 *
 * Returns multiple Pokemon NFTs from the owner wallet back to SlabNFTManager.
 *
 * Usage:
 *   npx hardhat returnPokemonBatch --token-ids 101,102,103 --network apechain
 *
 * Flow:
 *   For each token ID:
 *   1. Check ownerOf(tokenId) matches the signer (owner wallet)
 *   2. If not, log warning and skip
 *   3. If yes, call safeTransferFrom(owner, SlabNFTManager, tokenId)
 *   4. Print summary at the end
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

task("returnPokemonBatch", "Return multiple Pokemon NFTs to SlabNFTManager")
  .addParam("tokenIds", "Comma-separated list of NFT token IDs to return (e.g., 101,102,103)")
  .setAction(async (taskArgs, hre) => {
    const { header, subheader, success, warning, error, info } = require("./helpers/formatOutput.cjs");

    header("Batch Return Pokemon NFTs to SlabNFTManager");

    // Parse token IDs
    const tokenIds = taskArgs.tokenIds
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (tokenIds.length === 0) {
      error("No token IDs provided!");
      console.log();
      console.log("Usage: npx hardhat returnPokemonBatch --token-ids 101,102,103 --network apechain");
      return;
    }

    console.log();
    info(`Token IDs to return: ${tokenIds.join(', ')}`);
    info(`Total count: ${tokenIds.length}`);
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
      console.log();
    } catch (e) {
      warning(`Could not fetch NFT collection info: ${e.message}`);
      console.log();
    }

    // Track results
    const results = {
      attempted: tokenIds.length,
      successful: [],
      skippedNotOwned: [],
      skippedError: [],
    };

    // Process each token
    subheader("Processing Transfers");
    console.log();

    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i];
      const progress = `[${i + 1}/${tokenIds.length}]`;

      console.log(`${progress} Token ${tokenId}:`);

      // Check current owner
      let currentOwner;
      try {
        currentOwner = await nftContract.ownerOf(tokenId);
      } catch (e) {
        console.log(`  ❌ Failed to get owner: ${e.message}`);
        results.skippedError.push({ tokenId, reason: `ownerOf failed: ${e.message}` });
        console.log();
        continue;
      }

      // Verify ownership
      if (currentOwner.toLowerCase() !== signerAddress.toLowerCase()) {
        console.log(`  ⚠️  Token ${tokenId} is currently owned by ${currentOwner}`);
        console.log(`      Expected owner: ${signerAddress}, skipping.`);
        results.skippedNotOwned.push({ tokenId, actualOwner: currentOwner });
        console.log();
        continue;
      }

      console.log(`  ✓ Ownership verified`);

      // Execute transfer
      try {
        const tx = await nftContract.safeTransferFrom(
          signerAddress,
          SLAB_NFT_MANAGER_PROXY,
          tokenId
        );

        console.log(`  → Transaction: ${tx.hash}`);
        console.log(`    Waiting for confirmation...`);

        const receipt = await tx.wait();

        if (receipt.status === 1) {
          console.log(`  ✅ Transferred in block ${receipt.blockNumber}`);
          results.successful.push({ tokenId, txHash: tx.hash, block: receipt.blockNumber });
        } else {
          console.log(`  ❌ Transaction failed!`);
          results.skippedError.push({ tokenId, reason: 'Transaction reverted' });
        }
      } catch (e) {
        console.log(`  ❌ Transfer failed: ${e.message}`);
        results.skippedError.push({ tokenId, reason: e.message });
      }

      console.log();
    }

    // Print summary
    console.log();
    header("Transfer Summary");
    console.log();

    console.log(`  Total attempted:     ${results.attempted}`);
    console.log(`  Successfully returned: ${results.successful.length}`);
    console.log(`  Skipped (not owned):   ${results.skippedNotOwned.length}`);
    console.log(`  Skipped (errors):      ${results.skippedError.length}`);
    console.log();

    if (results.successful.length > 0) {
      subheader("Successfully Returned");
      results.successful.forEach(item => {
        console.log(`  Token ${item.tokenId} - tx: ${item.txHash.slice(0, 18)}...`);
      });
      console.log();
    }

    if (results.skippedNotOwned.length > 0) {
      subheader("Skipped - Not Owned by Signer");
      results.skippedNotOwned.forEach(item => {
        console.log(`  Token ${item.tokenId} - owned by ${item.actualOwner}`);
      });
      console.log();
      warning("Transfer these NFTs to the owner wallet first, then run again.");
      console.log();
    }

    if (results.skippedError.length > 0) {
      subheader("Skipped - Errors");
      results.skippedError.forEach(item => {
        console.log(`  Token ${item.tokenId} - ${item.reason}`);
      });
      console.log();
    }

    // Final status
    if (results.successful.length === results.attempted) {
      success(`All ${results.attempted} NFTs successfully returned to SlabNFTManager!`);
    } else if (results.successful.length > 0) {
      info(`${results.successful.length}/${results.attempted} NFTs returned to SlabNFTManager.`);
    } else {
      warning("No NFTs were returned.");
    }

    console.log();
    info("Run 'npx hardhat checkReserves --network apechain' to verify inventory count.");
  });

module.exports = {};
