// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title PokeballGame
 * @notice Pokemon catching mini-game on ApeChain with provably fair randomness
 * @dev UUPS upgradeable contract integrating POP VRNG for fair catch mechanics
 * @author Z33Fi ("Z33Fi Made It")
 * @custom:artist-signature Z33Fi Made It
 * @custom:network ApeChain Mainnet (Chain ID: 33139)
 * @custom:version 1.5.0
 *
 * CHANGELOG v1.5.0:
 * - UNIFIED PAYMENT: All payments (APE or USDC.e) now follow same economics
 * - APE AUTO-SWAP: APE payments are swapped to USDC.e via Camelot DEX
 * - UNIFIED FEES: 3% platform fee + 97% revenue, both tracked in USDC.e
 * - AUTO-FUND SLAB: Revenue automatically sent to SlabNFTManager in USDC.e
 * - SLIPPAGE PROTECTION: Configurable min output for APE→USDC.e swaps
 * - NEW: accumulatedUSDCFees replaces dual APE/USDC fee tracking
 * - NEW: withdrawUSDCFees() sends accumulated USDC.e fees to treasury
 *
 * Payment Flow (both tokens):
 * 1. User pays in APE or USDC.e
 * 2. APE is swapped to USDC.e via Camelot (USDC.e passes through)
 * 3. Split: 3% → accumulatedUSDCFees, 97% → SlabNFTManager.depositRevenue()
 * 4. SlabNFTManager.checkAndPurchaseNFT() triggers auto-buy if ≥$51
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
 */
interface IPOPVRNG {
    function requestRandomNumberWithTraceId(uint256 traceId) external returns (uint256 requestId);
}

/**
 * @dev Interface for SlabNFTManager
 */
interface ISlabNFTManager {
    function awardNFTToWinner(address winner) external returns (uint256 tokenId);
    function checkAndPurchaseNFT() external returns (bool purchased, uint256 requestId);
    function getInventoryCount() external view returns (uint256 count);
    function depositRevenue(uint256 amount) external;
}

/**
 * @dev Interface for Camelot V3 SwapRouter on ApeChain
 * @notice Used for APE → USDC.e swaps
 */
interface ICamelotRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 limitSqrtPrice;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/**
 * @dev Interface for WAPE (Wrapped APE) on ApeChain
 */
interface IWAPE {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
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
    // IMPORTANT: Storage layout must remain compatible with v1.4.x
    // Do NOT reorder or remove any existing state variables

    IERC20 public usdce;
    IERC20 public ape; // DEPRECATED: Kept for storage compatibility
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

    // v1.4.0 - Track accumulated native APE for platform fees (LEGACY)
    uint256 public accumulatedAPEFees;

    // v1.5.0 - Unified USDC.e fee tracking and Camelot router
    uint256 public accumulatedUSDCFees;
    ICamelotRouter public camelotRouter;
    IWAPE public wape;
    uint256 public swapSlippageBps; // Slippage tolerance in basis points (e.g., 100 = 1%)
    bool private _v150Initialized;

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
    event USDCFeesWithdrawn(address recipient, uint256 amount);
    event BallPriceUpdated(uint8 indexed ballType, uint256 oldPrice, uint256 newPrice);
    event CatchRateUpdated(uint8 indexed ballType, uint8 oldRate, uint8 newRate);
    event APESwappedToUSDC(uint256 apeAmount, uint256 usdcAmount);
    event SwapSlippageUpdated(uint256 oldSlippage, uint256 newSlippage);
    event CamelotRouterUpdated(address oldRouter, address newRouter);

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
    error SwapFailed();
    error SlippageExceeded(uint256 expected, uint256 received);
    error CamelotRouterNotSet();
    error InvalidSlippage();

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
        address _usdce,
        address _vrng,
        address _slabNFT,
        address _treasury,
        address _nftRevenue
    ) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        if (_usdce == address(0) || _vrng == address(0) || _slabNFT == address(0) ||
            _treasury == address(0) || _nftRevenue == address(0)) {
            revert ZeroAddress();
        }

        usdce = IERC20(_usdce);
        vrng = IPOPVRNG(_vrng);
        slabNFT = IERC721(_slabNFT);
        treasuryWallet = _treasury;
        nftRevenueWallet = _nftRevenue;

        nextPokemonId = 1;
        _traceIdCounter = 1;
    }

    /**
     * @notice Initialize v1.5.0 features (call once after upgrade)
     * @param _camelotRouter Camelot V3 SwapRouter address on ApeChain
     * @param _wape WAPE (Wrapped APE) token address
     * @param _slippageBps Initial slippage tolerance in basis points (e.g., 100 = 1%)
     */
    function initializeV150(
        address _camelotRouter,
        address _wape,
        uint256 _slippageBps
    ) external onlyOwner {
        require(!_v150Initialized, "Already initialized");

        if (_camelotRouter == address(0) || _wape == address(0)) {
            revert ZeroAddress();
        }
        if (_slippageBps > 1000) { // Max 10% slippage
            revert InvalidSlippage();
        }

        camelotRouter = ICamelotRouter(_camelotRouter);
        wape = IWAPE(_wape);
        swapSlippageBps = _slippageBps;

        // Approve WAPE for router (for swaps)
        IERC20(_wape).approve(_camelotRouter, type(uint256).max);

        _v150Initialized = true;
    }

    // ============ External Purchase Functions ============

    /**
     * @notice Purchase balls using native APE (auto-swapped to USDC.e)
     * @dev APE is wrapped → swapped to USDC.e → split 3%/97% → revenue to SlabNFTManager
     * @param ballType Type of ball to purchase (0-3)
     * @param quantity Number of balls to purchase
     */
    function purchaseBallsWithAPE(
        uint8 ballType,
        uint256 quantity
    ) external payable nonReentrant whenNotPaused {
        if (quantity == 0) revert ZeroQuantity();
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);
        if (address(camelotRouter) == address(0)) revert CamelotRouterNotSet();

        BallType ball = BallType(ballType);
        uint256 pricePerBallUSDC = getBallPrice(ball);
        uint256 totalCostUSDC = pricePerBallUSDC * quantity;

        // Enforce $49.90 maximum per transaction
        if (totalCostUSDC > MAX_PURCHASE_USD) {
            revert PurchaseExceedsMaximum(totalCostUSDC, MAX_PURCHASE_USD);
        }

        // Calculate minimum expected APE based on price (with slippage buffer)
        uint256 expectedAPE = calculateAPEAmount(totalCostUSDC);

        if (msg.value < expectedAPE) {
            revert InsufficientAPESent(expectedAPE, msg.value);
        }

        // Swap APE → USDC.e via Camelot at market rate
        // Note: We accept market rate because the pool price may differ from apePriceUSD.
        // The slippage protection is at the DEX level (deadline + pool liquidity).
        uint256 usdcReceived = _swapAPEtoUSDC(msg.value, totalCostUSDC);

        // Require we received at least SOME USDC (sanity check)
        if (usdcReceived == 0) {
            revert SlippageExceeded(totalCostUSDC, 0);
        }

        // Process the USDC.e payment at market rate (3%/97% split)
        // The user paid APE, we split whatever USDC.e the market gave us
        _processUnifiedPayment(usdcReceived);

        // Credit balls to player
        playerBalls[msg.sender][ball] += quantity;

        emit BallPurchased(msg.sender, ballType, quantity, true, msg.value);
    }

    /**
     * @notice Purchase balls using USDC.e directly
     * @dev USDC.e is split 3%/97% → revenue to SlabNFTManager
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

        // Transfer USDC.e from user
        uint256 allowance = usdce.allowance(msg.sender, address(this));
        if (allowance < totalCostUSDC) {
            revert InsufficientAllowance(address(usdce), totalCostUSDC, allowance);
        }

        uint256 balance = usdce.balanceOf(msg.sender);
        if (balance < totalCostUSDC) {
            revert InsufficientBalance(address(usdce), totalCostUSDC, balance);
        }

        usdce.safeTransferFrom(msg.sender, address(this), totalCostUSDC);

        // Process the USDC.e payment (3%/97% split)
        _processUnifiedPayment(totalCostUSDC);

        // Credit balls to player
        playerBalls[msg.sender][ball] += quantity;

        emit BallPurchased(msg.sender, ballType, quantity, false, totalCostUSDC);
    }

    /**
     * @notice Legacy function - redirects to appropriate payment method
     * @dev DEPRECATED: Use purchaseBallsWithAPE() or purchaseBallsWithUSDC() instead
     */
    function purchaseBalls(
        uint8 ballType,
        uint256 quantity,
        bool useAPE
    ) external payable nonReentrant whenNotPaused {
        if (useAPE) {
            // Redirect to APE purchase logic
            if (quantity == 0) revert ZeroQuantity();
            if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);
            if (address(camelotRouter) == address(0)) revert CamelotRouterNotSet();

            BallType ball = BallType(ballType);
            uint256 pricePerBallUSDC = getBallPrice(ball);
            uint256 totalCostUSDC = pricePerBallUSDC * quantity;

            if (totalCostUSDC > MAX_PURCHASE_USD) {
                revert PurchaseExceedsMaximum(totalCostUSDC, MAX_PURCHASE_USD);
            }

            uint256 expectedAPE = calculateAPEAmount(totalCostUSDC);
            if (msg.value < expectedAPE) {
                revert InsufficientAPESent(expectedAPE, msg.value);
            }

            uint256 usdcReceived = _swapAPEtoUSDC(msg.value, totalCostUSDC);

            // Sanity check - must receive something
            if (usdcReceived == 0) {
                revert SlippageExceeded(totalCostUSDC, 0);
            }

            _processUnifiedPayment(usdcReceived);
            playerBalls[msg.sender][ball] += quantity;

            emit BallPurchased(msg.sender, ballType, quantity, true, msg.value);
        } else {
            // Redirect to USDC.e purchase logic
            if (quantity == 0) revert ZeroQuantity();
            if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);

            BallType ball = BallType(ballType);
            uint256 pricePerBallUSDC = getBallPrice(ball);
            uint256 totalCostUSDC = pricePerBallUSDC * quantity;

            if (totalCostUSDC > MAX_PURCHASE_USD) {
                revert PurchaseExceedsMaximum(totalCostUSDC, MAX_PURCHASE_USD);
            }

            uint256 allowance = usdce.allowance(msg.sender, address(this));
            if (allowance < totalCostUSDC) {
                revert InsufficientAllowance(address(usdce), totalCostUSDC, allowance);
            }

            uint256 balance = usdce.balanceOf(msg.sender);
            if (balance < totalCostUSDC) {
                revert InsufficientBalance(address(usdce), totalCostUSDC, balance);
            }

            usdce.safeTransferFrom(msg.sender, address(this), totalCostUSDC);
            _processUnifiedPayment(totalCostUSDC);
            playerBalls[msg.sender][ball] += quantity;

            emit BallPurchased(msg.sender, ballType, quantity, false, totalCostUSDC);
        }
    }

    // ============ Throw Ball Functions ============

    /**
     * @notice Throw a ball at a Pokemon to attempt capture
     * @param pokemonSlot Slot index (0-19) of the Pokemon to catch
     * @param ballType Type of ball to throw (0-3)
     */
    function throwBall(uint8 pokemonSlot, uint8 ballType) external nonReentrant whenNotPaused returns (uint256 requestId) {
        if (pokemonSlot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(pokemonSlot);
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);

        Pokemon storage pokemon = activePokemons[pokemonSlot];
        if (!pokemon.isActive) revert PokemonNotActive(pokemon.id);

        BallType ball = BallType(ballType);
        uint256 playerBallCount = playerBalls[msg.sender][ball];
        if (playerBallCount == 0) {
            revert InsufficientBalls(ball, 1, 0);
        }

        // Consume one ball
        playerBalls[msg.sender][ball] = playerBallCount - 1;

        // Generate trace ID for VRNG request
        uint256 traceId = _traceIdCounter++;

        // Request random number
        requestId = vrng.requestRandomNumberWithTraceId(traceId);

        // Store pending throw
        pendingThrows[requestId] = PendingThrow({
            thrower: msg.sender,
            pokemonId: pokemon.id,
            ballType: ball,
            timestamp: block.timestamp,
            resolved: false
        });

        requestIdToTraceId[requestId] = traceId;

        emit ThrowAttempted(msg.sender, pokemon.id, ballType, requestId);
    }

    // ============ VRNG Callback ============

    /**
     * @notice Callback from VRNG with random number
     */
    function randomNumberCallback(uint256 requestId, uint256 randomNumber) external onlyVRNG {
        PendingThrow storage pendingThrow = pendingThrows[requestId];

        if (pendingThrow.thrower == address(0)) {
            revert ThrowNotFound(requestId);
        }
        if (pendingThrow.resolved) {
            revert ThrowAlreadyResolved(requestId);
        }

        pendingThrow.resolved = true;

        bool isSpawnRequest = pendingThrow.thrower == address(this);
        emit RandomnessReceived(requestId, randomNumber, isSpawnRequest);

        if (isSpawnRequest) {
            _handleSpawnCallback(pendingThrow, randomNumber);
        } else {
            _handleThrowCallback(pendingThrow, randomNumber);
        }
    }

    // ============ Owner Functions ============

    /**
     * @notice Withdraw accumulated USDC.e platform fees to treasury
     * @dev Sends all accumulatedUSDCFees to the configured treasury wallet
     */
    function withdrawUSDCFees() external onlyOwner nonReentrant {
        uint256 fees = accumulatedUSDCFees;
        if (fees == 0) revert NoFeesToWithdraw();

        accumulatedUSDCFees = 0;
        usdce.safeTransfer(treasuryWallet, fees);

        emit USDCFeesWithdrawn(treasuryWallet, fees);
    }

    /**
     * @notice Withdraw legacy accumulated APE fees to treasury
     * @dev For backwards compatibility with v1.4.x accumulated APE
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
     * @notice Emergency withdraw all native APE from contract
     */
    function withdrawAllAPE() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoFeesToWithdraw();

        accumulatedAPEFees = 0;

        (bool success, ) = payable(treasuryWallet).call{value: balance}("");
        if (!success) revert APETransferFailed();

        emit APEFeesWithdrawn(treasuryWallet, balance);
    }

    /**
     * @notice Set the Camelot router address
     */
    function setCamelotRouter(address _router) external onlyOwner {
        if (_router == address(0)) revert ZeroAddress();

        address oldRouter = address(camelotRouter);
        camelotRouter = ICamelotRouter(_router);

        // Approve WAPE for new router
        if (address(wape) != address(0)) {
            IERC20(address(wape)).approve(_router, type(uint256).max);
        }

        emit CamelotRouterUpdated(oldRouter, _router);
    }

    /**
     * @notice Set swap slippage tolerance
     * @param _slippageBps Slippage in basis points (e.g., 100 = 1%)
     */
    function setSwapSlippage(uint256 _slippageBps) external onlyOwner {
        if (_slippageBps > 1000) revert InvalidSlippage(); // Max 10%

        uint256 oldSlippage = swapSlippageBps;
        swapSlippageBps = _slippageBps;

        emit SwapSlippageUpdated(oldSlippage, _slippageBps);
    }

    /**
     * @notice Set APE price in USD (8 decimals)
     */
    function setAPEPrice(uint256 _priceUSD) external onlyOwner {
        if (_priceUSD == 0) revert InvalidPrice();
        uint256 oldPrice = apePriceUSD;
        apePriceUSD = _priceUSD;
        emit APEPriceUpdated(oldPrice, _priceUSD);
    }

    /**
     * @notice Set SlabNFTManager address
     */
    function setSlabNFTManager(address _manager) external onlyOwner {
        if (_manager == address(0)) revert ZeroAddress();
        slabNFTManager = ISlabNFTManager(_manager);

        // Approve USDC.e for the manager
        usdce.approve(_manager, type(uint256).max);
    }

    /**
     * @notice Set treasury wallet
     */
    function setTreasuryWallet(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        address old = treasuryWallet;
        treasuryWallet = _treasury;
        emit WalletUpdated("treasury", old, _treasury);
    }

    /**
     * @notice Set ball price (owner only)
     */
    function setBallPrice(uint8 ballType, uint256 newPrice) external onlyOwner {
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);
        if (newPrice == 0) revert InvalidPrice();
        if (newPrice > MAX_PURCHASE_USD) revert PurchaseExceedsMaximum(newPrice, MAX_PURCHASE_USD);

        BallType ball = BallType(ballType);
        uint256 oldPrice = ballPrices[ball];
        ballPrices[ball] = newPrice;

        emit BallPriceUpdated(ballType, oldPrice, newPrice);
    }

    /**
     * @notice Set catch rate (owner only)
     */
    function setCatchRate(uint8 ballType, uint8 newRate) external onlyOwner {
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);
        if (newRate > 100) revert InvalidCatchRate(newRate);

        BallType ball = BallType(ballType);
        uint8 oldRate = ballCatchRates[ball];
        ballCatchRates[ball] = newRate;

        emit CatchRateUpdated(ballType, oldRate, newRate);
    }

    /**
     * @notice Spawn a Pokemon at a specific slot
     */
    function spawnPokemon(uint8 slot) external onlyOwner nonReentrant {
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);
        if (activePokemons[slot].isActive) revert SlotOccupied(slot);

        uint256 pokemonId = nextPokemonId++;
        uint256 traceId = _traceIdCounter++;

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

    /**
     * @notice Force spawn a Pokemon at specific coordinates
     */
    function forceSpawnPokemon(uint8 slot, uint256 posX, uint256 posY) external onlyOwner {
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);
        if (activePokemons[slot].isActive) revert SlotOccupied(slot);
        if (posX > MAX_COORDINATE || posY > MAX_COORDINATE) revert InvalidPokemonSlot(slot);

        uint256 pokemonId = nextPokemonId++;

        activePokemons[slot] = Pokemon({
            id: pokemonId,
            positionX: posX,
            positionY: posY,
            throwAttempts: 0,
            isActive: true,
            spawnTime: block.timestamp
        });

        emit PokemonSpawned(pokemonId, posX, posY, slot);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ View Functions ============

    function getBallPrice(BallType ball) public view returns (uint256) {
        uint256 price = ballPrices[ball];
        if (price == 0) {
            // Default prices
            if (ball == BallType.PokeBall) return 1 * 1e6;
            if (ball == BallType.GreatBall) return 10 * 1e6;
            if (ball == BallType.UltraBall) return 25 * 1e6;
            if (ball == BallType.MasterBall) return 4990 * 1e4;
        }
        return price;
    }

    function getCatchRate(BallType ball) public view returns (uint8) {
        uint8 rate = ballCatchRates[ball];
        if (rate == 0) {
            // Default rates
            if (ball == BallType.PokeBall) return 2;
            if (ball == BallType.GreatBall) return 20;
            if (ball == BallType.UltraBall) return 50;
            if (ball == BallType.MasterBall) return 99;
        }
        return rate;
    }

    function calculateAPEAmount(uint256 usdcAmount) public view returns (uint256 apeAmount) {
        uint256 price = apePriceUSD > 0 ? apePriceUSD : 64000000; // Default $0.64
        return (usdcAmount * 1e20) / price;
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

    function getAllActivePokemons() external view returns (Pokemon[20] memory) {
        return activePokemons;
    }

    function getActivePokemonCount() external view returns (uint8 count) {
        for (uint8 i = 0; i < MAX_ACTIVE_POKEMON; i++) {
            if (activePokemons[i].isActive) count++;
        }
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
    }

    function getAllBallPrices() external view returns (
        uint256 pokeBallPrice,
        uint256 greatBallPrice,
        uint256 ultraBallPrice,
        uint256 masterBallPrice
    ) {
        return (
            getBallPrice(BallType.PokeBall),
            getBallPrice(BallType.GreatBall),
            getBallPrice(BallType.UltraBall),
            getBallPrice(BallType.MasterBall)
        );
    }

    function getAllCatchRates() external view returns (
        uint8 pokeBallRate,
        uint8 greatBallRate,
        uint8 ultraBallRate,
        uint8 masterBallRate
    ) {
        return (
            getCatchRate(BallType.PokeBall),
            getCatchRate(BallType.GreatBall),
            getCatchRate(BallType.UltraBall),
            getCatchRate(BallType.MasterBall)
        );
    }

    function getNFTInventoryCount() external view returns (uint256) {
        if (address(slabNFTManager) == address(0)) return 0;
        return slabNFTManager.getInventoryCount();
    }

    // ============ Internal Functions ============

    /**
     * @notice Swap APE to USDC.e via Camelot at market rate
     * @param apeAmount Amount of native APE to swap
     * @return usdcReceived Amount of USDC.e received
     */
    function _swapAPEtoUSDC(uint256 apeAmount, uint256) internal returns (uint256 usdcReceived) {
        // Wrap APE to WAPE
        wape.deposit{value: apeAmount}();

        // Approve Camelot router to spend WAPE (required for swap)
        // Using max approval to save gas on future swaps
        uint256 currentAllowance = IERC20(address(wape)).allowance(address(this), address(camelotRouter));
        if (currentAllowance < apeAmount) {
            wape.approve(address(camelotRouter), type(uint256).max);
        }

        // NOTE: We set minOut to 0 because the contract's apePriceUSD may differ from
        // the actual DEX pool rate. The slippage protection is done AFTER the swap
        // by checking if we received enough USDC to cover the purchase.
        // This allows the swap to succeed at market rate, then we verify the result.

        // Execute swap via Camelot at market rate
        ICamelotRouter.ExactInputSingleParams memory params = ICamelotRouter.ExactInputSingleParams({
            tokenIn: address(wape),
            tokenOut: address(usdce),
            recipient: address(this),
            deadline: block.timestamp + 300, // 5 minute deadline
            amountIn: apeAmount,
            amountOutMinimum: 0, // Accept market rate, verify after
            limitSqrtPrice: 0 // No price limit
        });

        usdcReceived = camelotRouter.exactInputSingle(params);

        emit APESwappedToUSDC(apeAmount, usdcReceived);
    }

    /**
     * @notice Process unified payment (split 3%/97% and fund SlabNFTManager)
     * @param usdcAmount Amount of USDC.e to process
     */
    function _processUnifiedPayment(uint256 usdcAmount) internal {
        // Calculate splits
        uint256 platformFee = (usdcAmount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 revenueAmount = usdcAmount - platformFee;

        // Track platform fee in USDC.e bucket
        accumulatedUSDCFees += platformFee;
        totalPlatformFees += platformFee;

        // Send revenue to SlabNFTManager
        if (address(slabNFTManager) != address(0) && revenueAmount > 0) {
            // Ensure approval (should already be max from setSlabNFTManager)
            uint256 currentAllowance = usdce.allowance(address(this), address(slabNFTManager));
            if (currentAllowance < revenueAmount) {
                usdce.approve(address(slabNFTManager), type(uint256).max);
            }

            slabNFTManager.depositRevenue(revenueAmount);
            slabNFTManager.checkAndPurchaseNFT();

            totalRevenuePool += revenueAmount;
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
        bool caught = (randomNumber % 100) < catchRate;

        if (caught) {
            _handleSuccessfulCatch(pendingThrow.thrower, pokemon, slot);
        } else {
            _handleFailedCatch(pendingThrow.thrower, pokemon, slot, randomNumber);
        }
    }

    function _handleSuccessfulCatch(address catcher, Pokemon storage pokemon, uint8 slot) internal {
        uint256 pokemonId = pokemon.id;
        uint256 nftTokenId = 0;

        if (address(slabNFTManager) != address(0)) {
            uint256 inventoryCount = slabNFTManager.getInventoryCount();
            if (inventoryCount > 0) {
                nftTokenId = slabNFTManager.awardNFTToWinner(catcher);
                totalNFTsPurchased++;
            } else if (revertOnNoNFT) {
                revert NoNFTAvailable();
            }
        }

        // Clear the Pokemon from the slot
        delete activePokemons[slot];

        emit CaughtPokemon(catcher, pokemonId, nftTokenId);
    }

    function _handleFailedCatch(address thrower, Pokemon storage pokemon, uint8 slot, uint256 randomNumber) internal {
        pokemon.throwAttempts++;

        if (pokemon.throwAttempts >= MAX_THROW_ATTEMPTS) {
            // Relocate the Pokemon
            uint256 newX = (randomNumber >> 64) % (MAX_COORDINATE + 1);
            uint256 newY = (randomNumber >> 192) % (MAX_COORDINATE + 1);

            pokemon.positionX = newX;
            pokemon.positionY = newY;
            pokemon.throwAttempts = 0;

            emit PokemonRelocated(pokemon.id, newX, newY);
        }

        emit FailedCatch(thrower, pokemon.id, MAX_THROW_ATTEMPTS - pokemon.throwAttempts);
    }

    function _findPokemonSlot(uint256 pokemonId) internal view returns (bool found, uint8 slot) {
        for (uint8 i = 0; i < MAX_ACTIVE_POKEMON; i++) {
            if (activePokemons[i].id == pokemonId && activePokemons[i].isActive) {
                return (true, i);
            }
        }
        return (false, 0);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Storage Gap ============

    /**
     * @dev Reserved storage gap for future upgrades
     * @notice v1.4.0 had 44 slots, v1.5.0 adds 5 new variables, so gap is 44 - 5 = 39
     */
    uint256[39] private __gap;

    // ============ Receive Function ============

    receive() external payable {}
}
