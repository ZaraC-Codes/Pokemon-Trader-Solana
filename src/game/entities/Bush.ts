import { Scene } from 'phaser';

export class Bush extends Phaser.GameObjects.Sprite {
  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y, 'bush');
    
    scene.add.existing(this);
    this.setDepth(5); // Above ground but below player
    
    // Start wind animation
    this.startWindAnimation();
  }

  private startWindAnimation(): void {
    // Subtle swaying animation
    this.scene.tweens.add({
      targets: this,
      angle: -2,
      duration: 1500 + Math.random() * 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
