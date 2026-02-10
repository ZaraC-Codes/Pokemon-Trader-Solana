import { useState, useEffect, useCallback, useRef } from 'react';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { config } from './services/apechainConfig';
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
import { useCaughtPokemonEvents, useFailedCatchEvents, useBallPurchasedEvents, type BallType } from './hooks/pokeballGame';
import { useActiveWeb3React } from './hooks/useActiveWeb3React';
import { contractService } from './services/contractService';
import type { TradeListing } from './services/contractService';
import '@rainbow-me/rainbowkit/styles.css';

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
  txHash?: `0x${string}`;
}

/** Toast notification state */
interface ToastMessage {
  id: number;
  message: string;
  type: 'warning' | 'error' | 'success';
}

// Configure QueryClient with sensible retry and timeout settings
// to prevent RPC request spam when the proxy is slow or overwhelmed
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reduce retries to prevent request spam on RPC timeouts
      retry: 2, // Default is 3, reduce to 2
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff: 1s, 2s, 4s... max 30s
      // Increase stale time to reduce refetch frequency
      staleTime: 30_000, // 30 seconds (default is 0)
      // Prevent refetching on window focus during active session (reduces RPC spam)
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect (wagmi handles reconnection)
      refetchOnReconnect: false,
      // Network mode: always attempt even if offline
      networkMode: 'always',
    },
    mutations: {
      // Mutations (writes) shouldn't retry automatically
      retry: false,
    },
  },
});

// Expose test functions to window for debugging
declare global {
  interface Window {
    testListings: () => Promise<void>;
    testContractConnection: () => Promise<void>;
    checkListing: (listingId: number) => Promise<void>;
    getListingsRange: (startIndex: number, max: number) => Promise<void>;
    // Music disabled
    // toggleMusic?: () => void;
  }
}

/** Inner app component that uses hooks requiring WagmiProvider context */
function AppContent() {
  const { account } = useActiveWeb3React();
  const queryClient = useQueryClient();
  const [selectedTrade, setSelectedTrade] = useState<TradeListing | null>(null);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.5);
  const [selectedPokemon, setSelectedPokemon] = useState<SelectedPokemon | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [catchWin, setCatchWin] = useState<CatchWinState | null>(null);
  const [catchFailure, setCatchFailure] = useState<CatchResultState | null>(null);
  const [isAdminToolsOpen, setIsAdminToolsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Music disabled
  // const [isMusicPlaying, setIsMusicPlaying] = useState(true);

  // Check for dev mode via URL param or localStorage
  const isDevMode = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('dev') === '1' ||
    localStorage.getItem('pokeballTrader_devMode') === 'true'
  );

  // Track which events we've already processed to avoid duplicates
  const processedCatchEventsRef = useRef<Set<string>>(new Set());
  const processedFailEventsRef = useRef<Set<string>>(new Set());
  const processedPurchaseEventsRef = useRef<Set<string>>(new Set());

  // Ref for triggering visual throw animation in Phaser
  const visualThrowRef = useRef<((pokemonId: bigint, ballType: BallType) => void) | null>(null);

  // Ref for notifying Phaser of catch results to reset manager state
  const catchResultRef = useRef<((caught: boolean, pokemonId: bigint) => void) | null>(null);

  // Toast management (defined before effects that use it)
  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'warning') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Listen for CaughtPokemon events
  const { events: caughtEvents, eventCount: caughtCount } = useCaughtPokemonEvents();

  // Listen for FailedCatch events
  const { events: failedEvents, eventCount: failedCount } = useFailedCatchEvents();

  // DEBUG: Log event counts on every render
  console.log('[App] Event counts - Caught:', caughtCount, 'Failed:', failedCount, 'Account:', account?.slice(0, 10));

  // Listen for BallPurchased events (for instant inventory update)
  const { events: purchaseEvents } = useBallPurchasedEvents();

  // Handle caught Pokemon events
  useEffect(() => {
    console.log('[App] CaughtPokemon effect triggered. Events count:', caughtEvents.length, 'selectedPokemon:', selectedPokemon ? 'OPEN' : 'closed');
    if (caughtEvents.length === 0) return;

    const latestEvent = caughtEvents[caughtEvents.length - 1];
    const eventKey = `${latestEvent.transactionHash}-${latestEvent.logIndex}`;
    console.log('[App] Latest CaughtPokemon event:', {
      eventKey,
      catcher: latestEvent.args.catcher,
      pokemonId: latestEvent.args.pokemonId?.toString(),
      nftTokenId: latestEvent.args.nftTokenId?.toString(),
      txHash: latestEvent.transactionHash,
    });

    // Skip if we've already processed this event
    if (processedCatchEventsRef.current.has(eventKey)) {
      console.log('[App] CaughtPokemon event already processed, skipping:', eventKey);
      return;
    }
    processedCatchEventsRef.current.add(eventKey);
    console.log('[App] Processing new CaughtPokemon event:', eventKey);

    // Only show for current user's catches
    const isCurrentUser = account && latestEvent.args.catcher.toLowerCase() === account.toLowerCase();
    console.log('[App] CaughtPokemon - Is current user?', isCurrentUser, 'Account:', account?.slice(0, 10), 'Catcher:', latestEvent.args.catcher?.slice(0, 10));

    if (isCurrentUser) {
      console.log('[App] *** CaughtPokemon event for current user ***', latestEvent.args);

      // Invalidate ALL queries to force refetch of ball inventory
      // The specific query key for wagmi's useReadContract is complex and dynamic
      // So we invalidate everything to ensure inventory updates immediately
      console.log('[App] CaughtPokemon - Invalidating ALL queries for instant inventory refresh');
      queryClient.invalidateQueries();

      // Notify Phaser to reset CatchMechanicsManager state
      console.log('[App] Calling catchResultRef.current(true, pokemonId) to notify Phaser...');
      if (catchResultRef.current) {
        catchResultRef.current(true, latestEvent.args.pokemonId);
        console.log('[App] catchResultRef.current() called successfully');
      } else {
        console.warn('[App] catchResultRef.current is null - Phaser bridge not connected!');
      }

      // Close the catch attempt modal if open
      console.log('[App] Closing CatchAttemptModal via setSelectedPokemon(null)...');
      setSelectedPokemon(null);

      // Check if an NFT was actually awarded (nftTokenId > 0)
      // nftTokenId is 0 when inventory was empty at catch time (SlabMachine transferFrom bug)
      const nftTokenId = latestEvent.args.nftTokenId;
      const hasNFT = nftTokenId !== undefined && nftTokenId > 0n;

      if (hasNFT) {
        // Show the win modal with NFT details
        console.log('[App] Setting catchWin state to show CatchWinModal:', {
          tokenId: nftTokenId.toString(),
          pokemonId: latestEvent.args.pokemonId?.toString(),
          txHash: latestEvent.transactionHash,
        });
        setCatchWin({
          tokenId: nftTokenId,
          pokemonId: latestEvent.args.pokemonId,
          txHash: latestEvent.transactionHash ?? undefined,
        });
        addToast('You caught a Pokémon and won an NFT!', 'success');
        console.log('[App] CatchWinModal should now be visible');
      } else {
        // Pokemon was caught but no NFT was available in inventory
        console.log('[App] Pokemon caught but nftTokenId is 0 — no NFT in inventory');
        addToast('Pokémon caught! But the NFT inventory was empty — no NFT awarded this time.', 'warning');
      }
    }
  }, [caughtEvents, account, addToast, queryClient]);

  // Handle failed catch events
  useEffect(() => {
    console.log('[App] FailedCatch effect triggered. Events count:', failedEvents.length);
    if (failedEvents.length === 0) return;

    const latestEvent = failedEvents[failedEvents.length - 1];
    const eventKey = `${latestEvent.transactionHash}-${latestEvent.logIndex}`;
    console.log('[App] Latest FailedCatch event:', {
      eventKey,
      thrower: latestEvent.args.thrower,
      pokemonId: latestEvent.args.pokemonId?.toString(),
      attemptsRemaining: latestEvent.args.attemptsRemaining,
      txHash: latestEvent.transactionHash,
    });

    // Skip if we've already processed this event
    if (processedFailEventsRef.current.has(eventKey)) {
      console.log('[App] FailedCatch event already processed, skipping:', eventKey);
      return;
    }
    processedFailEventsRef.current.add(eventKey);
    console.log('[App] Processing new FailedCatch event:', eventKey);

    // Only show for current user's throws
    const isCurrentUser = account && latestEvent.args.thrower.toLowerCase() === account.toLowerCase();
    console.log('[App] FailedCatch - Is current user?', isCurrentUser, 'Account:', account?.slice(0, 10), 'Thrower:', latestEvent.args.thrower?.slice(0, 10));

    if (isCurrentUser) {
      console.log('[App] *** FailedCatch event for current user ***', latestEvent.args);

      // Invalidate ALL queries to force refetch of ball inventory
      // The specific query key for wagmi's useReadContract is complex and dynamic
      // So we invalidate everything to ensure inventory updates immediately
      console.log('[App] FailedCatch - Invalidating ALL queries for instant inventory refresh');
      queryClient.invalidateQueries();

      // Notify Phaser to reset CatchMechanicsManager state
      console.log('[App] Calling catchResultRef.current(false, pokemonId) to notify Phaser...');
      if (catchResultRef.current) {
        catchResultRef.current(false, latestEvent.args.pokemonId);
        console.log('[App] catchResultRef.current() called successfully');
      } else {
        console.warn('[App] catchResultRef.current is null - Phaser bridge not connected!');
      }

      // Close the catch attempt modal
      console.log('[App] Closing CatchAttemptModal via setSelectedPokemon(null)...');
      setSelectedPokemon(null);

      // Show the failure modal
      // Contract bug: after 3rd failed throw, throwAttempts resets to 0 BEFORE event emission
      // So contract emits 3-0=3 instead of 0. If we get 3, it means relocation happened (0 remaining).
      const rawRemaining = Number(latestEvent.args.attemptsRemaining);
      const actualRemaining = rawRemaining === 3 ? 0 : rawRemaining;

      console.log('[App] Setting catchFailure state to show CatchResultModal:', {
        pokemonId: latestEvent.args.pokemonId?.toString(),
        attemptsRemaining: actualRemaining,
        txHash: latestEvent.transactionHash,
      });
      setCatchFailure({
        type: 'failure',
        pokemonId: latestEvent.args.pokemonId,
        attemptsRemaining: actualRemaining,
        txHash: latestEvent.transactionHash ?? undefined,
      });
      console.log('[App] CatchResultModal (failure) should now be visible');
    }
  }, [failedEvents, account, queryClient]);

  // Handle ball purchase events - update inventory instantly
  useEffect(() => {
    if (purchaseEvents.length === 0) return;

    const latestEvent = purchaseEvents[purchaseEvents.length - 1];
    const eventKey = `${latestEvent.transactionHash}-${latestEvent.logIndex}`;

    // Skip if we've already processed this event
    if (processedPurchaseEventsRef.current.has(eventKey)) return;
    processedPurchaseEventsRef.current.add(eventKey);

    // Only update for current user's purchases
    if (account && latestEvent.args.buyer.toLowerCase() === account.toLowerCase()) {
      console.log('[App] BallPurchased event for current user:', latestEvent.args);

      // Invalidate ALL queries to force refetch of ball inventory
      // This ensures the shop and HUD show updated ball counts immediately
      console.log('[App] BallPurchased - Invalidating ALL queries for instant inventory refresh');
      queryClient.invalidateQueries();

      // Show a success toast
      const ballNames = ['Poké Ball', 'Great Ball', 'Ultra Ball', 'Master Ball'];
      const ballName = ballNames[Number(latestEvent.args.ballType)] || 'Ball';
      const quantity = Number(latestEvent.args.quantity);
      addToast(`Purchased ${quantity}x ${ballName}!`, 'success');
    }
  }, [purchaseEvents, account, queryClient, addToast]);

  useEffect(() => {
    // Expose test functions to window for browser console testing
    window.testListings = async () => {
      console.log('=== Testing Listings Fetch (using getAllListings from hooks) ===');
      try {
        // Import and use the actual getAllListings function that the app uses
        const { getAllListings } = await import('./hooks/useAllListings');
        const allListings = await getAllListings();
        console.log(`✅ Successfully fetched ${allListings.length} listings`);
        console.log('All listings:', allListings);
        
        // Show summary
        if (allListings.length > 0) {
          console.log('\n📊 Listing Summary:');
          const listingsByCollection: Record<string, number> = {};
          allListings.forEach((listing: any) => {
            const collection = listing.tokenForSale?.contractAddress?.toLowerCase() || 'unknown';
            listingsByCollection[collection] = (listingsByCollection[collection] || 0) + 1;
          });
          Object.entries(listingsByCollection).forEach(([collection, count]) => {
            console.log(`  - Collection ${collection}: ${count} listings`);
          });
          
          // Show first few listings as examples
          console.log('\n📋 First 5 listings:');
          allListings.slice(0, 5).forEach((listing: any, idx: number) => {
            console.log(`  ${idx + 1}. Listing ID: ${listing.listingId}`);
            console.log(`     Seller: ${listing.seller}`);
            console.log(`     Token For Sale: ${listing.tokenForSale?.contractAddress} (Token ID: ${listing.tokenForSale?.value})`);
            console.log(`     Token To Receive: ${listing.tokenToReceive?.contractAddress} (Value: ${listing.tokenToReceive?.value})`);
            console.log(`     Destination Chain: ${listing.dstChain}`);
          });
        } else {
          console.warn('⚠️ No listings found');
        }
      } catch (error) {
        console.error('❌ Error testing listings:', error);
      }
    };
    
    window.testContractConnection = async () => {
      console.log('=== Testing Contract Connection ===');
      await contractService.testContractConnection();
    };
    
    window.checkListing = async (listingId: number) => {
      console.log(`=== Checking Listing ${listingId} using "listings" function ===`);
      try {
        const { readContract } = await import('@wagmi/core');
        const { chainToConfig, otcAddress, swapContractConfig } = await import('./services/config');
        const apeChainMainnet = (await import('./services/apechainConfig')).apeChainMainnet;
        
        const chainConfig = chainToConfig[apeChainMainnet.id];
        const result = await readContract(chainConfig, {
          address: otcAddress[apeChainMainnet.id] as any,
          abi: swapContractConfig.abi as any,
          functionName: 'listings',
          args: [BigInt(listingId)],
        }) as any;
        
        // The "listings" function returns an array: [destinationEndpoint, seller, tokenForSale, tokenToReceive]
        const destinationEndpoint = result[0];
        const seller = result[1];
        const tokenForSale = result[2];
        const tokenToReceive = result[3];
        
        // Check if listing exists (seller is not zero address)
        const isEmpty = !seller || seller === '0x0000000000000000000000000000000000000000';
        
        if (!isEmpty) {
          console.log(`✅ Listing ${listingId} found!`);
          console.log('Listing details:', {
            listingId,
            seller,
            destinationEndpoint: Number(destinationEndpoint),
            tokenForSale: {
              contractAddress: tokenForSale.contractAddress,
              handler: tokenForSale.handler,
              value: tokenForSale.value.toString(),
            },
            tokenToReceive: {
              contractAddress: tokenToReceive.contractAddress,
              handler: tokenToReceive.handler,
              value: tokenToReceive.value.toString(),
            },
          });
          
          // Check if tokenToReceive.value is max uint256
          const maxUint256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');
          if (tokenToReceive.value === maxUint256) {
            console.log('   Note: tokenToReceive.value is max uint256, meaning "any token"');
          }
        } else {
          console.log(`❌ Listing ${listingId} not found or empty`);
          console.log('Raw result:', result);
        }
      } catch (error: any) {
        console.error(`❌ Error checking listing ${listingId}:`, error?.message || error);
      }
    };
    
    window.getListingsRange = async (startIndex: number, max: number) => {
      console.log(`=== Fetching Listings ${startIndex} to ${startIndex + max - 1} ===`);
      try {
        const { readContract } = await import('@wagmi/core');
        const { chainToConfig, otcAddress, swapContractConfig } = await import('./services/config');
        const apeChainMainnet = (await import('./services/apechainConfig')).apeChainMainnet;
        
        const chainConfig = chainToConfig[apeChainMainnet.id];
        const result = await readContract(chainConfig, {
          address: otcAddress[apeChainMainnet.id] as any,
          abi: swapContractConfig.abi as any,
          functionName: 'getAllUnclaimedListings',
          args: [BigInt(startIndex), BigInt(max)],
        }) as any;
        
        const listings = result[0] as any[];
        const listingIds = result[1] as bigint[];
        
        console.log(`✅ Fetched ${listings.length} listings from index ${startIndex}`);
        
        if (listings.length > 0) {
          console.log('\n📋 Listing Details:');
          listings.forEach((listing, idx) => {
            const listingId = listingIds[idx] ? Number(listingIds[idx]) : startIndex + idx;
            console.log(`\n${listingId}. Listing ID: ${listingId}`);
            console.log(`   Seller: ${listing.seller}`);
            console.log(`   Destination Endpoint: ${listing.destinationEndpoint}`);
            console.log(`   Token For Sale:`);
            console.log(`     - Contract: ${listing.tokenForSale.contractAddress}`);
            console.log(`     - Handler: ${listing.tokenForSale.handler}`);
            console.log(`     - Token ID/Value: ${listing.tokenForSale.value.toString()}`);
            console.log(`   Token To Receive:`);
            console.log(`     - Contract: ${listing.tokenToReceive.contractAddress}`);
            console.log(`     - Handler: ${listing.tokenToReceive.handler}`);
            console.log(`     - Value: ${listing.tokenToReceive.value.toString()}`);
          });
          
          // Check if listing 1233 is in this range
          const listing1233Index = listingIds.findIndex(id => Number(id) === 1233);
          if (listing1233Index !== -1) {
            console.log(`\n🎯 Found listing 1233 at index ${listing1233Index} in results!`);
            console.log('Listing 1233 details:', listings[listing1233Index]);
          } else {
            console.log(`\n⚠️ Listing 1233 not found in this range (IDs: ${listingIds.map(id => Number(id)).join(', ')})`);
          }
        } else {
          console.log(`❌ No listings found in range ${startIndex} to ${startIndex + max - 1}`);
        }
      } catch (error: any) {
        console.error(`❌ Error fetching listings range ${startIndex} to ${startIndex + max - 1}:`, error?.message || error);
      }
    };
    
    console.log('🔧 Test functions available:');
    console.log('  - window.testListings() - Fetch all available listings from contract');
    console.log('  - window.checkListing(1233) - Check specific listing by ID');
    console.log('  - window.getListingsRange(1200, 35) - Fetch listings 1200 to 1234');
    console.log('  - window.testContractConnection() - Test contract connection');
    // Music disabled
    // console.log('  - window.toggleMusic() - Toggle background music');

    if (isDevMode) {
      console.log('🛠️ DEV MODE ENABLED - Press F2 to open Admin/Dev Tools');
    }
  }, [isDevMode]);

  // F2 keyboard shortcut for Admin Tools (dev mode only)
  useEffect(() => {
    if (!isDevMode) return;

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
      // Small delay to let the game load first
      const timer = setTimeout(() => {
        setShowHelp(true);
        localStorage.setItem('pokemonTrader_helpSeen', 'true');
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Music disabled
  // const handleMusicToggle = () => {
  //   // State will be updated by the game scene event
  //   setIsMusicPlaying((prev) => !prev);
  // };
  
  // useEffect(() => {
  //   // Listen for music state changes from game scene
  //   const handleMusicStateChange = (event: CustomEvent<boolean>) => {
  //     setIsMusicPlaying(event.detail);
  //   };
  //   
  //   window.addEventListener('music-state-changed' as any, handleMusicStateChange as EventListener);
  //   
  //   return () => {
  //     window.removeEventListener('music-state-changed' as any, handleMusicStateChange as EventListener);
  //   };
  // }, []);

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
    // Update music volume in game scene without causing re-renders
    // Use requestAnimationFrame to avoid blocking
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
          // Silently fail if game scene is not ready
          console.warn('Could not update music volume:', error);
        }
      }
    });
  }, []);

  // Handle Pokemon click from Phaser scene (only fires when player is in range)
  const handlePokemonClick = useCallback((data: PokemonClickData) => {
    // Max attempts is 3, so attemptsRemaining = 3 - attemptCount
    setSelectedPokemon({
      pokemonId: data.pokemonId,
      slotIndex: data.slotIndex,
      attemptsRemaining: 3 - data.attemptCount,
    });
  }, []);

  // Debounce ref for out-of-range toast to prevent double firing
  const lastOutOfRangeAtRef = useRef<number>(0);

  // Handle out-of-range catch attempt (with debounce to prevent double toast)
  const handleCatchOutOfRange = useCallback((_data: CatchOutOfRangeData) => {
    const now = Date.now();
    // Debounce: ignore if last toast was within 400ms
    if (now - lastOutOfRangeAtRef.current < 400) {
      console.log('[App] handleCatchOutOfRange debounced, skipping duplicate toast');
      return;
    }
    lastOutOfRangeAtRef.current = now;
    addToast('Move closer to the Pokémon!', 'warning');
  }, [addToast]);

  const handleCloseCatchModal = useCallback(() => {
    setSelectedPokemon(null);
  }, []);

  // Close the catch win modal
  const handleCloseWinModal = useCallback(() => {
    setCatchWin(null);
  }, []);

  // Close the catch failure modal
  const handleCloseFailureModal = useCallback(() => {
    setCatchFailure(null);
  }, []);

  // Handle "Try Again" from failure modal - reopen catch attempt modal
  const handleTryAgain = useCallback(() => {
    if (catchFailure?.type === 'failure' && catchFailure.attemptsRemaining > 0) {
      // We need to get the slot index from the game scene
      // For now, we'll just close the failure modal - user can click Pokemon again
      setCatchFailure(null);
      addToast('Click the Pokemon to try again!', 'warning');
    }
  }, [catchFailure, addToast]);

  // Handle visual throw animation before contract call
  const handleVisualThrow = useCallback((pokemonId: bigint, ballType: BallType) => {
    // Trigger the Phaser animation via the ref
    if (visualThrowRef.current) {
      visualThrowRef.current(pokemonId, ballType);
    }
  }, []);

  // Open the Help modal
  const handleShowHelp = useCallback(() => {
    setShowHelp(true);
  }, []);

  // Close the Help modal
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
      />

      {/* Catch Win Modal - Shows NFT details on successful catch */}
      {catchWin && (
        <CatchWinModal
          isOpen={true}
          onClose={handleCloseWinModal}
          tokenId={catchWin.tokenId}
          pokemonId={catchWin.pokemonId}
          txHash={catchWin.txHash}
        />
      )}

      {/* Catch Failure Modal - Shows escape result */}
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

      {/* Dev Mode Indicator Button (bottom-left corner) */}
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
          🛠️ DEV TOOLS
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
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = '#6a6';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = '#4a4';
        }}
      >
        <i className="fas fa-box" style={{ marginRight: '8px' }}></i>
        INVENTORY
      </button>

      {/* Volume Toggles - Music and SFX side by side */}
      <SfxVolumeToggle />
      <VolumeToggle onVolumeChange={handleVolumeChange} initialVolume={musicVolume} />

      {/* Inventory Terminal */}
      <InventoryTerminal isOpen={isInventoryOpen} onClose={handleInventoryClose} />

      {/* Help Modal */}
      <HelpModal isOpen={showHelp} onClose={handleCloseHelp} />

      {/* Music disabled */}
    </div>
  );
}

/** Root App component with providers */
function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <AppContent />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
