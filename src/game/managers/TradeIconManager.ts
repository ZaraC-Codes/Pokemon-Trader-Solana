import { Scene } from 'phaser';
import { TradeIcon } from '../entities/TradeIcon';
import { MapManager } from './MapManager';

/**
 * TradeIconManager — STUBBED for Solana port.
 *
 * The OTC trade/listing system was EVM-specific (ApeChain OTC contract).
 * This manager is kept as a no-op so GameScene doesn't break.
 * Trade icons will not appear until a Solana marketplace integration is added.
 */
export class TradeIconManager {
  private scene: Scene;
  private tradeIcons: TradeIcon[] = [];
  private mapManager: MapManager;
  private refreshInterval?: number;

  constructor(scene: Scene, mapManager: MapManager) {
    this.scene = scene;
    this.mapManager = mapManager;
  }

  async loadTradeIcons(): Promise<void> {
    // No-op: OTC trading not yet available on Solana
    console.log('[TradeIconManager] Trade icons disabled (Solana port — no OTC contract yet)');
  }

  clearTradeIcons(): void {
    this.tradeIcons.forEach((icon) => icon.destroy());
    this.tradeIcons = [];
  }

  update(): void {
    this.tradeIcons.forEach((icon) => icon.update());
  }

  refreshListings(): void {
    // No-op
  }

  startAutoRefresh(_intervalMs: number = 30000): void {
    // No-op
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }
}
