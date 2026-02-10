import { Scene } from 'phaser';
import { NPC } from '../entities/NPC';
import { MapManager } from './MapManager';

/**
 * NPCManager — STUBBED for Solana port.
 *
 * Trade NPCs were tied to the ApeChain OTC listing system.
 * NPCs will spawn without listings (decorative only) until
 * a Solana marketplace integration is added.
 */
export class NPCManager {
  private scene: Scene;
  private npcs: NPC[] = [];
  private mapManager: MapManager;
  private npcTypes = ['npc', 'npc2', 'npc3', 'npc4'];

  constructor(scene: Scene, mapManager: MapManager) {
    this.scene = scene;
    this.mapManager = mapManager;
  }

  async spawnNPCs(): Promise<void> {
    this.clearNPCs();

    console.log('[NPCManager] Trade NPCs disabled (Solana port — no OTC contract yet)');

    // Spawn a few decorative NPCs without trade listings
    const walkableAreas = this.mapManager.getWalkableArea();
    if (walkableAreas.length === 0) return;

    const numNPCs = Math.min(4, walkableAreas.length);
    const usedPositions = new Set<string>();

    for (let i = 0; i < numNPCs; i++) {
      let attempts = 0;
      let position: { x: number; y: number } | null = null;

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
        const npcType = this.npcTypes[i % this.npcTypes.length];
        const npc = new NPC(this.scene, position.x, position.y, npcType);
        this.npcs.push(npc);
      }
    }

    console.log(`[NPCManager] Spawned ${this.npcs.length} decorative NPCs`);
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
