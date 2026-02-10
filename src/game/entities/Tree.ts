import { Scene } from 'phaser';

export class Tree extends Phaser.GameObjects.Sprite {
  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y, 'tree');
    
    scene.add.existing(this);
    this.setDepth(5); // Above ground but below player
    
    // Start wind animation
    this.startWindAnimation();
  }

  private startWindAnimation(): void {
    // Subtle swaying animation
    this.scene.tweens.add({
      targets: this,
      angle: -3,
      duration: 2000 + Math.random() * 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
