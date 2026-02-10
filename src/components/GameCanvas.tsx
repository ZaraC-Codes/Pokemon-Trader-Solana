import { useEffect, useRef, useCallback } from 'react';
import Phaser from 'phaser';
import { GameScene } from '../game/scenes/GameScene';
import { gameConfig, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE } from '../game/config/gameConfig';
import type { TradeListing } from '../services/contractService';
import { useGetPokemonSpawns, type PokemonSpawn as ContractPokemonSpawn } from '../hooks/pokeballGame/useGetPokemonSpawns';
import type { PokemonSpawn as ManagerPokemonSpawn } from '../game/managers/PokemonSpawnManager';
import type { BallType } from '../game/managers/BallInventoryManager';

/** Data emitted when a Pokemon is ready to catch (player in range) */
export interface PokemonClickData {
  pokemonId: bigint;
  slotIndex: number;
  attemptCount: number;
  x: number;
  y: number;
}

/** Data emitted when player tries to catch Pokemon but is out of range */
export interface CatchOutOfRangeData {
  pokemonId: bigint;
  distance: number;
  requiredRange: number;
  playerX: number;
  playerY: number;
}

interface GameCanvasProps {
  onTradeClick?: (listing: TradeListing) => void;
  /** Called when player clicks Pokemon AND is in range (ready to catch) */
  onPokemonClick?: (data: PokemonClickData) => void;
  /** Called when player clicks Pokemon but is OUT of range */
  onCatchOutOfRange?: (data: CatchOutOfRangeData) => void;
  /**
   * Callback to trigger visual ball throw animation.
   * Set by parent to allow CatchAttemptModal to trigger Phaser animation.
   * Returns a function that can be called to play the animation.
   */
  onVisualThrowRef?: React.MutableRefObject<((pokemonId: bigint, ballType: BallType) => void) | null>;
  /**
   * Ref callback to notify Phaser of catch results from contract events.
   * This resets the CatchMechanicsManager state so clicks aren't blocked.
   * @param caught - Whether the Pokemon was caught
   * @param pokemonId - The Pokemon ID from the event
   */
  onCatchResultRef?: React.MutableRefObject<((caught: boolean, pokemonId: bigint) => void) | null>;
  // Music disabled
  // onMusicToggle?: () => void;
}

/**
 * Contract coordinate system constants.
 * The contract uses a 0-999 coordinate space for Pokemon positions.
 */
const CONTRACT_MAX_COORDINATE = 999;

/**
 * Convert contract coordinates (0-999) to game world pixels.
 * Game world is MAP_WIDTH * TILE_SIZE x MAP_HEIGHT * TILE_SIZE pixels.
 *
 * @param contractCoord - Coordinate from contract (0-999)
 * @param worldSize - Game world size in pixels (e.g., 2400)
 * @returns Scaled coordinate in game world pixels
 */
function scaleContractToWorld(contractCoord: number, worldSize: number): number {
  // Scale from 0-999 to 0-worldSize
  // Add a small margin (1 tile) to avoid spawning at exact edges
  const margin = TILE_SIZE;
  const usableSize = worldSize - margin * 2;
  const scaled = (contractCoord / CONTRACT_MAX_COORDINATE) * usableSize + margin;
  return Math.floor(scaled);
}

/**
 * Convert contract spawn format to PokemonSpawnManager format.
 * The contract returns position in 0-999 range, timestamp in Unix seconds.
 * Positions are scaled to match the game world size.
 */
function toManagerSpawn(contract: ContractPokemonSpawn, index: number): ManagerPokemonSpawn {
  // Calculate world dimensions
  const worldWidth = MAP_WIDTH * TILE_SIZE;   // 150 * 16 = 2400
  const worldHeight = MAP_HEIGHT * TILE_SIZE; // 150 * 16 = 2400

  // Scale contract coordinates (0-999) to game world pixels
  const scaledX = scaleContractToWorld(contract.x, worldWidth);
  const scaledY = scaleContractToWorld(contract.y, worldHeight);

  // Diagnostic logging for debugging spawn sync issues
  if (index < 3) {
    console.log(`[GameCanvas] toManagerSpawn[${index}] input:`, {
      id: contract.id?.toString() ?? 'undefined',
      slotIndex: contract.slotIndex,
      contractX: contract.x,
      contractY: contract.y,
      attemptCount: contract.attemptCount,
      isActive: contract.isActive,
      spawnTime: contract.spawnTime?.toString() ?? 'undefined',
    });
    console.log(`[GameCanvas] toManagerSpawn[${index}] scaling: (${contract.x}, ${contract.y}) -> (${scaledX}, ${scaledY})`);
  }

  const result: ManagerPokemonSpawn = {
    id: contract.id,
    slotIndex: contract.slotIndex,
    x: scaledX,
    y: scaledY,
    attemptCount: contract.attemptCount,
    timestamp: Number(contract.spawnTime) * 1000, // Convert seconds to ms
    // entity and grassRustle are set by PokemonSpawnManager
  };

  if (index < 3) {
    console.log(`[GameCanvas] toManagerSpawn[${index}] output:`, {
      id: result.id?.toString() ?? 'undefined',
      slotIndex: result.slotIndex,
      x: result.x,
      y: result.y,
      attemptCount: result.attemptCount,
      timestamp: result.timestamp,
    });
  }

  return result;
}

export default function GameCanvas({ onTradeClick, onPokemonClick, onCatchOutOfRange, onVisualThrowRef, onCatchResultRef }: GameCanvasProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onTradeClickRef = useRef(onTradeClick);
  const onPokemonClickRef = useRef(onPokemonClick);
  const onCatchOutOfRangeRef = useRef(onCatchOutOfRange);

  // Track whether the scene is ready (pokemonSpawnManager has been created)
  const sceneReadyRef = useRef<boolean>(false);
  // Buffer to hold spawns if they arrive before scene is ready
  const pendingSpawnsRef = useRef<ContractPokemonSpawn[] | null>(null);

  // Fetch on-chain Pokemon spawns (polls every 5 seconds)
  const { data: contractSpawns, isLoading: spawnsLoading } = useGetPokemonSpawns();

  // Keep the callback refs updated without causing re-renders
  useEffect(() => {
    onTradeClickRef.current = onTradeClick;
  }, [onTradeClick]);

  useEffect(() => {
    onPokemonClickRef.current = onPokemonClick;
  }, [onPokemonClick]);

  useEffect(() => {
    onCatchOutOfRangeRef.current = onCatchOutOfRange;
  }, [onCatchOutOfRange]);

  /**
   * Sync spawns to PokemonSpawnManager.
   * Handles race condition: if scene isn't ready, buffers spawns for later.
   */
  const syncSpawnsToManager = useCallback((spawns: ContractPokemonSpawn[]) => {
    // === DIAGNOSTIC LOGGING ===
    console.log('[GameCanvas] ========== syncSpawnsToManager ==========');
    console.log('[GameCanvas] Input spawns array length:', spawns?.length ?? 'undefined/null');
    console.log('[GameCanvas] Input spawns type:', typeof spawns, Array.isArray(spawns));

    const game = gameRef.current;
    if (!game) {
      console.warn('[GameCanvas] No game reference, cannot sync');
      return;
    }

    const scene = game.scene.getScene('GameScene') as GameScene | undefined;
    console.log('[GameCanvas] Scene exists:', !!scene);
    console.log('[GameCanvas] Scene active:', scene?.scene?.isActive?.() ?? 'N/A');

    const manager = scene?.getPokemonSpawnManager();
    console.log('[GameCanvas] Manager exists:', !!manager);

    if (!manager) {
      // Scene not ready yet - buffer the spawns
      console.log('[GameCanvas] Scene not ready, buffering', spawns.length, 'spawns');
      pendingSpawnsRef.current = spawns;
      return;
    }

    // Log raw contract spawn data
    console.log('[GameCanvas] Raw contract spawns (first 3):');
    for (let i = 0; i < Math.min(3, spawns.length); i++) {
      const s = spawns[i];
      console.log(`  [${i}]:`, {
        id: s.id?.toString(),
        slotIndex: s.slotIndex,
        x: s.x,
        y: s.y,
        isActive: s.isActive,
        attemptCount: s.attemptCount,
        spawnTime: s.spawnTime?.toString(),
      });
    }

    // Convert to manager format and sync
    const managerSpawns = spawns.map((spawn, index) => toManagerSpawn(spawn, index));
    const worldBounds = {
      width: MAP_WIDTH * TILE_SIZE,
      height: MAP_HEIGHT * TILE_SIZE,
    };

    console.log('[GameCanvas] Converted managerSpawns length:', managerSpawns.length);
    console.log('[GameCanvas] World bounds:', worldBounds);
    console.log('[GameCanvas] Calling manager.syncFromContract()...');
    manager.syncFromContract(managerSpawns, worldBounds);
    console.log('[GameCanvas] ==========================================');
  }, []);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    // Add GameScene to config
    const config = {
      ...gameConfig,
      parent: containerRef.current,
      scene: [GameScene],
    };

    // Create Phaser game instance
    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Expose game instance to window for volume control
    (window as any).__PHASER_GAME__ = game;

    // Wait for scene to start before attaching listeners
    // Phaser's scene.getScene() returns the scene immediately, but it may not be initialized
    // We need to wait for the 'create' event which fires after create() completes
    const setupSceneListeners = (gameScene: GameScene) => {
      // Use ref to avoid re-registering the event listener
      gameScene.events.on('show-trade-modal', (listing: TradeListing) => {
        if (onTradeClickRef.current) {
          onTradeClickRef.current(listing);
        }
      });

      // Listen for Pokemon catch-ready events (player is in range)
      // This replaces the old 'pokemon-clicked' event which didn't check proximity
      gameScene.events.on('pokemon-catch-ready', (data: PokemonClickData) => {
        console.log('[GameCanvas] Pokemon catch-ready event received:', data.pokemonId.toString());
        if (onPokemonClickRef.current) {
          onPokemonClickRef.current(data);
        }
      });

      // Listen for out-of-range events (player tried to catch but too far)
      gameScene.events.on('catch-out-of-range', (data: {
        pokemonId: bigint;
        spawn: { x: number; y: number };
        playerX: number;
        playerY: number;
        distance: number;
        requiredRange: number;
      }) => {
        console.log('[GameCanvas] Catch out-of-range event:', {
          pokemonId: data.pokemonId.toString(),
          distance: Math.round(data.distance),
          requiredRange: data.requiredRange,
        });
        if (onCatchOutOfRangeRef.current) {
          onCatchOutOfRangeRef.current({
            pokemonId: data.pokemonId,
            distance: data.distance,
            requiredRange: data.requiredRange,
            playerX: data.playerX,
            playerY: data.playerY,
          });
        }
      });

      // Mark scene as ready and flush any pending spawns
      sceneReadyRef.current = true;
      console.log('[GameCanvas] Scene is ready, manager available:', !!gameScene.getPokemonSpawnManager());

      if (pendingSpawnsRef.current) {
        console.log('[GameCanvas] Flushing', pendingSpawnsRef.current.length, 'buffered spawns');
        syncSpawnsToManager(pendingSpawnsRef.current);
        pendingSpawnsRef.current = null;
      }

      // Wire up the visual throw function to allow React to trigger Phaser animations
      if (onVisualThrowRef) {
        const catchMechanicsManager = gameScene.getCatchMechanicsManager();
        if (catchMechanicsManager) {
          onVisualThrowRef.current = (pokemonId: bigint, ballType: BallType) => {
            console.log('[GameCanvas] Visual throw triggered for Pokemon:', pokemonId.toString(), 'ball:', ballType);
            catchMechanicsManager.playBallThrowById(pokemonId, ballType);
          };
          console.log('[GameCanvas] Visual throw callback registered');
        } else {
          console.warn('[GameCanvas] CatchMechanicsManager not available, visual throw disabled');
        }
      }

      // Wire up catch result callback to reset manager state when contract events arrive
      if (onCatchResultRef) {
        const catchMechanicsManager = gameScene.getCatchMechanicsManager();
        if (catchMechanicsManager) {
          onCatchResultRef.current = (caught: boolean, pokemonId: bigint) => {
            console.log('[GameCanvas] Catch result received:', caught ? 'CAUGHT' : 'FAILED', 'Pokemon:', pokemonId.toString());
            catchMechanicsManager.handleCatchResult(caught, pokemonId);
          };
          console.log('[GameCanvas] Catch result callback registered');
        } else {
          console.warn('[GameCanvas] CatchMechanicsManager not available, catch result callback disabled');
        }
      }
    };

    // Try to get the scene - it may or may not be ready
    const gameScene = game.scene.getScene('GameScene') as GameScene | undefined;

    if (gameScene && gameScene.scene.isActive()) {
      // Scene is already active (rare, but handle it)
      setupSceneListeners(gameScene);
    } else {
      // Wait for scene to start - listen on the scene manager
      game.events.once('ready', () => {
        const scene = game.scene.getScene('GameScene') as GameScene;
        if (scene) {
          // Wait for create() to complete
          scene.events.once('create', () => {
            setupSceneListeners(scene);
          });
        }
      });
    }

    // Cleanup only on unmount
    return () => {
      sceneReadyRef.current = false;
      // Clear the visual throw ref
      if (onVisualThrowRef) {
        onVisualThrowRef.current = null;
      }
      // Clear the catch result ref
      if (onCatchResultRef) {
        onCatchResultRef.current = null;
      }
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        (window as any).__PHASER_GAME__ = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - syncSpawnsToManager is stable via useCallback

  // Sync spawns whenever contract data changes
  useEffect(() => {
    if (!contractSpawns || spawnsLoading) return;

    // Sync to manager (handles buffering if scene not ready)
    syncSpawnsToManager(contractSpawns);
  }, [contractSpawns, spawnsLoading, syncSpawnsToManager]);

  return (
    <div
      id="game-container"
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        imageRendering: 'pixelated',
        backgroundColor: '#000',
      }}
    />
  );
}
