import { Scene } from 'phaser';

export class House extends Phaser.GameObjects.Sprite {
  constructor(scene: Scene, x: number, y: number, houseType: 'small' | 'medium' | 'large' = 'medium') {
    super(scene, x, y, `house-${houseType}`);
    
    scene.add.existing(this);
    this.setDepth(3); // Above ground, below player
    this.setOrigin(0.5, 1); // Anchor at bottom center
  }
}
