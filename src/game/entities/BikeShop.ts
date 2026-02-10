import { Scene } from 'phaser';

export class BikeShop extends Phaser.GameObjects.Sprite {
  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y, 'bike-shop');
    
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(48, 32);
    body.setImmovable(true);
    body.setOffset(0, 0);
    
    this.setDepth(3); // Above ground, below player
    this.setOrigin(0.5, 1); // Anchor at bottom center
  }
}
