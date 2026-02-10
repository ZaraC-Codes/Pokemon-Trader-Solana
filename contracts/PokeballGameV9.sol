// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title PokeballGame
 * @notice Pokemon catching mini-game on ApeChain with provably fair randomness
 * @dev UUPS upgradeable contract integrating Pyth Entropy for fair catch mechanics
 * @author Z33Fi ("Z33Fi Made It")
 * @custom:artist-signature Z33Fi Made It
 * @custom:network ApeChain Mainnet (Chain ID: 33139)
 * @custom:version 1.9.0
 *
 * CHANGELOG v1.9.0:
 * - NEW: repositionPokemon(slot, newX, newY) - Admin function to move existing Pokemon without despawning
 * - NEW: despawnPokemon(slot) - Admin function to remove a Pokemon from a slot
 * - NEW: maxActivePokemon - Owner-configurable soft cap on active spawns (max 20)
 * - NEW: setMaxActivePokemon(newMax) - Adjust the soft cap at runtime
 * - NEW: getEffectiveMaxActivePokemon() - View function to get current effective max
 * - UNCHANGED: All economics, randomness, gasless throws, and NFT award logic
 *
 * Previous versions:
 * - v1.8.0: Gasless throws, APE reserves, meta-transactions
 * - v1.7.0: Random NFT selection using Pyth Entropy
 * - v1.6.0: Replaced POP VRNG with Pyth Entropy
 * - v1.5.0: Unified payments (APE auto-swap to USDC.e)
 */

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

// Pyth Entropy imports
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";

// ============ External Contract Interfaces ============

/**
 * @dev Interface for SlabNFTManager v2.4.0+
 * @notice Updated to include APE deposit function
 */
interface ISlabNFTManager {
    function awardNFTToWinner(address winner) external returns (uint256 tokenId);
    function awardNFTToWinnerWithRandomness(address winner, uint256 randomNumber) external returns (uint256 tokenId);
    function checkAndPurchaseNFT() external returns (bool purchased, uint256 requestId);
    function getInventoryCount() external view returns (uint256 count);
    function depositRevenue(uint256 amount) external;
    function depositAPEReserve() external payable;
    function getAPEReserve() external view returns (uint256);
}

/**
 * @dev Interface for Camelot V3 SwapRouter on ApeChain
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
    PausableUpgradeable,
    IEntropyConsumer
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
    uint8 public constant USDC_DECIMALS = 6;
    uint8 public constant APE_DECIMALS = 18;
    uint256 public constant MAX_COORDINATE = 999;
    uint256 public constant MAX_PURCHASE_USD = 4990 * 1e4; // $49.90
    uint256 public constant BPS_DENOMINATOR = 10000;

    // v1.8.0 Revenue split constants
    uint256 public constant APE_RESERVE_BPS = 50;        // 0.5% APE to PokeballGame
    uint256 public constant SLAB_APE_RESERVE_BPS = 50;   // 0.5% APE to SlabNFTManager
    uint256 public constant TREASURY_FEE_BPS = 300;      // 3% USDC.e to treasury
    uint256 public constant NFT_POOL_BPS = 9600;         // 96% USDC.e to NFT pool

    // ============ State Variables ============
    // IMPORTANT: Storage layout must remain compatible with v1.7.x
    // Do NOT reorder or remove any existing state variables

    IERC20 public usdce;
    IERC20 public ape; // DEPRECATED: Kept for storage compatibility
    address public vrng; // DEPRECATED: Was IPOPVRNG, now unused but kept for storage
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
    mapping(uint256 => uint256) public requestIdToTraceId; // DEPRECATED

    uint256 private _traceIdCounter; // DEPRECATED

    uint256 public apePriceUSD;

    // v1.1.0
    ISlabNFTManager public slabNFTManager;

    // v1.3.0
    mapping(BallType => uint256) public ballPrices;
    mapping(BallType => uint8) public ballCatchRates;
    bool public revertOnNoNFT;
    bool private _v130Initialized;

    // v1.4.0
    uint256 public accumulatedAPEFees; // Now: APE reserve for Entropy fees

    // v1.5.0
    uint256 public accumulatedUSDCFees;
    ICamelotRouter public camelotRouter;
    IWAPE public wape;
    uint256 public swapSlippageBps;
    bool private _v150Initialized;

    // v1.6.0
    IEntropyV2 public entropy;
    address public entropyProvider;
    bool private _v160Initialized;

    // v1.7.0
    bool private _v170Initialized;

    // v1.8.0 - New state for gasless throws and APE reserve tracking
    uint256 public totalAPEReserve;           // Total APE held for gas/Entropy fees
    uint256 public totalAPESentToManager;     // Total APE sent to SlabNFTManager
    mapping(address => uint256) public playerThrowNonces; // Nonces for meta-transactions
    address public relayerAddress;            // Authorized relayer for gasless throws
    bool private _v180Initialized;

    // v1.9.0 - Spawn management improvements
    uint8 public maxActivePokemon;            // Configurable soft cap (max MAX_ACTIVE_POKEMON)
    bool private _v190Initialized;

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
        uint64 sequenceNumber
    );

    event RandomnessReceived(
        uint64 indexed sequenceNumber,
        bytes32 randomNumber,
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
    event EntropyUpdated(address oldEntropy, address newEntropy);
    event EntropyProviderUpdated(address oldProvider, address newProvider);

    // v1.8.0 events
    event APEReserveDeposited(uint256 amount, uint256 newTotal);
    event APESentToSlabManager(uint256 amount);
    event GaslessThrowExecuted(address indexed player, address indexed relayer, uint256 pokemonId);
    event RelayerUpdated(address oldRelayer, address newRelayer);

    // v1.9.0 events
    event PokemonRepositioned(uint256 indexed pokemonId, uint8 indexed slot, uint256 oldX, uint256 oldY, uint256 newX, uint256 newY);
    event PokemonDespawned(uint256 indexed pokemonId, uint8 indexed slot);
    event MaxActivePokemonUpdated(uint8 oldMax, uint8 newMax);

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
    error ThrowAlreadyResolved(uint64 sequenceNumber);
    error ThrowNotFound(uint64 sequenceNumber);
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
    error EntropyNotSet();
    error InsufficientEntropyFee(uint256 required, uint256 sent);
    error InsufficientAPEReserve(uint256 required, uint256 available);
    error NotAuthorizedRelayer();
    error InvalidNonce();
    // v1.9.0 errors
    error SlotNotOccupied(uint8 slot);
    error InvalidCoordinate(uint256 coordinate, uint256 max);
    error MaxActivePokemonExceeded(uint8 current, uint8 max);
    error InvalidMaxActivePokemon(uint8 provided, uint8 hardCap);

    // ============ Modifiers ============

    modifier onlyRelayerOrOwner() {
        if (msg.sender != relayerAddress && msg.sender != owner()) {
            revert NotAuthorizedRelayer();
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
        address _entropy,
        address _slabNFT,
        address _treasury,
        address _nftRevenue
    ) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        if (_usdce == address(0) || _entropy == address(0) || _slabNFT == address(0) ||
            _treasury == address(0) || _nftRevenue == address(0)) {
            revert ZeroAddress();
        }

        usdce = IERC20(_usdce);
        entropy = IEntropyV2(_entropy);
        slabNFT = IERC721(_slabNFT);
        treasuryWallet = _treasury;
        nftRevenueWallet = _nftRevenue;

        entropyProvider = entropy.getDefaultProvider();

        nextPokemonId = 1;
    }

    /**
     * @notice Initialize v1.8.0 features (call once after upgrade from v1.7.x)
     * @param _relayer Address of authorized relayer for gasless throws
     */
    function initializeV180(address _relayer) external onlyOwner {
        require(!_v180Initialized, "Already initialized");

        relayerAddress = _relayer;
        _v180Initialized = true;
    }

    /**
     * @notice Initialize v1.9.0 features (call once after upgrade from v1.8.x)
     * @dev Sets maxActivePokemon to MAX_ACTIVE_POKEMON (20) as default
     */
    function initializeV190() external onlyOwner {
        require(!_v190Initialized, "Already initialized");

        // Default to the hard cap
        maxActivePokemon = MAX_ACTIVE_POKEMON;
        _v190Initialized = true;
    }

    // ============ IEntropyConsumer Implementation ============

    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    function entropyCallback(
        uint64 sequenceNumber,
        address /* provider */,
        bytes32 randomNumber
    ) internal override {
        PendingThrow storage pendingThrow = pendingThrows[uint256(sequenceNumber)];

        if (pendingThrow.thrower == address(0)) {
            revert ThrowNotFound(sequenceNumber);
        }
        if (pendingThrow.resolved) {
            revert ThrowAlreadyResolved(sequenceNumber);
        }

        pendingThrow.resolved = true;

        bool isSpawnRequest = pendingThrow.thrower == address(this);
        emit RandomnessReceived(sequenceNumber, randomNumber, isSpawnRequest);

        uint256 randomUint = uint256(randomNumber);

        if (isSpawnRequest) {
            _handleSpawnCallback(pendingThrow, randomUint);
        } else {
            _handleThrowCallback(pendingThrow, randomUint);
        }
    }

    // ============ External Purchase Functions ============

    /**
     * @notice Purchase balls using native APE
     * @dev v1.8.0 Revenue Split:
     *   - 0.5% APE stays in PokeballGame (for Entropy fees)
     *   - 0.5% APE sent to SlabNFTManager (for NFT selection Entropy fees)
     *   - 99% swapped to USDC.e: 96% NFT pool + 3% treasury
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

        if (totalCostUSDC > MAX_PURCHASE_USD) {
            revert PurchaseExceedsMaximum(totalCostUSDC, MAX_PURCHASE_USD);
        }

        uint256 expectedAPE = calculateAPEAmount(totalCostUSDC);
        if (msg.value < expectedAPE) {
            revert InsufficientAPESent(expectedAPE, msg.value);
        }

        // v1.8.0: Split APE before swap
        uint256 apeReserveAmount = (msg.value * APE_RESERVE_BPS) / BPS_DENOMINATOR;      // 0.5% to PokeballGame
        uint256 slabApeAmount = (msg.value * SLAB_APE_RESERVE_BPS) / BPS_DENOMINATOR;    // 0.5% to SlabNFTManager
        uint256 apeToSwap = msg.value - apeReserveAmount - slabApeAmount;                // 99% to swap

        // Keep APE reserve in this contract
        totalAPEReserve += apeReserveAmount;
        emit APEReserveDeposited(apeReserveAmount, totalAPEReserve);

        // Send APE reserve to SlabNFTManager
        if (address(slabNFTManager) != address(0) && slabApeAmount > 0) {
            slabNFTManager.depositAPEReserve{value: slabApeAmount}();
            totalAPESentToManager += slabApeAmount;
            emit APESentToSlabManager(slabApeAmount);
        } else {
            // If no manager, add to our reserve
            totalAPEReserve += slabApeAmount;
        }

        // Swap remaining APE -> USDC.e
        uint256 usdcReceived = _swapAPEtoUSDC(apeToSwap, 0);

        if (usdcReceived == 0) {
            revert SlippageExceeded(totalCostUSDC, 0);
        }

        // Process USDC.e: 96% NFT pool + 3% treasury
        _processUSDCPayment(usdcReceived);

        // Credit balls to player
        playerBalls[msg.sender][ball] += quantity;

        emit BallPurchased(msg.sender, ballType, quantity, true, msg.value);
    }

    /**
     * @notice Purchase balls using USDC.e directly
     * @dev v1.8.0 Revenue Split:
     *   - 1% converted to APE: 0.5% PokeballGame + 0.5% SlabNFTManager
     *   - 99% USDC.e: 96% NFT pool + 3% treasury
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

        // v1.8.0: Convert 1% to APE for reserves
        uint256 usdcForAPE = (totalCostUSDC * (APE_RESERVE_BPS + SLAB_APE_RESERVE_BPS)) / BPS_DENOMINATOR; // 1%
        uint256 usdcRemaining = totalCostUSDC - usdcForAPE; // 99%

        // Swap 1% USDC to APE for reserves
        if (usdcForAPE > 0 && address(camelotRouter) != address(0)) {
            uint256 apeReceived = _swapUSDCtoAPE(usdcForAPE);
            if (apeReceived > 0) {
                // Split APE: 0.5% each
                uint256 apeForPokeballGame = apeReceived / 2;
                uint256 apeForSlabManager = apeReceived - apeForPokeballGame;

                totalAPEReserve += apeForPokeballGame;
                emit APEReserveDeposited(apeForPokeballGame, totalAPEReserve);

                if (address(slabNFTManager) != address(0) && apeForSlabManager > 0) {
                    slabNFTManager.depositAPEReserve{value: apeForSlabManager}();
                    totalAPESentToManager += apeForSlabManager;
                    emit APESentToSlabManager(apeForSlabManager);
                } else {
                    totalAPEReserve += apeForSlabManager;
                }
            }
        }

        // Process remaining 99% USDC.e: 96% NFT pool + 3% treasury
        _processUSDCPayment(usdcRemaining);

        playerBalls[msg.sender][ball] += quantity;

        emit BallPurchased(msg.sender, ballType, quantity, false, totalCostUSDC);
    }

    // ============ Throw Ball Functions ============

    /**
     * @notice Throw a ball at a Pokemon (gasless - uses contract's APE reserve)
     * @dev v1.8.0: Players don't pay Entropy fee; it comes from contract's APE reserve
     * @param pokemonSlot Slot index (0-19) of the Pokemon to catch
     * @param ballType Type of ball to throw (0-3)
     */
    function throwBall(uint8 pokemonSlot, uint8 ballType) external nonReentrant whenNotPaused returns (uint64 sequenceNumber) {
        return _executeThrow(msg.sender, pokemonSlot, ballType);
    }

    /**
     * @notice Execute a throw on behalf of a player (meta-transaction)
     * @dev Allows relayer to execute gasless throws for players
     * @param player The player who owns the balls
     * @param pokemonSlot Slot index (0-19) of the Pokemon to catch
     * @param ballType Type of ball to throw (0-3)
     * @param nonce Player's nonce (must match playerThrowNonces[player])
     * @param signature Player's signature authorizing this throw
     */
    function throwBallFor(
        address player,
        uint8 pokemonSlot,
        uint8 ballType,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant whenNotPaused onlyRelayerOrOwner returns (uint64 sequenceNumber) {
        // Verify nonce
        if (nonce != playerThrowNonces[player]) {
            revert InvalidNonce();
        }

        // Verify signature (EIP-712 style)
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(player, pokemonSlot, ballType, nonce, block.chainid, address(this)))
        ));
        address signer = _recoverSigner(messageHash, signature);
        if (signer != player) {
            revert NotAuthorizedRelayer();
        }

        // Increment nonce
        playerThrowNonces[player]++;

        // Execute throw
        sequenceNumber = _executeThrow(player, pokemonSlot, ballType);

        emit GaslessThrowExecuted(player, msg.sender, activePokemons[pokemonSlot].id);
    }

    /**
     * @dev Internal function to execute a throw
     */
    function _executeThrow(address thrower, uint8 pokemonSlot, uint8 ballType) internal returns (uint64 sequenceNumber) {
        if (address(entropy) == address(0)) revert EntropyNotSet();
        if (pokemonSlot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(pokemonSlot);
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);

        Pokemon storage pokemon = activePokemons[pokemonSlot];
        if (!pokemon.isActive) revert PokemonNotActive(pokemon.id);

        BallType ball = BallType(ballType);
        uint256 playerBallCount = playerBalls[thrower][ball];
        if (playerBallCount == 0) {
            revert InsufficientBalls(ball, 1, 0);
        }

        // Get Entropy fee
        uint128 entropyFee = entropy.getFeeV2();

        // v1.8.0: Use APE reserve instead of requiring msg.value
        if (totalAPEReserve < entropyFee) {
            revert InsufficientAPEReserve(entropyFee, totalAPEReserve);
        }

        // Deduct from reserve
        totalAPEReserve -= entropyFee;

        // Consume one ball
        playerBalls[thrower][ball] = playerBallCount - 1;

        // Request random number from Pyth Entropy
        sequenceNumber = entropy.requestV2{value: entropyFee}();

        // Store pending throw
        pendingThrows[uint256(sequenceNumber)] = PendingThrow({
            thrower: thrower,
            pokemonId: pokemon.id,
            ballType: ball,
            timestamp: block.timestamp,
            resolved: false
        });

        emit ThrowAttempted(thrower, pokemon.id, ballType, sequenceNumber);
    }

    /**
     * @notice Get the current Entropy fee for a throw
     */
    function getThrowFee() external view returns (uint128) {
        if (address(entropy) == address(0)) return 0;
        return entropy.getFeeV2();
    }

    /**
     * @notice Get the current APE reserve balance
     */
    function getAPEReserve() external view returns (uint256) {
        return totalAPEReserve;
    }

    /**
     * @notice Check if there's enough APE reserve for a throw
     */
    function canThrow() external view returns (bool, uint256 reserve, uint256 required) {
        if (address(entropy) == address(0)) return (false, 0, 0);
        uint128 fee = entropy.getFeeV2();
        return (totalAPEReserve >= fee, totalAPEReserve, fee);
    }

    // ============ Owner Functions ============

    /**
     * @notice Set the relayer address for gasless throws
     */
    function setRelayer(address _relayer) external onlyOwner {
        address oldRelayer = relayerAddress;
        relayerAddress = _relayer;
        emit RelayerUpdated(oldRelayer, _relayer);
    }

    /**
     * @notice Manually add APE to the reserve (for topping up)
     */
    function depositAPEReserve() external payable onlyOwner {
        totalAPEReserve += msg.value;
        emit APEReserveDeposited(msg.value, totalAPEReserve);
    }

    /**
     * @notice Withdraw accumulated USDC.e platform fees to treasury
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
     * @dev For backwards compatibility - but keeps minimum reserve
     */
    function withdrawAPEFees() external onlyOwner nonReentrant {
        // Calculate minimum reserve needed (estimate for ~100 throws)
        uint128 entropyFee = address(entropy) != address(0) ? entropy.getFeeV2() : 0;
        uint256 minReserve = uint256(entropyFee) * 100;

        uint256 withdrawable = totalAPEReserve > minReserve ? totalAPEReserve - minReserve : 0;
        if (withdrawable == 0) revert NoFeesToWithdraw();

        totalAPEReserve -= withdrawable;

        (bool success, ) = payable(treasuryWallet).call{value: withdrawable}("");
        if (!success) revert APETransferFailed();

        emit APEFeesWithdrawn(treasuryWallet, withdrawable);
    }

    /**
     * @notice Emergency withdraw all native APE from contract
     * @dev WARNING: This will break gasless throws until topped up
     */
    function withdrawAllAPE() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoFeesToWithdraw();

        totalAPEReserve = 0;

        (bool success, ) = payable(treasuryWallet).call{value: balance}("");
        if (!success) revert APETransferFailed();

        emit APEFeesWithdrawn(treasuryWallet, balance);
    }

    function setEntropy(address _entropy) external onlyOwner {
        if (_entropy == address(0)) revert ZeroAddress();
        address oldEntropy = address(entropy);
        entropy = IEntropyV2(_entropy);
        entropyProvider = entropy.getDefaultProvider();
        emit EntropyUpdated(oldEntropy, _entropy);
    }

    function setEntropyProvider(address _provider) external onlyOwner {
        if (_provider == address(0)) revert ZeroAddress();
        address oldProvider = entropyProvider;
        entropyProvider = _provider;
        emit EntropyProviderUpdated(oldProvider, _provider);
    }

    function setCamelotRouter(address _router) external onlyOwner {
        if (_router == address(0)) revert ZeroAddress();
        address oldRouter = address(camelotRouter);
        camelotRouter = ICamelotRouter(_router);
        if (address(wape) != address(0)) {
            IERC20(address(wape)).approve(_router, type(uint256).max);
        }
        // Also approve USDC.e for reverse swaps
        usdce.approve(_router, type(uint256).max);
        emit CamelotRouterUpdated(oldRouter, _router);
    }

    function setSwapSlippage(uint256 _slippageBps) external onlyOwner {
        if (_slippageBps > 1000) revert InvalidSlippage();
        uint256 oldSlippage = swapSlippageBps;
        swapSlippageBps = _slippageBps;
        emit SwapSlippageUpdated(oldSlippage, _slippageBps);
    }

    function setAPEPrice(uint256 _priceUSD) external onlyOwner {
        if (_priceUSD == 0) revert InvalidPrice();
        uint256 oldPrice = apePriceUSD;
        apePriceUSD = _priceUSD;
        emit APEPriceUpdated(oldPrice, _priceUSD);
    }

    function setSlabNFTManager(address _manager) external onlyOwner {
        if (_manager == address(0)) revert ZeroAddress();
        slabNFTManager = ISlabNFTManager(_manager);
        usdce.approve(_manager, type(uint256).max);
    }

    function setTreasuryWallet(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        address old = treasuryWallet;
        treasuryWallet = _treasury;
        emit WalletUpdated("treasury", old, _treasury);
    }

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

    function spawnPokemon(uint8 slot) external payable onlyOwner nonReentrant {
        if (address(entropy) == address(0)) revert EntropyNotSet();
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);
        if (activePokemons[slot].isActive) revert SlotOccupied(slot);

        // v1.9.0: Check against configurable max
        uint8 effectiveMax = maxActivePokemon > 0 ? maxActivePokemon : MAX_ACTIVE_POKEMON;
        if (slot >= effectiveMax) {
            revert MaxActivePokemonExceeded(slot, effectiveMax);
        }

        uint128 entropyFee = entropy.getFeeV2();

        // Use APE reserve if no value sent
        uint256 feeSource;
        if (msg.value >= entropyFee) {
            feeSource = msg.value;
            // Refund excess
            if (msg.value > entropyFee) {
                (bool success, ) = payable(msg.sender).call{value: msg.value - entropyFee}("");
            }
        } else if (totalAPEReserve >= entropyFee) {
            feeSource = entropyFee;
            totalAPEReserve -= entropyFee;
        } else {
            revert InsufficientEntropyFee(entropyFee, msg.value);
        }

        uint256 pokemonId = nextPokemonId++;

        uint64 sequenceNumber = entropy.requestV2{value: entropyFee}();

        pendingThrows[uint256(sequenceNumber)] = PendingThrow({
            thrower: address(this),
            pokemonId: pokemonId,
            ballType: BallType(slot),
            timestamp: block.timestamp,
            resolved: false
        });
    }

    function forceSpawnPokemon(uint8 slot, uint256 posX, uint256 posY) external onlyOwner {
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);
        if (activePokemons[slot].isActive) revert SlotOccupied(slot);
        if (posX > MAX_COORDINATE) revert InvalidCoordinate(posX, MAX_COORDINATE);
        if (posY > MAX_COORDINATE) revert InvalidCoordinate(posY, MAX_COORDINATE);

        // v1.9.0: Check against configurable max
        uint8 effectiveMax = maxActivePokemon > 0 ? maxActivePokemon : MAX_ACTIVE_POKEMON;
        if (slot >= effectiveMax) {
            revert MaxActivePokemonExceeded(slot, effectiveMax);
        }

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

    // ============ v1.9.0 Spawn Management Functions ============

    /**
     * @notice Reposition an existing Pokemon to new coordinates without despawning
     * @dev Emits PokemonRelocated event which frontend already listens to
     * @param slot Slot index (0-19) of the Pokemon to reposition
     * @param newPosX New X coordinate (0-999)
     * @param newPosY New Y coordinate (0-999)
     */
    function repositionPokemon(uint8 slot, uint256 newPosX, uint256 newPosY) external onlyOwner {
        // Validate slot is within bounds
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);

        // Validate slot is occupied
        Pokemon storage pokemon = activePokemons[slot];
        if (!pokemon.isActive) revert SlotNotOccupied(slot);

        // Validate coordinates
        if (newPosX > MAX_COORDINATE) revert InvalidCoordinate(newPosX, MAX_COORDINATE);
        if (newPosY > MAX_COORDINATE) revert InvalidCoordinate(newPosY, MAX_COORDINATE);

        // Store old coordinates for event
        uint256 oldX = pokemon.positionX;
        uint256 oldY = pokemon.positionY;

        // Update position
        pokemon.positionX = newPosX;
        pokemon.positionY = newPosY;

        // Reset throw attempts so the Pokemon "refreshes" at new location
        pokemon.throwAttempts = 0;

        // Emit detailed event for logging/analytics
        emit PokemonRepositioned(pokemon.id, slot, oldX, oldY, newPosX, newPosY);

        // Emit standard relocation event that frontend already listens to
        emit PokemonRelocated(pokemon.id, newPosX, newPosY);
    }

    /**
     * @notice Remove a Pokemon from a slot (admin despawn)
     * @dev Frees the slot for a new spawn
     * @param slot Slot index (0-19) of the Pokemon to despawn
     */
    function despawnPokemon(uint8 slot) external onlyOwner {
        // Validate slot is within bounds
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);

        // Validate slot is occupied
        Pokemon storage pokemon = activePokemons[slot];
        if (!pokemon.isActive) revert SlotNotOccupied(slot);

        uint256 pokemonId = pokemon.id;

        // Clear the slot
        delete activePokemons[slot];

        emit PokemonDespawned(pokemonId, slot);
    }

    /**
     * @notice Set the configurable maximum active Pokemon (soft cap)
     * @dev Must be between 1 and MAX_ACTIVE_POKEMON (20)
     * @param newMax New maximum active Pokemon count
     */
    function setMaxActivePokemon(uint8 newMax) external onlyOwner {
        if (newMax == 0) revert InvalidMaxActivePokemon(newMax, MAX_ACTIVE_POKEMON);
        if (newMax > MAX_ACTIVE_POKEMON) revert InvalidMaxActivePokemon(newMax, MAX_ACTIVE_POKEMON);

        uint8 oldMax = maxActivePokemon;
        maxActivePokemon = newMax;

        emit MaxActivePokemonUpdated(oldMax, newMax);
    }

    /**
     * @notice Get the effective maximum active Pokemon count
     * @return The configured max, or hard cap if not set
     */
    function getEffectiveMaxActivePokemon() external view returns (uint8) {
        return maxActivePokemon > 0 ? maxActivePokemon : MAX_ACTIVE_POKEMON;
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
            if (ball == BallType.PokeBall) return 2;
            if (ball == BallType.GreatBall) return 20;
            if (ball == BallType.UltraBall) return 50;
            if (ball == BallType.MasterBall) return 99;
        }
        return rate;
    }

    function calculateAPEAmount(uint256 usdcAmount) public view returns (uint256 apeAmount) {
        uint256 price = apePriceUSD > 0 ? apePriceUSD : 64000000;
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

    function getPlayerNonce(address player) external view returns (uint256) {
        return playerThrowNonces[player];
    }

    // ============ Internal Functions ============

    /**
     * @notice Swap APE to USDC.e via Camelot
     */
    function _swapAPEtoUSDC(uint256 apeAmount, uint256) internal returns (uint256 usdcReceived) {
        wape.deposit{value: apeAmount}();

        uint256 currentAllowance = IERC20(address(wape)).allowance(address(this), address(camelotRouter));
        if (currentAllowance < apeAmount) {
            wape.approve(address(camelotRouter), type(uint256).max);
        }

        ICamelotRouter.ExactInputSingleParams memory params = ICamelotRouter.ExactInputSingleParams({
            tokenIn: address(wape),
            tokenOut: address(usdce),
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: apeAmount,
            amountOutMinimum: 0,
            limitSqrtPrice: 0
        });

        usdcReceived = camelotRouter.exactInputSingle(params);

        emit APESwappedToUSDC(apeAmount, usdcReceived);
    }

    /**
     * @notice Swap USDC.e to APE via Camelot (v1.8.0 - for USDC.e purchases)
     */
    function _swapUSDCtoAPE(uint256 usdcAmount) internal returns (uint256 apeReceived) {
        uint256 currentAllowance = usdce.allowance(address(this), address(camelotRouter));
        if (currentAllowance < usdcAmount) {
            usdce.approve(address(camelotRouter), type(uint256).max);
        }

        ICamelotRouter.ExactInputSingleParams memory params = ICamelotRouter.ExactInputSingleParams({
            tokenIn: address(usdce),
            tokenOut: address(wape),
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: usdcAmount,
            amountOutMinimum: 0,
            limitSqrtPrice: 0
        });

        uint256 wapeReceived = camelotRouter.exactInputSingle(params);

        // Unwrap WAPE to APE
        if (wapeReceived > 0) {
            wape.withdraw(wapeReceived);
            apeReceived = wapeReceived;
        }
    }

    /**
     * @notice Process USDC.e payment (v1.8.0: 96% NFT pool + 3% treasury)
     * @dev Called after APE reserves have been split off
     */
    function _processUSDCPayment(uint256 usdcAmount) internal {
        // Calculate splits from the USDC.e amount
        // Since we already took 1% for APE reserves, this usdcAmount represents 99%
        // We need to split it 96% NFT pool + 3% treasury (total 99%)
        // So from the perspective of this 99%: 96/99 goes to NFT pool, 3/99 goes to treasury
        uint256 treasuryFee = (usdcAmount * TREASURY_FEE_BPS) / (TREASURY_FEE_BPS + NFT_POOL_BPS);
        uint256 nftPoolAmount = usdcAmount - treasuryFee;

        // Track treasury fee
        accumulatedUSDCFees += treasuryFee;
        totalPlatformFees += treasuryFee;

        // Send NFT pool amount to SlabNFTManager
        if (address(slabNFTManager) != address(0) && nftPoolAmount > 0) {
            uint256 currentAllowance = usdce.allowance(address(this), address(slabNFTManager));
            if (currentAllowance < nftPoolAmount) {
                usdce.approve(address(slabNFTManager), type(uint256).max);
            }

            slabNFTManager.depositRevenue(nftPoolAmount);
            slabNFTManager.checkAndPurchaseNFT();

            totalRevenuePool += nftPoolAmount;
            emit RevenueSentToManager(nftPoolAmount);
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
            _handleSuccessfulCatch(pendingThrow.thrower, pokemon, slot, randomNumber);
        } else {
            _handleFailedCatch(pendingThrow.thrower, pokemon, slot, randomNumber);
        }
    }

    function _handleSuccessfulCatch(address catcher, Pokemon storage pokemon, uint8 slot, uint256 randomNumber) internal {
        uint256 pokemonId = pokemon.id;
        uint256 nftTokenId = 0;

        if (address(slabNFTManager) != address(0)) {
            uint256 inventoryCount = slabNFTManager.getInventoryCount();
            if (inventoryCount > 0) {
                nftTokenId = slabNFTManager.awardNFTToWinnerWithRandomness(catcher, randomNumber);
                totalNFTsPurchased++;
            } else if (revertOnNoNFT) {
                revert NoNFTAvailable();
            }
        }

        delete activePokemons[slot];

        emit CaughtPokemon(catcher, pokemonId, nftTokenId);
    }

    function _handleFailedCatch(address thrower, Pokemon storage pokemon, uint8 slot, uint256 randomNumber) internal {
        pokemon.throwAttempts++;

        if (pokemon.throwAttempts >= MAX_THROW_ATTEMPTS) {
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

    /**
     * @notice Recover signer from signature
     */
    function _recoverSigner(bytes32 messageHash, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) {
            v += 27;
        }

        return ecrecover(messageHash, v, r, s);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Storage Gap ============
    // v1.9.0: Reduced by 1 slot (maxActivePokemon + _v190Initialized share a single slot due to packing)

    uint256[32] private __gap;

    // ============ Receive Function ============

    receive() external payable {
        // Accept APE deposits
        totalAPEReserve += msg.value;
        emit APEReserveDeposited(msg.value, totalAPEReserve);
    }
}
