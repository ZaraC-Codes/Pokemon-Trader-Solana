// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title SlabNFTManager
 * @notice Manages NFT inventory and auto-purchasing from SlabMachine for the Pokemon catching game
 * @dev UUPS upgradeable contract that holds NFTs and USDC.e for automated purchases
 * @author Z33Fi ("Z33Fi Made It")
 * @custom:artist-signature Z33Fi Made It
 * @custom:network ApeChain Mainnet (Chain ID: 33139)
 * @custom:version 1.0.0
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

// ============ External Contract Interfaces ============

/**
 * @dev Interface for SlabMachine NFT vending
 * @notice Used for purchasing NFTs when revenue threshold is met
 */
interface ISlabMachine {
    /**
     * @notice Pull NFT(s) from the machine
     * @param _amount Number of NFTs to pull (typically 1)
     * @param _recipient Address to receive the NFT(s)
     * @return requestId_ The ID of the pull request (async operation)
     */
    function pull(uint256 _amount, address _recipient) external returns (uint256 requestId_);

    /**
     * @notice Get machine configuration including pull price
     * @return maxPulls Maximum pulls per transaction
     * @return buybackExpiry Buyback offer expiration time
     * @return buybackPercentage Percentage for buyback calculations
     * @return minBuybackValue Minimum value for buyback
     * @return usdcPullPrice Price in USDC.e to pull one NFT
     */
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
    IERC721Receiver
{
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Maximum NFTs that can be held in inventory
    uint8 public constant MAX_INVENTORY_SIZE = 10;

    /// @notice Minimum balance threshold to trigger auto-purchase ($51 USDC.e)
    uint256 public constant AUTO_PURCHASE_THRESHOLD = 51 * 1e6;

    /// @notice USDC.e decimals
    uint8 public constant USDC_DECIMALS = 6;

    // ============ State Variables ============

    /// @notice USDC.e token contract
    IERC20 public usdce;

    /// @notice SlabMachine contract for NFT purchases
    ISlabMachine public slabMachine;

    /// @notice Slab NFT collection contract
    IERC721 public slabNFT;

    /// @notice Address of the PokeballGame contract (authorized caller)
    address public pokeballGame;

    /// @notice Treasury wallet for emergency withdrawals
    address public treasuryWallet;

    /// @notice Array of NFT token IDs currently held in inventory
    uint256[] public nftInventory;

    /// @notice Mapping to track if a token ID is in inventory (for O(1) lookup)
    mapping(uint256 => bool) public isInInventory;

    /// @notice Mapping to track token ID index in inventory array
    mapping(uint256 => uint256) public tokenIdToIndex;

    /// @notice Total NFTs purchased from SlabMachine
    uint256 public totalNFTsPurchased;

    /// @notice Total NFTs awarded to winners
    uint256 public totalNFTsAwarded;

    /// @notice Total USDC.e spent on NFT purchases
    uint256 public totalUSDCSpent;

    /// @notice Pending pull requests (requestId => recipient)
    mapping(uint256 => address) public pendingPullRequests;

    /// @notice Counter for pending requests
    uint256 public pendingRequestCount;

    // ============ Events ============

    /**
     * @notice Emitted when USDC.e is deposited into the manager
     * @param depositor Address that deposited
     * @param amount Amount deposited in USDC.e (6 decimals)
     * @param newBalance New total balance
     */
    event RevenueDeposited(
        address indexed depositor,
        uint256 amount,
        uint256 newBalance
    );

    /**
     * @notice Emitted when an NFT purchase is initiated
     * @param requestId SlabMachine request ID
     * @param amount USDC.e amount spent
     * @param recipient Address to receive the NFT
     */
    event NFTPurchaseInitiated(
        uint256 indexed requestId,
        uint256 amount,
        address recipient
    );

    /**
     * @notice Emitted when an NFT is received and added to inventory
     * @param tokenId The NFT token ID received
     * @param inventorySize New inventory size
     */
    event NFTReceived(
        uint256 indexed tokenId,
        uint256 inventorySize
    );

    /**
     * @notice Emitted when an NFT is awarded to a winner
     * @param winner Address of the winner
     * @param tokenId The NFT token ID awarded
     * @param remainingInventory Remaining NFTs in inventory
     */
    event NFTAwarded(
        address indexed winner,
        uint256 indexed tokenId,
        uint256 remainingInventory
    );

    /**
     * @notice Emitted when PokeballGame address is updated
     * @param oldAddress Previous PokeballGame address
     * @param newAddress New PokeballGame address
     */
    event PokeballGameUpdated(
        address oldAddress,
        address newAddress
    );

    /**
     * @notice Emitted when treasury wallet is updated
     * @param oldAddress Previous treasury address
     * @param newAddress New treasury address
     */
    event TreasuryWalletUpdated(
        address oldAddress,
        address newAddress
    );

    /**
     * @notice Emitted when emergency withdrawal occurs
     * @param recipient Address receiving the funds
     * @param usdcAmount USDC.e amount withdrawn
     * @param nftCount Number of NFTs withdrawn
     */
    event EmergencyWithdrawal(
        address indexed recipient,
        uint256 usdcAmount,
        uint256 nftCount
    );

    // ============ Errors ============

    error ZeroAddress();
    error NotAuthorized(address caller);
    error InventoryFull(uint8 maxSize);
    error InventoryEmpty();
    error InsufficientBalance(uint256 required, uint256 available);
    error BelowPurchaseThreshold(uint256 balance, uint256 threshold);
    error TokenNotInInventory(uint256 tokenId);
    error InvalidTokenId();
    error TransferFailed();
    error PurchaseAlreadyPending();
    error InvalidAmount();

    // ============ Modifiers ============

    /**
     * @dev Restricts function to PokeballGame contract or owner
     */
    modifier onlyPokeballGameOrOwner() {
        if (msg.sender != pokeballGame && msg.sender != owner()) {
            revert NotAuthorized(msg.sender);
        }
        _;
    }

    /**
     * @dev Restricts function to PokeballGame contract only
     */
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

    /**
     * @notice Initialize the contract (replaces constructor for UUPS)
     * @param _owner Owner wallet address
     * @param _treasury Treasury wallet for emergency withdrawals
     * @param _usdce USDC.e token address
     * @param _slabMachine SlabMachine contract address
     * @param _slabNFT Slab NFT collection address
     * @param _pokeballGame PokeballGame contract address (can be zero initially)
     */
    function initialize(
        address _owner,
        address _treasury,
        address _usdce,
        address _slabMachine,
        address _slabNFT,
        address _pokeballGame
    ) external initializer {
        // Validate required addresses
        if (_owner == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_usdce == address(0)) revert ZeroAddress();
        if (_slabMachine == address(0)) revert ZeroAddress();
        if (_slabNFT == address(0)) revert ZeroAddress();
        // _pokeballGame can be zero initially, set later

        // Initialize inherited contracts
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        // Set external contracts
        usdce = IERC20(_usdce);
        slabMachine = ISlabMachine(_slabMachine);
        slabNFT = IERC721(_slabNFT);

        // Set wallets
        treasuryWallet = _treasury;
        pokeballGame = _pokeballGame;
    }

    // ============ External Functions - Revenue Management ============

    /**
     * @notice Deposit USDC.e revenue into the manager
     * @dev Can be called by anyone (typically PokeballGame)
     * @param amount Amount of USDC.e to deposit (6 decimals)
     */
    function depositRevenue(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();

        // Transfer USDC.e from sender to this contract
        usdce.safeTransferFrom(msg.sender, address(this), amount);

        uint256 newBalance = usdce.balanceOf(address(this));

        emit RevenueDeposited(msg.sender, amount, newBalance);
    }

    /**
     * @notice Check if auto-purchase conditions are met and execute if so
     * @dev Can be called by PokeballGame or owner to trigger NFT purchase
     * @return purchased Whether a purchase was initiated
     * @return requestId The SlabMachine request ID (0 if no purchase)
     */
    function checkAndPurchaseNFT()
        external
        nonReentrant
        whenNotPaused
        onlyPokeballGameOrOwner
        returns (bool purchased, uint256 requestId)
    {
        return _attemptNFTPurchase();
    }

    /**
     * @notice Force an NFT purchase if balance allows (owner only)
     * @dev Bypasses the normal threshold check, useful for testing
     * @return requestId The SlabMachine request ID
     */
    function forcePurchaseNFT()
        external
        nonReentrant
        whenNotPaused
        onlyOwner
        returns (uint256 requestId)
    {
        // Check inventory space
        if (nftInventory.length >= MAX_INVENTORY_SIZE) {
            revert InventoryFull(MAX_INVENTORY_SIZE);
        }

        // Get pull price from SlabMachine
        (, , , , uint256 pullPrice) = slabMachine.machineConfig();

        uint256 balance = usdce.balanceOf(address(this));
        if (balance < pullPrice) {
            revert InsufficientBalance(pullPrice, balance);
        }

        // Execute purchase
        requestId = _executePurchase(pullPrice);
        return requestId;
    }

    // ============ External Functions - Winner Payout ============

    /**
     * @notice Award an NFT from inventory to a winner
     * @dev Only callable by PokeballGame contract
     * @param winner Address to receive the NFT
     * @return tokenId The token ID awarded (0 if inventory empty)
     */
    function awardNFTToWinner(address winner)
        external
        nonReentrant
        whenNotPaused
        onlyPokeballGame
        returns (uint256 tokenId)
    {
        if (winner == address(0)) revert ZeroAddress();

        // Check inventory
        if (nftInventory.length == 0) {
            // No NFT available - return 0, caller should handle this
            return 0;
        }

        // Get the last NFT in inventory (most recently added, LIFO)
        tokenId = nftInventory[nftInventory.length - 1];

        // Remove from inventory tracking
        _removeFromInventory(tokenId);

        // Transfer NFT to winner
        slabNFT.safeTransferFrom(address(this), winner, tokenId);

        // Update stats
        totalNFTsAwarded++;

        emit NFTAwarded(winner, tokenId, nftInventory.length);

        return tokenId;
    }

    /**
     * @notice Award a specific NFT from inventory to a winner
     * @dev Only callable by PokeballGame contract
     * @param winner Address to receive the NFT
     * @param tokenId Specific token ID to award
     * @return success Whether the transfer succeeded
     */
    function awardSpecificNFT(address winner, uint256 tokenId)
        external
        nonReentrant
        whenNotPaused
        onlyPokeballGame
        returns (bool success)
    {
        if (winner == address(0)) revert ZeroAddress();
        if (!isInInventory[tokenId]) revert TokenNotInInventory(tokenId);

        // Remove from inventory tracking
        _removeFromInventory(tokenId);

        // Transfer NFT to winner
        slabNFT.safeTransferFrom(address(this), winner, tokenId);

        // Update stats
        totalNFTsAwarded++;

        emit NFTAwarded(winner, tokenId, nftInventory.length);

        return true;
    }

    // ============ External Functions - Admin ============

    /**
     * @notice Set the PokeballGame contract address
     * @dev Only callable by owner
     * @param _pokeballGame New PokeballGame address
     */
    function setPokeballGame(address _pokeballGame) external onlyOwner {
        if (_pokeballGame == address(0)) revert ZeroAddress();

        address oldAddress = pokeballGame;
        pokeballGame = _pokeballGame;

        emit PokeballGameUpdated(oldAddress, _pokeballGame);
    }

    /**
     * @notice Update the treasury wallet address
     * @dev Only callable by owner
     * @param _treasury New treasury wallet address
     */
    function setTreasuryWallet(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();

        address oldAddress = treasuryWallet;
        treasuryWallet = _treasury;

        emit TreasuryWalletUpdated(oldAddress, _treasury);
    }

    /**
     * @notice Emergency withdrawal of all assets to treasury
     * @dev Only callable by owner, sends all USDC.e and NFTs to treasury
     */
    function emergencyWithdraw() external onlyOwner nonReentrant {
        uint256 usdcBalance = usdce.balanceOf(address(this));
        uint256 nftCount = nftInventory.length;

        // Transfer all USDC.e
        if (usdcBalance > 0) {
            usdce.safeTransfer(treasuryWallet, usdcBalance);
        }

        // Transfer all NFTs
        for (uint256 i = 0; i < nftCount; i++) {
            uint256 tokenId = nftInventory[i];
            slabNFT.safeTransferFrom(address(this), treasuryWallet, tokenId);
            isInInventory[tokenId] = false;
        }

        // Clear inventory array
        delete nftInventory;

        emit EmergencyWithdrawal(treasuryWallet, usdcBalance, nftCount);
    }

    /**
     * @notice Pause the contract
     * @dev Only callable by owner
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @dev Only callable by owner
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ External View Functions ============

    /**
     * @notice Get current USDC.e balance held by this contract
     * @return balance Current balance in USDC.e (6 decimals)
     */
    function getUSDCBalance() external view returns (uint256 balance) {
        return usdce.balanceOf(address(this));
    }

    /**
     * @notice Get current NFT inventory count
     * @return count Number of NFTs in inventory
     */
    function getInventoryCount() external view returns (uint256 count) {
        return nftInventory.length;
    }

    /**
     * @notice Get all NFT token IDs in inventory
     * @return tokenIds Array of token IDs
     */
    function getInventory() external view returns (uint256[] memory tokenIds) {
        return nftInventory;
    }

    /**
     * @notice Check if inventory has space for more NFTs
     * @return hasSpace True if inventory is not full
     * @return availableSlots Number of available slots
     */
    function hasInventorySpace() external view returns (bool hasSpace, uint8 availableSlots) {
        uint256 currentSize = nftInventory.length;
        hasSpace = currentSize < MAX_INVENTORY_SIZE;
        availableSlots = hasSpace ? uint8(MAX_INVENTORY_SIZE - currentSize) : 0;
    }

    /**
     * @notice Check if auto-purchase conditions are currently met
     * @return canPurchase True if purchase can be triggered
     * @return currentBalance Current USDC.e balance
     * @return threshold Required threshold
     * @return pullPrice Current SlabMachine pull price
     */
    function canAutoPurchase() external view returns (
        bool canPurchase,
        uint256 currentBalance,
        uint256 threshold,
        uint256 pullPrice
    ) {
        currentBalance = usdce.balanceOf(address(this));
        threshold = AUTO_PURCHASE_THRESHOLD;
        (, , , , pullPrice) = slabMachine.machineConfig();

        canPurchase = (
            currentBalance >= threshold &&
            currentBalance >= pullPrice &&
            nftInventory.length < MAX_INVENTORY_SIZE
        );
    }

    /**
     * @notice Get contract statistics
     * @return nftsPurchased Total NFTs purchased from SlabMachine
     * @return nftsAwarded Total NFTs awarded to winners
     * @return usdcSpent Total USDC.e spent on purchases
     * @return currentInventory Current inventory count
     * @return currentBalance Current USDC.e balance
     */
    function getStats() external view returns (
        uint256 nftsPurchased,
        uint256 nftsAwarded,
        uint256 usdcSpent,
        uint256 currentInventory,
        uint256 currentBalance
    ) {
        return (
            totalNFTsPurchased,
            totalNFTsAwarded,
            totalUSDCSpent,
            nftInventory.length,
            usdce.balanceOf(address(this))
        );
    }

    /**
     * @notice Check if a specific token ID is in inventory
     * @param tokenId Token ID to check
     * @return inInventory True if token is in inventory
     */
    function isTokenInInventory(uint256 tokenId) external view returns (bool inInventory) {
        return isInInventory[tokenId];
    }

    // ============ Internal Functions ============

    /**
     * @dev Attempt to purchase an NFT if conditions are met
     * @return purchased Whether a purchase was initiated
     * @return requestId The SlabMachine request ID
     */
    function _attemptNFTPurchase() internal returns (bool purchased, uint256 requestId) {
        // Check inventory space
        if (nftInventory.length >= MAX_INVENTORY_SIZE) {
            return (false, 0);
        }

        // Get pull price from SlabMachine
        (, , , , uint256 pullPrice) = slabMachine.machineConfig();

        // Check balance against threshold AND pull price
        uint256 balance = usdce.balanceOf(address(this));
        if (balance < AUTO_PURCHASE_THRESHOLD || balance < pullPrice) {
            return (false, 0);
        }

        // Execute purchase
        requestId = _executePurchase(pullPrice);
        return (true, requestId);
    }

    /**
     * @dev Execute the actual NFT purchase from SlabMachine
     * @param pullPrice The price to pay for the NFT
     * @return requestId The SlabMachine request ID
     */
    function _executePurchase(uint256 pullPrice) internal returns (uint256 requestId) {
        // Approve SlabMachine to spend USDC.e
        usdce.safeIncreaseAllowance(address(slabMachine), pullPrice);

        // Pull 1 NFT, recipient is this contract
        // Note: pull(_amount, _recipient) where _amount is number of NFTs, not price
        requestId = slabMachine.pull(1, address(this));

        // Track pending request
        pendingPullRequests[requestId] = address(this);
        pendingRequestCount++;

        // Update stats
        totalNFTsPurchased++;
        totalUSDCSpent += pullPrice;

        emit NFTPurchaseInitiated(requestId, pullPrice, address(this));

        return requestId;
    }

    /**
     * @dev Remove a token from inventory tracking
     * @param tokenId Token ID to remove
     */
    function _removeFromInventory(uint256 tokenId) internal {
        if (!isInInventory[tokenId]) revert TokenNotInInventory(tokenId);

        uint256 index = tokenIdToIndex[tokenId];
        uint256 lastIndex = nftInventory.length - 1;

        // If not the last element, swap with last
        if (index != lastIndex) {
            uint256 lastTokenId = nftInventory[lastIndex];
            nftInventory[index] = lastTokenId;
            tokenIdToIndex[lastTokenId] = index;
        }

        // Remove last element
        nftInventory.pop();

        // Clear mappings
        delete isInInventory[tokenId];
        delete tokenIdToIndex[tokenId];
    }

    /**
     * @dev Add a token to inventory tracking
     * @param tokenId Token ID to add
     */
    function _addToInventory(uint256 tokenId) internal {
        if (nftInventory.length >= MAX_INVENTORY_SIZE) {
            revert InventoryFull(MAX_INVENTORY_SIZE);
        }

        // Add to array
        tokenIdToIndex[tokenId] = nftInventory.length;
        nftInventory.push(tokenId);
        isInInventory[tokenId] = true;

        emit NFTReceived(tokenId, nftInventory.length);
    }

    // ============ ERC721 Receiver ============

    /**
     * @notice Handle receiving ERC721 NFTs
     * @dev Required for safeTransferFrom to this contract
     * @param tokenId The NFT token ID being received
     * @return bytes4 The function selector to confirm receipt
     */
    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        // Only accept NFTs from Slab NFT contract
        if (msg.sender == address(slabNFT)) {
            // Only add to inventory if we have space
            if (nftInventory.length < MAX_INVENTORY_SIZE) {
                _addToInventory(tokenId);
            }
            // If inventory full, still accept but don't track
            // (shouldn't happen with proper checks)
        }
        // Accept NFTs from other sources (owner deposits) but don't auto-track

        return this.onERC721Received.selector;
    }

    // ============ UUPS Upgrade Authorization ============

    /**
     * @dev Authorize contract upgrades
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // ============ Storage Gap ============

    /**
     * @dev Reserved storage gap for future upgrades
     * @notice Allows adding new state variables without breaking storage layout
     */
    uint256[50] private __gap;
}
