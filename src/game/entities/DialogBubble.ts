import { Scene } from 'phaser';

export class DialogBubble extends Phaser.GameObjects.Container {
  private background?: Phaser.GameObjects.Rectangle;
  private text?: Phaser.GameObjects.Text;
  private yesButton?: Phaser.GameObjects.Rectangle;
  private noButton?: Phaser.GameObjects.Rectangle;
  private yesText?: Phaser.GameObjects.Text;
  private noText?: Phaser.GameObjects.Text;
  private onYes?: () => void;
  private onNo?: () => void;

  constructor(scene: Scene, x: number, y: number, message: string, onYes: () => void, onNo: () => void) {
    super(scene, x, y);
    
    this.onYes = onYes;
    this.onNo = onNo;
    
    scene.add.existing(this);
    this.setDepth(20); // Above everything
    this.setScrollFactor(1); // Follow camera
    
    // Calculate text height to determine background size
    const textLines = message.split('\n').length;
    const estimatedHeight = Math.max(80, 25 + (textLines * 18) + 45); // More padding + text + buttons with spacing
    
    // Create background (adjustable size for listing info)
    this.background = scene.add.rectangle(0, 0, 220, estimatedHeight, 0x000000, 0.95);
    this.background.setStrokeStyle(4, 0xffffff);
    this.background.setScrollFactor(1);
    this.add(this.background);
    
    // Create message text (much clearer and more visible - brighter)
    this.text = scene.add.text(0, -(estimatedHeight / 2) + 20, message, {
      fontSize: '13px',
      fontFamily: 'Courier New, monospace',
      fontStyle: 'bold',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 200 },
      stroke: '#000000',
      strokeThickness: 3,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#000000',
        blur: 3,
        stroke: true,
        fill: true
      }
    });
    this.text.setOrigin(0.5, 0);
    this.text.setScrollFactor(1);
    this.add(this.text);
    
    // Create "Sure" button (changed from "YES")
    this.yesButton = scene.add.rectangle(-45, (estimatedHeight / 2) - 30, 70, 22, 0x4a4, 1);
    this.yesButton.setStrokeStyle(2, 0xffffff);
    this.yesButton.setScrollFactor(1);
    this.yesButton.setInteractive({ useHandCursor: true });
    this.yesButton.on('pointerdown', () => {
      if (this.onYes) this.onYes();
      this.destroy();
    });
    this.yesButton.on('pointerover', () => {
      this.yesButton!.setFillStyle(0x6a6);
    });
    this.yesButton.on('pointerout', () => {
      this.yesButton!.setFillStyle(0x4a4);
    });
    this.add(this.yesButton);
    
    this.yesText = scene.add.text(-45, (estimatedHeight / 2) - 30, 'Sure', {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.yesText.setOrigin(0.5, 0.5);
    this.yesText.setScrollFactor(1);
    this.add(this.yesText);
    
    // Create "No thanks" button (changed from "NO")
    this.noButton = scene.add.rectangle(45, (estimatedHeight / 2) - 30, 85, 22, 0xa44, 1);
    this.noButton.setStrokeStyle(2, 0xffffff);
    this.noButton.setScrollFactor(1);
    this.noButton.setInteractive({ useHandCursor: true });
    this.noButton.on('pointerdown', () => {
      if (this.onNo) this.onNo();
      this.destroy();
    });
    this.noButton.on('pointerover', () => {
      this.noButton!.setFillStyle(0xc66);
    });
    this.noButton.on('pointerout', () => {
      this.noButton!.setFillStyle(0xa44);
    });
    this.add(this.noButton);
    
    this.noText = scene.add.text(45, (estimatedHeight / 2) - 30, 'No thanks', {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.noText.setOrigin(0.5, 0.5);
    this.noText.setScrollFactor(1);
    this.add(this.noText);
  }

  destroy(): void {
    if (this.background) this.background.destroy();
    if (this.text) this.text.destroy();
    if (this.yesButton) this.yesButton.destroy();
    if (this.noButton) this.noButton.destroy();
    if (this.yesText) this.yesText.destroy();
    if (this.noText) this.noText.destroy();
    super.destroy();
  }
}
