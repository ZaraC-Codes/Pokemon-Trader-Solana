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
  // Track slots already resolved via handleThrowResult to avoid duplicate processing
  const resolvedByCatchModalRef = useRef<Set<string>>(new Set());

  // Ref for triggering visual throw animation in Phaser
  const visualThrowRef = useRef<((pokemonId: bigint, ballType: BallType) => void) | null>(null);

  // Ref for notifying Phaser of catch results to reset manager state
  const catchResultRef = useRef<((caught: boolean, pokemonId: bigint) => void) | null>(null);

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
    setSelectedPokemon({
      pokemonId: data.pokemonId,
      slotIndex: data.slotIndex,
      attemptsRemaining: 3 - data.attemptCount,
    });
  }, []);

  const lastOutOfRangeAtRef = useRef<number>(0);

  const handleCatchOutOfRange = useCallback((_data: CatchOutOfRangeData) => {
    const now = Date.now();
    if (now - lastOutOfRangeAtRef.current < 400) return;
    lastOutOfRangeAtRef.current = now;
    addToast('Move closer to the Pokemon!', 'warning');
  }, [addToast]);

  const handleCloseCatchModal = useCallback(() => {
    setSelectedPokemon(null);
  }, []);

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

  const handleVisualThrow = useCallback((pokemonId: bigint, ballType: BallType) => {
    if (visualThrowRef.current) {
      visualThrowRef.current(pokemonId, ballType);
    }
  }, []);

  // Handle ThrowResult from CatchAttemptModal (via useThrowBall's VRF event resolution)
  const handleThrowResult = useCallback((result: ThrowResult) => {
    console.log('[App] ThrowResult from CatchAttemptModal:', result);

    // Mark this slot as resolved by the modal so the event-based useEffects don't double-process
    if (result.slotIndex !== undefined) {
      resolvedByCatchModalRef.current.add(`${result.status}-${result.slotIndex}`);
    }

    if (result.status === 'caught' && result.pokemonId !== undefined) {
      // Notify Phaser
      if (catchResultRef.current) {
        catchResultRef.current(true, result.pokemonId);
      }

      setSelectedPokemon(null);

      const nftMint = result.nftMint;
      const hasNFT = nftMint && nftMint !== '11111111111111111111111111111111';

      if (hasNFT) {
        setCatchWin({
          tokenId: BigInt(0),
          pokemonId: result.pokemonId,
          txSignature: result.txSignature,
        });
        addToast('You caught a Pokemon and won an NFT!', 'success');
      } else {
        addToast('Pokemon caught! But the NFT vault was empty — no NFT awarded this time.', 'warning');
      }
    } else if (result.status === 'missed' && result.pokemonId !== undefined) {
      if (catchResultRef.current) {
        catchResultRef.current(false, result.pokemonId);
      }

      setSelectedPokemon(null);

      setCatchFailure({
        type: 'failure',
        pokemonId: result.pokemonId,
        attemptsRemaining: result.attemptsRemaining ?? 0,
      });
    } else if (result.status === 'error') {
      // Throw flow errored (e.g., consume_randomness failed, user cancelled, network issue).
      // Clean up selected pokemon so modal can be reopened.
      setSelectedPokemon(null);

      const errMsg = result.errorMessage || 'Throw failed. Please try again.';
      addToast(errMsg, 'warning');
      console.error('[App] ThrowResult error:', errMsg);
    }
  }, [addToast]);

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
        onVisualThrow={handleVisualThrow}
        onResult={handleThrowResult}
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
