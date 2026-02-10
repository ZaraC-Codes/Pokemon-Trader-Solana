import { Scene } from 'phaser';
import { DialogBubble } from './DialogBubble';

export class BikeShopOwner extends Phaser.GameObjects.Sprite {
  private interactionZone?: Phaser.GameObjects.Zone;
  private exclamationMark?: Phaser.GameObjects.Sprite;
  private isPlayerNear = false;
  private checkDistanceTimer?: Phaser.Time.TimerEvent;
  private dialogBubble?: DialogBubble;

  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y, 'shop-owner');
    
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12);
    body.setOffset(2, 4);
    body.setImmovable(true);
    
    this.setDepth(10); // Same depth as player
    
    // Create interaction zone (larger than sprite for easier clicking)
    this.interactionZone = scene.add.zone(x, y, 24, 24);
    this.interactionZone.setInteractive({ useHandCursor: true });
    this.interactionZone.setDepth(11);
    
    // Make sprite clickable too
    this.setInteractive({ useHandCursor: true });
    
    // Create exclamation mark sprite
    this.createExclamationMark();
    
    // Create idle animation
    this.createAnimations();
    this.anims.play('shop-owner-idle');
    
    // Start checking player distance
    this.startDistanceCheck();
  }

  private createExclamationMark(): void {
    // Create exclamation mark sprite
    const exclamationGraphics = this.scene.make.graphics({ x: 0, y: 0 });
    exclamationGraphics.fillStyle(0xffff00, 1); // Yellow background
    exclamationGraphics.fillCircle(4, 4, 4);
    exclamationGraphics.fillStyle(0xff0000, 1); // Red exclamation
    exclamationGraphics.fillRect(3, 1, 2, 4);
    exclamationGraphics.fillRect(3, 6, 2, 1);
    exclamationGraphics.generateTexture('exclamation', 8, 8);
    exclamationGraphics.destroy();
    
    // Create sprite but hide it initially
    this.exclamationMark = this.scene.add.sprite(this.x, this.y - 12, 'exclamation');
    this.exclamationMark.setDepth(15); // Above everything
    this.exclamationMark.setVisible(false);
    
    // Add pulsing animation
    this.scene.tweens.add({
      targets: this.exclamationMark,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private createAnimations(): void {
    const scene = this.scene;
    
    if (!scene.anims.exists('shop-owner-idle')) {
      scene.anims.create({
        key: 'shop-owner-idle',
        frames: [{ key: 'shop-owner', frame: 0 }],
        frameRate: 1,
        repeat: -1,
      });
    }
  }

  private startDistanceCheck(): void {
    // Check distance to player periodically
    this.checkDistanceTimer = this.scene.time.addEvent({
      delay: 100, // Check every 100ms
      callback: () => {
        this.updateExclamationMark();
      },
      loop: true,
    });
  }

  private updateExclamationMark(): void {
    if (!this.exclamationMark) return;
    
    // Get player from scene (GameScene has player property)
    const gameScene = this.scene as any;
    const player = gameScene.player;
    if (!player || !player.active) {
      this.exclamationMark.setVisible(false);
      return;
    }
    
    // Calculate distance
    const distance = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      player.x,
      player.y
    );
    
    this.isPlayerNear = distance < 48; // Show exclamation within 3 tiles (48 pixels)
    
    // Update exclamation mark visibility and position
    if (this.exclamationMark) {
      this.exclamationMark.setVisible(this.isPlayerNear);
      this.exclamationMark.setPosition(this.x, this.y - 12);
    }
  }

  getInteractionZone(): Phaser.GameObjects.Zone | undefined {
    return this.interactionZone;
  }

  isPlayerInRange(): boolean {
    return this.isPlayerNear;
  }

  showDialog(onYes: () => void, onNo: () => void, isReturning: boolean = false): void {
    // Close existing dialog if any (clean up properly)
    this.hideDialog();
    
    // Create new dialog bubble directly above the shop owner's head
    const dialogX = this.x;
    const dialogY = this.y - 20; // Directly above head (closer)
    
    const message = isReturning 
      ? 'Would you like\nto return the bicycle?'
      : 'Would you like\nto rent a bicycle?';
    
    this.dialogBubble = new DialogBubble(
      this.scene,
      dialogX,
      dialogY,
      message,
      () => {
        // Clean up dialog before executing action
        this.hideDialog();
        onYes();
      },
      () => {
        // Clean up dialog on no
        this.hideDialog();
        onNo();
      }
    );
    
    // Store update timer to clean up later
    const updateTimer = this.scene.time.addEvent({
      delay: 50,
      callback: () => {
        if (this.dialogBubble && this.dialogBubble.active) {
          this.dialogBubble.setPosition(this.x, this.y - 20);
        } else {
          updateTimer.remove();
        }
      },
      loop: true
    });
  }

  hideDialog(): void {
    if (this.dialogBubble) {
      this.dialogBubble.destroy();
      this.dialogBubble = undefined;
    }
  }

  destroy(): void {
    if (this.checkDistanceTimer) {
      this.checkDistanceTimer.destroy();
    }
    if (this.interactionZone) {
      this.interactionZone.destroy();
    }
    if (this.exclamationMark) {
      this.exclamationMark.destroy();
    }
    if (this.dialogBubble) {
      this.dialogBubble.destroy();
    }
    super.destroy();
  }
}
