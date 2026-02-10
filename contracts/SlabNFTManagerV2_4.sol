// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title SlabNFTManager
 * @notice Manages NFT inventory and auto-purchasing from SlabMachine for the Pokemon catching game
 * @dev UUPS upgradeable contract that holds NFTs and USDC.e for automated purchases
 * @author Z33Fi ("Z33Fi Made It")
 * @custom:artist-signature Z33Fi Made It
 * @custom:network ApeChain Mainnet (Chain ID: 33139)
 * @custom:version 2.4.0
 *
 * CHANGELOG v2.4.0:
 * - APE RESERVE: Maintains 0.5% APE reserve for Pyth Entropy fees on NFT selection
 * - DEPOSIT APE RESERVE: Added depositAPEReserve() function to receive APE from PokeballGame
 * - AUTO-PURCHASE LOOP: checkAndPurchaseNFT() now loops until inventory reaches 20 OR funds depleted
 * - PYTH ENTROPY INTEGRATION: Uses Entropy for random NFT selection in awardNFTToWinnerWithRandomness()
 * - Storage layout compatible with v2.3.0
 *
 * CHANGELOG v2.3.0:
 * - Added awardNFTToWinnerWithRandomness() for random NFT selection using Pyth Entropy
 * - Uses swap-and-pop pattern for O(1) removal at random index
 *
 * Previous versions: See v2.3.0 for full changelog history
 */

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// Pyth Entropy imports
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";

// ============ External Contract Interfaces ============

/**
 * @dev Interface for SlabMachine NFT vending
 */
interface ISlabMachine {
    function pull(uint256 _amount, address _recipient) external returns (uint256 requestId_);

    function machineConfig() external view returns (
        uint256 maxPulls,
        uint256 buybackExpiry,
        uint256 buybackPercentage,
        uint256 minBuybackValue,
        uint256 usdcPullPrice
    );
}

// ============ Main Contract ============

contract SlabNFTManager is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    IERC721Receiver,
    IEntropyConsumer
{
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint8 public constant MAX_INVENTORY_SIZE = 20;
    uint256 public constant AUTO_PURCHASE_THRESHOLD = 51 * 1e6;
    uint256 public constant PULL_PRICE_USDC = 51 * 1e6;
    uint8 public constant USDC_DECIMALS = 6;

    // ============ State Variables ============
    // IMPORTANT: Storage layout must remain compatible with v2.3.0
    // Do NOT reorder or remove any existing state variables

    IERC20 public usdce;
    ISlabMachine public slabMachine;
    IERC721 public slabNFT;
    address public pokeballGame;
    address public treasuryWallet;

    uint256[] public nftInventory;
    mapping(uint256 => bool) public isInInventory;
    mapping(uint256 => uint256) public tokenIdToIndex;

    uint256 public totalNFTsPurchased;
    uint256 public totalNFTsAwarded;
    uint256 public totalUSDCSpent;

    mapping(uint256 => address) public pendingPullRequests;
    uint256 public pendingRequestCount;

    // v2.4.0 - New state variables for APE reserve and Entropy
    uint256 public apeReserve;                    // APE held for Entropy fees
    uint256 public totalAPEReceived;              // Total APE received from PokeballGame
    IEntropyV2 public entropy;                    // Pyth Entropy contract
    address public entropyProvider;               // Entropy provider address
    mapping(uint64 => address) public pendingAwards; // sequenceNumber => winner address
    bool private _v240Initialized;

    // ============ Events ============

    event RevenueDeposited(
        address indexed depositor,
        uint256 amount,
        uint256 newBalance
    );

    event NFTPurchaseInitiated(
        uint256 indexed requestId,
        uint256 amount,
        address recipient
    );

    event NFTReceived(
        uint256 indexed tokenId,
        uint256 inventorySize
    );

    event NFTAwarded(
        address indexed winner,
        uint256 indexed tokenId,
        uint256 remainingInventory
    );

    event NFTAwardedWithRandomness(
        address indexed winner,
        uint256 indexed tokenId,
        uint256 selectedIndex,
        uint256 inventorySize,
        uint256 remainingInventory
    );

    event PokeballGameUpdated(
        address oldAddress,
        address newAddress
    );

    event TreasuryWalletUpdated(
        address oldAddress,
        address newAddress
    );

    event OwnerWalletUpdated(
        address oldOwner,
        address newOwner
    );

    event EmergencyWithdrawal(
        address indexed recipient,
        uint256 usdcAmount,
        uint256 nftCount
    );

    event InventoryCapacityReached(
        uint256 currentSize,
        uint256 maxSize
    );

    event AutoPurchaseSkippedInventoryFull(
        uint256 balance,
        uint256 inventorySize,
        uint256 maxSize
    );

    event RevenueWithdrawn(
        address indexed recipient,
        uint256 amount,
        uint256 remainingBalance
    );

    event NFTRecovered(
        uint256 indexed tokenId,
        uint256 inventorySize
    );

    event PendingRequestCleared(
        uint256 indexed requestId,
        uint256 remainingPending
    );

    // v2.4.0 events
    event APEReserveDeposited(
        address indexed depositor,
        uint256 amount,
        uint256 newReserve
    );

    event APEReserveWithdrawn(
        address indexed recipient,
        uint256 amount,
        uint256 remainingReserve
    );

    event AutoPurchaseLoopCompleted(
        uint256 purchaseCount,
        uint256 finalInventorySize,
        uint256 remainingBalance
    );

    event EntropyUpdated(
        address oldEntropy,
        address newEntropy
    );

    // ============ Errors ============

    error ZeroAddress();
    error NotAuthorized(address caller);
    error InventoryFull(uint8 maxSize);
    error InventoryEmpty();
    error InsufficientBalance(uint256 required, uint256 available);
    error BelowPurchaseThreshold(uint256 balance, uint256 threshold);
    error TokenNotInInventory(uint256 tokenId);
    error TokenAlreadyInInventory(uint256 tokenId);
    error TokenNotOwned(uint256 tokenId);
    error InvalidTokenId();
    error TransferFailed();
    error PurchaseAlreadyPending();
    error InvalidAmount();
    error NoPendingRequests();
    error InsufficientAPEReserve(uint256 required, uint256 available);
    error EntropyNotSet();

    // ============ Modifiers ============

    modifier onlyPokeballGameOrOwner() {
        if (msg.sender != pokeballGame && msg.sender != owner()) {
            revert NotAuthorized(msg.sender);
        }
        _;
    }

    modifier onlyPokeballGame() {
        if (msg.sender != pokeballGame) {
            revert NotAuthorized(msg.sender);
        }
        _;
    }

    // ============ Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _owner,
        address _treasury,
        address _usdce,
        address _slabMachine,
        address _slabNFT,
        address _pokeballGame
    ) external initializer {
        if (_owner == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_usdce == address(0)) revert ZeroAddress();
        if (_slabMachine == address(0)) revert ZeroAddress();
        if (_slabNFT == address(0)) revert ZeroAddress();

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        usdce = IERC20(_usdce);
        slabMachine = ISlabMachine(_slabMachine);
        slabNFT = IERC721(_slabNFT);
        treasuryWallet = _treasury;
        pokeballGame = _pokeballGame;
    }

    /**
     * @notice Initialize v2.4.0 features (call once after upgrade from v2.3.x)
     * @param _entropy Pyth Entropy contract address
     */
    function initializeV240(address _entropy) external onlyOwner {
        require(!_v240Initialized, "Already initialized");

        if (_entropy != address(0)) {
            entropy = IEntropyV2(_entropy);
            entropyProvider = entropy.getDefaultProvider();
        }

        _v240Initialized = true;
    }

    // ============ IEntropyConsumer Implementation ============

    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    /**
     * @notice Callback from Pyth Entropy with random number for NFT selection
     * @dev Only used if we need separate randomness (currently reuses PokeballGame's)
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address /* provider */,
        bytes32 randomNumber
    ) internal override {
        address winner = pendingAwards[sequenceNumber];
        if (winner == address(0)) return;

        delete pendingAwards[sequenceNumber];

        if (nftInventory.length == 0) return;

        uint256 randomUint = uint256(randomNumber);
        uint256 inventorySize = nftInventory.length;
        uint256 randomIndex = (randomUint >> 128) % inventorySize;

        uint256 tokenId = nftInventory[randomIndex];
        _removeFromInventoryAtIndex(randomIndex);

        slabNFT.safeTransferFrom(address(this), winner, tokenId);
        totalNFTsAwarded++;

        emit NFTAwardedWithRandomness(winner, tokenId, randomIndex, inventorySize, nftInventory.length);
    }

    // ============ External Functions - Revenue Management ============

    /**
     * @notice Deposit USDC.e revenue into the manager
     * @param amount Amount of USDC.e to deposit (6 decimals)
     */
    function depositRevenue(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();

        usdce.safeTransferFrom(msg.sender, address(this), amount);

        uint256 newBalance = usdce.balanceOf(address(this));

        emit RevenueDeposited(msg.sender, amount, newBalance);
    }

    /**
     * @notice Deposit APE reserve for Entropy fees (v2.4.0)
     * @dev Called by PokeballGame to fund NFT selection randomness
     */
    function depositAPEReserve() external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert InvalidAmount();

        apeReserve += msg.value;
        totalAPEReceived += msg.value;

        emit APEReserveDeposited(msg.sender, msg.value, apeReserve);
    }

    /**
     * @notice Check if auto-purchase conditions are met and execute if so
     * @dev v2.4.0: Now loops until inventory reaches 20 NFTs OR funds depleted
     * @return purchased Whether any purchase was initiated
     * @return requestId The last SlabMachine request ID (0 if no purchase)
     */
    function checkAndPurchaseNFT()
        external
        nonReentrant
        whenNotPaused
        onlyPokeballGameOrOwner
        returns (bool purchased, uint256 requestId)
    {
        uint256 purchaseCount = 0;

        // Loop until inventory full or insufficient funds
        while (true) {
            // Check inventory space
            if (nftInventory.length >= MAX_INVENTORY_SIZE) {
                emit AutoPurchaseSkippedInventoryFull(
                    usdce.balanceOf(address(this)),
                    nftInventory.length,
                    MAX_INVENTORY_SIZE
                );
                break;
            }

            // Check balance
            uint256 balance = usdce.balanceOf(address(this));
            if (balance < AUTO_PURCHASE_THRESHOLD || balance < PULL_PRICE_USDC) {
                break;
            }

            // Execute purchase
            requestId = _executePurchase(PULL_PRICE_USDC);
            purchaseCount++;
            purchased = true;
        }

        if (purchaseCount > 0) {
            emit AutoPurchaseLoopCompleted(
                purchaseCount,
                nftInventory.length,
                usdce.balanceOf(address(this))
            );
        }

        return (purchased, requestId);
    }

    /**
     * @notice Force an NFT purchase if balance allows (owner only)
     * @dev Bypasses the normal threshold check
     */
    function forcePurchaseNFT()
        external
        nonReentrant
        whenNotPaused
        onlyOwner
        returns (uint256 requestId)
    {
        if (nftInventory.length >= MAX_INVENTORY_SIZE) {
            revert InventoryFull(MAX_INVENTORY_SIZE);
        }

        uint256 balance = usdce.balanceOf(address(this));
        if (balance < PULL_PRICE_USDC) {
            revert InsufficientBalance(PULL_PRICE_USDC, balance);
        }

        requestId = _executePurchase(PULL_PRICE_USDC);
        return requestId;
    }

    // ============ External Functions - NFT Management ============

    /**
     * @notice Award an NFT from inventory to a winner (FIFO - deterministic)
     * @dev Legacy function - uses first NFT (FIFO order)
     */
    function awardNFTToWinner(address winner)
        external
        nonReentrant
        whenNotPaused
        onlyPokeballGame
        returns (uint256 tokenId)
    {
        if (winner == address(0)) revert ZeroAddress();
        if (nftInventory.length == 0) revert InventoryEmpty();

        tokenId = nftInventory[0];
        _removeFromInventory(tokenId);

        slabNFT.safeTransferFrom(address(this), winner, tokenId);
        totalNFTsAwarded++;

        emit NFTAwarded(winner, tokenId, nftInventory.length);

        return tokenId;
    }

    /**
     * @notice Award an NFT from inventory using random selection (v2.3.0+)
     * @dev Uses the random number from PokeballGame's Pyth Entropy call
     * @param winner Address to receive the NFT
     * @param randomNumber Random number from Pyth Entropy
     */
    function awardNFTToWinnerWithRandomness(address winner, uint256 randomNumber)
        external
        nonReentrant
        whenNotPaused
        onlyPokeballGame
        returns (uint256 tokenId)
    {
        if (winner == address(0)) revert ZeroAddress();
        uint256 inventorySize = nftInventory.length;
        if (inventorySize == 0) revert InventoryEmpty();

        // O(1) random index selection
        uint256 randomIndex = (randomNumber >> 128) % inventorySize;

        tokenId = nftInventory[randomIndex];
        _removeFromInventoryAtIndex(randomIndex);

        slabNFT.safeTransferFrom(address(this), winner, tokenId);
        totalNFTsAwarded++;

        emit NFTAwardedWithRandomness(
            winner,
            tokenId,
            randomIndex,
            inventorySize,
            nftInventory.length
        );

        return tokenId;
    }

    /**
     * @notice Recover an untracked NFT that was transferred via transferFrom
     */
    function recoverUntrackedNFT(uint256 tokenId) external onlyOwner {
        if (slabNFT.ownerOf(tokenId) != address(this)) {
            revert TokenNotOwned(tokenId);
        }
        if (isInInventory[tokenId]) {
            revert TokenAlreadyInInventory(tokenId);
        }
        if (nftInventory.length >= MAX_INVENTORY_SIZE) {
            revert InventoryFull(MAX_INVENTORY_SIZE);
        }

        _addToInventory(tokenId);

        emit NFTRecovered(tokenId, nftInventory.length);
    }

    /**
     * @notice Recover multiple untracked NFTs in a single transaction
     */
    function batchRecoverUntrackedNFTs(uint256[] calldata tokenIds) external onlyOwner {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];

            if (slabNFT.ownerOf(tokenId) != address(this)) continue;
            if (isInInventory[tokenId]) continue;
            if (nftInventory.length >= MAX_INVENTORY_SIZE) {
                revert InventoryFull(MAX_INVENTORY_SIZE);
            }

            _addToInventory(tokenId);

            emit NFTRecovered(tokenId, nftInventory.length);
        }
    }

    /**
     * @notice Clear a stuck pending request counter
     */
    function clearPendingRequest(uint256 requestId) external onlyOwner {
        if (pendingRequestCount == 0) {
            revert NoPendingRequests();
        }

        if (requestId > 0 && pendingPullRequests[requestId] != address(0)) {
            delete pendingPullRequests[requestId];
        }

        pendingRequestCount--;

        emit PendingRequestCleared(requestId, pendingRequestCount);
    }

    /**
     * @notice Reset pending request count to zero (emergency)
     */
    function resetPendingRequestCount() external onlyOwner {
        pendingRequestCount = 0;
        emit PendingRequestCleared(0, 0);
    }

    // ============ View Functions ============

    function hasNFTAvailable() external view returns (bool) {
        return nftInventory.length > 0;
    }

    function getInventoryCount() external view returns (uint256) {
        return nftInventory.length;
    }

    function getInventory() external view returns (uint256[] memory) {
        return nftInventory;
    }

    function getMaxInventorySize() external pure returns (uint8) {
        return MAX_INVENTORY_SIZE;
    }

    function getPullPrice() external pure returns (uint256) {
        return PULL_PRICE_USDC;
    }

    function getAPEReserve() external view returns (uint256) {
        return apeReserve;
    }

    function getUntrackedNFTs(uint256 startId, uint256 endId)
        external
        view
        returns (uint256[] memory untrackedIds)
    {
        uint256 count = 0;
        for (uint256 tokenId = startId; tokenId < endId; tokenId++) {
            try slabNFT.ownerOf(tokenId) returns (address owner) {
                if (owner == address(this) && !isInInventory[tokenId]) {
                    count++;
                }
            } catch {}
        }

        untrackedIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 tokenId = startId; tokenId < endId; tokenId++) {
            try slabNFT.ownerOf(tokenId) returns (address owner) {
                if (owner == address(this) && !isInInventory[tokenId]) {
                    untrackedIds[index] = tokenId;
                    index++;
                }
            } catch {}
        }

        return untrackedIds;
    }

    function getStats()
        external
        view
        returns (
            uint256 balance,
            uint256 inventorySize,
            uint256 purchased,
            uint256 awarded,
            uint256 spent,
            uint256 pending
        )
    {
        return (
            usdce.balanceOf(address(this)),
            nftInventory.length,
            totalNFTsPurchased,
            totalNFTsAwarded,
            totalUSDCSpent,
            pendingRequestCount
        );
    }

    function canTriggerPurchase()
        external
        view
        returns (bool canPurchase, string memory reason)
    {
        if (nftInventory.length >= MAX_INVENTORY_SIZE) {
            return (false, "Inventory full (max 20)");
        }

        uint256 balance = usdce.balanceOf(address(this));
        if (balance < AUTO_PURCHASE_THRESHOLD) {
            return (false, "Balance below threshold");
        }

        if (balance < PULL_PRICE_USDC) {
            return (false, "Balance below pull price");
        }

        return (true, "Ready to purchase");
    }

    function canAutoPurchase()
        external
        view
        returns (bool canPurchase, uint256 threshold)
    {
        (canPurchase, ) = this.canTriggerPurchase();
        return (canPurchase, AUTO_PURCHASE_THRESHOLD);
    }

    // ============ External Functions - Admin ============

    function setPokeballGame(address _pokeballGame) external onlyOwner {
        address oldAddress = pokeballGame;
        pokeballGame = _pokeballGame;
        emit PokeballGameUpdated(oldAddress, _pokeballGame);
    }

    function setTreasuryWallet(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        address oldAddress = treasuryWallet;
        treasuryWallet = _treasury;
        emit TreasuryWalletUpdated(oldAddress, _treasury);
    }

    function setOwnerWallet(address _newOwner) external onlyOwner {
        if (_newOwner == address(0)) revert ZeroAddress();
        address oldOwner = owner();
        _transferOwnership(_newOwner);
        emit OwnerWalletUpdated(oldOwner, _newOwner);
    }

    function setEntropy(address _entropy) external onlyOwner {
        address oldEntropy = address(entropy);
        if (_entropy != address(0)) {
            entropy = IEntropyV2(_entropy);
            entropyProvider = entropy.getDefaultProvider();
        }
        emit EntropyUpdated(oldEntropy, _entropy);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency withdraw all USDC.e and NFTs to treasury
     */
    function emergencyWithdraw() external onlyOwner whenPaused {
        if (treasuryWallet == address(0)) revert ZeroAddress();

        uint256 usdcBalance = usdce.balanceOf(address(this));
        if (usdcBalance > 0) {
            usdce.safeTransfer(treasuryWallet, usdcBalance);
        }

        uint256 nftCount = nftInventory.length;
        for (uint256 i = nftCount; i > 0; i--) {
            uint256 tokenId = nftInventory[i - 1];
            slabNFT.safeTransferFrom(address(this), treasuryWallet, tokenId);
            _removeFromInventory(tokenId);
        }

        emit EmergencyWithdrawal(treasuryWallet, usdcBalance, nftCount);
    }

    /**
     * @notice Emergency withdraw APE reserve to treasury
     */
    function emergencyWithdrawAPE() external onlyOwner {
        if (treasuryWallet == address(0)) revert ZeroAddress();

        uint256 balance = apeReserve;
        if (balance == 0) revert InsufficientAPEReserve(1, 0);

        apeReserve = 0;

        (bool success, ) = payable(treasuryWallet).call{value: balance}("");
        if (!success) revert TransferFailed();

        emit APEReserveWithdrawn(treasuryWallet, balance, 0);
    }

    /**
     * @notice Emergency withdraw a specific amount of USDC.e revenue
     */
    function emergencyWithdrawRevenue(uint256 amount) external onlyOwner {
        if (treasuryWallet == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        uint256 balance = usdce.balanceOf(address(this));
        if (balance < amount) {
            revert InsufficientBalance(amount, balance);
        }

        usdce.safeTransfer(treasuryWallet, amount);

        uint256 remainingBalance = usdce.balanceOf(address(this));
        emit RevenueWithdrawn(treasuryWallet, amount, remainingBalance);
    }

    /**
     * @notice Emergency withdraw ALL USDC.e revenue
     */
    function emergencyWithdrawAllRevenue() external onlyOwner {
        if (treasuryWallet == address(0)) revert ZeroAddress();

        uint256 balance = usdce.balanceOf(address(this));
        if (balance == 0) {
            revert InsufficientBalance(1, 0);
        }

        usdce.safeTransfer(treasuryWallet, balance);

        emit RevenueWithdrawn(treasuryWallet, balance, 0);
    }

    // ============ Internal Functions ============

    function _attemptNFTPurchase() internal returns (bool purchased, uint256 requestId) {
        if (nftInventory.length >= MAX_INVENTORY_SIZE) {
            emit AutoPurchaseSkippedInventoryFull(
                usdce.balanceOf(address(this)),
                nftInventory.length,
                MAX_INVENTORY_SIZE
            );
            return (false, 0);
        }

        uint256 balance = usdce.balanceOf(address(this));
        if (balance < AUTO_PURCHASE_THRESHOLD || balance < PULL_PRICE_USDC) {
            return (false, 0);
        }

        requestId = _executePurchase(PULL_PRICE_USDC);
        return (true, requestId);
    }

    function _executePurchase(uint256 pullPrice) internal returns (uint256 requestId) {
        usdce.safeIncreaseAllowance(address(slabMachine), pullPrice);

        requestId = slabMachine.pull(1, address(this));

        pendingPullRequests[requestId] = address(this);
        pendingRequestCount++;

        totalNFTsPurchased++;
        totalUSDCSpent += pullPrice;

        emit NFTPurchaseInitiated(requestId, pullPrice, address(this));

        return requestId;
    }

    function _removeFromInventory(uint256 tokenId) internal {
        if (!isInInventory[tokenId]) revert TokenNotInInventory(tokenId);

        uint256 index = tokenIdToIndex[tokenId];
        _removeFromInventoryAtIndex(index);
    }

    function _removeFromInventoryAtIndex(uint256 index) internal {
        uint256 lastIndex = nftInventory.length - 1;
        uint256 tokenId = nftInventory[index];

        if (index != lastIndex) {
            uint256 lastTokenId = nftInventory[lastIndex];
            nftInventory[index] = lastTokenId;
            tokenIdToIndex[lastTokenId] = index;
        }

        nftInventory.pop();

        delete isInInventory[tokenId];
        delete tokenIdToIndex[tokenId];
    }

    function _addToInventory(uint256 tokenId) internal {
        if (nftInventory.length >= MAX_INVENTORY_SIZE) {
            emit InventoryCapacityReached(nftInventory.length, MAX_INVENTORY_SIZE);
            revert InventoryFull(MAX_INVENTORY_SIZE);
        }

        tokenIdToIndex[tokenId] = nftInventory.length;
        nftInventory.push(tokenId);
        isInInventory[tokenId] = true;

        emit NFTReceived(tokenId, nftInventory.length);
    }

    // ============ ERC721 Receiver ============

    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        if (msg.sender == address(slabNFT)) {
            if (nftInventory.length < MAX_INVENTORY_SIZE) {
                _addToInventory(tokenId);
            } else {
                emit InventoryCapacityReached(nftInventory.length, MAX_INVENTORY_SIZE);
            }
        }

        return this.onERC721Received.selector;
    }

    // ============ UUPS Upgrade Authorization ============

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // ============ Storage Gap ============

    uint256[44] private __gap;

    // ============ Receive Function ============

    receive() external payable {
        // Accept APE deposits to reserve
        apeReserve += msg.value;
        totalAPEReceived += msg.value;
        emit APEReserveDeposited(msg.sender, msg.value, apeReserve);
    }
}
