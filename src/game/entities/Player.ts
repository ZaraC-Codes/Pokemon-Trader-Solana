import { Scene } from 'phaser';
import { TouchInputManager, type TouchMovementState } from '../managers/TouchInputManager';
import { TOUCH_CONTROL_CONFIG } from '../config/gameConfig';

export class Player extends Phaser.GameObjects.Sprite {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys?: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private touchInputManager?: TouchInputManager;
  private speed = 100;
  private walkSpeed = 100;
  private bikeSpeed = 200;
  private isMoving = false;
  private isOnBike = false;
  private bicycle?: Phaser.GameObjects.Sprite;

  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12);
    body.setOffset(2, 4);
    
    // Create animations
    this.createAnimations();
    this.anims.play('player-idle-down');
    
    // Set up keyboard input
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.wasdKeys = scene.input.keyboard.addKeys('W,S,A,D') as any;
      this.spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    // Set up touch input for mobile devices
    this.touchInputManager = new TouchInputManager(scene, {
      mode: TOUCH_CONTROL_CONFIG.mode,
      dpadSize: TOUCH_CONTROL_CONFIG.dpadSize,
      dpadOpacity: TOUCH_CONTROL_CONFIG.dpadOpacity,
      dpadMargin: TOUCH_CONTROL_CONFIG.dpadMargin,
      tapMoveThreshold: TOUCH_CONTROL_CONFIG.tapMoveThreshold,
      showTapIndicator: TOUCH_CONTROL_CONFIG.showTapIndicator,
      bottomUIHeight: TOUCH_CONTROL_CONFIG.bottomUIHeight,
      bottomUIPadding: TOUCH_CONTROL_CONFIG.bottomUIPadding,
      topMargin: TOUCH_CONTROL_CONFIG.topMargin,
    });

    // Force enable touch controls if configured (for testing on desktop)
    if (TOUCH_CONTROL_CONFIG.forceEnabled) {
      this.touchInputManager.forceEnable();
    }

    // Create bicycle sprite (initially hidden)
    this.bicycle = scene.add.sprite(x, y, 'bicycle');
    this.bicycle.setDepth(9); // Just below player
    this.bicycle.setVisible(false);
  }

  private createAnimations(): void {
    const scene = this.scene;
    
    if (!scene.anims.exists('player-walk-down')) {
      scene.anims.create({
        key: 'player-walk-down',
        frames: scene.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    
    if (!scene.anims.exists('player-walk-up')) {
      scene.anims.create({
        key: 'player-walk-up',
        frames: scene.anims.generateFrameNumbers('player', { start: 4, end: 7 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    
    if (!scene.anims.exists('player-walk-left')) {
      scene.anims.create({
        key: 'player-walk-left',
        frames: scene.anims.generateFrameNumbers('player', { start: 8, end: 11 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    
    if (!scene.anims.exists('player-walk-right')) {
      scene.anims.create({
        key: 'player-walk-right',
        frames: scene.anims.generateFrameNumbers('player', { start: 12, end: 15 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    
    // Idle animations
    if (!scene.anims.exists('player-idle-down')) {
      scene.anims.create({
        key: 'player-idle-down',
        frames: [{ key: 'player', frame: 0 }],
        frameRate: 1,
      });
    }
    
    if (!scene.anims.exists('player-idle-up')) {
      scene.anims.create({
        key: 'player-idle-up',
        frames: [{ key: 'player', frame: 4 }],
        frameRate: 1,
      });
    }
    
    if (!scene.anims.exists('player-idle-left')) {
      scene.anims.create({
        key: 'player-idle-left',
        frames: [{ key: 'player', frame: 8 }],
        frameRate: 1,
      });
    }
    
    if (!scene.anims.exists('player-idle-right')) {
      scene.anims.create({
        key: 'player-idle-right',
        frames: [{ key: 'player', frame: 12 }],
        frameRate: 1,
      });
    }
  }

  update(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    // Toggle bicycle with spacebar (optional, can also rent from shop)
    if (this.spaceKey?.isDown && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.toggleBike();
    }

    // Get keyboard input
    const keyboardLeft = this.cursors?.left?.isDown || this.wasdKeys?.a?.isDown || false;
    const keyboardRight = this.cursors?.right?.isDown || this.wasdKeys?.d?.isDown || false;
    const keyboardUp = this.cursors?.up?.isDown || this.wasdKeys?.w?.isDown || false;
    const keyboardDown = this.cursors?.down?.isDown || this.wasdKeys?.s?.isDown || false;

    // Get touch input (updates internal state based on player position)
    let touchState: TouchMovementState | undefined;
    if (this.touchInputManager) {
      touchState = this.touchInputManager.update(this.x, this.y);
    }

    // Combine inputs: keyboard takes priority, then touch
    // This ensures both input methods work, with keyboard overriding touch if active
    const hasKeyboardInput = keyboardLeft || keyboardRight || keyboardUp || keyboardDown;

    let leftDown: boolean;
    let rightDown: boolean;
    let upDown: boolean;
    let downDown: boolean;

    if (hasKeyboardInput) {
      // Keyboard input active - use keyboard, cancel any tap-to-move
      leftDown = keyboardLeft;
      rightDown = keyboardRight;
      upDown = keyboardUp;
      downDown = keyboardDown;
      // Cancel touch movement when keyboard is used
      this.touchInputManager?.cancelMovement();
    } else if (touchState) {
      // No keyboard input - use touch
      leftDown = touchState.left;
      rightDown = touchState.right;
      upDown = touchState.up;
      downDown = touchState.down;
    } else {
      leftDown = false;
      rightDown = false;
      upDown = false;
      downDown = false;
    }

    // Reset velocity
    body.setVelocity(0);

    // Handle movement - prioritize vertical over horizontal to prevent diagonal movement
    // Only allow one direction at a time
    if (upDown && !downDown) {
      body.setVelocityY(-this.speed);
      this.anims.play('player-walk-up', true);
      this.isMoving = true;
    } else if (downDown && !upDown) {
      body.setVelocityY(this.speed);
      this.anims.play('player-walk-down', true);
      this.isMoving = true;
    } else if (leftDown && !rightDown) {
      body.setVelocityX(-this.speed);
      this.anims.play('player-walk-left', true);
      this.isMoving = true;
    } else if (rightDown && !leftDown) {
      body.setVelocityX(this.speed);
      this.anims.play('player-walk-right', true);
      this.isMoving = true;
    }

    // Update isMoving flag based on actual movement (not just key presses)
    this.isMoving = body.velocity.x !== 0 || body.velocity.y !== 0;

    // Handle idle animation
    if (!this.isMoving) {
      const currentAnim = this.anims.currentAnim?.key;
      if (currentAnim?.includes('walk')) {
        const direction = currentAnim.split('-')[2];
        this.anims.play(`player-idle-${direction}`, true);
      }
    }

    // Update bicycle position to follow player (slightly below to appear under feet)
    if (this.bicycle) {
      this.bicycle.setPosition(this.x, this.y + 2);
    }
  }
  
  getIsOnBike(): boolean {
    return this.isOnBike;
  }

  rentBike(): void {
    // Prevent re-renting if already on bike (avoids infinite recursion)
    if (this.isOnBike) {
      return;
    }
    this.isOnBike = true;
    this.speed = this.bikeSpeed;
    if (this.bicycle) {
      this.bicycle.setVisible(true);
    }
    // Don't emit event here to prevent infinite recursion
    // The event should be emitted by the caller (e.g., BikeShopOwner or modal)
    // this.scene.events.emit('rent-bike');
  }

  returnBike(): void {
    // Prevent returning if not on bike (avoids infinite recursion)
    if (!this.isOnBike) {
      return;
    }
    this.isOnBike = false;
    this.speed = this.walkSpeed;
    if (this.bicycle) {
      this.bicycle.setVisible(false);
    }
    // Don't emit event here to prevent infinite recursion
    // The event should be emitted by the caller if needed
    // this.scene.events.emit('return-bike');
  }

  toggleBike(): void {
    if (this.isOnBike) {
      this.returnBike();
    } else {
      this.rentBike();
    }
  }

  /**
   * Get the touch input manager for external control
   */
  getTouchInputManager(): TouchInputManager | undefined {
    return this.touchInputManager;
  }

  /**
   * Cancel any active touch movement (e.g., when opening UI)
   */
  cancelTouchMovement(): void {
    this.touchInputManager?.cancelMovement();
  }

  /**
   * Check if touch controls are active on this device
   */
  isTouchControlsActive(): boolean {
    return this.touchInputManager?.isTouchActive() ?? false;
  }

  /**
   * Clean up resources
   */
  destroy(fromScene?: boolean): void {
    this.touchInputManager?.destroy();
    this.bicycle?.destroy();
    super.destroy(fromScene);
  }
}
