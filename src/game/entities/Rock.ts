import { Scene } from 'phaser';

export class Rock extends Phaser.GameObjects.Sprite {
  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y, 'rock');
    
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12);
    body.setImmovable(true);
    body.setOffset(2, 2);
    
    this.setDepth(5); // Above ground but below player
  }
}
