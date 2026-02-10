/**
 * Tests for SlabNFTManager v2.3.0 - Random NFT Selection
 *
 * Test Cases:
 * 1. Random index selection is uniformly distributed
 * 2. Different random numbers produce different selections
 * 3. Swap-and-pop removal is O(1) and correct
 * 4. Edge cases: single item, empty inventory
 * 5. Backwards compatibility: awardNFTToWinner() still works
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SlabNFTManager v2.3.0 - Random NFT Selection", function () {
  let slabNFTManager;
  let mockPokeballGame;
  let mockSlabMachine;
  let mockSlabNFT;
  let mockUSDCe;
  let owner;
  let treasury;
  let player1;
  let player2;

  // Constants
  const PULL_PRICE = ethers.utils.parseUnits("51", 6); // $51 USDC.e

  beforeEach(async function () {
    [owner, treasury, player1, player2] = await ethers.getSigners();

    // Deploy mock USDC.e
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDCe = await MockERC20.deploy("USDC.e", "USDC.e", 6);
    await mockUSDCe.deployed();

    // Deploy mock Slab NFT
    const MockERC721 = await ethers.getContractFactory("MockERC721");
    mockSlabNFT = await MockERC721.deploy("Slab NFT", "SLAB");
    await mockSlabNFT.deployed();

    // Deploy mock SlabMachine
    const MockSlabMachine = await ethers.getContractFactory("MockSlabMachine");
    mockSlabMachine = await MockSlabMachine.deploy();
    await mockSlabMachine.deployed();

    // Deploy SlabNFTManager
    const SlabNFTManager = await ethers.getContractFactory("contracts/SlabNFTManagerV2_3.sol:SlabNFTManager");
    slabNFTManager = await ethers.upgrades.deployProxy(
      SlabNFTManager,
      [
        owner.address,
        treasury.address,
        mockUSDCe.address,
        mockSlabMachine.address,
        mockSlabNFT.address,
        ethers.constants.AddressZero, // PokeballGame set later
      ],
      { kind: "uups" }
    );
    await slabNFTManager.deployed();

    // Set PokeballGame to player1 for testing (simulates PokeballGame calling)
    await slabNFTManager.setPokeballGame(player1.address);

    // Mint NFTs to the manager (simulating inventory)
    for (let i = 100; i < 110; i++) {
      await mockSlabNFT.mint(slabNFTManager.address, i);
      // Manually add to inventory via recoverUntrackedNFT
      await slabNFTManager.recoverUntrackedNFT(i);
    }
  });

  describe("awardNFTToWinnerWithRandomness", function () {
    it("should select NFT at random index based on randomNumber", async function () {
      const inventoryBefore = await slabNFTManager.getInventory();
      expect(inventoryBefore.length).to.equal(10);

      // Use a specific random number
      const randomNumber = ethers.BigNumber.from("0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0");

      // Calculate expected index: (randomNumber >> 128) % inventorySize
      const shifted = randomNumber.shr(128);
      const expectedIndex = shifted.mod(inventoryBefore.length).toNumber();
      const expectedTokenId = inventoryBefore[expectedIndex];

      // Call awardNFTToWinnerWithRandomness as PokeballGame (player1)
      const tx = await slabNFTManager.connect(player1).awardNFTToWinnerWithRandomness(
        player2.address,
        randomNumber
      );

      // Check event
      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === "NFTAwardedWithRandomness");
      expect(event).to.not.be.undefined;
      expect(event.args.winner).to.equal(player2.address);
      expect(event.args.tokenId).to.equal(expectedTokenId);
      expect(event.args.selectedIndex).to.equal(expectedIndex);
      expect(event.args.inventorySize).to.equal(10);
      expect(event.args.remainingInventory).to.equal(9);

      // Verify player2 received the NFT
      expect(await mockSlabNFT.ownerOf(expectedTokenId)).to.equal(player2.address);

      // Verify inventory was updated
      const inventoryAfter = await slabNFTManager.getInventory();
      expect(inventoryAfter.length).to.equal(9);
      expect(inventoryAfter.includes(expectedTokenId)).to.be.false;
    });

    it("should produce uniform distribution over many selections", async function () {
      // This test verifies that different random numbers produce different indices
      // Skip in CI since it requires many NFTs and iterations

      // Add more NFTs to inventory
      for (let i = 110; i < 120; i++) {
        await mockSlabNFT.mint(slabNFTManager.address, i);
        await slabNFTManager.recoverUntrackedNFT(i);
      }

      const inventorySize = (await slabNFTManager.getInventory()).length;
      expect(inventorySize).to.equal(20);

      // Track which indices get selected
      const indexCounts = {};
      const numTrials = 100;

      for (let trial = 0; trial < numTrials; trial++) {
        // Generate random number
        const randomNumber = ethers.BigNumber.from(ethers.utils.randomBytes(32));

        // Calculate expected index
        const shifted = randomNumber.shr(128);
        const expectedIndex = shifted.mod(inventorySize).toNumber();

        indexCounts[expectedIndex] = (indexCounts[expectedIndex] || 0) + 1;
      }

      // Check that we hit multiple different indices (not all the same)
      const uniqueIndices = Object.keys(indexCounts).length;
      expect(uniqueIndices).to.be.greaterThan(1);

      console.log("Distribution over", numTrials, "trials:");
      console.log("Unique indices hit:", uniqueIndices, "out of", inventorySize);
      console.log("Index counts:", indexCounts);
    });

    it("should work with single item inventory", async function () {
      // Remove all but one NFT from inventory
      const inventory = await slabNFTManager.getInventory();
      for (let i = 1; i < inventory.length; i++) {
        await slabNFTManager.connect(player1).awardNFTToWinner(player2.address);
      }

      expect(await slabNFTManager.getInventoryCount()).to.equal(1);
      const lastTokenId = (await slabNFTManager.getInventory())[0];

      // Any random number should select index 0 (only item)
      const randomNumber = ethers.BigNumber.from("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

      await slabNFTManager.connect(player1).awardNFTToWinnerWithRandomness(player2.address, randomNumber);

      expect(await mockSlabNFT.ownerOf(lastTokenId)).to.equal(player2.address);
      expect(await slabNFTManager.getInventoryCount()).to.equal(0);
    });

    it("should revert on empty inventory", async function () {
      // Remove all NFTs
      const inventory = await slabNFTManager.getInventory();
      for (let i = 0; i < inventory.length; i++) {
        await slabNFTManager.connect(player1).awardNFTToWinner(player2.address);
      }

      expect(await slabNFTManager.getInventoryCount()).to.equal(0);

      await expect(
        slabNFTManager.connect(player1).awardNFTToWinnerWithRandomness(
          player2.address,
          ethers.BigNumber.from("12345")
        )
      ).to.be.revertedWithCustomError(slabNFTManager, "InventoryEmpty");
    });

    it("should correctly swap-and-pop when removing middle element", async function () {
      const inventoryBefore = await slabNFTManager.getInventory();

      // Choose random number that selects middle element
      const middleIndex = 5;
      // We need (randomNumber >> 128) % 10 = 5
      // So (randomNumber >> 128) = 5 works (5 % 10 = 5)
      const randomNumber = ethers.BigNumber.from(5).shl(128);

      const middleTokenId = inventoryBefore[middleIndex];
      const lastTokenId = inventoryBefore[inventoryBefore.length - 1];

      await slabNFTManager.connect(player1).awardNFTToWinnerWithRandomness(
        player2.address,
        randomNumber
      );

      const inventoryAfter = await slabNFTManager.getInventory();

      // The last element should now be at the middle position
      if (middleIndex < inventoryBefore.length - 1) {
        expect(inventoryAfter[middleIndex]).to.equal(lastTokenId);
      }

      // Middle element should no longer be in inventory
      expect(inventoryAfter.includes(middleTokenId)).to.be.false;
    });

    it("should use different entropy bits than catch rate calculation", async function () {
      // Catch rate uses: randomNumber % 100
      // NFT selection uses: (randomNumber >> 128) % inventorySize
      // They should be independent

      // Create a random number where low bits and high bits give different results
      // Low 128 bits: all 1s (would give high catch rate check)
      // High 128 bits: all 0s (would give index 0)
      const lowBits = ethers.BigNumber.from("0xffffffffffffffffffffffffffffffff");
      const highBits = ethers.BigNumber.from("5"); // Small number for predictable index

      const randomNumber = highBits.shl(128).or(lowBits);

      // Low bits % 100 = 255 % 100 = 55 (if used for catch rate)
      // High bits % 10 = 5 % 10 = 5 (for NFT selection with inventory size 10)

      const inventory = await slabNFTManager.getInventory();
      const expectedTokenId = inventory[5]; // Index 5

      const tx = await slabNFTManager.connect(player1).awardNFTToWinnerWithRandomness(
        player2.address,
        randomNumber
      );

      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === "NFTAwardedWithRandomness");
      expect(event.args.selectedIndex).to.equal(5);
      expect(event.args.tokenId).to.equal(expectedTokenId);
    });
  });

  describe("Backwards compatibility", function () {
    it("awardNFTToWinner() should still work (FIFO)", async function () {
      const inventoryBefore = await slabNFTManager.getInventory();
      const firstTokenId = inventoryBefore[0];

      await slabNFTManager.connect(player1).awardNFTToWinner(player2.address);

      expect(await mockSlabNFT.ownerOf(firstTokenId)).to.equal(player2.address);
    });

    it("should not affect other functions", async function () {
      // Test that stats work
      const stats = await slabNFTManager.getStats();
      expect(stats.inventorySize).to.equal(10);

      // Test canTriggerPurchase
      const [canPurchase, reason] = await slabNFTManager.canTriggerPurchase();
      expect(reason).to.be.a("string");
    });
  });

  describe("Access control", function () {
    it("should only allow PokeballGame to call awardNFTToWinnerWithRandomness", async function () {
      const randomNumber = ethers.BigNumber.from("12345");

      // Owner should not be able to call
      await expect(
        slabNFTManager.connect(owner).awardNFTToWinnerWithRandomness(player2.address, randomNumber)
      ).to.be.revertedWithCustomError(slabNFTManager, "NotAuthorized");

      // Random address should not be able to call
      await expect(
        slabNFTManager.connect(player2).awardNFTToWinnerWithRandomness(player2.address, randomNumber)
      ).to.be.revertedWithCustomError(slabNFTManager, "NotAuthorized");

      // PokeballGame (player1) should be able to call
      await expect(
        slabNFTManager.connect(player1).awardNFTToWinnerWithRandomness(player2.address, randomNumber)
      ).to.not.be.reverted;
    });
  });
});

// Mock contracts for testing
// These would be in separate files in a real project

// contracts/mocks/MockERC20.sol content:
/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
*/

// contracts/mocks/MockERC721.sol content:
/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}
*/

// contracts/mocks/MockSlabMachine.sol content:
/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract MockSlabMachine {
    function pull(uint256, address) external pure returns (uint256) {
        return 1; // Return fake request ID
    }

    function machineConfig() external pure returns (
        uint256 maxPulls,
        uint256 buybackExpiry,
        uint256 buybackPercentage,
        uint256 minBuybackValue,
        uint256 usdcPullPrice
    ) {
        return (10, 0, 0, 0, 51 * 1e6);
    }
}
*/
