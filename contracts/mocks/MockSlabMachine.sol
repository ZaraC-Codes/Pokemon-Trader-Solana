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
