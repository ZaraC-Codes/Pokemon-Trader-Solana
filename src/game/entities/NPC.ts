import { Scene } from 'phaser';
import type { OTCListing } from '../../services/types';
import { getAlchemyNFTMetadata } from '../../utils/alchemy';
import { DialogBubble } from './DialogBubble';

export class NPC extends Phaser.GameObjects.Sprite {
  private moveTimer?: Phaser.Time.TimerEvent;
  private currentDirection: number = 0; // 0=down, 1=up, 2=left, 3=right
  private speed = 30;
  private isMoving = false;
  private npcType: string;
  public listing?: OTCListing;
  private interactionZone?: Phaser.GameObjects.Zone;
  private exclamationMark?: Phaser.GameObjects.Sprite;
  private isPlayerNear = false;
  private checkDistanceTimer?: Phaser.Time.TimerEvent;
  private listingInfoDisplay?: Phaser.GameObjects.Container;
  private listingInfoTimer?: Phaser.Time.TimerEvent;
  private moveToPlayerTimer?: Phaser.Time.TimerEvent;
  private isMovingToPlayer: boolean = false;
  private dialogBubble?: DialogBubble;

  constructor(scene: Scene, x: number, y: number, npcType: string = 'npc', listing?: OTCListing) {
    super(scene, x, y, npcType);
    this.npcType = npcType;
    this.listing = listing;
    
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12);
    body.setOffset(2, 4);
    body.setImmovable(true); // NPCs don't get pushed by player
    
    this.setDepth(10); // Same depth as player
    
    // Create interaction zone if NPC has a listing
    if (this.listing) {
      // Make interaction zone slightly larger for easier clicking
      this.interactionZone = scene.add.zone(x, y, 40, 40);
      this.interactionZone.setInteractive({ useHandCursor: true });
      this.interactionZone.setDepth(11);
      
      // Make NPC sprite itself clickable with proper hit area
      this.setInteractive({ 
        useHandCursor: true,
        hitArea: new Phaser.Geom.Rectangle(-8, -8, 16, 16),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains
      });
      this.createExclamationMark();
      this.startDistanceCheck();
      
      // Make NPC clickable - show dialog immediately when clicked
      this.on('pointerdown', () => {
        if (this.listing) {
          // Stop any current movement
          const body = this.body as Phaser.Physics.Arcade.Body;
          body.setVelocity(0, 0);
          this.isMoving = false;
          this.isMovingToPlayer = false;
          
          // Show dialog immediately
          this.showTradeDialog();
        }
      });
      
      // Also make interaction zone clickable
      this.interactionZone.on('pointerdown', () => {
        if (this.listing) {
          // Stop any current movement
          const body = this.body as Phaser.Physics.Arcade.Body;
          body.setVelocity(0, 0);
          this.isMoving = false;
          this.isMovingToPlayer = false;
          
          // Show dialog immediately
          this.showTradeDialog();
        }
      });
    }
    
    // Create animations
    this.createAnimations();
    this.anims.play(`${this.npcType}-idle-down`);
    
    // Start random movement pattern
    this.startRandomMovement();
  }
  
  private createExclamationMark(): void {
    // Reuse exclamation mark texture if it exists, otherwise create it
    if (!this.scene.textures.exists('exclamation')) {
      const exclamationGraphics = this.scene.make.graphics({ x: 0, y: 0 });
      exclamationGraphics.fillStyle(0xffff00, 1); // Yellow background
      exclamationGraphics.fillCircle(4, 4, 4);
      exclamationGraphics.fillStyle(0xff0000, 1); // Red exclamation
      exclamationGraphics.fillRect(3, 1, 2, 4);
      exclamationGraphics.fillRect(3, 6, 2, 1);
      exclamationGraphics.generateTexture('exclamation', 8, 8);
      exclamationGraphics.destroy();
    }
    
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
    if (!this.exclamationMark || !this.listing) return;
    
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
    
    // Update listing info display position to follow NPC
    if (this.listingInfoDisplay && this.listingInfoDisplay.active) {
      this.listingInfoDisplay.setPosition(this.x, this.y - 28);
    }
    
    // Update dialog bubble position to follow NPC
    if (this.dialogBubble && this.dialogBubble.active) {
      this.dialogBubble.setPosition(this.x, this.y - 60);
    }
    
    // Update interaction zone position to follow NPC
    if (this.interactionZone) {
      this.interactionZone.setPosition(this.x, this.y);
    }
  }
  
  getInteractionZone(): Phaser.GameObjects.Zone | undefined {
    return this.interactionZone;
  }
  
  isPlayerInRange(): boolean {
    return this.isPlayerNear;
  }

  private async showListingInfo(): Promise<void> {
    if (!this.listing) return;

    // Hide existing info display if any
    this.hideListingInfo();

    // Format listing information
    const listingId = this.listing.listingId;
    const tokenId = this.listing.tokenForSale?.value;
    const price = this.listing.tokenToReceive?.value?.toString() || '0';
    const seller = this.listing.seller || '';
    const saleContract = this.listing.tokenForSale?.contractAddress || '';
    const receiveContract = this.listing.tokenToReceive?.contractAddress || '';
    const isCrossChain = this.listing.dstChain !== undefined && this.listing.dstChain !== 0;
    
    // Helper to shorten addresses
    const shortenAddress = (address: string, start: number = 6, end: number = 4): string => {
      if (!address || address.length < start + end) return address;
      return `${address.substring(0, start)}...${address.substring(address.length - end)}`;
    };

    // Format price (assuming it's in wei, convert to readable format)
    const formatPrice = (priceStr: string): string => {
      try {
        const priceBigInt = BigInt(priceStr);
        const priceInEther = Number(priceBigInt) / 1e18;
        if (priceInEther >= 1) {
          // Show more decimals for smaller amounts
          if (priceInEther < 0.0001) {
            return priceBigInt.toString() + ' wei';
          } else if (priceInEther < 1) {
            return priceInEther.toFixed(8) + ' APE';
          } else if (priceInEther < 1000) {
            return priceInEther.toFixed(4) + ' APE';
          } else {
            return priceInEther.toFixed(2) + ' APE';
          }
        } else {
          return priceBigInt.toString() + ' wei';
        }
      } catch {
        return priceStr;
      }
    };

    const shortenedSeller = seller ? shortenAddress(seller) : 'N/A';
    const shortenedSaleContract = saleContract ? shortenAddress(saleContract) : 'N/A';
    const shortenedReceiveContract = receiveContract ? shortenAddress(receiveContract) : 'N/A';
    
    // Create initial lines of text
    const lines: string[] = [
      `Listing #${listingId}`,
      `Token ID: ${tokenId?.toString() || 'N/A'}`,
    ];

    // Add seller info if available
    if (seller) {
      lines.push(`Seller: ${shortenedSeller}`);
    }

    // Add NFT contract info if available
    if (saleContract) {
      lines.push(`NFT: ${shortenedSaleContract}`);
    }

    // Add payment token contract info if available
    if (receiveContract && receiveContract.toLowerCase() !== '0x0000000000000000000000000000000000000000') {
      lines.push(`Pay: ${shortenedReceiveContract}`);
    }

    // Add cross-chain info if applicable
    if (isCrossChain && this.listing.dstChain) {
      lines.push(`Cross-Chain: Chain ${this.listing.dstChain}`);
    }

    // Fetch NFT metadata from Alchemy
    let nftMetadata: { name?: string; description?: string; image?: string; attributes?: Array<{ trait_type: string; value: string | number }> } | null = null;
    if (saleContract && tokenId !== undefined) {
      try {
        nftMetadata = await getAlchemyNFTMetadata(saleContract, tokenId);
        if (nftMetadata) {
          // Add metadata to display
          if (nftMetadata.name) {
            lines.push(`Name: ${nftMetadata.name}`);
          }
          if (nftMetadata.description) {
            // Truncate long descriptions
            const maxDescLength = 50;
            const desc = nftMetadata.description.length > maxDescLength 
              ? nftMetadata.description.substring(0, maxDescLength) + '...'
              : nftMetadata.description;
            lines.push(`Desc: ${desc}`);
          }
          // Show first few attributes if available
          if (nftMetadata.attributes && nftMetadata.attributes.length > 0) {
            const attrsToShow = nftMetadata.attributes.slice(0, 2); // Show first 2 attributes
            attrsToShow.forEach(attr => {
              const attrText = `${attr.trait_type}: ${attr.value}`;
              // Truncate if too long
              const maxAttrLength = 30;
              const truncated = attrText.length > maxAttrLength 
                ? attrText.substring(0, maxAttrLength) + '...'
                : attrText;
              lines.push(truncated);
            });
            if (nftMetadata.attributes.length > 2) {
              lines.push(`+${nftMetadata.attributes.length - 2} more`);
            }
          }
        }
      } catch (error) {
        console.warn('[NPC] Failed to fetch NFT metadata:', error);
      }
    }

    // Helper to wrap text to fit within max width
    const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
      // Approximate character width (monospace font)
      const charWidth = fontSize * 0.6;
      const maxChars = Math.floor(maxWidth / charWidth);
      
      if (text.length <= maxChars) {
        return [text];
      }
      
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length <= maxChars) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
          }
          // If word itself is too long, break it
          if (word.length > maxChars) {
            for (let i = 0; i < word.length; i += maxChars) {
              lines.push(word.substring(i, i + maxChars));
            }
            currentLine = '';
          } else {
            currentLine = word;
          }
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    };

    // Calculate container size based on wrapped text
    const lineHeight = 13;
    const padding = 8;
    const maxLineWidth = 220; // Increased to accommodate metadata
    const fontSize = 11;
    
    // Calculate total lines after wrapping
    let totalWrappedLines = 0;
    lines.forEach(line => {
      const wrapped = wrapText(line, maxLineWidth - 4, fontSize);
      totalWrappedLines += wrapped.length;
    });
    
    const containerWidth = maxLineWidth + padding * 2;
    const containerHeight = totalWrappedLines * lineHeight + padding * 2;

    // Create container for listing info
    this.listingInfoDisplay = this.scene.add.container(this.x, this.y - 28);
    this.listingInfoDisplay.setDepth(20); // Above everything
    this.listingInfoDisplay.setScrollFactor(1); // Follow camera

    // Create background rectangle
    const background = this.scene.add.rectangle(
      0,
      0,
      containerWidth,
      containerHeight,
      0x000000,
      0.9
    );
    background.setStrokeStyle(3, 0xffff00); // Yellow border
    background.setScrollFactor(1);
    this.listingInfoDisplay.add(background);

    // Create text lines with proper wrapping
    let yOffset = -(containerHeight / 2) + padding;
    lines.forEach((line) => {
      const wrappedLines = wrapText(line, maxLineWidth - 4, 11);
      wrappedLines.forEach((wrappedLine) => {
        const text = this.scene.add.text(0, yOffset + (lineHeight / 2), wrappedLine, {
          fontSize: '11px',
          fontFamily: 'Courier New, monospace',
          color: '#ffffff',
          align: 'center',
          stroke: '#000000',
          strokeThickness: 2,
        });
        text.setOrigin(0.5, 0.5);
        text.setScrollFactor(1);
        this.listingInfoDisplay.add(text);
        yOffset += lineHeight;
      });
    });

    // Animate appearance
    this.listingInfoDisplay.setAlpha(0);
    this.listingInfoDisplay.setScale(0.8);
    this.scene.tweens.add({
      targets: this.listingInfoDisplay,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    // Auto-hide after 8 seconds (increased to allow reading metadata)
    this.listingInfoTimer = this.scene.time.delayedCall(8000, () => {
      this.hideListingInfo();
    });
  }

  private moveTowardsPlayer(): void {
    // Get player from scene
    const gameScene = this.scene as any;
    const player = gameScene.player;
    if (!player || !player.active) {
      return;
    }

    // Stop random movement
    if (this.moveTimer) {
      this.moveTimer.destroy();
      this.moveTimer = undefined;
    }

    // Don't move if already moving to player or already close
    const distance = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (this.isMovingToPlayer || distance < 32) {
      // Already close or moving, just stop
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      this.isMoving = false;
      this.isMovingToPlayer = false;
      return;
    }

    this.isMovingToPlayer = true;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const animPrefix = this.npcType;

    // Calculate direction to player
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    
    // Determine primary direction (prioritize vertical)
    let vx = 0;
    let vy = 0;
    let direction = 0;
    let anim = '';

    if (Math.abs(dy) > Math.abs(dx)) {
      // Move vertically
      if (dy > 0) {
        vy = this.speed;
        direction = 0;
        anim = `${animPrefix}-walk-down`;
      } else {
        vy = -this.speed;
        direction = 1;
        anim = `${animPrefix}-walk-up`;
      }
    } else {
      // Move horizontally
      if (dx > 0) {
        vx = this.speed;
        direction = 3;
        anim = `${animPrefix}-walk-right`;
      } else {
        vx = -this.speed;
        direction = 2;
        anim = `${animPrefix}-walk-left`;
      }
    }

    this.currentDirection = direction;
    this.isMoving = true;
    body.setVelocity(vx, vy);
    this.anims.play(anim, true);

    // Check distance periodically and stop when close enough
    const checkDistance = () => {
      if (!this.active || !player || !player.active) {
        this.isMovingToPlayer = false;
        return;
      }

      const currentDistance = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      
      if (currentDistance < 32) {
        // Close enough, stop moving
        body.setVelocity(0, 0);
        this.isMoving = false;
        this.isMovingToPlayer = false;
        
        // Play idle animation
        const idleAnims = [`${animPrefix}-idle-down`, `${animPrefix}-idle-up`, `${animPrefix}-idle-left`, `${animPrefix}-idle-right`];
        this.anims.play(idleAnims[this.currentDirection], true);
        
        // Show dialog box
        this.showTradeDialog();
      } else {
        // Continue checking
        this.moveToPlayerTimer = this.scene.time.delayedCall(100, checkDistance);
      }
    };

    // Start checking distance
    this.moveToPlayerTimer = this.scene.time.delayedCall(100, checkDistance);
  }

  private showTradeDialog(): void {
    if (!this.listing) return;
    
    // Hide existing dialog if any
    this.hideDialog();

    // Get player from scene
    const gameScene = this.scene as any;
    const player = gameScene.player;
    if (!player || !player.active) {
      return;
    }

    // Format listing info for dialog (show immediately with basic info)
    const listingId = this.listing.listingId;
    const tokenId = this.listing.tokenForSale?.value?.toString() || 'N/A';
    const saleContract = this.listing.tokenForSale?.contractAddress || '';
    
    // Create dialog message with listing info (show immediately, fetch metadata in background)
    let nftName = `Token #${tokenId}`;
    const message = `Hey, want to trade?\n\nListing #${listingId}\nNFT: ${nftName}\nToken ID: ${tokenId}`;

    // Create dialog bubble above NPC immediately
    const dialogX = this.x;
    const dialogY = this.y - 60; // Above NPC's head

    this.dialogBubble = new DialogBubble(
      this.scene,
      dialogX,
      dialogY,
      message,
      () => {
        // "Sure" - open trade modal
        this.hideDialog();
        if (this.listing) {
          // Convert OTCListing to TradeListing for modal compatibility
          const tradeListing = {
            id: BigInt(this.listing.listingId),
            seller: this.listing.seller as any,
            nftContract: this.listing.tokenForSale?.contractAddress || '0x0' as any,
            tokenId: this.listing.tokenForSale?.value || BigInt(0),
            price: this.listing.tokenToReceive?.value || BigInt(0),
            active: true,
            otcListing: this.listing,
          };
          this.scene.events.emit('show-trade-modal', tradeListing);
        }
      },
      () => {
        // "No thanks" - close dialog and keep NPC stopped
        this.hideDialog();
      }
    );

    // Fetch NFT metadata in background and update dialog if still visible
    if (saleContract && this.listing.tokenForSale?.value !== undefined) {
      getAlchemyNFTMetadata(saleContract, this.listing.tokenForSale.value)
        .then((nftMetadata) => {
          if (nftMetadata?.name && this.dialogBubble && this.dialogBubble.active) {
            // Update dialog text with NFT name if dialog is still open
            const updatedMessage = `Hey, want to trade?\n\nListing #${listingId}\nNFT: ${nftMetadata.name}\nToken ID: ${tokenId}`;
            // Note: DialogBubble doesn't have an update method, so we'd need to recreate it
            // For now, just log - the basic info is already shown
            console.log('[NPC] Fetched NFT name:', nftMetadata.name);
          }
        })
        .catch((error) => {
          console.warn('[NPC] Failed to fetch NFT metadata for dialog:', error);
        });
    }

    // Dialog position is updated in updateExclamationMark() which runs every 100ms
  }

  private hideDialog(): void {
    if (this.dialogBubble) {
      this.dialogBubble.destroy();
      this.dialogBubble = undefined;
    }
  }

  private hideListingInfo(): void {
    if (this.listingInfoTimer) {
      this.listingInfoTimer.destroy();
      this.listingInfoTimer = undefined;
    }

    if (this.listingInfoDisplay) {
      // Animate out
      this.scene.tweens.add({
        targets: this.listingInfoDisplay,
        alpha: 0,
        scaleX: 0.8,
        scaleY: 0.8,
        duration: 200,
        ease: 'Back.easeIn',
        onComplete: () => {
          if (this.listingInfoDisplay) {
            this.listingInfoDisplay.destroy();
            this.listingInfoDisplay = undefined;
          }
        },
      });
    }
  }

  private createAnimations(): void {
    const scene = this.scene;
    const animPrefix = this.npcType;
    
    // Walk animations
    if (!scene.anims.exists(`${animPrefix}-walk-down`)) {
      scene.anims.create({
        key: `${animPrefix}-walk-down`,
        frames: scene.anims.generateFrameNumbers(this.npcType, { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    
    if (!scene.anims.exists(`${animPrefix}-walk-up`)) {
      scene.anims.create({
        key: `${animPrefix}-walk-up`,
        frames: scene.anims.generateFrameNumbers(this.npcType, { start: 4, end: 7 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    
    if (!scene.anims.exists(`${animPrefix}-walk-left`)) {
      scene.anims.create({
        key: `${animPrefix}-walk-left`,
        frames: scene.anims.generateFrameNumbers(this.npcType, { start: 8, end: 11 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    
    if (!scene.anims.exists(`${animPrefix}-walk-right`)) {
      scene.anims.create({
        key: `${animPrefix}-walk-right`,
        frames: scene.anims.generateFrameNumbers(this.npcType, { start: 12, end: 15 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    
    // Idle animations
    if (!scene.anims.exists(`${animPrefix}-idle-down`)) {
      scene.anims.create({
        key: `${animPrefix}-idle-down`,
        frames: [{ key: this.npcType, frame: 0 }],
        frameRate: 1,
      });
    }
    
    if (!scene.anims.exists(`${animPrefix}-idle-up`)) {
      scene.anims.create({
        key: `${animPrefix}-idle-up`,
        frames: [{ key: this.npcType, frame: 4 }],
        frameRate: 1,
      });
    }
    
    if (!scene.anims.exists(`${animPrefix}-idle-left`)) {
      scene.anims.create({
        key: `${animPrefix}-idle-left`,
        frames: [{ key: this.npcType, frame: 8 }],
        frameRate: 1,
      });
    }
    
    if (!scene.anims.exists(`${animPrefix}-idle-right`)) {
      scene.anims.create({
        key: `${animPrefix}-idle-right`,
        frames: [{ key: this.npcType, frame: 12 }],
        frameRate: 1,
      });
    }
  }

  private startRandomMovement(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    
    const move = () => {
      if (!this.active) return;
      
      // Randomly decide to move or stand still
      if (Math.random() < 0.7) { // 70% chance to move
        const animPrefix = this.npcType;
        const directions = [
          { dir: 0, anim: `${animPrefix}-walk-down`, vx: 0, vy: this.speed },
          { dir: 1, anim: `${animPrefix}-walk-up`, vx: 0, vy: -this.speed },
          { dir: 2, anim: `${animPrefix}-walk-left`, vx: -this.speed, vy: 0 },
          { dir: 3, anim: `${animPrefix}-walk-right`, vx: this.speed, vy: 0 },
        ];
        
        const direction = directions[Math.floor(Math.random() * directions.length)];
        this.currentDirection = direction.dir;
        this.isMoving = true;
        
        body.setVelocity(direction.vx, direction.vy);
        this.anims.play(direction.anim, true);
        
        // Move for random duration
        const moveDuration = 1000 + Math.random() * 2000; // 1-3 seconds
        
        this.scene.time.delayedCall(moveDuration, () => {
          if (this.active) {
            body.setVelocity(0, 0);
            this.isMoving = false;
            const idleAnims = [`${animPrefix}-idle-down`, `${animPrefix}-idle-up`, `${animPrefix}-idle-left`, `${animPrefix}-idle-right`];
            this.anims.play(idleAnims[this.currentDirection], true);
          }
        });
      } else {
        // Stand still
        const animPrefix = this.npcType;
        body.setVelocity(0, 0);
        this.isMoving = false;
        const idleAnims = [`${animPrefix}-idle-down`, `${animPrefix}-idle-up`, `${animPrefix}-idle-left`, `${animPrefix}-idle-right`];
        this.anims.play(idleAnims[this.currentDirection], true);
      }
      
      // Update interaction zone position when NPC moves
      if (this.interactionZone) {
        this.interactionZone.setPosition(this.x, this.y);
      }
      
      // Update listing info display position when NPC moves
      if (this.listingInfoDisplay && this.listingInfoDisplay.active) {
        this.listingInfoDisplay.setPosition(this.x, this.y - 28);
      }
      
      // Schedule next movement decision
      const nextDelay = 2000 + Math.random() * 3000; // 2-5 seconds
      this.moveTimer = this.scene.time.delayedCall(nextDelay, move);
    };
    
    // Start first movement after a delay
    this.moveTimer = this.scene.time.delayedCall(1000 + Math.random() * 2000, move);
  }

  destroy(): void {
    if (this.moveTimer) {
      this.moveTimer.destroy();
    }
    if (this.moveToPlayerTimer) {
      this.moveToPlayerTimer.destroy();
    }
    if (this.checkDistanceTimer) {
      this.checkDistanceTimer.destroy();
    }
    if (this.listingInfoTimer) {
      this.listingInfoTimer.destroy();
    }
    if (this.interactionZone) {
      this.interactionZone.destroy();
    }
    if (this.exclamationMark) {
      this.exclamationMark.destroy();
    }
    if (this.listingInfoDisplay) {
      this.listingInfoDisplay.destroy();
    }
    if (this.dialogBubble) {
      this.dialogBubble.destroy();
    }
    super.destroy();
  }
}
