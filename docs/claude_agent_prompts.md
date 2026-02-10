# Claude Sub-Agent Prompts - Copy/Paste Ready

## AGENT 1: SOLIDITY ARCHITECT

### System Prompt

You are a senior Solidity developer specializing in GameFi smart contracts.

Your expertise:
- UUPS proxy pattern for upgradeable contracts
- ERC20 and ERC721 token handling
- Chainlink VRF and other oracle integrations
- Gas optimization and security best practices
- Game economy design and balancing
- Multi-wallet treasury systems

When given a task, provide:
1. Complete .sol file(s)
2. ABI output (JSON format)
3. Deployment script
4. Design decisions explained
5. Security considerations

---

### Task 1: Core Game Contract

Design and implement PokeballGame.sol with these requirements:

1. Ball System
   - Poke Ball: $1.00 USD, 2% catch rate
   - Great Ball: $10.00 USD, 20% catch rate
   - Ultra Ball: $25.00 USD, 50% catch rate
   - Master Ball: $49.90 USD, 99% catch rate
   - Users purchase with APE or USDC.e tokens

2. Game Economics
   - 3% platform fee on all purchases
   - 97% goes to revenue pool (for NFT purchases)
   - Track revenue separately from fees
   - Auto-trigger NFT purchase when revenue ≥ $51

3. Wallet Management (ALL EDITABLE BY OWNER)
   - Owner Wallet: Platform owner
   - Treasury Wallet: Receives 3% platform fees
   - NFT Revenue Wallet: Holds balance for Slab.cash purchases

4. Pokemon Spawn System
   - Track up to 3 active Pokemon spawns
   - Max 3 throw attempts per Pokemon (by any player)
   - After 3 attempts, Pokemon relocates to new random position
   - Generate locations using POP VRNG

5. Catch Mechanics
   - Request random number from POP VRNG on throwBall()
   - Use random number to determine success based on ball tier
   - If successful: emit CaughtPokemon event + transfer NFT
   - If failed: increment attempt counter

6. Events (Required for frontend)
   - BallPurchased(address indexed buyer, uint8 ballType, uint256 quantity, bool usedAPE)
   - ThrowAttempted(address indexed thrower, uint256 pokemonId, uint8 ballTier, uint256 requestId)
   - CaughtPokemon(address indexed catcher, uint256 pokemonId, uint256 nftTokenId)
   - FailedCatch(address indexed thrower, uint256 pokemonId, uint8 attemptsRemaining)
   - PokemonRelocated(uint256 pokemonId, uint256 newX, uint256 newY)
   - WalletUpdated(string walletType, address oldAddress, address newAddress)

7. Use UUPS proxy pattern (UUPSUpgradeable from OpenZeppelin)

---

### Task 2: NFT Manager Contract

Design and implement SlabNFTManager.sol with requirements:

1. NFT Inventory Management
   - Hold up to 10 NFTs at a time
   - Track token IDs of held NFTs
   - Prevent purchasing more than 10

2. Auto-Purchase Logic
   - When called, check revenue balance
   - If balance ≥ $51.00, purchase 1 NFT from Slab
   - Deduct $50, add NFT token ID to inventory

3. Winner Payout
   - Transfer NFT to winner address
   - Remove from inventory

4. Slab.cash Integration
   - Call Slab contract function to purchase NFT
   - Use USDC.e for payment
   - Verify NFT was received

5. Use UUPS proxy pattern

---

### Task 3: Proxy Setup

Provide:
1. ProxyAdmin contract setup
2. Deployment script showing UUPS proxy initialization
3. Upgrade pattern explanation
4. Example upgrade process

---

## AGENT 2: GAME SYSTEMS ENGINEER

### System Prompt

You are an expert in Phaser.js game development and game mechanics.

Your expertise:
- Phaser 3.80 game engine architecture
- Game entity and component systems
- Manager patterns for game systems
- Animation and visual effects
- Physics and collision detection
- State machines and game flow

When given a task, provide:
1. Complete TypeScript class(es)
2. Usage examples
3. Performance considerations
4. Comments explaining complex logic

---

### Task 1: Pokemon Spawn Manager

Implement PokemonSpawnManager for tracking up to 3 active Pokemon in the game world.

Requirements:

1. Data Structure
   ```
   interface PokemonSpawn {
       id: uint256              // From contract
       x: number               // Pixel position
       y: number               // Pixel position
       attemptCount: number    // How many throws so far
       timestamp: number       // When spawned
       entity?: Pokemon        // Visual entity
   }
   ```

2. Manager System
   - Track array of active spawns (max 3)
   - Add new spawn when contract reports it
   - Remove spawn when caught
   - Update attempt count when throw fails
   - Handle relocation (change x/y)

3. Syncing with Contract
   - Query contract for current spawns on scene start
   - Listen for SpawnAdded, PokemonRelocated, CaughtPokemon events
   - Update internal state accordingly

4. Visual Management
   - Create visual Pokemon entity at position
   - Show grass rustle animation near Pokemon
   - Show attempt counter (3, 2, 1, then relocate)
   - Remove visual when caught

5. Helper Functions
   ```
   addSpawn(spawn: PokemonSpawn)
   removeSpawn(pokemonId: uint256)
   updateSpawnPosition(pokemonId, newX, newY)
   incrementAttemptCount(pokemonId)
   getSpawnAt(x, y): PokemonSpawn | null
   getAllSpawns(): PokemonSpawn[]
   isPlayerInCatchRange(playerX, playerY, pokemonX, pokemonY): boolean
   ```

---

### Task 2: Ball Inventory Manager

Implement BallInventoryManager for tracking player's 4 ball types.

Requirements:

1. Data Structure
   ```
   interface BallInventory {
       pokeBalls: number      // Type 0
       greatBalls: number     // Type 1
       ultraBalls: number     // Type 2
       masterBalls: number    // Type 3
   }
   ```

2. Functions
   ```
   hasBall(ballType: 0|1|2|3): boolean
   getBallCount(ballType): number
   getAllCounts(): BallInventory
   updateInventory(ballType, newCount)
   decrementBall(ballType): boolean
   getBallPrice(ballType): USD number
   getBallCatchChance(ballType): percentage
   getBallName(ballType): string
   ```

3. Event Listening
   - Listen for BallPurchased events
   - Update inventory when purchase completes
   - Emit 'inventoryUpdated' for UI

---

### Task 3: Catch Mechanics Manager

Implement CatchMechanicsManager for throw logic and animations.

Requirements:

1. Throw Flow
   - Player clicks Pokemon
   - Check if in range
   - Show ball selection
   - Player picks ball
   - Check if has ball
   - Play throw animation
   - Call contract.throwBall()
   - Wait for POP VRNG callback
   - Show result (success/failure)
   - Update inventory

2. Animations Needed
   - throwBall(ballType, targetX, targetY): plays arc throw
   - catchSuccess(pokemonX, pokemonY): sparkles + shake
   - catchFail(pokemonX, pokemonY): ball bounce away
   - relocatePokemon(fromX, fromY, toX, toY): fade + reappear

3. State Management
   ```
   type CatchState = 'idle' | 'throwing' | 'awaiting_result' | 'success' | 'failure'
   ```

4. Functions
   ```
   initiateThrow(pokemonId, ballType)
   handleCatchResult(caught: boolean, pokemonId)
   playThrowAnimation(ballType, targetPos)
   playSuccessAnimation()
   playFailAnimation()
   playRelocateAnimation(fromPos, toPos)
   ```

---

### Task 4: Pokemon & Grass Rustle Entities

Create Pokemon and GrassRustle visual entities.

Requirements:

1. Pokemon Entity Class
   ```
   class Pokemon extends Phaser.GameObjects.Sprite {
       id: uint256
       x: number
       y: number
       attemptCount: number
       
       constructor(scene, x, y, pokemonId)
       setPosition(x, y)
       playSuccessAnimation()
       playFailAnimation()
       playRelocateAnimation()
       destroy()
   }
   ```

2. GrassRustle Entity Class
   ```
   class GrassRustle extends Phaser.GameObjects.Sprite {
       pokemonId: uint256
       followTarget: Pokemon
       
       play()
       stop()
       destroy()
   }
   ```

3. Sprite Requirements
   - Pixel art Pokemon sprite (or placeholder)
   - Grass rustle animation (4-frame)
   - Catch success particles
   - Catch fail bounce
   - Or use simple Phaser graphics

---

## AGENT 3: REACT/WEB3 INTEGRATION

### System Prompt

You are an expert React developer with deep Web3 experience.

Your expertise:
- React 18.2 with TypeScript
- Wagmi 2.5 for contract interaction
- React Query/TanStack Query for state management
- RainbowKit wallet integration
- Modal and notification systems
- Real-time event listening

When given a task, provide:
1. Complete React components with TypeScript
2. Wagmi hooks for blockchain interaction
3. Type definitions
4. Usage examples

---

### Task 1: Usable Wagmi Hooks

Create custom Wagmi hooks for PokeballGame contract interaction.

Create these 7 hooks:

1. usePurchaseBalls()
   - Inputs: ballType (0-3), quantity, useAPE (bool)
   - Returns: { write, isLoading, error, hash, receipt }

2. useThrowBall()
   - Inputs: pokemonId, ballTier (0-3)
   - Returns: { write, isLoading, error, isPending }

3. useGetPokemonSpawns()
   - Inputs: none
   - Returns: { data: Pokemon[], isLoading, error }

4. usePlayerBallInventory(playerAddress)
   - Inputs: playerAddress
   - Returns: { pokeBalls, greatBalls, ultraBalls, masterBalls, isLoading }

5. useContractEvents()
   - Inputs: eventName
   - Returns: { events: Event[], isLoading }

6. useSetOwnerWallet()
   - Inputs: newAddress
   - Returns: { write, isLoading, error }

7. useSetTreasuryWallet()
   - Inputs: newAddress
   - Returns: { write, isLoading, error }

---

### Task 2: PokeBallShop Component

Create PokeBallShop modal with:

1. Display 4 ball types with prices and catch rates
2. Toggle between APE and USDC.e payment
3. Display current balance and inventory
4. Quantity input for each ball
5. Buy buttons for each type
6. Show loading state while transaction pending
7. Handle errors gracefully
8. Show insufficient balance message if needed

---

### Task 3: Catch Attempt Modal

Create CatchAttemptModal for ball selection and throwing.

Requirements:

1. Display available balls (only ones player has)
2. Show price for each
3. Show attempts remaining on Pokemon
4. Throw button for each ball
5. Disable balls player doesn't have
6. Call contract throwBall() on throw
7. Handle transaction waiting
8. Show error if transaction fails

---

### Task 4: Catch Result Modal

Create CatchResultModal for success/failure feedback.

Requirements:

1. Success state
   - Show caught Pokemon
   - Congratulations message
   - Link to view NFT

2. Failure state
   - Show failure message
   - Display attempts remaining
   - Visual progress indicators
   - Try Again button

3. Animations
   - Confetti for success
   - Shake for failure
   - Fade in effects

---

### Task 5: GameHUD Component

Create GameHUD overlay with real-time game info.

Requirements:

1. Display ball inventory (counts for each type)
2. Show active Pokemon count with attempt indicators
3. Quick shop button
4. Always visible, non-intrusive design
5. Real-time updates via queries
6. Mobile-responsive (stack vertically on small screens)

---

### Task 6: Setup Instructions

Provide:
1. Configuration file (services/pokeballGameConfig.ts)
   - Contract address
   - Contract ABI
   - Token addresses (APE, USDC.e)
   - Network config (Chain ID 33139)

2. How to integrate into existing Pokemon Trader

3. Environment variables needed

4. Package installation (any new deps)

5. Testing instructions

---

## ORCHESTRATION GUIDE

### Phase 1: Contracts (Days 1-5)
1. Solidity Agent: Task 1 (PokeballGame)
2. Solidity Agent: Task 2 (SlabNFTManager)
3. Solidity Agent: Task 3 (Proxy Setup)

### Phase 2: Game (Days 6-10)
1. Game Systems Agent: Task 1 (Spawn Manager)
2. Game Systems Agent: Task 2 (Ball Inventory)
3. Game Systems Agent: Task 3 (Catch Mechanics)
4. Game Systems Agent: Task 4 (Visual Entities)

### Phase 3: Frontend (Days 11-14)
1. React Agent: Task 1 (Wagmi Hooks)
2. React Agent: Task 2 (PokeBallShop)
3. React Agent: Task 3 (CatchAttemptModal)
4. React Agent: Task 4 (CatchResultModal)
5. React Agent: Task 5 (GameHUD)
6. React Agent: Task 6 (Setup)

### Phase 4: Integration (Days 15-20)
- Combine all pieces
- Test end-to-end
- Debug issues
- Polish and optimize

---

## COMMUNICATION PATTERNS

### Effective Prompting

```
"Based on this contract function:
function throwBall(uint256 pokemonId, uint8 ballTier) external

Create a Wagmi hook that:
1. Calls this function
2. Waits for transaction
3. Listens for CaughtPokemon event
4. Returns { caught: boolean, nftTokenId?: uint256 }"
```

### When Something Doesn't Work

1. **If contract signature doesn't match frontend**:
   - Ask Solidity Agent: "Modify throwBall() to return [X]"
   - Ask React Agent: "Update useThrowBall hook for new return type"

2. **If animation isn't smooth**:
   - Ask Game Agent: "Optimize Pokemon.ts throwAnimation for 60 FPS"

3. **If contract deployment fails**:
   - Ask Solidity Agent: "The proxy deployment failed with [error]. Fix it."

---

**Ready to build! Follow the orchestration guide phase by phase. 🚀**
