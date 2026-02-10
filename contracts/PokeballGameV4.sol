// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title PokeballGame
 * @notice Pokemon catching mini-game on ApeChain with provably fair randomness
 * @dev UUPS upgradeable contract integrating POP VRNG for fair catch mechanics
 * @author Z33Fi ("Z33Fi Made It")
 * @custom:artist-signature Z33Fi Made It
 * @custom:network ApeChain Mainnet (Chain ID: 33139)
 * @custom:version 1.4.2
 *
 * CHANGELOG v1.4.2:
 * - FIX: Division by zero in calculateAPEAmount() when apePriceUSD is 0
 * - Default to $0.64 APE price (64000000 in 8 decimals) if not set
 *
 * CHANGELOG v1.4.1:
 * - FIX: Fee calculation now based on requiredAPE, not msg.value
 * - Users pay exact ball price, fees are split internally (3% treasury, 97% NFT pool)
 * - No markup on user payments - ball price IS the total amount deducted
 *
 * CHANGELOG v1.4.0:
 * - APE payments now use native APE via msg.value (like ETH on Ethereum)
 * - Removed ERC-20 APE token approach - no more approve() needed for APE
 * - purchaseBallsWithAPE() is now payable and accepts native APE
 * - purchaseBallsWithUSDC() for USDC.e payments (unchanged)
 * - Legacy purchaseBalls() removed - use specific functions instead
 * - Added withdrawAPE() for owner to withdraw accumulated native APE
 * - Storage layout compatible with v1.3.x (IERC20 ape slot preserved but unused)
 */

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

// ============ External Contract Interfaces ============

/**
 * @dev Interface for POP VRNG (Verifiable Random Number Generator)
 * @notice Used for provably fair catch mechanics
 */
interface IPOPVRNG {
    function requestRandomNumberWithTraceId(uint256 traceId) external returns (uint256 requestId);
}

/**
 * @dev Interface for SlabNFTManager
 * @notice Manages NFT inventory and auto-purchasing from SlabMachine
 */
interface ISlabNFTManager {
    function awardNFTToWinner(address winner) external returns (uint256 tokenId);
    function checkAndPurchaseNFT() external returns (bool purchased, uint256 requestId);
    function getInventoryCount() external view returns (uint256 count);
    function depositRevenue(uint256 amount) external;
}

// ============ Main Contract ============

contract PokeballGame is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    // ============ Type Declarations ============

    enum BallType {
        PokeBall,    // Default $1.00,  2% catch rate
        GreatBall,   // Default $10.00, 20% catch rate
        UltraBall,   // Default $25.00, 50% catch rate
        MasterBall   // Default $49.90, 99% catch rate
    }

    struct Pokemon {
        uint256 id;
        uint256 positionX;
        uint256 positionY;
        uint8 throwAttempts;
        bool isActive;
        uint256 spawnTime;
    }

    struct PendingThrow {
        address thrower;
        uint256 pokemonId;
        BallType ballType;
        uint256 timestamp;
        bool resolved;
    }

    // ============ Constants ============

    uint8 public constant MAX_ACTIVE_POKEMON = 20;
    uint8 public constant MAX_THROW_ATTEMPTS = 3;
    uint256 public constant PLATFORM_FEE_BPS = 300;
    uint256 public constant REVENUE_POOL_BPS = 9700;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint8 public constant USDC_DECIMALS = 6;
    uint8 public constant APE_DECIMALS = 18;
    uint256 public constant MAX_COORDINATE = 999;
    uint256 public constant MAX_PURCHASE_USD = 4990 * 1e4; // $49.90

    // ============ State Variables ============
    // IMPORTANT: Storage layout must remain compatible with v1.3.x
    // Do NOT reorder or remove any existing state variables

    IERC20 public usdce;
    IERC20 public ape; // DEPRECATED: Kept for storage compatibility, no longer used
    IPOPVRNG public vrng;
    IERC721 public slabNFT;

    address public treasuryWallet;
    address public nftRevenueWallet;

    uint256 public totalRevenuePool;
    uint256 public totalPlatformFees;
    uint256 public totalNFTsPurchased;

    mapping(address => mapping(BallType => uint256)) public playerBalls;

    Pokemon[20] public activePokemons;
    uint256 public nextPokemonId;

    mapping(uint256 => PendingThrow) public pendingThrows;
    mapping(uint256 => uint256) public requestIdToTraceId;

    uint256 private _traceIdCounter;

    // APE price in USD (8 decimals, e.g., 1.50 USD = 150000000)
    uint256 public apePriceUSD;

    // v1.1.0
    ISlabNFTManager public slabNFTManager;

    // v1.3.0
    mapping(BallType => uint256) public ballPrices;
    mapping(BallType => uint8) public ballCatchRates;
    bool public revertOnNoNFT;
    bool private _v130Initialized;

    // v1.4.0 - Track accumulated native APE for platform fees
    uint256 public accumulatedAPEFees;

    // ============ Events ============

    event BallPurchased(
        address indexed buyer,
        uint8 ballType,
        uint256 quantity,
        bool usedAPE,
        uint256 totalAmount
    );

    event ThrowAttempted(
        address indexed thrower,
        uint256 pokemonId,
        uint8 ballTier,
        uint256 requestId
    );

    event RandomnessReceived(
        uint256 indexed requestId,
        uint256 randomNumber,
        bool isSpawnRequest
    );

    event CaughtPokemon(
        address indexed catcher,
        uint256 pokemonId,
        uint256 nftTokenId
    );

    event FailedCatch(
        address indexed thrower,
        uint256 pokemonId,
        uint8 attemptsRemaining
    );

    event PokemonRelocated(
        uint256 pokemonId,
        uint256 newX,
        uint256 newY
    );

    event WalletUpdated(
        string walletType,
        address oldAddress,
        address newAddress
    );

    event RevenueSentToManager(uint256 amount);

    event PokemonSpawned(
        uint256 pokemonId,
        uint256 positionX,
        uint256 positionY,
        uint8 slotIndex
    );

    event APEPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event FeesWithdrawn(address recipient, uint256 amount);
    event APEFeesWithdrawn(address recipient, uint256 amount);
    event BallPriceUpdated(uint8 indexed ballType, uint256 oldPrice, uint256 newPrice);
    event CatchRateUpdated(uint8 indexed ballType, uint8 oldRate, uint8 newRate);

    // ============ Errors ============

    error InvalidBallType(uint8 provided);
    error InsufficientBalls(BallType ballType, uint256 required, uint256 available);
    error PokemonNotActive(uint256 pokemonId);
    error InvalidPokemonSlot(uint8 slot);
    error ZeroQuantity();
    error ZeroAddress();
    error InsufficientAllowance(address token, uint256 required, uint256 available);
    error InsufficientBalance(address token, uint256 required, uint256 available);
    error InsufficientAPESent(uint256 required, uint256 sent);
    error ThrowAlreadyResolved(uint256 requestId);
    error ThrowNotFound(uint256 requestId);
    error UnauthorizedCallback(address caller);
    error InvalidPrice();
    error TransferFailed();
    error NoFeesToWithdraw();
    error SlotOccupied(uint8 slot);
    error SlabNFTManagerNotSet();
    error PurchaseExceedsMaximum(uint256 requested, uint256 maximum);
    error NoNFTAvailable();
    error InvalidCatchRate(uint8 rate);
    error APETransferFailed();

    // ============ Modifiers ============

    modifier onlyVRNG() {
        if (msg.sender != address(vrng)) {
            revert UnauthorizedCallback(msg.sender);
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
        address _nftRevenue,
        address _usdce,
        address _ape, // Kept for compatibility but not used
        address _vrng,
        address _slabNFT,
        uint256 _initialAPEPrice
    ) external initializer {
        if (_owner == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_nftRevenue == address(0)) revert ZeroAddress();
        if (_usdce == address(0)) revert ZeroAddress();
        if (_vrng == address(0)) revert ZeroAddress();
        if (_slabNFT == address(0)) revert ZeroAddress();
        if (_initialAPEPrice == 0) revert InvalidPrice();

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        usdce = IERC20(_usdce);
        ape = IERC20(_ape); // Stored for compatibility but not used
        vrng = IPOPVRNG(_vrng);
        slabNFT = IERC721(_slabNFT);

        treasuryWallet = _treasury;
        nftRevenueWallet = _nftRevenue;
        apePriceUSD = _initialAPEPrice;
        nextPokemonId = 1;
        _traceIdCounter = 1;

        _initializeDefaultPricing();
    }

    function initializeV130() external onlyOwner {
        require(!_v130Initialized, "V1.3.0 already initialized");
        _initializeDefaultPricing();
        _v130Initialized = true;
    }

    function _initializeDefaultPricing() internal {
        ballPrices[BallType.PokeBall] = 1 * 1e6;
        ballPrices[BallType.GreatBall] = 10 * 1e6;
        ballPrices[BallType.UltraBall] = 25 * 1e6;
        ballPrices[BallType.MasterBall] = 4990 * 1e4;

        ballCatchRates[BallType.PokeBall] = 2;
        ballCatchRates[BallType.GreatBall] = 20;
        ballCatchRates[BallType.UltraBall] = 50;
        ballCatchRates[BallType.MasterBall] = 99;

        revertOnNoNFT = false;
    }

    // ============ External Functions - Ball Purchase ============

    /**
     * @notice Purchase balls using native APE (sent via msg.value)
     * @dev No approve() needed - just send APE with the transaction
     *      User pays exact ball price. Fees are split internally:
     *      - 3% (PLATFORM_FEE_BPS) goes to treasury
     *      - 97% (REVENUE_POOL_BPS) goes to NFT pool
     * @param ballType Type of ball to purchase (0-3)
     * @param quantity Number of balls to purchase
     */
    function purchaseBallsWithAPE(
        uint8 ballType,
        uint256 quantity
    ) external payable nonReentrant whenNotPaused {
        if (quantity == 0) revert ZeroQuantity();
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);

        BallType ball = BallType(ballType);
        uint256 pricePerBallUSDC = getBallPrice(ball);
        uint256 totalCostUSDC = pricePerBallUSDC * quantity;

        // Enforce $49.90 maximum per transaction
        if (totalCostUSDC > MAX_PURCHASE_USD) {
            revert PurchaseExceedsMaximum(totalCostUSDC, MAX_PURCHASE_USD);
        }

        // Calculate required APE amount (exact amount user should pay)
        uint256 requiredAPE = calculateAPEAmount(totalCostUSDC);

        // Verify sufficient APE was sent
        if (msg.value < requiredAPE) {
            revert InsufficientAPESent(requiredAPE, msg.value);
        }

        // Calculate fee split from the REQUIRED amount (not msg.value)
        // User pays exactly requiredAPE, which is split internally:
        // - 3% to treasury (platform fee)
        // - 97% to NFT pool (revenue)
        uint256 platformFeeUSDC = (totalCostUSDC * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 platformFeeAPE = (requiredAPE * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;

        // Track platform fee in both USDC equivalent and APE
        totalPlatformFees += platformFeeUSDC;
        accumulatedAPEFees += platformFeeAPE;

        // Refund excess APE if any (e.g., if user sent more than required)
        uint256 excess = msg.value - requiredAPE;
        if (excess > 0) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: excess}("");
            if (!refundSuccess) revert APETransferFailed();
        }

        // Credit balls to player
        playerBalls[msg.sender][ball] += quantity;

        emit BallPurchased(msg.sender, ballType, quantity, true, requiredAPE);
    }

    /**
     * @notice Purchase balls using USDC.e (requires prior approve())
     * @dev 97% goes to SlabNFTManager for NFT purchases, 3% to platform fees
     * @param ballType Type of ball to purchase (0-3)
     * @param quantity Number of balls to purchase
     */
    function purchaseBallsWithUSDC(
        uint8 ballType,
        uint256 quantity
    ) external nonReentrant whenNotPaused {
        if (quantity == 0) revert ZeroQuantity();
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);

        BallType ball = BallType(ballType);
        uint256 pricePerBallUSDC = getBallPrice(ball);
        uint256 totalCostUSDC = pricePerBallUSDC * quantity;

        // Enforce $49.90 maximum per transaction
        if (totalCostUSDC > MAX_PURCHASE_USD) {
            revert PurchaseExceedsMaximum(totalCostUSDC, MAX_PURCHASE_USD);
        }

        _processUSDCPayment(totalCostUSDC);

        // Credit balls to player
        playerBalls[msg.sender][ball] += quantity;

        emit BallPurchased(msg.sender, ballType, quantity, false, totalCostUSDC);
    }

    /**
     * @notice Legacy function - redirects to appropriate payment method
     * @dev DEPRECATED: Use purchaseBallsWithAPE() or purchaseBallsWithUSDC() instead
     *      User pays exact ball price. Fees are split internally (no markup).
     * @param ballType Type of ball to purchase (0-3)
     * @param quantity Number of balls to purchase
     * @param useAPE If true, must call purchaseBallsWithAPE() with msg.value instead
     */
    function purchaseBalls(
        uint8 ballType,
        uint256 quantity,
        bool useAPE
    ) external payable nonReentrant whenNotPaused {
        if (useAPE) {
            // For APE, redirect to the payable function
            // This maintains backwards compatibility for callers who send value
            if (quantity == 0) revert ZeroQuantity();
            if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);

            BallType ball = BallType(ballType);
            uint256 pricePerBallUSDC = getBallPrice(ball);
            uint256 totalCostUSDC = pricePerBallUSDC * quantity;

            if (totalCostUSDC > MAX_PURCHASE_USD) {
                revert PurchaseExceedsMaximum(totalCostUSDC, MAX_PURCHASE_USD);
            }

            // Calculate exact required APE amount
            uint256 requiredAPE = calculateAPEAmount(totalCostUSDC);

            if (msg.value < requiredAPE) {
                revert InsufficientAPESent(requiredAPE, msg.value);
            }

            // Calculate fee split from REQUIRED amount (not msg.value)
            // User pays exactly requiredAPE, which is split internally
            uint256 platformFeeUSDC = (totalCostUSDC * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            uint256 platformFeeAPE = (requiredAPE * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;

            totalPlatformFees += platformFeeUSDC;
            accumulatedAPEFees += platformFeeAPE;

            // Refund excess
            uint256 excess = msg.value - requiredAPE;
            if (excess > 0) {
                (bool refundSuccess, ) = payable(msg.sender).call{value: excess}("");
                if (!refundSuccess) revert APETransferFailed();
            }

            playerBalls[msg.sender][ball] += quantity;
            emit BallPurchased(msg.sender, ballType, quantity, true, requiredAPE);
        } else {
            // For USDC, use the existing logic
            if (quantity == 0) revert ZeroQuantity();
            if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);

            BallType ball = BallType(ballType);
            uint256 pricePerBallUSDC = getBallPrice(ball);
            uint256 totalCostUSDC = pricePerBallUSDC * quantity;

            if (totalCostUSDC > MAX_PURCHASE_USD) {
                revert PurchaseExceedsMaximum(totalCostUSDC, MAX_PURCHASE_USD);
            }

            _processUSDCPayment(totalCostUSDC);
            playerBalls[msg.sender][ball] += quantity;
            emit BallPurchased(msg.sender, ballType, quantity, false, totalCostUSDC);
        }
    }

    // ============ External Functions - Game Mechanics ============

    function throwBall(
        uint8 pokemonSlot,
        uint8 ballType
    ) external nonReentrant whenNotPaused returns (uint256 requestId) {
        if (pokemonSlot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(pokemonSlot);
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);

        Pokemon storage pokemon = activePokemons[pokemonSlot];
        if (!pokemon.isActive) revert PokemonNotActive(pokemon.id);

        BallType ball = BallType(ballType);

        if (playerBalls[msg.sender][ball] == 0) {
            revert InsufficientBalls(ball, 1, 0);
        }
        playerBalls[msg.sender][ball] -= 1;

        uint256 traceId = _generateTraceId(msg.sender, pokemon.id, ballType);
        requestId = vrng.requestRandomNumberWithTraceId(traceId);

        pendingThrows[requestId] = PendingThrow({
            thrower: msg.sender,
            pokemonId: pokemon.id,
            ballType: ball,
            timestamp: block.timestamp,
            resolved: false
        });

        requestIdToTraceId[requestId] = traceId;

        emit ThrowAttempted(msg.sender, pokemon.id, ballType, requestId);
        return requestId;
    }

    function randomNumberCallback(
        uint256 requestId,
        uint256 randomNumber
    ) external onlyVRNG {
        PendingThrow storage pendingThrow = pendingThrows[requestId];

        if (pendingThrow.thrower == address(0)) revert ThrowNotFound(requestId);
        if (pendingThrow.resolved) revert ThrowAlreadyResolved(requestId);

        pendingThrow.resolved = true;

        bool isSpawnRequest = pendingThrow.thrower == address(this);
        emit RandomnessReceived(requestId, randomNumber, isSpawnRequest);

        if (isSpawnRequest) {
            _handleSpawnCallback(pendingThrow, randomNumber);
            return;
        }

        _handleThrowCallback(pendingThrow, randomNumber);
    }

    // ============ External Functions - Pokemon Management ============

    function spawnPokemon(uint8 slot) external onlyOwner {
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);
        if (activePokemons[slot].isActive) revert SlotOccupied(slot);

        uint256 pokemonId = nextPokemonId++;
        uint256 traceId = _generateTraceId(address(this), pokemonId, 255);
        uint256 requestId = vrng.requestRandomNumberWithTraceId(traceId);

        pendingThrows[requestId] = PendingThrow({
            thrower: address(this),
            pokemonId: pokemonId,
            ballType: BallType(slot),
            timestamp: block.timestamp,
            resolved: false
        });

        requestIdToTraceId[requestId] = traceId;
    }

    function forceSpawnPokemon(uint8 slot, uint256 posX, uint256 posY) external onlyOwner {
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);
        if (activePokemons[slot].isActive) revert SlotOccupied(slot);

        uint256 pokemonId = nextPokemonId++;

        activePokemons[slot] = Pokemon({
            id: pokemonId,
            positionX: posX % (MAX_COORDINATE + 1),
            positionY: posY % (MAX_COORDINATE + 1),
            throwAttempts: 0,
            isActive: true,
            spawnTime: block.timestamp
        });

        emit PokemonSpawned(pokemonId, posX % (MAX_COORDINATE + 1), posY % (MAX_COORDINATE + 1), slot);
    }

    function despawnPokemon(uint8 slot) external onlyOwner {
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);
        activePokemons[slot].isActive = false;
    }

    // ============ External Functions - Pricing Management ============

    function setBallPrice(uint8 ballType, uint256 newPrice) external onlyOwner {
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);
        if (newPrice == 0) revert InvalidPrice();
        if (newPrice > MAX_PURCHASE_USD) revert PurchaseExceedsMaximum(newPrice, MAX_PURCHASE_USD);

        BallType ball = BallType(ballType);
        uint256 oldPrice = ballPrices[ball];
        ballPrices[ball] = newPrice;

        emit BallPriceUpdated(ballType, oldPrice, newPrice);
    }

    function setCatchRate(uint8 ballType, uint8 newRate) external onlyOwner {
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);
        if (newRate > 100) revert InvalidCatchRate(newRate);

        BallType ball = BallType(ballType);
        uint8 oldRate = ballCatchRates[ball];
        ballCatchRates[ball] = newRate;

        emit CatchRateUpdated(ballType, oldRate, newRate);
    }

    function setPricingConfig(
        uint256 pokeBallPrice,
        uint256 greatBallPrice,
        uint256 ultraBallPrice,
        uint256 masterBallPrice
    ) external onlyOwner {
        if (pokeBallPrice == 0 || greatBallPrice == 0 ||
            ultraBallPrice == 0 || masterBallPrice == 0) revert InvalidPrice();

        if (pokeBallPrice > MAX_PURCHASE_USD) revert PurchaseExceedsMaximum(pokeBallPrice, MAX_PURCHASE_USD);
        if (greatBallPrice > MAX_PURCHASE_USD) revert PurchaseExceedsMaximum(greatBallPrice, MAX_PURCHASE_USD);
        if (ultraBallPrice > MAX_PURCHASE_USD) revert PurchaseExceedsMaximum(ultraBallPrice, MAX_PURCHASE_USD);
        if (masterBallPrice > MAX_PURCHASE_USD) revert PurchaseExceedsMaximum(masterBallPrice, MAX_PURCHASE_USD);

        emit BallPriceUpdated(0, ballPrices[BallType.PokeBall], pokeBallPrice);
        emit BallPriceUpdated(1, ballPrices[BallType.GreatBall], greatBallPrice);
        emit BallPriceUpdated(2, ballPrices[BallType.UltraBall], ultraBallPrice);
        emit BallPriceUpdated(3, ballPrices[BallType.MasterBall], masterBallPrice);

        ballPrices[BallType.PokeBall] = pokeBallPrice;
        ballPrices[BallType.GreatBall] = greatBallPrice;
        ballPrices[BallType.UltraBall] = ultraBallPrice;
        ballPrices[BallType.MasterBall] = masterBallPrice;
    }

    function setRevertOnNoNFT(bool _revertOnNoNFT) external onlyOwner {
        revertOnNoNFT = _revertOnNoNFT;
    }

    // ============ External Functions - Wallet Management ============

    function setSlabNFTManager(address _slabNFTManager) external onlyOwner {
        if (_slabNFTManager == address(0)) revert ZeroAddress();
        address oldManager = address(slabNFTManager);
        slabNFTManager = ISlabNFTManager(_slabNFTManager);
        emit WalletUpdated("slabNFTManager", oldManager, _slabNFTManager);
    }

    function setTreasuryWallet(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address oldTreasury = treasuryWallet;
        treasuryWallet = newTreasury;
        emit WalletUpdated("treasury", oldTreasury, newTreasury);
    }

    function setNFTRevenueWallet(address newNFTRevenue) external onlyOwner {
        if (newNFTRevenue == address(0)) revert ZeroAddress();
        address oldNFTRevenue = nftRevenueWallet;
        nftRevenueWallet = newNFTRevenue;
        emit WalletUpdated("nftRevenue", oldNFTRevenue, newNFTRevenue);
    }

    function setOwnerWallet(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address oldOwner = owner();
        _transferOwnership(newOwner);
        emit WalletUpdated("owner", oldOwner, newOwner);
    }

    function setAPEPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert InvalidPrice();
        uint256 oldPrice = apePriceUSD;
        apePriceUSD = newPrice;
        emit APEPriceUpdated(oldPrice, newPrice);
    }

    /**
     * @notice Withdraw accumulated USDC.e platform fees to treasury
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 fees = totalPlatformFees;
        if (fees == 0) revert NoFeesToWithdraw();

        totalPlatformFees = 0;
        usdce.safeTransfer(treasuryWallet, fees);

        emit FeesWithdrawn(treasuryWallet, fees);
    }

    /**
     * @notice Withdraw accumulated native APE fees to treasury
     */
    function withdrawAPEFees() external onlyOwner nonReentrant {
        uint256 apeFees = accumulatedAPEFees;
        if (apeFees == 0) revert NoFeesToWithdraw();

        accumulatedAPEFees = 0;

        (bool success, ) = payable(treasuryWallet).call{value: apeFees}("");
        if (!success) revert APETransferFailed();

        emit APEFeesWithdrawn(treasuryWallet, apeFees);
    }

    /**
     * @notice Withdraw all native APE from contract to treasury
     * @dev Emergency function to recover any stuck APE
     */
    function withdrawAllAPE() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoFeesToWithdraw();

        accumulatedAPEFees = 0; // Reset tracker

        (bool success, ) = payable(treasuryWallet).call{value: balance}("");
        if (!success) revert APETransferFailed();

        emit APEFeesWithdrawn(treasuryWallet, balance);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ External View Functions ============

    function getPlayerBallBalance(address player, uint8 ballType) external view returns (uint256 quantity) {
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);
        return playerBalls[player][BallType(ballType)];
    }

    function getAllPlayerBalls(address player) external view returns (
        uint256 pokeBalls,
        uint256 greatBalls,
        uint256 ultraBalls,
        uint256 masterBalls
    ) {
        return (
            playerBalls[player][BallType.PokeBall],
            playerBalls[player][BallType.GreatBall],
            playerBalls[player][BallType.UltraBall],
            playerBalls[player][BallType.MasterBall]
        );
    }

    function getPokemon(uint8 slot) external view returns (Pokemon memory pokemon) {
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);
        return activePokemons[slot];
    }

    function getAllActivePokemons() external view returns (Pokemon[20] memory pokemons) {
        return activePokemons;
    }

    function getActivePokemonCount() external view returns (uint8 count) {
        for (uint8 i = 0; i < MAX_ACTIVE_POKEMON; i++) {
            if (activePokemons[i].isActive) count++;
        }
        return count;
    }

    function getActivePokemonSlots() external view returns (uint8[] memory slots) {
        uint8 count = 0;
        for (uint8 i = 0; i < MAX_ACTIVE_POKEMON; i++) {
            if (activePokemons[i].isActive) count++;
        }

        slots = new uint8[](count);
        uint8 idx = 0;
        for (uint8 i = 0; i < MAX_ACTIVE_POKEMON; i++) {
            if (activePokemons[i].isActive) {
                slots[idx++] = i;
            }
        }
        return slots;
    }

    function getPendingThrow(uint256 requestId) external view returns (PendingThrow memory) {
        return pendingThrows[requestId];
    }

    function getNFTInventoryCount() external view returns (uint256 count) {
        if (address(slabNFTManager) == address(0)) return 0;
        return slabNFTManager.getInventoryCount();
    }

    function calculateAPEAmount(uint256 usdcAmount) public view returns (uint256 apeAmount) {
        // Guard against division by zero - use default $0.64 (64000000 in 8 decimals) if not set
        uint256 price = apePriceUSD > 0 ? apePriceUSD : 64000000;
        return (usdcAmount * 1e20) / price;
    }

    function getAllBallPrices() external view returns (
        uint256 pokeBallPrice,
        uint256 greatBallPrice,
        uint256 ultraBallPrice,
        uint256 masterBallPrice
    ) {
        return (
            ballPrices[BallType.PokeBall],
            ballPrices[BallType.GreatBall],
            ballPrices[BallType.UltraBall],
            ballPrices[BallType.MasterBall]
        );
    }

    function getAllCatchRates() external view returns (
        uint8 pokeBallRate,
        uint8 greatBallRate,
        uint8 ultraBallRate,
        uint8 masterBallRate
    ) {
        return (
            ballCatchRates[BallType.PokeBall],
            ballCatchRates[BallType.GreatBall],
            ballCatchRates[BallType.UltraBall],
            ballCatchRates[BallType.MasterBall]
        );
    }

    function getBallPrice(BallType ballType) public view returns (uint256 price) {
        price = ballPrices[ballType];
        if (price == 0) {
            if (ballType == BallType.PokeBall) return 1 * 1e6;
            if (ballType == BallType.GreatBall) return 10 * 1e6;
            if (ballType == BallType.UltraBall) return 25 * 1e6;
            if (ballType == BallType.MasterBall) return 4990 * 1e4;
        }
        return price;
    }

    function getCatchRate(BallType ballType) public view returns (uint8 rate) {
        rate = ballCatchRates[ballType];
        if (rate == 0) {
            if (ballType == BallType.PokeBall) return 2;
            if (ballType == BallType.GreatBall) return 20;
            if (ballType == BallType.UltraBall) return 50;
            if (ballType == BallType.MasterBall) return 99;
        }
        return rate;
    }

    // ============ Internal Functions ============

    function _processUSDCPayment(uint256 totalCostUSDC) internal {
        uint256 allowance = usdce.allowance(msg.sender, address(this));
        if (allowance < totalCostUSDC) {
            revert InsufficientAllowance(address(usdce), totalCostUSDC, allowance);
        }

        uint256 balance = usdce.balanceOf(msg.sender);
        if (balance < totalCostUSDC) {
            revert InsufficientBalance(address(usdce), totalCostUSDC, balance);
        }

        usdce.safeTransferFrom(msg.sender, address(this), totalCostUSDC);

        uint256 platformFee = (totalCostUSDC * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 revenueAmount = totalCostUSDC - platformFee;

        totalPlatformFees += platformFee;

        if (address(slabNFTManager) != address(0) && revenueAmount > 0) {
            usdce.safeIncreaseAllowance(address(slabNFTManager), revenueAmount);
            slabNFTManager.depositRevenue(revenueAmount);
            slabNFTManager.checkAndPurchaseNFT();
            emit RevenueSentToManager(revenueAmount);
        }
    }

    function _handleSpawnCallback(PendingThrow storage pendingThrow, uint256 randomNumber) internal {
        uint8 slot = uint8(pendingThrow.ballType);
        if (slot >= MAX_ACTIVE_POKEMON) return;
        if (activePokemons[slot].isActive) return;

        uint256 posX = randomNumber % (MAX_COORDINATE + 1);
        uint256 posY = (randomNumber >> 128) % (MAX_COORDINATE + 1);

        activePokemons[slot] = Pokemon({
            id: pendingThrow.pokemonId,
            positionX: posX,
            positionY: posY,
            throwAttempts: 0,
            isActive: true,
            spawnTime: block.timestamp
        });

        emit PokemonSpawned(pendingThrow.pokemonId, posX, posY, slot);
    }

    function _handleThrowCallback(PendingThrow storage pendingThrow, uint256 randomNumber) internal {
        (bool found, uint8 slot) = _findPokemonSlot(pendingThrow.pokemonId);
        if (!found || !activePokemons[slot].isActive) return;

        Pokemon storage pokemon = activePokemons[slot];
        uint8 catchRate = getCatchRate(pendingThrow.ballType);
        uint256 roll = randomNumber % 100;
        bool caught = roll < catchRate;

        if (caught) {
            _handleSuccessfulCatch(pendingThrow.thrower, pokemon, slot);
        } else {
            _handleFailedCatch(pendingThrow.thrower, pokemon, slot, randomNumber);
        }
    }

    function _handleSuccessfulCatch(address catcher, Pokemon storage pokemon, uint8 slot) internal {
        uint256 pokemonId = pokemon.id;
        pokemon.isActive = false;

        uint256 nftTokenId = 0;
        if (address(slabNFTManager) != address(0)) {
            nftTokenId = slabNFTManager.awardNFTToWinner(catcher);
            if (nftTokenId == 0 && revertOnNoNFT) {
                revert NoNFTAvailable();
            }
        }

        emit CaughtPokemon(catcher, pokemonId, nftTokenId);
        _respawnPokemonAtSlot(slot, pokemonId + 1000);
    }

    function _handleFailedCatch(address thrower, Pokemon storage pokemon, uint8 slot, uint256 randomNumber) internal {
        slot; // Suppress unused warning

        pokemon.throwAttempts++;
        uint8 attemptsRemaining = MAX_THROW_ATTEMPTS - pokemon.throwAttempts;

        emit FailedCatch(thrower, pokemon.id, attemptsRemaining);

        if (pokemon.throwAttempts >= MAX_THROW_ATTEMPTS) {
            uint256 newX = (randomNumber >> 8) % (MAX_COORDINATE + 1);
            uint256 newY = (randomNumber >> 16) % (MAX_COORDINATE + 1);

            pokemon.positionX = newX;
            pokemon.positionY = newY;
            pokemon.throwAttempts = 0;

            emit PokemonRelocated(pokemon.id, newX, newY);
        }
    }

    function _respawnPokemonAtSlot(uint8 slot, uint256 newPokemonId) internal {
        uint256 traceId = _generateTraceId(address(this), newPokemonId, 254);
        uint256 requestId = vrng.requestRandomNumberWithTraceId(traceId);

        pendingThrows[requestId] = PendingThrow({
            thrower: address(this),
            pokemonId: newPokemonId,
            ballType: BallType(slot),
            timestamp: block.timestamp,
            resolved: false
        });

        requestIdToTraceId[requestId] = traceId;
    }

    function _findPokemonSlot(uint256 pokemonId) internal view returns (bool found, uint8 slot) {
        for (uint8 i = 0; i < MAX_ACTIVE_POKEMON; i++) {
            if (activePokemons[i].id == pokemonId && activePokemons[i].isActive) {
                return (true, i);
            }
        }
        return (false, 0);
    }

    function _generateTraceId(address actor, uint256 targetId, uint8 actionType) internal returns (uint256 traceId) {
        return uint256(keccak256(abi.encodePacked(
            actor,
            targetId,
            actionType,
            block.timestamp,
            _traceIdCounter++
        )));
    }

    // ============ UUPS Upgrade Authorization ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Receive function for native APE ============

    receive() external payable {}

    // ============ Storage Gap ============

    /**
     * @dev Reserved storage gap for future upgrades
     * @notice Reduced from 45 to 44 to account for accumulatedAPEFees
     */
    uint256[44] private __gap;
}
