import { Scene } from 'phaser';
import { NPC } from '../entities/NPC';
import { MapManager } from './MapManager';
import type { OTCListing } from '../../services/types';

export class NPCManager {
  private scene: Scene;
  private npcs: NPC[] = [];
  private mapManager: MapManager;
  private npcTypes = ['npc', 'npc2', 'npc3', 'npc4']; // Different NPC character types

  constructor(scene: Scene, mapManager: MapManager) {
    this.scene = scene;
    this.mapManager = mapManager;
  }

  async spawnNPCs(): Promise<void> {
    // Clear existing NPCs
    this.clearNPCs();

    console.log('[NPCManager] Fetching listings for NPCs...');
    
    // Import and use the getAllListings function directly
    // Since we're in a Phaser scene (not React), we call the function directly
    const { getAllListings } = await import('../../hooks/useAllListings');
    
    // Fetch listings from contract (now optimized to check only known IDs + new ones)
    const otcListings = await getAllListings();
    
    console.log('[NPCManager] Total listings fetched:', otcListings.length);
    
    // Use ALL listings, not just filtered ones - each listing gets an NPC
    const relevantListings = otcListings.filter((listing: OTCListing) => {
      // Include listings that have valid tokens
      const saleToken = listing.tokenForSale;
      const receiveToken = listing.tokenToReceive;
      return saleToken && receiveToken && 
             saleToken.contractAddress && 
             saleToken.contractAddress !== '0x0000000000000000000000000000000000000000';
    });
    
    console.log('[NPCManager] Found', relevantListings.length, 'listings with valid tokens (will create 1 NPC per listing)');

    // Get walkable areas
    const walkableAreas = this.mapManager.getWalkableArea();
    
    if (walkableAreas.length === 0) {
      console.warn('[NPCManager] No walkable areas available');
      return;
    }

    // Spawn one NPC per listing (one-to-one mapping)
    // Limit to available walkable areas if we have more listings than positions
    const maxNPCs = Math.min(relevantListings.length, walkableAreas.length);
    const usedPositions = new Set<string>();
    
    console.log(`[NPCManager] Spawning ${maxNPCs} NPCs (${relevantListings.length} listings available, ${walkableAreas.length} walkable areas)`);
    
    for (let i = 0; i < maxNPCs; i++) {
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

      if (position && relevantListings[i]) {
        // Randomly select NPC type
        const npcType = this.npcTypes[Math.floor(Math.random() * this.npcTypes.length)];
        const npc = new NPC(this.scene, position.x, position.y, npcType, relevantListings[i]);
        this.npcs.push(npc);
        
        if (i < 5) {
          console.log(`[NPCManager] Spawned NPC ${i + 1} with listing ID ${relevantListings[i].listingId} at (${position.x}, ${position.y})`);
        }
      }
    }
    
    console.log(`[NPCManager] ✅ Spawned ${this.npcs.length} NPCs (1 NPC per listing)`);
    
    if (relevantListings.length > walkableAreas.length) {
      console.warn(`[NPCManager] ⚠️ Note: ${relevantListings.length - walkableAreas.length} listings could not be assigned NPCs due to limited walkable areas`);
    }
  }
  
  getNPCs(): NPC[] {
    return this.npcs;
  }

  clearNPCs(): void {
    this.npcs.forEach((npc) => npc.destroy());
    this.npcs = [];
  }

  update(): void {
    // NPCs handle their own updates via timers
  }
}
