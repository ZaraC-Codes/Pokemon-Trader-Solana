import { Scene } from 'phaser';
import type { TradeListing } from '../../services/contractService';

export class TradeIcon extends Phaser.GameObjects.Sprite {
  public listing: TradeListing;
  private glow?: Phaser.GameObjects.Sprite;

  constructor(scene: Scene, x: number, y: number, listing: TradeListing) {
    super(scene, x, y, 'trade-icon');
    
    this.listing = listing;
    
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 16);
    body.setImmovable(true);
    
    // Make it interactive
    this.setInteractive({ useHandCursor: true });
    
    // Add glow effect
    this.glow = scene.add.sprite(x, y, 'trade-icon-glow');
    this.glow.setDepth(this.depth - 1);
    this.glow.setAlpha(0.6);
    
    // Create pulsing animation
    if (!scene.anims.exists('trade-icon-pulse')) {
      scene.anims.create({
        key: 'trade-icon-pulse',
        frames: scene.anims.generateFrameNumbers('trade-icon', { start: 0, end: 3 }),
        frameRate: 4,
        repeat: -1,
      });
    }
    
    this.anims.play('trade-icon-pulse');
    
    // Pointer events
    this.on('pointerdown', () => {
      this.emit('trade-clicked', this.listing);
    });
  }

  update(): void {
    // Make glow pulse
    if (this.glow) {
      const time = this.scene.time.now;
      const alpha = 0.4 + Math.sin(time / 500) * 0.2;
      this.glow.setAlpha(alpha);
      this.glow.setPosition(this.x, this.y);
    }
  }

  destroy(): void {
    if (this.glow) {
      this.glow.destroy();
    }
    super.destroy();
  }
}
