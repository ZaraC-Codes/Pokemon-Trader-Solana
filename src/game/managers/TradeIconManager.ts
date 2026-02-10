import { Scene } from 'phaser';
import { TradeIcon } from '../entities/TradeIcon';
import type { TradeListing } from '../../services/contractService';
import { MapManager } from './MapManager';
import { CONTRACT_ADDRESSES } from '../../services/apechainConfig';

export class TradeIconManager {
  private scene: Scene;
  private tradeIcons: TradeIcon[] = [];
  private mapManager: MapManager;
  private refreshInterval?: number;
  private consecutiveErrors = 0;
  private maxConsecutiveErrors = 3; // Stop auto-refresh after 3 consecutive errors
  private isRefreshing = false;

  constructor(scene: Scene, mapManager: MapManager) {
    this.scene = scene;
    this.mapManager = mapManager;
  }

  async loadTradeIcons(): Promise<void> {
    // Prevent concurrent refresh calls
    if (this.isRefreshing) {
      console.log('[TradeIconManager] Refresh already in progress, skipping...');
      return;
    }

    this.isRefreshing = true;
    // Clear existing icons
    this.clearTradeIcons();

    console.log('[TradeIconManager] Loading trade icons...');
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TradeIconManager.ts:18',message:'loadTradeIcons entry',data:{expectedCollection:CONTRACT_ADDRESSES.NFT_COLLECTION},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
    // #endregion
    
    try {
      // Use the same getAllListings function from hooks (exact same approach)
      const { getAllListings } = await import('../../hooks/useAllListings');
      const otcListings = await getAllListings();
      
      // Reset error counter on success
      this.consecutiveErrors = 0;
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TradeIconManager.ts:26',message:'after getAllListings',data:{otcListingsCount:otcListings.length,firstFewCollections:otcListings.slice(0,5).map(l=>({listingId:l.listingId,tokenForSaleContract:l.tokenForSale?.contractAddress,tokenToReceiveContract:l.tokenToReceive?.contractAddress}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
    // #endregion
    
    // Convert OTCListings to TradeListings for compatibility
    const expectedCollectionLower = CONTRACT_ADDRESSES.NFT_COLLECTION.toLowerCase();
    const listings = otcListings
      .filter((listing) => {
        // Filter for our NFT collection
        const saleToken = listing.tokenForSale;
        const matches = saleToken && 
               saleToken.contractAddress?.toLowerCase() === expectedCollectionLower;
        // #region agent log
        if (otcListings.indexOf(listing) < 5) {
          fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TradeIconManager.ts:32',message:'collection filter check',data:{listingId:listing.listingId,hasSaleToken:!!saleToken,saleTokenContract:saleToken?.contractAddress?.toLowerCase(),expectedCollection:expectedCollectionLower,matches},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
        }
        // #endregion
        return matches;
      })
      .map((listing) => ({
        id: BigInt(listing.listingId),
        seller: listing.seller as any,
        nftContract: listing.tokenForSale!.contractAddress as any,
        tokenId: listing.tokenForSale!.value,
        price: listing.tokenToReceive?.value || BigInt(0), // Use tokenToReceive value as price
        active: true,
      }));
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/9990b2fb-3fdb-43f6-9433-dbe60ebf83a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TradeIconManager.ts:45',message:'after collection filter',data:{filteredCount:listings.length,originalCount:otcListings.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
    // #endregion
    console.log('[TradeIconManager] Received listings:', listings.length);
    
    if (listings.length === 0) {
      console.warn('[TradeIconManager] No listings found, cannot place trade icons');
      return;
    }

    // Get walkable areas for placement
    const walkableAreas = this.mapManager.getWalkableArea();
    
    console.log('[TradeIconManager] Walkable areas available:', walkableAreas.length);
    
    if (walkableAreas.length === 0) {
      console.warn('[TradeIconManager] No walkable areas available');
      return;
    }

    // Randomly place icons on the map
    const maxIcons = Math.min(listings.length, walkableAreas.length);
    console.log('[TradeIconManager] Will place', maxIcons, 'trade icons');
    const usedPositions = new Set<string>();

    for (let i = 0; i < maxIcons; i++) {
      let attempts = 0;
      let position: { x: number; y: number } | null = null;

      // Try to find a unique position
      while (attempts < 50 && !position) {
        const randomIndex = Math.floor(Math.random() * walkableAreas.length);
        const candidate = walkableAreas[randomIndex];
        const key = `${candidate.x},${candidate.y}`;

        if (!usedPositions.has(key)) {
          position = candidate;
          usedPositions.add(key);
        }
        attempts++;
      }

      if (position) {
        const listing = listings[i];
        const tradeIcon = new TradeIcon(
          this.scene,
          position.x,
          position.y,
          listing
        );
        
        tradeIcon.on('trade-clicked', (listing: TradeListing) => {
          this.scene.events.emit('trade-icon-clicked', listing);
        });

        this.tradeIcons.push(tradeIcon);
      }
    }
    
    console.log('[TradeIconManager] Successfully placed', this.tradeIcons.length, 'trade icons');
    } catch (error: any) {
      // Log error but don't spam console
      const errorMsg = error?.message || String(error);
      const isRateLimit = errorMsg.includes('429') || errorMsg.includes('Too Many Requests') || errorMsg.includes('rate limit');
      
      this.consecutiveErrors++;
      console.error(`[TradeIconManager] Error loading trade icons (${this.consecutiveErrors}/${this.maxConsecutiveErrors}):`, 
        isRateLimit ? 'Rate limit error - pausing auto-refresh' : errorMsg.substring(0, 150));
      
      // Stop auto-refresh if too many consecutive errors (likely rate limiting)
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.warn('[TradeIconManager] Too many consecutive errors - stopping auto-refresh to prevent rate limiting');
        this.stopAutoRefresh();
      }
    } finally {
      this.isRefreshing = false;
    }
  }

  clearTradeIcons(): void {
    this.tradeIcons.forEach((icon) => icon.destroy());
    this.tradeIcons = [];
  }

  update(): void {
    this.tradeIcons.forEach((icon) => icon.update());
  }

  refreshListings(): void {
    // Only refresh if not already refreshing and not too many errors
    if (!this.isRefreshing && this.consecutiveErrors < this.maxConsecutiveErrors) {
      this.loadTradeIcons();
    } else if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      console.log('[TradeIconManager] Auto-refresh disabled due to consecutive errors');
    }
  }

  startAutoRefresh(intervalMs: number = 30000): void {
    this.stopAutoRefresh();
    // Only start auto-refresh if not already disabled by errors
    if (this.consecutiveErrors < this.maxConsecutiveErrors) {
      this.refreshInterval = window.setInterval(() => {
        this.refreshListings();
      }, intervalMs);
    }
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }
}
