import { useState, useEffect, useCallback, useRef } from 'react';
import { SolanaWalletProvider } from './solana/wallet';
import GameCanvas, { type PokemonClickData, type CatchOutOfRangeData } from './components/GameCanvas';
import WalletConnector from './components/WalletConnector';
import TradeModal from './components/TradeModal';
import VolumeToggle from './components/VolumeToggle';
import SfxVolumeToggle from './components/SfxVolumeToggle';
import InventoryTerminal from './components/InventoryTerminal';
import { GameHUD } from './components/PokeBallShop';
import { CatchAttemptModal } from './components/CatchAttemptModal';
import { CatchWinModal } from './components/CatchWinModal';
import { CatchResultModal, type CatchResultState } from './components/CatchResultModal';
import { AdminDevTools } from './components/AdminDevTools';
import { HelpModal } from './components/HelpModal';
import {
  useCaughtPokemonEvents,
  useFailedCatchEvents,
  useBallPurchasedEvents,
  useThrowBall,
  type BallType,
  type ThrowResult,
} from './hooks/solana';
import { useActiveWeb3React } from './hooks/useActiveWeb3React';
import type { TradeListing } from './services/types';

/** State for the selected Pokemon to catch */
interface SelectedPokemon {
  pokemonId: bigint;
  slotIndex: number;
  attemptsRemaining: number;
}

/** State for the catch win modal */
interface CatchWinState {
  tokenId: bigint;
  pokemonId: bigint;
  txSignature?: string;
}

/** Toast notification state */
interface ToastMessage {
  id: number;
  message: string;
  type: 'warning' | 'error' | 'success';
}

/** Inner app component that uses hooks requiring SolanaWalletProvider context */
function AppContent() {
  const { account } = useActiveWeb3React();
  const [selectedTrade, setSelectedTrade] = useState<TradeListing | null>(null);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.5);
  const [selectedPokemon, setSelectedPokemon] = useState<SelectedPokemon | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [catchWin, setCatchWin] = useState<CatchWinState | null>(null);
  const [catchFailure, setCatchFailure] = useState<CatchResultState | null>(null);
  const [isAdminToolsOpen, setIsAdminToolsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Check for dev mode via URL param or localStorage
  const isDevMode = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('dev') === '1' ||
    localStorage.getItem('pokeballTrader_devMode') === 'true'
  );

  // Track which events we've already processed to avoid duplicates
  const processedCatchEventsRef = useRef<Set<string>>(new Set());
  const processedFailEventsRef = useRef<Set<string>>(new Set());
  const processedPurchaseEventsRef = useRef<Set<string>>(new Set());
  // Track slots already resolved via lastResult effect to avoid duplicate processing
  const resolvedByCatchModalRef = useRef<Set<string>>(new Set());

  // Ref for triggering visual throw animation in Phaser
  const visualThrowRef = useRef<((pokemonId: bigint, ballType: BallType) => void) | null>(null);

  // Ref for notifying Phaser of catch results to reset manager state
  const catchResultRef = useRef<((caught: boolean, pokemonId: bigint) => void) | null>(null);

  // Ref for triggering immediate spawn data refetch after throw results
  const refetchSpawnsRef = useRef<(() => void) | null>(null);

  // Ref for throw + struggle animation (ball arc → wobble loop until VRF resolves)
  const throwAndStruggleRef = useRef<
    ((pokemonId: bigint, ballType: BallType) => Promise<() => void>) | null
  >(null);

  // ---- useThrowBall hook (LIFTED from CatchAttemptModal so it survives modal close) ----
  const {
    throwBall: throwBallFn,
    throwStatus,
    isLoading: throwIsLoading,
    error: throwError,
    reset: resetThrow,
    txSignature: throwTxSignature,
    lastResult,
  } = useThrowBall();

  // Track which Pokemon + ball type we're throwing at (for animation after modal closes)
  const throwingInfoRef = useRef<{ pokemonId: bigint; ballType: BallType } | null>(null);
  // Cleanup function for the active struggle animation
  const stopStruggleRef = useRef<(() => void) | null>(null);

  // Toast management
  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'warning') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Listen for CaughtPokemon events (Solana Anchor program events via WebSocket)
  const { events: caughtEvents, eventCount: caughtCount } = useCaughtPokemonEvents();

  // Listen for FailedCatch events
  const { events: failedEvents, eventCount: failedCount } = useFailedCatchEvents();

  console.log('[App] Event counts - Caught:', caughtCount, 'Failed:', failedCount, 'Account:', account?.slice(0, 10));

  // Listen for BallPurchased events
  const { events: purchaseEvents } = useBallPurchasedEvents();

  // Handle caught Pokemon events
  useEffect(() => {
    if (caughtEvents.length === 0) return;

    const latestEvent = caughtEvents[caughtEvents.length - 1];
    const eventKey = latestEvent.eventKey;

    if (processedCatchEventsRef.current.has(eventKey)) return;
    processedCatchEventsRef.current.add(eventKey);

    // On Solana, catcher is a base58 pubkey string
    const isCurrentUser = account && latestEvent.args.catcher === account;

    if (isCurrentUser) {
      // Skip if already handled by CatchAttemptModal's onResult
      const resolveKey = `caught-${latestEvent.args.slotIndex}`;
      if (resolvedByCatchModalRef.current.has(resolveKey)) {
        resolvedByCatchModalRef.current.delete(resolveKey);
        return;
      }

      console.log('[App] CaughtPokemon event for current user (event-based):', latestEvent.args);

      // Notify Phaser to reset CatchMechanicsManager state
      if (catchResultRef.current) {
        catchResultRef.current(true, latestEvent.args.pokemonId);
      }

      setSelectedPokemon(null);

      // On Solana, nftMint is a pubkey string. Check if it's not the system program (no NFT)
      const nftMint = latestEvent.args.nftMint;
      const hasNFT = nftMint && nftMint !== '11111111111111111111111111111111';

      if (hasNFT) {
        setCatchWin({
          tokenId: BigInt(0), // Solana doesn't use token IDs like EVM
          pokemonId: latestEvent.args.pokemonId,
          txSignature: undefined,
        });
        addToast('You caught a Pokemon and won an NFT!', 'success');
      } else {
        addToast('Pokemon caught! But the NFT vault was empty — no NFT awarded this time.', 'warning');
      }
    }
  }, [caughtEvents, account, addToast]);

  // Handle failed catch events
  useEffect(() => {
    if (failedEvents.length === 0) return;

    const latestEvent = failedEvents[failedEvents.length - 1];
    const eventKey = latestEvent.eventKey;

    if (processedFailEventsRef.current.has(eventKey)) return;
    processedFailEventsRef.current.add(eventKey);

    const isCurrentUser = account && latestEvent.args.thrower === account;

    if (isCurrentUser) {
      // Skip if already handled by CatchAttemptModal's onResult
      const resolveKey = `missed-${latestEvent.args.slotIndex}`;
      if (resolvedByCatchModalRef.current.has(resolveKey)) {
        resolvedByCatchModalRef.current.delete(resolveKey);
        return;
      }

      console.log('[App] FailedCatch event for current user (event-based):', latestEvent.args);

      if (catchResultRef.current) {
        catchResultRef.current(false, latestEvent.args.pokemonId);
      }

      setSelectedPokemon(null);

      // On Solana, the Anchor program emits the correct attemptsRemaining value
      const actualRemaining = latestEvent.args.attemptsRemaining;

      setCatchFailure({
        type: 'failure',
        pokemonId: latestEvent.args.pokemonId,
        attemptsRemaining: actualRemaining,
      });
    }
  }, [failedEvents, account]);

  // Handle ball purchase events
  useEffect(() => {
    if (purchaseEvents.length === 0) return;

    const latestEvent = purchaseEvents[purchaseEvents.length - 1];
    const eventKey = latestEvent.eventKey;

    if (processedPurchaseEventsRef.current.has(eventKey)) return;
    processedPurchaseEventsRef.current.add(eventKey);

    const isCurrentUser = account && latestEvent.args.buyer === account;

    if (isCurrentUser) {
      console.log('[App] BallPurchased event for current user:', latestEvent.args);
      const ballNames = ['Poke Ball', 'Great Ball', 'Ultra Ball', 'Master Ball'];
      const ballName = ballNames[latestEvent.args.ballType] || 'Ball';
      const quantity = latestEvent.args.quantity;
      addToast(`Purchased ${quantity}x ${ballName}!`, 'success');
    }
  }, [purchaseEvents, account, addToast]);

  // F2 keyboard shortcut for Admin Tools (dev mode only)
  useEffect(() => {
    if (!isDevMode) return;
    console.log('DEV MODE ENABLED - Press F2 to open Admin/Dev Tools');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setIsAdminToolsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDevMode]);

  // Auto-show Help modal on first visit
  useEffect(() => {
    const helpSeen = localStorage.getItem('pokemonTrader_helpSeen');
    if (!helpSeen) {
      const timer = setTimeout(() => {
        setShowHelp(true);
        localStorage.setItem('pokemonTrader_helpSeen', 'true');
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleTradeClick = useCallback((listing: TradeListing) => {
    setSelectedTrade(listing);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedTrade(null);
  }, []);

  const handleInventoryOpen = useCallback(() => {
    setIsInventoryOpen(true);
  }, []);

  const handleInventoryClose = useCallback(() => {
    setIsInventoryOpen(false);
  }, []);

  const handleVolumeChange = useCallback((volume: number) => {
    setMusicVolume(volume);
    requestAnimationFrame(() => {
      const game = (window as any).__PHASER_GAME__;
      if (game && !game.destroyed) {
        try {
          const scene = game.scene.getScene('GameScene');
          if (scene && typeof scene.getMP3Music === 'function') {
            const mp3Music = scene.getMP3Music();
            if (mp3Music && typeof mp3Music.setVolume === 'function') {
              mp3Music.setVolume(volume);
            }
          }
        } catch (error) {
          console.warn('Could not update music volume:', error);
        }
      }
    });
  }, []);

  const handlePokemonClick = useCallback((data: PokemonClickData) => {
    // Don't open modal if a throw is already in flight (animating/waiting_vrf)
    if (throwStatus !== 'idle' && throwStatus !== 'error' && throwStatus !== 'caught' && throwStatus !== 'missed' && throwStatus !== 'relocated') {
      console.log('[App] Ignoring Pokemon click — throw in flight (status:', throwStatus, ')');
      return;
    }

    // Don't block based on attemptCount — the on-chain program is the single source of truth
    // for max attempts (throw_ball checks throw_attempts < MAX_THROW_ATTEMPTS).
    // Frontend attemptCount can be stale (5s poll) after a relocation resets attempts to 0.
    const remaining = Math.max(3 - data.attemptCount, 0);
    setSelectedPokemon({
      pokemonId: data.pokemonId,
      slotIndex: data.slotIndex,
      attemptsRemaining: remaining,
    });
  }, [throwStatus]);

  const lastOutOfRangeAtRef = useRef<number>(0);

  const handleCatchOutOfRange = useCallback((_data: CatchOutOfRangeData) => {
    const now = Date.now();
    if (now - lastOutOfRangeAtRef.current < 400) return;
    lastOutOfRangeAtRef.current = now;
    addToast('Move closer to the Pokemon!', 'warning');
  }, [addToast]);

  const handleCloseCatchModal = useCallback(() => {
    setSelectedPokemon(null);
    // Only reset the throw hook if nothing is in flight
    // (if animating or waiting for VRF, don't kill the polling)
    if (throwStatus === 'idle' || throwStatus === 'error') {
      resetThrow();
    }
  }, [throwStatus, resetThrow]);

  const handleCloseWinModal = useCallback(() => {
    setCatchWin(null);
  }, []);

  const handleCloseFailureModal = useCallback(() => {
    setCatchFailure(null);
  }, []);

  const handleTryAgain = useCallback(() => {
    if (catchFailure?.type === 'failure' && catchFailure.attemptsRemaining > 0) {
      setCatchFailure(null);
      addToast('Click the Pokemon to try again!', 'warning');
    }
  }, [catchFailure, addToast]);

  // ---- Wrapped throwBall that records pokemonId + ballType for animation ----
  const wrappedThrowBall = useCallback(
    async (slotIndex: number, ballType: BallType) => {
      // Record what we're throwing at, for animation later
      if (selectedPokemon) {
        throwingInfoRef.current = {
          pokemonId: selectedPokemon.pokemonId,
          ballType,
        };
      }
      return throwBallFn ? throwBallFn(slotIndex, ballType) : false;
    },
    [throwBallFn, selectedPokemon]
  );

  // ---- Effect: throwStatus === 'animating' → close modal + start animation ----
  // 'animating' fires after the 2nd wallet signature (consume_randomness signed).
  // The modal closes and the throw+struggle animation starts on the Phaser map.
  useEffect(() => {
    if (throwStatus !== 'animating') return;
    if (!throwingInfoRef.current) return;

    const { pokemonId, ballType } = throwingInfoRef.current;
    console.log('[App] throwStatus=animating → closing modal, starting throw+struggle for Pokemon', pokemonId.toString());

    // Close the CatchAttemptModal
    setSelectedPokemon(null);

    // Start throw + struggle animation on the map
    if (throwAndStruggleRef.current) {
      throwAndStruggleRef.current(pokemonId, ballType).then((cleanup) => {
        stopStruggleRef.current = cleanup;
      });
    }
  }, [throwStatus]);

  // ---- Effect: lastResult arrives → stop struggle + show result modal ----
  // When VRF resolves, useThrowBall sets lastResult. We stop the struggle animation
  // and show the appropriate result modal (caught/missed/relocated/error).
  useEffect(() => {
    if (!lastResult) return;

    console.log('[App] lastResult received:', lastResult.status, lastResult);

    // Stop struggle animation
    if (stopStruggleRef.current) {
      stopStruggleRef.current();
      stopStruggleRef.current = null;
    }

    // Mark this slot as resolved so WebSocket event handlers don't double-process
    if (lastResult.slotIndex !== undefined) {
      resolvedByCatchModalRef.current.add(`${lastResult.status}-${lastResult.slotIndex}`);
    }

    if (lastResult.status === 'caught' && lastResult.pokemonId !== undefined) {
      // Notify Phaser of catch success (sparkle animation)
      catchResultRef.current?.(true, lastResult.pokemonId);

      setSelectedPokemon(null);

      const nftMint = lastResult.nftMint;
      const hasNFT = nftMint && nftMint !== '11111111111111111111111111111111';

      if (hasNFT) {
        setCatchWin({
          tokenId: BigInt(0),
          pokemonId: lastResult.pokemonId,
          txSignature: lastResult.txSignature,
        });
        addToast('You caught a Pokemon and won an NFT!', 'success');
      } else {
        addToast('Pokemon caught! But the NFT vault was empty \u2014 no NFT awarded this time.', 'warning');
      }
    } else if (lastResult.status === 'relocated' && lastResult.pokemonId !== undefined) {
      // Pokemon relocated after 3rd miss
      catchResultRef.current?.(false, lastResult.pokemonId);
      setSelectedPokemon(null);

      setCatchFailure({
        type: 'failure',
        pokemonId: lastResult.pokemonId,
        attemptsRemaining: 3,
        relocated: true,
      });
    } else if (lastResult.status === 'missed' && lastResult.pokemonId !== undefined) {
      catchResultRef.current?.(false, lastResult.pokemonId);
      setSelectedPokemon(null);

      setCatchFailure({
        type: 'failure',
        pokemonId: lastResult.pokemonId,
        attemptsRemaining: lastResult.attemptsRemaining ?? 0,
      });
    } else if (lastResult.status === 'error') {
      setSelectedPokemon(null);

      const errMsg = lastResult.errorMessage || 'Throw failed. Please try again.';
      addToast(errMsg, 'warning');
      console.error('[App] ThrowResult error:', errMsg);
    }

    // After any throw result (caught/missed/relocated), immediately refetch on-chain spawn data
    if (lastResult.status !== 'error') {
      setTimeout(() => {
        refetchSpawnsRef.current?.();
      }, 500);
    }

    // Clean up throw tracking state and reset the hook for next throw
    throwingInfoRef.current = null;
    resetThrow();
  }, [lastResult]); // Minimal deps — only fire when lastResult changes

  const handleShowHelp = useCallback(() => {
    setShowHelp(true);
  }, []);

  const handleCloseHelp = useCallback(() => {
    setShowHelp(false);
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        margin: 0,
        padding: 0,
        backgroundColor: '#000',
      }}
    >
      <WalletConnector />
      <GameCanvas
        onTradeClick={handleTradeClick}
        onPokemonClick={handlePokemonClick}
        onCatchOutOfRange={handleCatchOutOfRange}
        onVisualThrowRef={visualThrowRef}
        onCatchResultRef={catchResultRef}
        refetchSpawnsRef={refetchSpawnsRef}
        onThrowAndStruggleRef={throwAndStruggleRef}
      />
      <GameHUD playerAddress={account} onShowHelp={handleShowHelp} />

      {/* Toast Notifications */}
      <div style={{
        position: 'fixed',
        top: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              padding: '12px 20px',
              backgroundColor: toast.type === 'warning' ? '#3a3a1a' : toast.type === 'error' ? '#3a1a1a' : '#1a3a1a',
              border: `2px solid ${toast.type === 'warning' ? '#ffcc00' : toast.type === 'error' ? '#ff4444' : '#00ff00'}`,
              color: toast.type === 'warning' ? '#ffcc00' : toast.type === 'error' ? '#ff4444' : '#00ff00',
              fontFamily: "'Courier New', monospace",
              fontSize: '14px',
              fontWeight: 'bold',
              textAlign: 'center',
              imageRendering: 'pixelated',
              animation: 'fadeInOut 3s ease-in-out',
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(-10px); }
          10% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
      `}</style>
      {selectedTrade && (
        <TradeModal listing={selectedTrade} onClose={handleCloseModal} />
      )}

      {/* Catch Attempt Modal */}
      <CatchAttemptModal
        isOpen={selectedPokemon !== null}
        onClose={handleCloseCatchModal}
        playerAddress={account}
        pokemonId={selectedPokemon?.pokemonId ?? BigInt(0)}
        slotIndex={selectedPokemon?.slotIndex ?? 0}
        attemptsRemaining={selectedPokemon?.attemptsRemaining ?? 0}
        throwBallFn={wrappedThrowBall}
        throwStatus={throwStatus}
        isLoading={throwIsLoading}
        error={throwError}
        resetThrow={resetThrow}
        txSignature={throwTxSignature}
      />

      {/* Catch Win Modal */}
      {catchWin && (
        <CatchWinModal
          isOpen={true}
          onClose={handleCloseWinModal}
          tokenId={catchWin.tokenId}
          pokemonId={catchWin.pokemonId}
          txHash={catchWin.txSignature}
        />
      )}

      {/* Catch Failure Modal */}
      <CatchResultModal
        isOpen={catchFailure !== null}
        onClose={handleCloseFailureModal}
        onTryAgain={handleTryAgain}
        result={catchFailure}
      />

      {/* Admin/Dev Tools Panel (dev mode only) */}
      {isDevMode && (
        <AdminDevTools
          isOpen={isAdminToolsOpen}
          onClose={() => setIsAdminToolsOpen(false)}
          connectedAddress={account}
        />
      )}

      {/* Dev Mode Indicator Button */}
      {isDevMode && !isAdminToolsOpen && (
        <button
          onClick={() => setIsAdminToolsOpen(true)}
          style={{
            position: 'fixed',
            bottom: '70px',
            left: '20px',
            zIndex: 1000,
            padding: '8px 12px',
            backgroundColor: '#1a1a3a',
            color: '#ff44ff',
            border: '2px solid #ff44ff',
            cursor: 'pointer',
            fontFamily: "'Courier New', monospace",
            fontSize: '10px',
            fontWeight: 'bold',
            imageRendering: 'pixelated',
          }}
          title="Press F2 to toggle"
        >
          DEV TOOLS
        </button>
      )}

      {/* Inventory Button */}
      <button
        className="inventory-button"
        onClick={handleInventoryOpen}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          zIndex: 1000,
          padding: '12px 20px',
          backgroundColor: '#4a4',
          color: '#fff',
          border: '3px solid #fff',
          cursor: 'pointer',
          fontFamily: 'Courier New, monospace',
          fontSize: '14px',
          textTransform: 'uppercase',
          fontWeight: 'bold',
          imageRendering: 'pixelated',
        }}
        onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#6a6'; }}
        onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#4a4'; }}
      >
        INVENTORY
      </button>

      {/* Volume Toggles */}
      <SfxVolumeToggle />
      <VolumeToggle onVolumeChange={handleVolumeChange} initialVolume={musicVolume} />

      {/* Inventory Terminal */}
      <InventoryTerminal isOpen={isInventoryOpen} onClose={handleInventoryClose} />

      {/* Help Modal */}
      <HelpModal isOpen={showHelp} onClose={handleCloseHelp} />
    </div>
  );
}

/** Root App component with Solana wallet provider */
function App() {
  return (
    <SolanaWalletProvider>
      <AppContent />
    </SolanaWalletProvider>
  );
}

export default App;
