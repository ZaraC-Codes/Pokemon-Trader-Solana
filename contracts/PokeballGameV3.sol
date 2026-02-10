// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title PokeballGame
 * @notice Pokemon catching mini-game on ApeChain with provably fair randomness
 * @dev UUPS upgradeable contract integrating POP VRNG for fair catch mechanics
 * @author Z33Fi ("Z33Fi Made It")
 * @custom:artist-signature Z33Fi Made It
 * @custom:network ApeChain Mainnet (Chain ID: 33139)
 * @custom:version 1.3.1
 *
 * CHANGELOG v1.3.0:
 * - Configurable ball prices via setBallPrice() - no longer constants
 * - Added $49.90 max purchase cap per transaction (MAX_PURCHASE_USD)
 * - Enhanced BallPurchased event with totalAmount field
 * - Added RandomnessReceived event for VRNG callback tracking
 * - Added setOwnerWallet() for ownership transfer with event
 * - Option to revert if no NFT available on catch (configurable)
 * - Storage layout compatible with v1.2.0
 *
 * CHANGELOG v1.3.1:
 * - Added setApeToken() to update APE/WAPE token address
 * - Fixes: Contract was initialized with Ethereum mainnet APE address instead of ApeChain WAPE
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
    /**
     * @notice Request a random number with a trace ID for tracking
     * @param traceId Unique identifier to track the request
     * @return requestId The ID of the randomness request
     */
    function requestRandomNumberWithTraceId(uint256 traceId) external returns (uint256 requestId);
}

/**
 * @dev Interface for SlabNFTManager
 * @notice Manages NFT inventory and auto-purchasing from SlabMachine
 */
interface ISlabNFTManager {
    /**
     * @notice Award an NFT from inventory to a winner
     * @param winner Address to receive the NFT
     * @return tokenId The token ID awarded (0 if inventory empty)
     */
    function awardNFTToWinner(address winner) external returns (uint256 tokenId);

    /**
     * @notice Check and trigger NFT purchase if threshold met
     * @return purchased Whether a purchase was initiated
     * @return requestId The SlabMachine request ID
     */
    function checkAndPurchaseNFT() external returns (bool purchased, uint256 requestId);

    /**
     * @notice Get current NFT inventory count
     * @return count Number of NFTs in inventory
     */
    function getInventoryCount() external view returns (uint256 count);

    /**
     * @notice Deposit USDC.e revenue into the manager
     * @param amount Amount of USDC.e to deposit (6 decimals)
     */
    function depositRevenue(uint256 amount) external;
}

/**
 * @dev Interface for price feed to convert APE to USD
 * @notice Placeholder for Chainlink or similar oracle integration
 */
interface IPriceFeed {
    function getAPEPriceInUSD() external view returns (uint256);
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

    /**
     * @dev Ball types with associated pricing and catch rates
     * @notice Each tier offers different risk/reward profiles
     */
    enum BallType {
        PokeBall,    // Default $1.00,  2% catch rate
        GreatBall,   // Default $10.00, 20% catch rate
        UltraBall,   // Default $25.00, 50% catch rate
        MasterBall   // Default $49.90, 99% catch rate
    }

    /**
     * @dev Represents an active Pokemon spawn in the game world
     */
    struct Pokemon {
        uint256 id;              // Unique Pokemon identifier
        uint256 positionX;       // X coordinate in game world (0-999)
        uint256 positionY;       // Y coordinate in game world (0-999)
        uint8 throwAttempts;     // Current throw attempts (max 3)
        bool isActive;           // Whether Pokemon is catchable
        uint256 spawnTime;       // Block timestamp when spawned
    }

    /**
     * @dev Tracks a pending throw awaiting VRNG callback
     */
    struct PendingThrow {
        address thrower;         // Player who threw the ball
        uint256 pokemonId;       // Target Pokemon ID
        BallType ballType;       // Type of ball thrown
        uint256 timestamp;       // When throw was initiated
        bool resolved;           // Whether callback was received
    }

    /**
     * @dev Ball configuration with price and catch rate
     */
    struct BallConfig {
        uint256 priceUSDC;       // Price in USDC.e (6 decimals)
        uint8 catchRate;         // Catch rate percentage (0-100)
    }

    // ============ Constants ============

    /// @notice Maximum concurrent Pokemon spawns
    uint8 public constant MAX_ACTIVE_POKEMON = 20;

    /// @notice Maximum throw attempts before Pokemon relocates
    uint8 public constant MAX_THROW_ATTEMPTS = 3;

    /// @notice Platform fee percentage (3%)
    uint256 public constant PLATFORM_FEE_BPS = 300; // 3% = 300 basis points

    /// @notice Revenue pool percentage (97%)
    uint256 public constant REVENUE_POOL_BPS = 9700; // 97% = 9700 basis points

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice USDC.e decimals
    uint8 public constant USDC_DECIMALS = 6;

    /// @notice APE decimals
    uint8 public constant APE_DECIMALS = 18;

    /// @notice Game world max coordinate
    uint256 public constant MAX_COORDINATE = 999;

    /// @notice Maximum purchase amount per transaction ($49.90 in USDC.e)
    uint256 public constant MAX_PURCHASE_USD = 4990 * 1e4; // 49.90 * 1e6

    // ============ Legacy Constants (kept for reference, no longer used) ============
    // These are superseded by configurable ballPrices mapping

    uint256 private constant _LEGACY_POKEBALL_PRICE = 1 * 1e6;
    uint256 private constant _LEGACY_GREATBALL_PRICE = 10 * 1e6;
    uint256 private constant _LEGACY_ULTRABALL_PRICE = 25 * 1e6;
    uint256 private constant _LEGACY_MASTERBALL_PRICE = 4990 * 1e4;

    // ============ State Variables ============
    // IMPORTANT: Storage layout must remain compatible with v1.2.0
    // Do NOT reorder or remove any existing state variables

    // External contract addresses
    IERC20 public usdce;
    IERC20 public ape;
    IPOPVRNG public vrng;
    IERC721 public slabNFT;

    // Wallet addresses
    address public treasuryWallet;
    address public nftRevenueWallet;

    // Revenue tracking
    uint256 public totalRevenuePool;      // Accumulated 97% for NFT purchases (legacy, now sent to manager)
    uint256 public totalPlatformFees;     // Accumulated 3% fees
    uint256 public totalNFTsPurchased;    // Count of auto-purchased NFTs (legacy counter)

    // Player ball balances: player => ballType => quantity
    mapping(address => mapping(BallType => uint256)) public playerBalls;

    // Active Pokemon spawns
    Pokemon[20] public activePokemons;
    uint256 public nextPokemonId;

    // Pending throws awaiting VRNG callback
    mapping(uint256 => PendingThrow) public pendingThrows;

    // Track request IDs to trace IDs for VRNG
    mapping(uint256 => uint256) public requestIdToTraceId;

    // Counter for generating unique trace IDs
    uint256 private _traceIdCounter;

    // APE price in USD (8 decimals, e.g., 1.50 USD = 150000000)
    uint256 public apePriceUSD;

    // ============ State Variables (v1.1.0) ============

    /// @notice SlabNFTManager contract for NFT inventory and purchases
    ISlabNFTManager public slabNFTManager;

    // ============ NEW State Variables (v1.3.0) ============
    // Added at the end to maintain storage compatibility

    /// @notice Configurable ball prices (ballType => priceUSDC)
    mapping(BallType => uint256) public ballPrices;

    /// @notice Configurable catch rates (ballType => catchRate)
    mapping(BallType => uint8) public ballCatchRates;

    /// @notice Whether to revert if no NFT available on successful catch
    bool public revertOnNoNFT;

    /// @notice Flag to indicate v1.3.0 state has been initialized
    bool private _v130Initialized;

    // ============ Events ============

    /**
     * @notice Emitted when a player purchases balls
     * @param buyer Address of the buyer
     * @param ballType Type of ball purchased (0-3)
     * @param quantity Number of balls purchased
     * @param usedAPE True if paid with APE, false if USDC.e
     * @param totalAmount Total cost in payment token (6 decimals for USDC, 18 for APE)
     */
    event BallPurchased(
        address indexed buyer,
        uint8 ballType,
        uint256 quantity,
        bool usedAPE,
        uint256 totalAmount
    );

    /**
     * @notice Emitted when a player attempts to catch a Pokemon
     * @param thrower Address of the player
     * @param pokemonId ID of the target Pokemon
     * @param ballTier Type of ball used (0-3)
     * @param requestId VRNG request ID for verification
     */
    event ThrowAttempted(
        address indexed thrower,
        uint256 pokemonId,
        uint8 ballTier,
        uint256 requestId
    );

    /**
     * @notice Emitted when VRNG callback is received
     * @param requestId VRNG request ID
     * @param randomNumber The random number received
     * @param isSpawnRequest Whether this was a spawn request
     */
    event RandomnessReceived(
        uint256 indexed requestId,
        uint256 randomNumber,
        bool isSpawnRequest
    );

    /**
     * @notice Emitted when a Pokemon is successfully caught
     * @param catcher Address of the successful player
     * @param pokemonId ID of the caught Pokemon
     * @param nftTokenId Token ID of the awarded NFT (0 if none available)
     */
    event CaughtPokemon(
        address indexed catcher,
        uint256 pokemonId,
        uint256 nftTokenId
    );

    /**
     * @notice Emitted when a catch attempt fails
     * @param thrower Address of the player
     * @param pokemonId ID of the target Pokemon
     * @param attemptsRemaining Remaining attempts before relocation
     */
    event FailedCatch(
        address indexed thrower,
        uint256 pokemonId,
        uint8 attemptsRemaining
    );

    /**
     * @notice Emitted when a Pokemon relocates after max attempts
     * @param pokemonId ID of the relocated Pokemon
     * @param newX New X coordinate
     * @param newY New Y coordinate
     */
    event PokemonRelocated(
        uint256 pokemonId,
        uint256 newX,
        uint256 newY
    );

    /**
     * @notice Emitted when a wallet or manager address is updated
     * @param walletType Type of address ("treasury", "nftRevenue", "slabNFTManager", "owner")
     * @param oldAddress Previous address
     * @param newAddress New address
     */
    event WalletUpdated(
        string walletType,
        address oldAddress,
        address newAddress
    );

    /**
     * @notice Emitted when revenue is sent to SlabNFTManager
     * @param amount Amount sent in USDC.e (6 decimals)
     */
    event RevenueSentToManager(uint256 amount);

    /**
     * @notice Emitted when a new Pokemon spawns
     * @param pokemonId ID of the spawned Pokemon
     * @param positionX X coordinate
     * @param positionY Y coordinate
     * @param slotIndex Slot in activePokemons array (0-19)
     */
    event PokemonSpawned(
        uint256 pokemonId,
        uint256 positionX,
        uint256 positionY,
        uint8 slotIndex
    );

    /**
     * @notice Emitted when APE price is updated
     * @param oldPrice Previous price (8 decimals)
     * @param newPrice New price (8 decimals)
     */
    event APEPriceUpdated(uint256 oldPrice, uint256 newPrice);

    /**
     * @notice Emitted when platform fees are withdrawn
     * @param recipient Treasury wallet address
     * @param amount Amount withdrawn in USDC.e
     */
    event FeesWithdrawn(address recipient, uint256 amount);

    /**
     * @notice Emitted when ball pricing is updated
     * @param ballType Ball type (0-3)
     * @param oldPrice Previous price in USDC.e
     * @param newPrice New price in USDC.e
     */
    event BallPriceUpdated(
        uint8 indexed ballType,
        uint256 oldPrice,
        uint256 newPrice
    );

    /**
     * @notice Emitted when catch rate is updated
     * @param ballType Ball type (0-3)
     * @param oldRate Previous catch rate
     * @param newRate New catch rate
     */
    event CatchRateUpdated(
        uint8 indexed ballType,
        uint8 oldRate,
        uint8 newRate
    );

    // ============ Errors ============

    error InvalidBallType(uint8 provided);
    error InsufficientBalls(BallType ballType, uint256 required, uint256 available);
    error PokemonNotActive(uint256 pokemonId);
    error InvalidPokemonSlot(uint8 slot);
    error ZeroQuantity();
    error ZeroAddress();
    error InsufficientAllowance(address token, uint256 required, uint256 available);
    error InsufficientBalance(address token, uint256 required, uint256 available);
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

    // ============ Modifiers ============

    /**
     * @dev Ensures the caller is the VRNG contract for callbacks
     */
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

    /**
     * @notice Initialize the contract (replaces constructor for UUPS)
     * @param _owner Owner wallet address
     * @param _treasury Treasury wallet for platform fees
     * @param _nftRevenue NFT revenue wallet (legacy, now using SlabNFTManager)
     * @param _usdce USDC.e token address
     * @param _ape APE token address
     * @param _vrng POP VRNG contract address
     * @param _slabNFT Slab NFT contract address
     * @param _initialAPEPrice Initial APE price in USD (8 decimals)
     */
    function initialize(
        address _owner,
        address _treasury,
        address _nftRevenue,
        address _usdce,
        address _ape,
        address _vrng,
        address _slabNFT,
        uint256 _initialAPEPrice
    ) external initializer {
        // Validate addresses
        if (_owner == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_nftRevenue == address(0)) revert ZeroAddress();
        if (_usdce == address(0)) revert ZeroAddress();
        if (_ape == address(0)) revert ZeroAddress();
        if (_vrng == address(0)) revert ZeroAddress();
        if (_slabNFT == address(0)) revert ZeroAddress();
        if (_initialAPEPrice == 0) revert InvalidPrice();

        // Initialize inherited contracts
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        // Set external contracts
        usdce = IERC20(_usdce);
        ape = IERC20(_ape);
        vrng = IPOPVRNG(_vrng);
        slabNFT = IERC721(_slabNFT);

        // Set wallets
        treasuryWallet = _treasury;
        nftRevenueWallet = _nftRevenue;

        // Set initial APE price
        apePriceUSD = _initialAPEPrice;

        // Initialize Pokemon ID counter
        nextPokemonId = 1;

        // Initialize trace ID counter
        _traceIdCounter = 1;

        // Initialize default ball prices and catch rates
        _initializeDefaultPricing();
    }

    /**
     * @notice Initialize v1.3.0 state variables (call after upgrade)
     * @dev Only needs to be called once after upgrading from v1.2.0
     */
    function initializeV130() external onlyOwner {
        require(!_v130Initialized, "V1.3.0 already initialized");
        _initializeDefaultPricing();
        _v130Initialized = true;
    }

    /**
     * @dev Set default ball prices and catch rates
     */
    function _initializeDefaultPricing() internal {
        // Default prices (USDC.e with 6 decimals)
        ballPrices[BallType.PokeBall] = 1 * 1e6;       // $1.00
        ballPrices[BallType.GreatBall] = 10 * 1e6;    // $10.00
        ballPrices[BallType.UltraBall] = 25 * 1e6;    // $25.00
        ballPrices[BallType.MasterBall] = 4990 * 1e4; // $49.90

        // Default catch rates
        ballCatchRates[BallType.PokeBall] = 2;    // 2%
        ballCatchRates[BallType.GreatBall] = 20;  // 20%
        ballCatchRates[BallType.UltraBall] = 50;  // 50%
        ballCatchRates[BallType.MasterBall] = 99; // 99%

        // Default: don't revert if no NFT
        revertOnNoNFT = false;
    }

    // ============ External Functions - Ball Purchase ============

    /**
     * @notice Purchase balls using USDC.e or APE tokens
     * @dev 97% goes to SlabNFTManager for NFT purchases, 3% to platform fees
     * @dev Maximum purchase is $49.90 USD per transaction
     * @param ballType Type of ball to purchase (0-3)
     * @param quantity Number of balls to purchase
     * @param useAPE True to pay with APE, false for USDC.e
     */
    function purchaseBalls(
        uint8 ballType,
        uint256 quantity,
        bool useAPE
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

        uint256 actualPaymentAmount;
        if (useAPE) {
            actualPaymentAmount = _processAPEPayment(totalCostUSDC);
        } else {
            actualPaymentAmount = totalCostUSDC;
            _processUSDCPayment(totalCostUSDC);
        }

        // Credit balls to player
        playerBalls[msg.sender][ball] += quantity;

        emit BallPurchased(msg.sender, ballType, quantity, useAPE, actualPaymentAmount);
    }

    // ============ External Functions - Game Mechanics ============

    /**
     * @notice Throw a ball at an active Pokemon
     * @dev Requests random number from POP VRNG for fair catch determination
     * @param pokemonSlot Index in activePokemons array (0-19)
     * @param ballType Type of ball to throw (0-3)
     * @return requestId The VRNG request ID for tracking
     */
    function throwBall(
        uint8 pokemonSlot,
        uint8 ballType
    ) external nonReentrant whenNotPaused returns (uint256 requestId) {
        if (pokemonSlot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(pokemonSlot);
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);

        Pokemon storage pokemon = activePokemons[pokemonSlot];
        if (!pokemon.isActive) revert PokemonNotActive(pokemon.id);

        BallType ball = BallType(ballType);

        // Check and deduct ball from inventory
        if (playerBalls[msg.sender][ball] == 0) {
            revert InsufficientBalls(ball, 1, 0);
        }
        playerBalls[msg.sender][ball] -= 1;

        // Generate unique trace ID
        uint256 traceId = _generateTraceId(msg.sender, pokemon.id, ballType);

        // Request random number from VRNG
        requestId = vrng.requestRandomNumberWithTraceId(traceId);

        // Store pending throw details
        pendingThrows[requestId] = PendingThrow({
            thrower: msg.sender,
            pokemonId: pokemon.id,
            ballType: ball,
            timestamp: block.timestamp,
            resolved: false
        });

        // Map request ID to trace ID for verification
        requestIdToTraceId[requestId] = traceId;

        emit ThrowAttempted(msg.sender, pokemon.id, ballType, requestId);

        return requestId;
    }

    /**
     * @notice Callback function called by POP VRNG with random number
     * @dev Only callable by the VRNG contract. Handles both throw attempts and spawn requests.
     * @param requestId The request ID from the original throw or spawn
     * @param randomNumber The verifiable random number
     */
    function randomNumberCallback(
        uint256 requestId,
        uint256 randomNumber
    ) external onlyVRNG {
        PendingThrow storage pendingThrow = pendingThrows[requestId];

        if (pendingThrow.thrower == address(0)) revert ThrowNotFound(requestId);
        if (pendingThrow.resolved) revert ThrowAlreadyResolved(requestId);

        pendingThrow.resolved = true;

        // Check if this is a spawn/respawn request (thrower == address(this))
        bool isSpawnRequest = pendingThrow.thrower == address(this);

        // Emit randomness received event
        emit RandomnessReceived(requestId, randomNumber, isSpawnRequest);

        if (isSpawnRequest) {
            _handleSpawnCallback(pendingThrow, randomNumber);
            return;
        }

        // Otherwise, this is a throw attempt
        _handleThrowCallback(pendingThrow, randomNumber);
    }

    /**
     * @dev Handle VRNG callback for spawn/respawn requests
     * @param pendingThrow The pending request data
     * @param randomNumber Random number for position calculation
     */
    function _handleSpawnCallback(
        PendingThrow storage pendingThrow,
        uint256 randomNumber
    ) internal {
        // ballType stores the slot index for spawn requests
        uint8 slot = uint8(pendingThrow.ballType);

        if (slot >= MAX_ACTIVE_POKEMON) return;

        // Don't overwrite if slot became occupied
        if (activePokemons[slot].isActive) return;

        // Calculate random position from VRNG
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

    /**
     * @dev Handle VRNG callback for throw attempts
     * @param pendingThrow The pending throw data
     * @param randomNumber Random number for catch determination
     */
    function _handleThrowCallback(
        PendingThrow storage pendingThrow,
        uint256 randomNumber
    ) internal {
        // Find the Pokemon slot
        (bool found, uint8 slot) = _findPokemonSlot(pendingThrow.pokemonId);

        // If Pokemon is no longer active (already caught or despawned), just return
        if (!found || !activePokemons[slot].isActive) {
            return;
        }

        Pokemon storage pokemon = activePokemons[slot];

        // Determine catch success
        uint8 catchRate = getCatchRate(pendingThrow.ballType);
        uint256 roll = randomNumber % 100;
        bool caught = roll < catchRate;

        if (caught) {
            _handleSuccessfulCatch(pendingThrow.thrower, pokemon, slot);
        } else {
            _handleFailedCatch(pendingThrow.thrower, pokemon, slot, randomNumber);
        }
    }

    // ============ External Functions - Pokemon Management ============

    /**
     * @notice Spawn a new Pokemon at a specific slot
     * @dev Only callable by owner; position determined by VRNG callback
     * @param slot Slot index (0-19) to spawn Pokemon
     */
    function spawnPokemon(uint8 slot) external onlyOwner {
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);
        if (activePokemons[slot].isActive) revert SlotOccupied(slot);

        uint256 pokemonId = nextPokemonId++;
        uint256 traceId = _generateTraceId(address(this), pokemonId, 255); // 255 = spawn action

        // Request random position from VRNG
        uint256 requestId = vrng.requestRandomNumberWithTraceId(traceId);

        // Store spawn request
        pendingThrows[requestId] = PendingThrow({
            thrower: address(this), // Marker for spawn request
            pokemonId: pokemonId,
            ballType: BallType(slot), // Store slot in ballType field
            timestamp: block.timestamp,
            resolved: false
        });

        requestIdToTraceId[requestId] = traceId;
    }

    /**
     * @notice Force spawn a Pokemon with specific coordinates (for testing/admin)
     * @dev Only callable by owner
     * @param slot Slot index (0-19)
     * @param posX X coordinate (0-999)
     * @param posY Y coordinate (0-999)
     */
    function forceSpawnPokemon(
        uint8 slot,
        uint256 posX,
        uint256 posY
    ) external onlyOwner {
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

    /**
     * @notice Despawn a Pokemon from a slot
     * @dev Only callable by owner
     * @param slot Slot index (0-19)
     */
    function despawnPokemon(uint8 slot) external onlyOwner {
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);

        activePokemons[slot].isActive = false;
    }

    // ============ External Functions - Pricing Management ============

    /**
     * @notice Set the price for a specific ball type
     * @dev Only callable by owner
     * @param ballType Ball type (0-3)
     * @param newPrice New price in USDC.e (6 decimals)
     */
    function setBallPrice(uint8 ballType, uint256 newPrice) external onlyOwner {
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);
        if (newPrice == 0) revert InvalidPrice();
        // Ensure price doesn't exceed max purchase limit
        if (newPrice > MAX_PURCHASE_USD) revert PurchaseExceedsMaximum(newPrice, MAX_PURCHASE_USD);

        BallType ball = BallType(ballType);
        uint256 oldPrice = ballPrices[ball];
        ballPrices[ball] = newPrice;

        emit BallPriceUpdated(ballType, oldPrice, newPrice);
    }

    /**
     * @notice Set the catch rate for a specific ball type
     * @dev Only callable by owner
     * @param ballType Ball type (0-3)
     * @param newRate New catch rate (0-100)
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
     * @notice Set all ball prices at once
     * @dev Only callable by owner
     * @param pokeBallPrice Poke Ball price in USDC.e
     * @param greatBallPrice Great Ball price in USDC.e
     * @param ultraBallPrice Ultra Ball price in USDC.e
     * @param masterBallPrice Master Ball price in USDC.e
     */
    function setPricingConfig(
        uint256 pokeBallPrice,
        uint256 greatBallPrice,
        uint256 ultraBallPrice,
        uint256 masterBallPrice
    ) external onlyOwner {
        if (pokeBallPrice == 0 || greatBallPrice == 0 ||
            ultraBallPrice == 0 || masterBallPrice == 0) revert InvalidPrice();

        // Validate none exceed max
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

    /**
     * @notice Set whether to revert if no NFT available on catch
     * @dev Only callable by owner
     * @param _revertOnNoNFT True to revert, false to continue with tokenId=0
     */
    function setRevertOnNoNFT(bool _revertOnNoNFT) external onlyOwner {
        revertOnNoNFT = _revertOnNoNFT;
    }

    // ============ External Functions - Wallet Management ============

    /**
     * @notice Set the SlabNFTManager contract address
     * @dev Only callable by owner
     * @param _slabNFTManager New SlabNFTManager address
     */
    function setSlabNFTManager(address _slabNFTManager) external onlyOwner {
        if (_slabNFTManager == address(0)) revert ZeroAddress();

        address oldManager = address(slabNFTManager);
        slabNFTManager = ISlabNFTManager(_slabNFTManager);

        emit WalletUpdated("slabNFTManager", oldManager, _slabNFTManager);
    }

    /**
     * @notice Update the treasury wallet address
     * @dev Only callable by owner
     * @param newTreasury New treasury wallet address
     */
    function setTreasuryWallet(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();

        address oldTreasury = treasuryWallet;
        treasuryWallet = newTreasury;

        emit WalletUpdated("treasury", oldTreasury, newTreasury);
    }

    /**
     * @notice Update the NFT revenue wallet address (legacy)
     * @dev Only callable by owner; prefer using SlabNFTManager
     * @param newNFTRevenue New NFT revenue wallet address
     */
    function setNFTRevenueWallet(address newNFTRevenue) external onlyOwner {
        if (newNFTRevenue == address(0)) revert ZeroAddress();

        address oldNFTRevenue = nftRevenueWallet;
        nftRevenueWallet = newNFTRevenue;

        emit WalletUpdated("nftRevenue", oldNFTRevenue, newNFTRevenue);
    }

    /**
     * @notice Transfer ownership to a new address
     * @dev Overrides OwnableUpgradeable to add event
     * @param newOwner New owner address
     */
    function setOwnerWallet(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();

        address oldOwner = owner();
        _transferOwnership(newOwner);

        emit WalletUpdated("owner", oldOwner, newOwner);
    }

    /**
     * @notice Update the APE price in USD
     * @dev Only callable by owner; should integrate oracle in production
     * @param newPrice New APE price in USD (8 decimals)
     */
    function setAPEPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert InvalidPrice();

        uint256 oldPrice = apePriceUSD;
        apePriceUSD = newPrice;

        emit APEPriceUpdated(oldPrice, newPrice);
    }

    /**
     * @notice Update the APE/WAPE token address
     * @dev Only callable by owner. Used to fix incorrect initialization with
     *      Ethereum mainnet APE address. ApeChain uses WAPE (Wrapped APE).
     * @param newApeToken New APE/WAPE token address
     */
    function setApeToken(address newApeToken) external onlyOwner {
        if (newApeToken == address(0)) revert ZeroAddress();

        address oldApeToken = address(ape);
        ape = IERC20(newApeToken);

        emit WalletUpdated("apeToken", oldApeToken, newApeToken);
    }

    /**
     * @notice Withdraw accumulated platform fees to treasury
     * @dev Only callable by owner
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 fees = totalPlatformFees;
        if (fees == 0) revert NoFeesToWithdraw();

        totalPlatformFees = 0;

        usdce.safeTransfer(treasuryWallet, fees);

        emit FeesWithdrawn(treasuryWallet, fees);
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
     * @notice Get a player's ball balance for a specific type
     * @param player Player address
     * @param ballType Ball type (0-3)
     * @return quantity Number of balls owned
     */
    function getPlayerBallBalance(
        address player,
        uint8 ballType
    ) external view returns (uint256 quantity) {
        if (ballType > uint8(BallType.MasterBall)) revert InvalidBallType(ballType);
        return playerBalls[player][BallType(ballType)];
    }

    /**
     * @notice Get all ball balances for a player
     * @param player Player address
     * @return pokeBalls Number of Poke Balls
     * @return greatBalls Number of Great Balls
     * @return ultraBalls Number of Ultra Balls
     * @return masterBalls Number of Master Balls
     */
    function getAllPlayerBalls(
        address player
    ) external view returns (
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

    /**
     * @notice Get details of an active Pokemon
     * @param slot Slot index (0-19)
     * @return pokemon The Pokemon struct
     */
    function getPokemon(uint8 slot) external view returns (Pokemon memory pokemon) {
        if (slot >= MAX_ACTIVE_POKEMON) revert InvalidPokemonSlot(slot);
        return activePokemons[slot];
    }

    /**
     * @notice Get all active Pokemon
     * @return pokemons Array of all 20 Pokemon slots (check isActive for occupancy)
     */
    function getAllActivePokemons() external view returns (Pokemon[20] memory pokemons) {
        return activePokemons;
    }

    /**
     * @notice Get count of currently active Pokemon
     * @return count Number of Pokemon where isActive == true
     */
    function getActivePokemonCount() external view returns (uint8 count) {
        for (uint8 i = 0; i < MAX_ACTIVE_POKEMON; i++) {
            if (activePokemons[i].isActive) {
                count++;
            }
        }
        return count;
    }

    /**
     * @notice Get slot indices of all currently active Pokemon
     * @return slots Array of slot indices (length matches active count)
     */
    function getActivePokemonSlots() external view returns (uint8[] memory slots) {
        // First pass: count active
        uint8 count = 0;
        for (uint8 i = 0; i < MAX_ACTIVE_POKEMON; i++) {
            if (activePokemons[i].isActive) {
                count++;
            }
        }

        // Second pass: fill array
        slots = new uint8[](count);
        uint8 idx = 0;
        for (uint8 i = 0; i < MAX_ACTIVE_POKEMON; i++) {
            if (activePokemons[i].isActive) {
                slots[idx++] = i;
            }
        }
        return slots;
    }

    /**
     * @notice Get details of a pending throw
     * @param requestId VRNG request ID
     * @return pendingThrow The PendingThrow struct
     */
    function getPendingThrow(
        uint256 requestId
    ) external view returns (PendingThrow memory) {
        return pendingThrows[requestId];
    }

    /**
     * @notice Get NFT inventory count from SlabNFTManager
     * @return count Number of NFTs available
     */
    function getNFTInventoryCount() external view returns (uint256 count) {
        if (address(slabNFTManager) == address(0)) {
            return 0;
        }
        return slabNFTManager.getInventoryCount();
    }

    /**
     * @notice Calculate APE amount needed for a USDC value
     * @param usdcAmount Amount in USDC.e (6 decimals)
     * @return apeAmount Amount in APE (18 decimals)
     */
    function calculateAPEAmount(
        uint256 usdcAmount
    ) public view returns (uint256 apeAmount) {
        return (usdcAmount * 1e20) / apePriceUSD;
    }

    /**
     * @notice Get all ball pricing configuration
     * @return pokeBallPrice Poke Ball price
     * @return greatBallPrice Great Ball price
     * @return ultraBallPrice Ultra Ball price
     * @return masterBallPrice Master Ball price
     */
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

    /**
     * @notice Get all catch rate configuration
     * @return pokeBallRate Poke Ball catch rate
     * @return greatBallRate Great Ball catch rate
     * @return ultraBallRate Ultra Ball catch rate
     * @return masterBallRate Master Ball catch rate
     */
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

    // ============ Public View Functions ============

    /**
     * @notice Get the price of a ball type in USDC.e
     * @param ballType Ball type enum
     * @return price Price in USDC.e (6 decimals)
     */
    function getBallPrice(BallType ballType) public view returns (uint256 price) {
        price = ballPrices[ballType];
        // Fallback to legacy defaults if not set (for upgrade compatibility)
        if (price == 0) {
            if (ballType == BallType.PokeBall) return 1 * 1e6;
            if (ballType == BallType.GreatBall) return 10 * 1e6;
            if (ballType == BallType.UltraBall) return 25 * 1e6;
            if (ballType == BallType.MasterBall) return 4990 * 1e4;
        }
        return price;
    }

    /**
     * @notice Get the catch rate of a ball type
     * @param ballType Ball type enum
     * @return rate Catch rate percentage (0-100)
     */
    function getCatchRate(BallType ballType) public view returns (uint8 rate) {
        rate = ballCatchRates[ballType];
        // Fallback to legacy defaults if not set (for upgrade compatibility)
        if (rate == 0) {
            if (ballType == BallType.PokeBall) return 2;
            if (ballType == BallType.GreatBall) return 20;
            if (ballType == BallType.UltraBall) return 50;
            if (ballType == BallType.MasterBall) return 99;
        }
        return rate;
    }

    // ============ Internal Functions ============

    /**
     * @dev Process payment in USDC.e
     * @notice 97% sent to SlabNFTManager, 3% kept as platform fees
     * @param totalCostUSDC Total cost in USDC.e (6 decimals)
     */
    function _processUSDCPayment(uint256 totalCostUSDC) internal {
        // Check allowance
        uint256 allowance = usdce.allowance(msg.sender, address(this));
        if (allowance < totalCostUSDC) {
            revert InsufficientAllowance(address(usdce), totalCostUSDC, allowance);
        }

        // Check balance
        uint256 balance = usdce.balanceOf(msg.sender);
        if (balance < totalCostUSDC) {
            revert InsufficientBalance(address(usdce), totalCostUSDC, balance);
        }

        // Transfer from user to this contract
        usdce.safeTransferFrom(msg.sender, address(this), totalCostUSDC);

        // Split: 97% to SlabNFTManager, 3% to platform fees
        uint256 platformFee = (totalCostUSDC * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 revenueAmount = totalCostUSDC - platformFee;

        // Accumulate platform fees (withdrawn by owner later)
        totalPlatformFees += platformFee;

        // Send 97% revenue to SlabNFTManager and trigger auto-purchase check
        if (address(slabNFTManager) != address(0) && revenueAmount > 0) {
            // Approve SlabNFTManager to pull the revenue
            usdce.safeIncreaseAllowance(address(slabNFTManager), revenueAmount);

            // Deposit revenue to manager
            slabNFTManager.depositRevenue(revenueAmount);

            // Trigger auto-purchase check
            slabNFTManager.checkAndPurchaseNFT();

            emit RevenueSentToManager(revenueAmount);
        }
    }

    /**
     * @dev Process payment in APE (converted from USDC value)
     * @notice For APE payments, we track USDC equivalent and handle revenue flow
     * @param totalCostUSDC Total cost in USDC.e equivalent (6 decimals)
     * @return apeAmount The amount of APE transferred
     */
    function _processAPEPayment(uint256 totalCostUSDC) internal returns (uint256 apeAmount) {
        // Convert USDC cost to APE amount
        apeAmount = calculateAPEAmount(totalCostUSDC);

        // Check allowance
        uint256 allowance = ape.allowance(msg.sender, address(this));
        if (allowance < apeAmount) {
            revert InsufficientAllowance(address(ape), apeAmount, allowance);
        }

        // Check balance
        uint256 balance = ape.balanceOf(msg.sender);
        if (balance < apeAmount) {
            revert InsufficientBalance(address(ape), apeAmount, balance);
        }

        // Transfer APE from user
        ape.safeTransferFrom(msg.sender, address(this), apeAmount);

        // Calculate fee split (in USDC terms for tracking)
        uint256 platformFee = (totalCostUSDC * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;

        // Track platform fee in USDC equivalent (will need manual conversion)
        totalPlatformFees += platformFee;

        return apeAmount;
    }

    /**
     * @dev Handle successful Pokemon catch
     * @notice Awards NFT via SlabNFTManager if available
     * @param catcher Address of the successful player
     * @param pokemon The caught Pokemon
     * @param slot Slot index
     */
    function _handleSuccessfulCatch(
        address catcher,
        Pokemon storage pokemon,
        uint8 slot
    ) internal {
        uint256 pokemonId = pokemon.id;

        // Deactivate the Pokemon
        pokemon.isActive = false;

        // Award NFT via SlabNFTManager
        uint256 nftTokenId = 0;
        if (address(slabNFTManager) != address(0)) {
            // SlabNFTManager.awardNFTToWinner returns 0 if no NFT available
            nftTokenId = slabNFTManager.awardNFTToWinner(catcher);

            // Optionally revert if no NFT available
            if (nftTokenId == 0 && revertOnNoNFT) {
                revert NoNFTAvailable();
            }
        }

        // Emit event (nftTokenId will be 0 if no NFT was available)
        emit CaughtPokemon(catcher, pokemonId, nftTokenId);

        // Auto-respawn Pokemon at new location
        _respawnPokemonAtSlot(slot, pokemonId + 1000); // Use offset ID for respawn
    }

    /**
     * @dev Handle failed catch attempt
     * @param thrower Address of the player
     * @param pokemon The target Pokemon
     * @param slot Slot index (unused but kept for signature consistency)
     * @param randomNumber Random number for relocation
     */
    function _handleFailedCatch(
        address thrower,
        Pokemon storage pokemon,
        uint8 slot,
        uint256 randomNumber
    ) internal {
        // Suppress unused variable warning
        slot;

        pokemon.throwAttempts++;
        uint8 attemptsRemaining = MAX_THROW_ATTEMPTS - pokemon.throwAttempts;

        emit FailedCatch(thrower, pokemon.id, attemptsRemaining);

        // Check if max attempts reached
        if (pokemon.throwAttempts >= MAX_THROW_ATTEMPTS) {
            // Relocate Pokemon
            uint256 newX = (randomNumber >> 8) % (MAX_COORDINATE + 1);
            uint256 newY = (randomNumber >> 16) % (MAX_COORDINATE + 1);

            pokemon.positionX = newX;
            pokemon.positionY = newY;
            pokemon.throwAttempts = 0;

            emit PokemonRelocated(pokemon.id, newX, newY);
        }
    }

    /**
     * @dev Respawn a Pokemon at a specific slot
     * @param slot Slot index
     * @param newPokemonId ID for the new Pokemon
     */
    function _respawnPokemonAtSlot(uint8 slot, uint256 newPokemonId) internal {
        // Request random position for respawn
        uint256 traceId = _generateTraceId(address(this), newPokemonId, 254); // 254 = respawn action

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

    /**
     * @dev Find the slot of a Pokemon by ID
     * @param pokemonId Pokemon ID to find
     * @return found Whether Pokemon was found
     * @return slot Slot index if found
     */
    function _findPokemonSlot(
        uint256 pokemonId
    ) internal view returns (bool found, uint8 slot) {
        for (uint8 i = 0; i < MAX_ACTIVE_POKEMON; i++) {
            if (activePokemons[i].id == pokemonId && activePokemons[i].isActive) {
                return (true, i);
            }
        }
        return (false, 0);
    }

    /**
     * @dev Generate a unique trace ID for VRNG requests
     * @param actor Address initiating the action
     * @param targetId Pokemon ID or action target
     * @param actionType Type of action (ball type, spawn, etc.)
     * @return traceId Unique trace identifier
     */
    function _generateTraceId(
        address actor,
        uint256 targetId,
        uint8 actionType
    ) internal returns (uint256 traceId) {
        return uint256(keccak256(abi.encodePacked(
            actor,
            targetId,
            actionType,
            block.timestamp,
            _traceIdCounter++
        )));
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
     * @notice Reduced from 49 to 45 to account for new v1.3.0 state variables:
     *         - ballPrices mapping (1 slot for mapping pointer)
     *         - ballCatchRates mapping (1 slot for mapping pointer)
     *         - revertOnNoNFT bool (1 slot, packed)
     *         - _v130Initialized bool (packed with above)
     */
    uint256[45] private __gap;
}
