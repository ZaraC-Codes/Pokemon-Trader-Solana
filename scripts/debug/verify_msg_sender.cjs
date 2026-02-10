/**
 * Verify who calls onERC721Received
 *
 * When SlabMachine does slabNFT.safeTransferFrom(slabMachine, recipient, tokenId),
 * the flow is:
 * 1. SlabMachine calls slabNFT.safeTransferFrom()
 * 2. SlabNFT internally calls recipient.onERC721Received()
 *
 * In step 2, msg.sender is the SlabNFT contract (since SlabNFT is calling onERC721Received)
 *
 * So the check `if (msg.sender == address(slabNFT))` SHOULD work...
 * Unless the actual ERC721 implementation differs.
 *
 * Let's check the transaction logs to see exactly what happened.
 */

const { ethers } = require('ethers');

const CALDERA_RPC = 'https://apechain.calderachain.xyz/http';
const SLAB_NFT_ADDRESS = '0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7';
const SLAB_MACHINE_ADDRESS = '0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466';
const SLAB_NFT_MANAGER_ADDRESS = '0xbbdfa19f9719f9d9348F494E07E0baB96A85AA71';

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(CALDERA_RPC);

  // Get the transaction that transferred Token 300
  const txHash = '0x9d3d8a1d9b18ff17edb002b1eca8e568cc1a715223e933202a35e64990db9f55';
  console.log('Analyzing TX:', txHash);
  console.log();

  const tx = await provider.getTransaction(txHash);
  const receipt = await provider.getTransactionReceipt(txHash);

  console.log('TX Details:');
  console.log(`  From: ${tx.from}`);
  console.log(`  To:   ${tx.to}`);
  console.log(`  Status: ${receipt.status === 1 ? 'SUCCESS' : 'FAILED'}`);
  console.log();

  console.log('Expected addresses:');
  console.log(`  SlabNFT:       ${SLAB_NFT_ADDRESS.toLowerCase()}`);
  console.log(`  SlabMachine:   ${SLAB_MACHINE_ADDRESS.toLowerCase()}`);
  console.log(`  SlabNFTManager: ${SLAB_NFT_MANAGER_ADDRESS.toLowerCase()}`);
  console.log();

  // The key insight: when safeTransferFrom is called, it internally calls
  // _checkOnERC721Received which does:
  //   IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data)
  //
  // In the context of _checkOnERC721Received:
  // - msg.sender = whoever called safeTransferFrom (SlabMachine)
  // - But when it calls onERC721Received, the NEW msg.sender is the NFT contract!
  //
  // Actually wait - let me trace this more carefully:
  //
  // 1. Pyth Entropy calls SlabMachine.fulfillRandomness()
  // 2. SlabMachine calls slabNFT.safeTransferFrom(slabMachine, recipient, tokenId)
  //    - In this call, msg.sender for SlabNFT is SlabMachine
  // 3. SlabNFT._checkOnERC721Received() calls recipient.onERC721Received()
  //    - In THIS call, msg.sender for SlabNFTManager is SlabNFT
  //
  // So the check `msg.sender == address(slabNFT)` SHOULD work!
  //
  // Unless... the transfer didn't use safeTransferFrom but used transferFrom instead?
  // Let's check the function signatures in the transaction input

  // Decode what function was called
  const transferSelector = ethers.utils.id('transfer(address,uint256)').slice(0, 10);
  const transferFromSelector = ethers.utils.id('transferFrom(address,address,uint256)').slice(0, 10);
  const safeTransferFromSelector = ethers.utils.id('safeTransferFrom(address,address,uint256)').slice(0, 10);
  const safeTransferFromWithDataSelector = ethers.utils.id('safeTransferFrom(address,address,uint256,bytes)').slice(0, 10);

  console.log('Function selectors:');
  console.log(`  transfer:              ${transferSelector}`);
  console.log(`  transferFrom:          ${transferFromSelector}`);
  console.log(`  safeTransferFrom:      ${safeTransferFromSelector}`);
  console.log(`  safeTransferFrom+data: ${safeTransferFromWithDataSelector}`);
  console.log();

  // Check all internal transactions (logs) to see what was called
  console.log('Looking for internal calls...');
  console.log();

  // Parse all logs to understand the flow
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    console.log(`Log ${i}:`);
    console.log(`  Address: ${log.address}`);

    if (log.address.toLowerCase() === SLAB_NFT_ADDRESS.toLowerCase()) {
      console.log('  >>> This is from SlabNFT!');
    }
    if (log.address.toLowerCase() === SLAB_MACHINE_ADDRESS.toLowerCase()) {
      console.log('  >>> This is from SlabMachine!');
    }
    if (log.address.toLowerCase() === SLAB_NFT_MANAGER_ADDRESS.toLowerCase()) {
      console.log('  >>> This is from SlabNFTManager!');
    }

    // Transfer event
    if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
      const from = '0x' + log.topics[1].slice(26);
      const to = '0x' + log.topics[2].slice(26);
      const tokenId = ethers.BigNumber.from(log.topics[3]).toString();
      console.log(`  TYPE: Transfer event`);
      console.log(`  From: ${from}`);
      console.log(`  To:   ${to}`);
      console.log(`  TokenID: ${tokenId}`);
    }

    console.log();
  }

  // Now check if there were any NFTReceived events from SlabNFTManager
  console.log('Checking for SlabNFTManager events...');
  const nftReceivedTopic = ethers.utils.id('NFTReceived(uint256,uint256)');
  console.log(`  NFTReceived topic: ${nftReceivedTopic}`);

  let foundNFTReceived = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === SLAB_NFT_MANAGER_ADDRESS.toLowerCase()) {
      console.log(`  Found log from SlabNFTManager:`);
      console.log(`    Topic 0: ${log.topics[0]}`);
      if (log.topics[0] === nftReceivedTopic) {
        foundNFTReceived = true;
        console.log('  >>> NFTReceived event FOUND!');
      }
    }
  }

  if (!foundNFTReceived) {
    console.log('  >>> NO NFTReceived event emitted!');
    console.log('  This confirms _addToInventory was NOT called.');
  }

  console.log();
  console.log('='.repeat(70));
  console.log('DIAGNOSIS:');
  console.log('='.repeat(70));
  console.log();
  console.log('If onERC721Received was called by SlabNFT, msg.sender would be SlabNFT.');
  console.log('The check `if (msg.sender == address(slabNFT))` should have passed.');
  console.log();
  console.log('Possible issues:');
  console.log('1. SlabMachine used `transferFrom` instead of `safeTransferFrom`');
  console.log('   - In this case, onERC721Received is never called!');
  console.log('2. The slabNFT address stored in SlabNFTManager is wrong');
  console.log('3. Some other edge case');
  console.log();

  // Check what slabNFT address is stored
  const SLAB_NFT_MANAGER_ABI = [
    'function slabNFT() view returns (address)',
  ];
  const manager = new ethers.Contract(SLAB_NFT_MANAGER_ADDRESS, SLAB_NFT_MANAGER_ABI, provider);

  const storedSlabNFT = await manager.slabNFT();
  console.log(`SlabNFT stored in manager: ${storedSlabNFT}`);
  console.log(`Actual SlabNFT address:    ${SLAB_NFT_ADDRESS}`);
  if (storedSlabNFT.toLowerCase() === SLAB_NFT_ADDRESS.toLowerCase()) {
    console.log('>>> Addresses MATCH! The issue is likely safeTransferFrom not being called.');
  } else {
    console.log('>>> Addresses MISMATCH! This is the bug!');
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
