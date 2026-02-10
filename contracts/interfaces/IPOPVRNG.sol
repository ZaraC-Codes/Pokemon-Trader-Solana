// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPOPVRNG {
    /**
     * Requests a random number from POP VRNG
     * @param traceId Optional ID for tracking
     * @return requestId The unique request identifier
     */
    function requestRandomNumberWithTraceId(uint256 traceId) 
        external 
        returns (uint256);
}

interface IPOPVRNG_Callback {
    /**
     * Callback when random number is delivered
     * @param requestId The request identifier
     * @param randomNumber The generated random number
     */
    function randomNumberCallback(uint256 requestId, uint256 randomNumber) 
        external;
}
