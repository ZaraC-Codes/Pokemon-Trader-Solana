import { Scene } from 'phaser';
import { Player } from '../entities/Player';
import { MapManager } from '../managers/MapManager';
import { TradeIconManager } from '../managers/TradeIconManager';
import { NPCManager } from '../managers/NPCManager';
import { PokemonSpawnManager } from '../managers/PokemonSpawnManager';
import { CatchMechanicsManager } from '../managers/CatchMechanicsManager';
import { House } from '../entities/House';
import { Building, type BuildingType } from '../entities/Building';
import { Tree } from '../entities/Tree';
import { Bush } from '../entities/Bush';
import { TradingOutpost } from '../entities/TradingOutpost';
import { BikeShop } from '../entities/BikeShop';
import { BikeShopOwner } from '../entities/BikeShopOwner';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from '../config/gameConfig';
import { ChiptuneMusic } from '../utils/chiptuneMusic';
import { MP3Music } from '../utils/mp3Music';
// Trade/OTC service disabled for Solana port — contractService was EVM-only

export class GameScene extends Scene {
  private player?: Player;
  private loadingScreen?: Phaser.GameObjects.Container;
  private loadingCharacter?: Phaser.GameObjects.Sprite;
  private loadingText?: Phaser.GameObjects.Text;
  private loadingSubtext?: Phaser.GameObjects.Text;
  private glitchGraphics?: Phaser.GameObjects.Graphics;
  private glitchTimer?: Phaser.Time.TimerEvent;
  private mapManager?: MapManager;
  private tradeIconManager?: TradeIconManager;
  private npcManager?: NPCManager;
  /** Exposed for React/Web3 sync - use getPokemonSpawnManager() for safe access */
  public pokemonSpawnManager?: PokemonSpawnManager;
  private catchMechanicsManager?: CatchMechanicsManager;
  private backgroundMusic?: ChiptuneMusic;
  private mp3Music?: MP3Music;
  private houses: House[] = [];
  private buildings: Building[] = [];
  private trees: Tree[] = [];
  private tradingOutposts: TradingOutpost[] = [];
  private bikeShop?: BikeShop;
  private bikeShopOwner?: BikeShopOwner;
  private rocks: Phaser.GameObjects.Sprite[] = [];
  private areNPCsLoaded: boolean = false; // Flag to track if NPCs are fully loaded

  constructor() {
    super({ key: 'GameScene' });
  }

  /**
   * Safe accessor for PokemonSpawnManager.
   * Returns undefined if scene hasn't finished create() yet.
   */
  getPokemonSpawnManager(): PokemonSpawnManager | undefined {
    return this.pokemonSpawnManager;
  }

  /**
   * Safe accessor for CatchMechanicsManager.
   * Returns undefined if scene hasn't finished create() yet.
   */
  getCatchMechanicsManager(): CatchMechanicsManager | undefined {
    return this.catchMechanicsManager;
  }

  preload(): void {
    // Create placeholder pixel art sprites programmatically
    this.createPlaceholderSprites();
    
    // Load Mo Bamba MP3 music
    this.load.audio('mo-bamba', '/mo-bamba.mp3');
    
    // Listen for when audio is loaded
    this.load.once('filecomplete-audio-mo-bamba', () => {
      console.log('Mo Bamba music loaded successfully');
    });
    
    this.load.once('loaderror', (file: any) => {
      if (file.key === 'mo-bamba') {
        console.error('Failed to load Mo Bamba music file:', file.src);
      }
    });
  }

  private createPlaceholderSprites(): void {
    // Player sprite sheet (16x16 frames, 4 directions x 4 frames each = 16 frames)
    // Total size: 4 frames wide x 4 directions tall = 64x64
    // Creating a detailed pixel art character (Pokemon trainer style)
    const playerGraphics = this.make.graphics({ x: 0, y: 0 });
    
    // Create sprite sheet for player (4 frames per row, 4 rows for directions)
    for (let dir = 0; dir < 4; dir++) {
      for (let frame = 0; frame < 4; frame++) {
        const offsetX = frame * 16;
        const offsetY = dir * 16;
        
        // Animation offset for walking (subtle movement)
        const walkOffset = frame % 2 === 0 ? 0 : 1;
        
        if (dir === 0) { // Down (facing camera)
          // Hat/Cap
          playerGraphics.fillStyle(0xff0000, 1); // Red cap
          playerGraphics.fillRect(offsetX + 4, offsetY + 1, 8, 3);
          playerGraphics.fillRect(offsetX + 5, offsetY, 6, 1);
          
          // Face
          playerGraphics.fillStyle(0xffdbac, 1); // Skin tone
          playerGraphics.fillRect(offsetX + 5, offsetY + 4, 6, 5);
          
          // Eyes
          playerGraphics.fillStyle(0x000000, 1);
          playerGraphics.fillRect(offsetX + 6, offsetY + 5, 1, 1);
          playerGraphics.fillRect(offsetX + 9, offsetY + 5, 1, 1);
          
          // Body/Shirt
          playerGraphics.fillStyle(0x0066ff, 1); // Blue shirt
          playerGraphics.fillRect(offsetX + 4, offsetY + 9, 8, 6);
          
          // Arms
          playerGraphics.fillRect(offsetX + 2, offsetY + 10, 2, 4);
          playerGraphics.fillRect(offsetX + 12, offsetY + 10, 2, 4);
          
          // Legs
          playerGraphics.fillStyle(0x654321, 1); // Brown pants
          playerGraphics.fillRect(offsetX + 5 + walkOffset, offsetY + 15, 2, 1);
          playerGraphics.fillRect(offsetX + 9 - walkOffset, offsetY + 15, 2, 1);
        } else if (dir === 1) { // Up (back facing)
          // Hat/Cap (back view)
          playerGraphics.fillStyle(0xff0000, 1);
          playerGraphics.fillRect(offsetX + 4, offsetY + 1, 8, 2);
          
          // Head (back)
          playerGraphics.fillStyle(0xffdbac, 1);
          playerGraphics.fillRect(offsetX + 5, offsetY + 3, 6, 4);
          
          // Hair
          playerGraphics.fillStyle(0x8b4513, 1); // Brown hair
          playerGraphics.fillRect(offsetX + 4, offsetY + 3, 1, 2);
          playerGraphics.fillRect(offsetX + 11, offsetY + 3, 1, 2);
          
          // Body/Shirt (back)
          playerGraphics.fillStyle(0x0066ff, 1);
          playerGraphics.fillRect(offsetX + 4, offsetY + 7, 8, 6);
          
          // Arms (back)
          playerGraphics.fillRect(offsetX + 2, offsetY + 8, 2, 4);
          playerGraphics.fillRect(offsetX + 12, offsetY + 8, 2, 4);
          
          // Legs
          playerGraphics.fillStyle(0x654321, 1);
          playerGraphics.fillRect(offsetX + 5 - walkOffset, offsetY + 15, 2, 1);
          playerGraphics.fillRect(offsetX + 9 + walkOffset, offsetY + 15, 2, 1);
        } else if (dir === 2) { // Left (side view)
          // Hat
          playerGraphics.fillStyle(0xff0000, 1);
          playerGraphics.fillRect(offsetX + 5, offsetY + 1, 6, 2);
          
          // Face (side)
          playerGraphics.fillStyle(0xffdbac, 1);
          playerGraphics.fillRect(offsetX + 6, offsetY + 3, 5, 5);
          
          // Eye (side view)
          playerGraphics.fillStyle(0x000000, 1);
          playerGraphics.fillRect(offsetX + 8, offsetY + 5, 1, 1);
          
          // Body/Shirt (side)
          playerGraphics.fillStyle(0x0066ff, 1);
          playerGraphics.fillRect(offsetX + 5, offsetY + 8, 6, 6);
          
          // Arm (side - one visible)
          playerGraphics.fillRect(offsetX + 3 - walkOffset, offsetY + 9, 2, 4);
          
          // Legs (side)
          playerGraphics.fillStyle(0x654321, 1);
          playerGraphics.fillRect(offsetX + 6, offsetY + 14, 2, 2);
          playerGraphics.fillRect(offsetX + 8, offsetY + 14, 2, 2);
        } else if (dir === 3) { // Right (side view, mirrored)
          // Hat
          playerGraphics.fillStyle(0xff0000, 1);
          playerGraphics.fillRect(offsetX + 5, offsetY + 1, 6, 2);
          
          // Face (side)
          playerGraphics.fillStyle(0xffdbac, 1);
          playerGraphics.fillRect(offsetX + 5, offsetY + 3, 5, 5);
          
          // Eye (side view)
          playerGraphics.fillStyle(0x000000, 1);
          playerGraphics.fillRect(offsetX + 7, offsetY + 5, 1, 1);
          
          // Body/Shirt (side)
          playerGraphics.fillStyle(0x0066ff, 1);
          playerGraphics.fillRect(offsetX + 5, offsetY + 8, 6, 6);
          
          // Arm (side - one visible)
          playerGraphics.fillRect(offsetX + 11 + walkOffset, offsetY + 9, 2, 4);
          
          // Legs (side)
          playerGraphics.fillStyle(0x654321, 1);
          playerGraphics.fillRect(offsetX + 6, offsetY + 14, 2, 2);
          playerGraphics.fillRect(offsetX + 8, offsetY + 14, 2, 2);
        }
      }
    }
    playerGraphics.generateTexture('player', 64, 64);
    playerGraphics.destroy();
    
    // Configure the texture and add frames manually
    const playerTexture = this.textures.get('player');
    playerTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    
    const sourceIndex = 0; // First (and only) source
    
    // Add frames manually (16x16 per frame, arranged in 4x4 grid)
    // Frame indices must be numeric to work with generateFrameNumbers
    for (let i = 0; i < 16; i++) {
      const frameX = (i % 4) * 16;
      const frameY = Math.floor(i / 4) * 16;
      // Add frame - Phaser will use the numeric index
      playerTexture.add(i, sourceIndex, frameX, frameY, 16, 16);
    }

    // Trade icon sprite
    const tradeIconGraphics = this.make.graphics({ x: 0, y: 0 });
    tradeIconGraphics.fillStyle(0xffaa00, 1);
    tradeIconGraphics.fillCircle(8, 8, 7);
    tradeIconGraphics.fillStyle(0xffffff, 1);
    tradeIconGraphics.fillRect(6, 6, 4, 4);
    tradeIconGraphics.generateTexture('trade-icon', 16, 16);
    tradeIconGraphics.destroy();

    // Trade icon glow
    const glowGraphics = this.make.graphics({ x: 0, y: 0 });
    glowGraphics.fillStyle(0xffaa00, 0.3);
    glowGraphics.fillCircle(8, 8, 12);
    glowGraphics.generateTexture('trade-icon-glow', 24, 24);
    glowGraphics.destroy();

    // NPC sprite sheet (similar to player but different colors)
    this.createNPCSprite();
    
    // Tree sprite
    this.createTreeSprite();
    
    // Bush sprite
    this.createBushSprite();
    
    // House sprites
    this.createHouseSprites();
    
    // Building sprites (shops, offices, skyscrapers, etc.)
    this.createBuildingSprites();

    // Bicycle sprite
    this.createBicycleSprite();

    // Tile sprites
    this.createTileSprites();
  }

  private createNPCSprite(): void {
    const npcGraphics = this.make.graphics({ x: 0, y: 0 });
    
    // Create NPC sprite sheet (4 frames per row, 4 rows for directions)
    for (let dir = 0; dir < 4; dir++) {
      for (let frame = 0; frame < 4; frame++) {
        const offsetX = frame * 16;
        const offsetY = dir * 16;
        const walkOffset = frame % 2 === 0 ? 0 : 1;
        
        if (dir === 0) { // Down
          // Hat (different color)
          npcGraphics.fillStyle(0x0000ff, 1); // Blue cap
          npcGraphics.fillRect(offsetX + 4, offsetY + 1, 8, 3);
          npcGraphics.fillRect(offsetX + 5, offsetY, 6, 1);
          
          // Face
          npcGraphics.fillStyle(0xffdbac, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 4, 6, 5);
          
          // Eyes
          npcGraphics.fillStyle(0x000000, 1);
          npcGraphics.fillRect(offsetX + 6, offsetY + 5, 1, 1);
          npcGraphics.fillRect(offsetX + 9, offsetY + 5, 1, 1);
          
          // Body (different color)
          npcGraphics.fillStyle(0xff6600, 1); // Orange shirt
          npcGraphics.fillRect(offsetX + 4, offsetY + 9, 8, 6);
          
          // Arms
          npcGraphics.fillRect(offsetX + 2, offsetY + 10, 2, 4);
          npcGraphics.fillRect(offsetX + 12, offsetY + 10, 2, 4);
          
          // Legs
          npcGraphics.fillStyle(0x654321, 1);
          npcGraphics.fillRect(offsetX + 5 + walkOffset, offsetY + 15, 2, 1);
          npcGraphics.fillRect(offsetX + 9 - walkOffset, offsetY + 15, 2, 1);
        } else if (dir === 1) { // Up
          npcGraphics.fillStyle(0x0000ff, 1);
          npcGraphics.fillRect(offsetX + 4, offsetY + 1, 8, 2);
          npcGraphics.fillStyle(0xffdbac, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 3, 6, 4);
          npcGraphics.fillStyle(0x8b4513, 1);
          npcGraphics.fillRect(offsetX + 4, offsetY + 3, 1, 2);
          npcGraphics.fillRect(offsetX + 11, offsetY + 3, 1, 2);
          npcGraphics.fillStyle(0xff6600, 1);
          npcGraphics.fillRect(offsetX + 4, offsetY + 7, 8, 6);
          npcGraphics.fillRect(offsetX + 2, offsetY + 8, 2, 4);
          npcGraphics.fillRect(offsetX + 12, offsetY + 8, 2, 4);
          npcGraphics.fillStyle(0x654321, 1);
          npcGraphics.fillRect(offsetX + 5 - walkOffset, offsetY + 15, 2, 1);
          npcGraphics.fillRect(offsetX + 9 + walkOffset, offsetY + 15, 2, 1);
        } else if (dir === 2) { // Left
          npcGraphics.fillStyle(0x0000ff, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 1, 6, 2);
          npcGraphics.fillStyle(0xffdbac, 1);
          npcGraphics.fillRect(offsetX + 6, offsetY + 3, 5, 5);
          npcGraphics.fillStyle(0x000000, 1);
          npcGraphics.fillRect(offsetX + 8, offsetY + 5, 1, 1);
          npcGraphics.fillStyle(0xff6600, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 8, 6, 6);
          npcGraphics.fillRect(offsetX + 3 - walkOffset, offsetY + 9, 2, 4);
          npcGraphics.fillStyle(0x654321, 1);
          npcGraphics.fillRect(offsetX + 6, offsetY + 14, 2, 2);
          npcGraphics.fillRect(offsetX + 8, offsetY + 14, 2, 2);
        } else if (dir === 3) { // Right
          npcGraphics.fillStyle(0x0000ff, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 1, 6, 2);
          npcGraphics.fillStyle(0xffdbac, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 3, 5, 5);
          npcGraphics.fillStyle(0x000000, 1);
          npcGraphics.fillRect(offsetX + 7, offsetY + 5, 1, 1);
          npcGraphics.fillStyle(0xff6600, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 8, 6, 6);
          npcGraphics.fillRect(offsetX + 11 + walkOffset, offsetY + 9, 2, 4);
          npcGraphics.fillStyle(0x654321, 1);
          npcGraphics.fillRect(offsetX + 6, offsetY + 14, 2, 2);
          npcGraphics.fillRect(offsetX + 8, offsetY + 14, 2, 2);
        }
      }
    }
    npcGraphics.generateTexture('npc', 64, 64);
    npcGraphics.destroy();
    
    const npcTexture = this.textures.get('npc');
    npcTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const sourceIndex = 0;
    for (let i = 0; i < 16; i++) {
      const frameX = (i % 4) * 16;
      const frameY = Math.floor(i / 4) * 16;
      npcTexture.add(i, sourceIndex, frameX, frameY, 16, 16);
    }
    
    // Create NPC variant 2 (green shirt)
    this.createNPCVariant('npc2', 0x00ff00);
    
    // Create NPC variant 3 (purple shirt)
    this.createNPCVariant('npc3', 0x9932cc);
    
    // Create NPC variant 4 (yellow shirt)
    this.createNPCVariant('npc4', 0xffff00);
  }

  private createNPCVariant(variantName: string, shirtColor: number): void {
    const npcGraphics = this.make.graphics({ x: 0, y: 0 });
    
    for (let dir = 0; dir < 4; dir++) {
      for (let frame = 0; frame < 4; frame++) {
        const offsetX = frame * 16;
        const offsetY = dir * 16;
        const walkOffset = frame % 2 === 0 ? 0 : 1;
        
        if (dir === 0) { // Down
          npcGraphics.fillStyle(0x0000ff, 1);
          npcGraphics.fillRect(offsetX + 4, offsetY + 1, 8, 3);
          npcGraphics.fillRect(offsetX + 5, offsetY, 6, 1);
          npcGraphics.fillStyle(0xffdbac, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 4, 6, 5);
          npcGraphics.fillStyle(0x000000, 1);
          npcGraphics.fillRect(offsetX + 6, offsetY + 5, 1, 1);
          npcGraphics.fillRect(offsetX + 9, offsetY + 5, 1, 1);
          npcGraphics.fillStyle(shirtColor, 1);
          npcGraphics.fillRect(offsetX + 4, offsetY + 9, 8, 6);
          npcGraphics.fillRect(offsetX + 2, offsetY + 10, 2, 4);
          npcGraphics.fillRect(offsetX + 12, offsetY + 10, 2, 4);
          npcGraphics.fillStyle(0x654321, 1);
          npcGraphics.fillRect(offsetX + 5 + walkOffset, offsetY + 15, 2, 1);
          npcGraphics.fillRect(offsetX + 9 - walkOffset, offsetY + 15, 2, 1);
        } else if (dir === 1) { // Up
          npcGraphics.fillStyle(0x0000ff, 1);
          npcGraphics.fillRect(offsetX + 4, offsetY + 1, 8, 2);
          npcGraphics.fillStyle(0xffdbac, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 3, 6, 4);
          npcGraphics.fillStyle(0x8b4513, 1);
          npcGraphics.fillRect(offsetX + 4, offsetY + 3, 1, 2);
          npcGraphics.fillRect(offsetX + 11, offsetY + 3, 1, 2);
          npcGraphics.fillStyle(shirtColor, 1);
          npcGraphics.fillRect(offsetX + 4, offsetY + 7, 8, 6);
          npcGraphics.fillRect(offsetX + 2, offsetY + 8, 2, 4);
          npcGraphics.fillRect(offsetX + 12, offsetY + 8, 2, 4);
          npcGraphics.fillStyle(0x654321, 1);
          npcGraphics.fillRect(offsetX + 5 - walkOffset, offsetY + 15, 2, 1);
          npcGraphics.fillRect(offsetX + 9 + walkOffset, offsetY + 15, 2, 1);
        } else if (dir === 2) { // Left
          npcGraphics.fillStyle(0x0000ff, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 1, 6, 2);
          npcGraphics.fillStyle(0xffdbac, 1);
          npcGraphics.fillRect(offsetX + 6, offsetY + 3, 5, 5);
          npcGraphics.fillStyle(0x000000, 1);
          npcGraphics.fillRect(offsetX + 8, offsetY + 5, 1, 1);
          npcGraphics.fillStyle(shirtColor, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 8, 6, 6);
          npcGraphics.fillRect(offsetX + 3 - walkOffset, offsetY + 9, 2, 4);
          npcGraphics.fillStyle(0x654321, 1);
          npcGraphics.fillRect(offsetX + 6, offsetY + 14, 2, 2);
          npcGraphics.fillRect(offsetX + 8, offsetY + 14, 2, 2);
        } else if (dir === 3) { // Right
          npcGraphics.fillStyle(0x0000ff, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 1, 6, 2);
          npcGraphics.fillStyle(0xffdbac, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 3, 5, 5);
          npcGraphics.fillStyle(0x000000, 1);
          npcGraphics.fillRect(offsetX + 7, offsetY + 5, 1, 1);
          npcGraphics.fillStyle(shirtColor, 1);
          npcGraphics.fillRect(offsetX + 5, offsetY + 8, 6, 6);
          npcGraphics.fillRect(offsetX + 11 + walkOffset, offsetY + 9, 2, 4);
          npcGraphics.fillStyle(0x654321, 1);
          npcGraphics.fillRect(offsetX + 6, offsetY + 14, 2, 2);
          npcGraphics.fillRect(offsetX + 8, offsetY + 14, 2, 2);
        }
      }
    }
    npcGraphics.generateTexture(variantName, 64, 64);
    npcGraphics.destroy();
    
    const npcTexture = this.textures.get(variantName);
    npcTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const sourceIndex = 0;
    for (let i = 0; i < 16; i++) {
      const frameX = (i % 4) * 16;
      const frameY = Math.floor(i / 4) * 16;
      npcTexture.add(i, sourceIndex, frameX, frameY, 16, 16);
    }
  }

  private createTreeSprite(): void {
    const treeGraphics = this.make.graphics({ x: 0, y: 0 });
    
    // Tree trunk
    treeGraphics.fillStyle(0x8b4513, 1); // Brown
    treeGraphics.fillRect(6, 10, 4, 6);
    
    // Tree leaves (green circle)
    treeGraphics.fillStyle(0x228b22, 1); // Forest green
    treeGraphics.fillCircle(8, 8, 6);
    
    // Some variation in leaves
    treeGraphics.fillStyle(0x32cd32, 1); // Lime green
    treeGraphics.fillCircle(6, 6, 2);
    treeGraphics.fillCircle(10, 6, 2);
    treeGraphics.fillCircle(8, 4, 2);
    
    treeGraphics.generateTexture('tree', 16, 16);
    treeGraphics.destroy();
  }

  private createBushSprite(): void {
    const bushGraphics = this.make.graphics({ x: 0, y: 0 });
    
    // Bush (green rounded shape)
    bushGraphics.fillStyle(0x228b22, 1); // Dark green
    bushGraphics.fillCircle(8, 8, 7);
    
    // Highlights
    bushGraphics.fillStyle(0x32cd32, 1); // Light green
    bushGraphics.fillCircle(6, 6, 3);
    bushGraphics.fillCircle(10, 6, 3);
    bushGraphics.fillCircle(8, 10, 3);
    
    bushGraphics.generateTexture('bush', 16, 16);
    bushGraphics.destroy();
    
    // Rock sprite
    const rockGraphics = this.make.graphics({ x: 0, y: 0 });
    rockGraphics.fillStyle(0x696969, 1); // Dim gray
    rockGraphics.fillRect(2, 2, 12, 12);
    rockGraphics.fillStyle(0x808080, 1); // Gray highlights
    rockGraphics.fillRect(4, 4, 8, 8);
    rockGraphics.fillStyle(0x555555, 1); // Dark gray shadows
    rockGraphics.fillRect(6, 6, 4, 4);
    rockGraphics.generateTexture('rock', 16, 16);
    rockGraphics.destroy();
  }

  private createHouseSprites(): void {
    // Small house
    const smallHouseGraphics = this.make.graphics({ x: 0, y: 0 });
    smallHouseGraphics.fillStyle(0x8b4513, 1); // Brown walls
    smallHouseGraphics.fillRect(0, 8, 16, 8);
    smallHouseGraphics.fillStyle(0x8b0000, 1); // Dark red roof
    smallHouseGraphics.fillTriangle(0, 8, 8, 2, 16, 8);
    smallHouseGraphics.fillStyle(0x000000, 1); // Door
    smallHouseGraphics.fillRect(6, 12, 4, 4);
    smallHouseGraphics.fillStyle(0xffff00, 1); // Window
    smallHouseGraphics.fillRect(2, 10, 3, 3);
    smallHouseGraphics.fillRect(11, 10, 3, 3);
    smallHouseGraphics.generateTexture('house-small', 16, 16);
    smallHouseGraphics.destroy();
    
    // Medium house
    const mediumHouseGraphics = this.make.graphics({ x: 0, y: 0 });
    mediumHouseGraphics.fillStyle(0xdeb887, 1); // Tan walls
    mediumHouseGraphics.fillRect(0, 6, 32, 10);
    mediumHouseGraphics.fillStyle(0x8b0000, 1); // Dark red roof
    mediumHouseGraphics.fillTriangle(0, 6, 16, 0, 32, 6);
    mediumHouseGraphics.fillStyle(0x000000, 1); // Door
    mediumHouseGraphics.fillRect(12, 12, 8, 4);
    mediumHouseGraphics.fillStyle(0x87ceeb, 1); // Blue windows
    mediumHouseGraphics.fillRect(4, 9, 4, 4);
    mediumHouseGraphics.fillRect(24, 9, 4, 4);
    mediumHouseGraphics.generateTexture('house-medium', 32, 16);
    mediumHouseGraphics.destroy();
    
    // Large house
    const largeHouseGraphics = this.make.graphics({ x: 0, y: 0 });
    largeHouseGraphics.fillStyle(0xf5deb3, 1); // Wheat walls
    largeHouseGraphics.fillRect(0, 8, 48, 16);
    largeHouseGraphics.fillStyle(0x8b0000, 1); // Dark red roof
    largeHouseGraphics.fillTriangle(0, 8, 24, 0, 48, 8);
    largeHouseGraphics.fillStyle(0x000000, 1); // Door
    largeHouseGraphics.fillRect(20, 18, 8, 6);
    largeHouseGraphics.fillStyle(0x87ceeb, 1); // Blue windows
    largeHouseGraphics.fillRect(6, 12, 6, 6);
    largeHouseGraphics.fillRect(36, 12, 6, 6);
    largeHouseGraphics.fillRect(21, 10, 6, 4);
    largeHouseGraphics.generateTexture('house-large', 48, 24);
    largeHouseGraphics.destroy();
    
    // Trading outpost sprite
    const outpostGraphics = this.make.graphics({ x: 0, y: 0 });
    // Base structure
    outpostGraphics.fillStyle(0x8b4513, 1); // Brown base
    outpostGraphics.fillRect(0, 8, 32, 8);
    // Roof
    outpostGraphics.fillStyle(0xffaa00, 1); // Orange roof
    outpostGraphics.fillTriangle(0, 8, 16, 0, 32, 8);
    // Trading sign
    outpostGraphics.fillStyle(0xffffff, 1);
    outpostGraphics.fillRect(10, 2, 12, 6);
    outpostGraphics.fillStyle(0xff0000, 1);
    outpostGraphics.fillRect(12, 3, 8, 4);
    // Door
    outpostGraphics.fillStyle(0x000000, 1);
    outpostGraphics.fillRect(12, 12, 8, 4);
    // Windows
    outpostGraphics.fillStyle(0x87ceeb, 1);
    outpostGraphics.fillRect(4, 10, 4, 4);
    outpostGraphics.fillRect(24, 10, 4, 4);
    outpostGraphics.generateTexture('trading-outpost', 32, 16);
    outpostGraphics.destroy();
  }

  private createBuildingSprites(): void {
    // Shop sprite (2x2 tiles)
    const shopGraphics = this.make.graphics({ x: 0, y: 0 });
    shopGraphics.fillStyle(0xd3d3d3, 1); // Light gray walls
    shopGraphics.fillRect(0, 4, 32, 12);
    shopGraphics.fillStyle(0xff6347, 1); // Tomato red roof
    shopGraphics.fillTriangle(0, 4, 16, 0, 32, 4);
    // Shop sign
    shopGraphics.fillStyle(0xffff00, 1); // Yellow sign
    shopGraphics.fillRect(8, 2, 16, 4);
    shopGraphics.fillStyle(0x000000, 1); // Text
    shopGraphics.fillRect(10, 3, 12, 2);
    // Door
    shopGraphics.fillStyle(0x8b4513, 1); // Brown door
    shopGraphics.fillRect(12, 12, 8, 4);
    // Windows
    shopGraphics.fillStyle(0x87ceeb, 1); // Sky blue windows
    shopGraphics.fillRect(4, 8, 4, 4);
    shopGraphics.fillRect(24, 8, 4, 4);
    shopGraphics.generateTexture('building-shop', 32, 16);
    shopGraphics.destroy();

    // Office sprite (3x3 tiles)
    const officeGraphics = this.make.graphics({ x: 0, y: 0 });
    officeGraphics.fillStyle(0xc0c0c0, 1); // Silver walls
    officeGraphics.fillRect(0, 8, 48, 16);
    // Flat roof
    officeGraphics.fillStyle(0x696969, 1); // Dim gray roof
    officeGraphics.fillRect(0, 8, 48, 2);
    // Windows grid
    officeGraphics.fillStyle(0x4169e1, 1); // Royal blue windows
    for (let x = 4; x < 44; x += 8) {
      for (let y = 12; y < 20; y += 6) {
        officeGraphics.fillRect(x, y, 4, 4);
      }
    }
    // Door
    officeGraphics.fillStyle(0x000000, 1);
    officeGraphics.fillRect(20, 20, 8, 4);
    officeGraphics.generateTexture('building-office', 48, 24);
    officeGraphics.destroy();

    // Skyscraper sprite (4x5 tiles)
    const skyscraperGraphics = this.make.graphics({ x: 0, y: 0 });
    skyscraperGraphics.fillStyle(0x708090, 1); // Slate gray walls
    skyscraperGraphics.fillRect(0, 0, 64, 80);
    // Windows grid (many windows)
    skyscraperGraphics.fillStyle(0xffff00, 1); // Yellow lit windows
    for (let x = 4; x < 60; x += 8) {
      for (let y = 4; y < 76; y += 8) {
        if (Math.random() > 0.3) { // Some windows lit
          skyscraperGraphics.fillRect(x, y, 4, 4);
        }
      }
    }
    // Dark windows
    skyscraperGraphics.fillStyle(0x2f4f4f, 1); // Dark slate gray
    for (let x = 4; x < 60; x += 8) {
      for (let y = 4; y < 76; y += 8) {
        if (Math.random() > 0.7) { // Some windows dark
          skyscraperGraphics.fillRect(x, y, 4, 4);
        }
      }
    }
    // Top section
    skyscraperGraphics.fillStyle(0x556b2f, 1); // Dark olive green top
    skyscraperGraphics.fillRect(0, 0, 64, 8);
    skyscraperGraphics.generateTexture('building-skyscraper', 64, 80);
    skyscraperGraphics.destroy();

    // Warehouse sprite (5x4 tiles)
    const warehouseGraphics = this.make.graphics({ x: 0, y: 0 });
    warehouseGraphics.fillStyle(0x778899, 1); // Light slate gray
    warehouseGraphics.fillRect(0, 8, 80, 48);
    // Roof
    warehouseGraphics.fillStyle(0x696969, 1); // Dim gray
    warehouseGraphics.fillRect(0, 8, 80, 4);
    // Large door
    warehouseGraphics.fillStyle(0x2f4f4f, 1); // Dark slate gray
    warehouseGraphics.fillRect(30, 40, 20, 16);
    // Small windows
    warehouseGraphics.fillStyle(0x000000, 1);
    warehouseGraphics.fillRect(8, 16, 4, 4);
    warehouseGraphics.fillRect(68, 16, 4, 4);
    warehouseGraphics.fillRect(8, 32, 4, 4);
    warehouseGraphics.fillRect(68, 32, 4, 4);
    warehouseGraphics.generateTexture('building-warehouse', 80, 56);
    warehouseGraphics.destroy();

    // Apartment sprite (3x4 tiles)
    const apartmentGraphics = this.make.graphics({ x: 0, y: 0 });
    apartmentGraphics.fillStyle(0xdeb887, 1); // Burlywood walls
    apartmentGraphics.fillRect(0, 0, 48, 64);
    // Balconies
    apartmentGraphics.fillStyle(0x8b4513, 1); // Brown balconies
    for (let y = 16; y < 64; y += 16) {
      apartmentGraphics.fillRect(0, y, 48, 2);
      apartmentGraphics.fillRect(0, y + 10, 48, 2);
    }
    // Windows per floor
    apartmentGraphics.fillStyle(0x87ceeb, 1); // Sky blue windows
    for (let floor = 0; floor < 3; floor++) {
      apartmentGraphics.fillRect(6, 4 + floor * 16, 8, 8);
      apartmentGraphics.fillRect(22, 4 + floor * 16, 8, 8);
      apartmentGraphics.fillRect(34, 4 + floor * 16, 8, 8);
    }
    // Door
    apartmentGraphics.fillStyle(0x654321, 1); // Dark brown
    apartmentGraphics.fillRect(20, 56, 8, 8);
    apartmentGraphics.generateTexture('building-apartment', 48, 64);
    apartmentGraphics.destroy();
    
    // Bike shop sprite
    const bikeShopGraphics = this.make.graphics({ x: 0, y: 0 });
    // Base structure (larger building)
    bikeShopGraphics.fillStyle(0x8b4513, 1); // Brown base
    bikeShopGraphics.fillRect(0, 8, 48, 16);
    // Roof
    bikeShopGraphics.fillStyle(0x8b0000, 1); // Dark red roof
    bikeShopGraphics.fillTriangle(0, 8, 24, 0, 48, 8);
    // Bike shop sign
    bikeShopGraphics.fillStyle(0xffff00, 1); // Yellow sign
    bikeShopGraphics.fillRect(14, 2, 20, 6);
    bikeShopGraphics.fillStyle(0x000000, 1);
    bikeShopGraphics.fillRect(16, 3, 16, 4);
    // Door
    bikeShopGraphics.fillStyle(0x000000, 1);
    bikeShopGraphics.fillRect(20, 18, 8, 6);
    // Windows
    bikeShopGraphics.fillStyle(0x87ceeb, 1);
    bikeShopGraphics.fillRect(6, 12, 6, 6);
    bikeShopGraphics.fillRect(36, 12, 6, 6);
    // Bicycle display in window
    bikeShopGraphics.fillStyle(0x00ff00, 1);
    bikeShopGraphics.fillCircle(9, 15, 2);
    bikeShopGraphics.fillCircle(39, 15, 2);
    bikeShopGraphics.generateTexture('bike-shop', 48, 24);
    bikeShopGraphics.destroy();
    
    // Shop owner sprite (stationary NPC)
    const shopOwnerGraphics = this.make.graphics({ x: 0, y: 0 });
    // Shop owner (similar to NPC but with apron)
    shopOwnerGraphics.fillStyle(0xffffff, 1); // White apron
    shopOwnerGraphics.fillRect(4, 9, 8, 6);
    shopOwnerGraphics.fillStyle(0xffdbac, 1); // Skin tone
    shopOwnerGraphics.fillRect(5, 4, 6, 5);
    shopOwnerGraphics.fillStyle(0x000000, 1); // Eyes
    shopOwnerGraphics.fillRect(6, 5, 1, 1);
    shopOwnerGraphics.fillRect(9, 5, 1, 1);
    shopOwnerGraphics.fillStyle(0x8b4513, 1); // Brown hair
    shopOwnerGraphics.fillRect(4, 3, 1, 2);
    shopOwnerGraphics.fillRect(11, 3, 1, 2);
    shopOwnerGraphics.fillRect(5, 2, 6, 1);
    shopOwnerGraphics.fillStyle(0x0066ff, 1); // Blue shirt
    shopOwnerGraphics.fillRect(4, 7, 8, 2);
    shopOwnerGraphics.fillStyle(0x654321, 1); // Brown pants
    shopOwnerGraphics.fillRect(5, 15, 2, 1);
    shopOwnerGraphics.fillRect(9, 15, 2, 1);
    shopOwnerGraphics.generateTexture('shop-owner', 16, 16);
    shopOwnerGraphics.destroy();
  }

  private createBicycleSprite(): void {
    const bikeGraphics = this.make.graphics({ x: 0, y: 0 });
    
    // Create a pixelated bicycle sprite (16x16)
    // Frame (main body)
    bikeGraphics.fillStyle(0x333333, 1); // Dark gray frame
    bikeGraphics.fillRect(2, 8, 12, 2); // Horizontal frame
    bikeGraphics.fillRect(6, 4, 2, 6); // Vertical frame
    
    // Wheels
    bikeGraphics.fillStyle(0x000000, 1); // Black wheels
    bikeGraphics.fillCircle(4, 12, 3); // Back wheel
    bikeGraphics.fillCircle(12, 12, 3); // Front wheel
    bikeGraphics.fillStyle(0x666666, 1); // Gray wheel rims
    bikeGraphics.fillCircle(4, 12, 2);
    bikeGraphics.fillCircle(12, 12, 2);
    bikeGraphics.fillStyle(0x000000, 1); // Black spokes
    bikeGraphics.fillRect(3, 11, 2, 2);
    bikeGraphics.fillRect(11, 11, 2, 2);
    
    // Handlebars
    bikeGraphics.fillStyle(0x333333, 1);
    bikeGraphics.fillRect(10, 4, 4, 1);
    bikeGraphics.fillRect(13, 3, 1, 2);
    
    // Seat
    bikeGraphics.fillStyle(0x8b4513, 1); // Brown seat
    bikeGraphics.fillRect(6, 2, 3, 2);
    
    // Pedals
    bikeGraphics.fillStyle(0x666666, 1);
    bikeGraphics.fillRect(5, 9, 2, 1);
    bikeGraphics.fillRect(9, 9, 2, 1);
    
    bikeGraphics.generateTexture('bicycle', 16, 16);
    bikeGraphics.destroy();

    const bikeTexture = this.textures.get('bicycle');
    bikeTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Pokemon placeholder sprite (16x16 wild Pokemon silhouette)
    // This is intentionally semi-transparent so the grass rustle effect is the main visual
    const pokemonGraphics = this.make.graphics({ x: 0, y: 0 });
    // Create a simple Pokemon-like shape (barely visible, grass is the main indicator)
    pokemonGraphics.fillStyle(0x88cc44, 0.3); // Very transparent grass-green
    pokemonGraphics.fillCircle(8, 10, 6);
    pokemonGraphics.generateTexture('pokemon-placeholder', 16, 16);
    pokemonGraphics.destroy();

    const pokemonTexture = this.textures.get('pokemon-placeholder');
    pokemonTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Grass rustle sprite sheet (4 frames for animation)
    // 16x16 pixels per frame, arranged horizontally: total 64x16
    const grassRustleGraphics = this.make.graphics({ x: 0, y: 0 });
    for (let frame = 0; frame < 4; frame++) {
      const offsetX = frame * 16;

      // Animation phase determines blade positions and kicked-up particles
      const phase = frame / 4; // 0, 0.25, 0.5, 0.75
      const sway = Math.sin(phase * Math.PI * 2) * 1.5;
      const kickHeight = Math.abs(Math.sin(phase * Math.PI * 2)) * 2;

      // Ground-level grass base (darker)
      grassRustleGraphics.fillStyle(0x558822, 1);
      grassRustleGraphics.fillRect(offsetX + 2, 13, 12, 3);

      // Main rustling grass blades (3 blades for compact effect)
      const bladeColors = [0x55aa22, 0x77cc44, 0x55aa22];
      const bladePositions = [2, 7, 11];

      for (let b = 0; b < 3; b++) {
        const baseX = offsetX + bladePositions[b];
        const bladeSway = sway * (b % 2 === 0 ? 1 : -1) * 0.7;
        const bladeHeight = 6 + (b === 1 ? 2 : 0); // Center blade taller

        grassRustleGraphics.fillStyle(bladeColors[b], 1);
        grassRustleGraphics.fillTriangle(
          baseX + bladeSway, 14,                    // Base left
          baseX + 1.5 + bladeSway, 14 - bladeHeight - kickHeight * 0.5, // Tip
          baseX + 3 + bladeSway, 14                 // Base right
        );
      }

      // Kicked-up grass particles floating upward (frame-dependent positions)
      const particleColor = 0x88dd55;
      grassRustleGraphics.fillStyle(particleColor, 0.9);

      // Particle 1 - left side, rises and falls
      const p1Y = 10 - kickHeight - (frame === 1 ? 2 : frame === 2 ? 3 : frame === 3 ? 1 : 0);
      grassRustleGraphics.fillRect(offsetX + 2 + sway, p1Y, 1, 2);

      // Particle 2 - right side, opposite phase
      const p2Y = 9 - kickHeight * 0.8 - (frame === 0 ? 1 : frame === 1 ? 2 : frame === 2 ? 2 : 0);
      grassRustleGraphics.fillRect(offsetX + 12 - sway, p2Y, 1, 2);

      // Particle 3 - center, highest kick
      const p3Y = 6 - kickHeight * 1.2 - (frame === 2 ? 3 : frame === 3 ? 2 : frame === 0 ? 1 : 2);
      grassRustleGraphics.fillStyle(0x99ee66, 0.8);
      grassRustleGraphics.fillRect(offsetX + 7 + sway * 0.5, p3Y, 1, 1);

      // Small dust/debris particles
      grassRustleGraphics.fillStyle(0xccdd99, 0.6);
      if (frame === 1 || frame === 3) {
        grassRustleGraphics.fillCircle(offsetX + 5 - sway, 7 - kickHeight, 0.5);
        grassRustleGraphics.fillCircle(offsetX + 11 + sway, 8 - kickHeight * 0.5, 0.5);
      }
    }
    grassRustleGraphics.generateTexture('grass-rustle', 64, 16);
    grassRustleGraphics.destroy();

    const grassRustleTexture = this.textures.get('grass-rustle');
    grassRustleTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Create a grass particle texture for additional effects
    const grassParticleGraphics = this.make.graphics({ x: 0, y: 0 });
    grassParticleGraphics.fillStyle(0x77cc44, 1);
    grassParticleGraphics.fillTriangle(0, 4, 1, 0, 2, 4); // Small grass blade shape
    grassParticleGraphics.generateTexture('grass-particle', 4, 6);
    grassParticleGraphics.destroy();
  }

  private createTileSprites(): void {
    // Grass tile
    const grassGraphics = this.make.graphics({ x: 0, y: 0 });
    grassGraphics.fillStyle(0x88cc44, 1);
    grassGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Grass texture pattern
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * TILE_SIZE;
      const y = Math.random() * TILE_SIZE;
      grassGraphics.fillStyle(0x66aa33, 1);
      grassGraphics.fillRect(x, y, 2, 2);
    }
    grassGraphics.generateTexture('grass', TILE_SIZE, TILE_SIZE);
    grassGraphics.destroy();

    // Path tile
    const pathGraphics = this.make.graphics({ x: 0, y: 0 });
    pathGraphics.fillStyle(0xccccaa, 1);
    pathGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    pathGraphics.generateTexture('path', TILE_SIZE, TILE_SIZE);
    pathGraphics.destroy();

    // Garden/dirt tile
    const gardenGraphics = this.make.graphics({ x: 0, y: 0 });
    gardenGraphics.fillStyle(0x996633, 1);
    gardenGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Dirt texture
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * TILE_SIZE;
      const y = Math.random() * TILE_SIZE;
      gardenGraphics.fillStyle(0x774422, 1);
      gardenGraphics.fillRect(x, y, 1, 1);
    }
    gardenGraphics.generateTexture('garden', TILE_SIZE, TILE_SIZE);
    gardenGraphics.destroy();

    // Plant/flower tile
    const plantGraphics = this.make.graphics({ x: 0, y: 0 });
    plantGraphics.fillStyle(0x996633, 1);
    plantGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Stem
    plantGraphics.fillStyle(0x44aa44, 1);
    plantGraphics.fillRect(7, 8, 2, 8);
    // Flower
    plantGraphics.fillStyle(0xff00ff, 1);
    plantGraphics.fillCircle(8, 6, 3);
    plantGraphics.generateTexture('plant', TILE_SIZE, TILE_SIZE);
    plantGraphics.destroy();

    // Solana art tile (decorative texture, not used in tilemap)
    const solanaGraphics = this.make.graphics({ x: 0, y: 0 });
    solanaGraphics.fillStyle(0x9945ff, 1);
    solanaGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Simple Solana gradient pattern
    solanaGraphics.fillStyle(0x14f195, 1);
    solanaGraphics.fillRect(2, 2, 12, 12);
    solanaGraphics.fillStyle(0x9945ff, 1);
    solanaGraphics.fillCircle(8, 8, 5);
    solanaGraphics.generateTexture('solana', TILE_SIZE, TILE_SIZE);
    solanaGraphics.destroy();
  }

  create(): void {
    // Set background color (sky blue)
    this.cameras.main.setBackgroundColor(0x87ceeb);
    
    // Resize camera to fill viewport
    this.scale.on('resize', this.resize, this);
    this.resize();

    // Initialize MP3 background music (Mo Bamba)
    this.mp3Music = new MP3Music(this);
    
    // Wait for audio to be loaded before trying to play
    // Check if audio is already in cache, otherwise wait for load event
    if (this.cache.audio.exists('mo-bamba')) {
      // Audio is already loaded, try to play after a short delay
      this.time.delayedCall(100, () => {
        if (this.mp3Music) {
          this.mp3Music.play();
        }
      });
    } else {
      // Wait for audio to load
      this.load.once('filecomplete-audio-mo-bamba', () => {
        this.time.delayedCall(100, () => {
          if (this.mp3Music) {
            this.mp3Music.play();
          }
        });
      });
    }
    
    // Also try to play on first user interaction (click/touch) to handle autoplay restrictions
    const startMusicOnInteraction = () => {
      if (this.mp3Music && !this.mp3Music.isMusicPlaying()) {
        this.mp3Music.play();
      }
      // Remove listeners after first interaction
      this.input.off('pointerdown', startMusicOnInteraction);
      this.input.off('pointerup', startMusicOnInteraction);
    };
    
    this.input.once('pointerdown', startMusicOnInteraction);
    this.input.once('pointerup', startMusicOnInteraction);
    
    // Keep chiptune music disabled for now (using MP3 instead)
    // this.backgroundMusic = new ChiptuneMusic();
    // this.backgroundMusic.play();

    // Create map
    this.mapManager = new MapManager(this);
    this.mapManager.createMap();

    // Create tilemap visuals (since we're using programmatic sprites)
    this.createTilemapVisuals();

    // Create player at center of map
    const startX = Math.floor(MAP_WIDTH / 2) * TILE_SIZE;
    const startY = Math.floor(MAP_HEIGHT / 2) * TILE_SIZE;
    
    this.player = new Player(this, startX, startY);
    this.player.setDepth(10);

    // Set camera to follow player
    this.cameras.main.startFollow(this.player);
    this.cameras.main.setZoom(1);
    
    // Set camera bounds to map size
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);

    // Initialize trade icon manager
    this.tradeIconManager = new TradeIconManager(this, this.mapManager);
    
    // Test contract connection first
    // Note: Disabled auto-refresh initially - will be enabled after initial load if successful
    // this.time.delayedCall(1000, async () => {
    //   console.log('[GameScene] Testing contract connection...');
    //   await contractService.testContractConnection();
    //   console.log('[GameScene] Loading trade icons...');
    //   if (this.tradeIconManager) {
    //     await this.tradeIconManager.loadTradeIcons();
    //   }
    // });
    
    // Auto-refresh disabled initially to avoid rate limiting
    // Can be re-enabled later if needed, but for now let NPCs handle the initial load
    // if (this.tradeIconManager) {
    //   this.tradeIconManager.startAutoRefresh(60000); // Refresh every 60 seconds (reduced from 30)
    // }

    // Add trees, bushes, and houses to the map first
    this.addTownDecorations();

    // Add bike shop
    this.addBikeShop();

    // Pause physics and game updates while loading
    this.physics.world.pause();
    this.areNPCsLoaded = false;
    
    // Disable input during loading
    this.input.enabled = false;

    // Show loading screen
    this.showLoadingScreen();

    // Initialize NPC manager
    this.npcManager = new NPCManager(this, this.mapManager);

    // Create grass-rustle animation (4 frames)
    // First, add frames to the grass-rustle texture manually
    const grassRustleTexture = this.textures.get('grass-rustle');
    if (grassRustleTexture) {
      // Add 4 frames (16x16 each) to the texture
      for (let i = 0; i < 4; i++) {
        grassRustleTexture.add(i, 0, i * 16, 0, 16, 16);
      }
      // Create the animation with slightly faster framerate for more dynamic movement
      this.anims.create({
        key: 'grass-rustle-anim',
        frames: this.anims.generateFrameNumbers('grass-rustle', { start: 0, end: 3 }),
        frameRate: 10, // Faster for more energetic rustling
        repeat: -1,
      });
      console.log('[GameScene] Grass rustle animation created (16x16 frames)');
    } else {
      console.warn('[GameScene] grass-rustle texture not found');
    }

    // Initialize Pokemon spawn manager (for PokeballGame integration)
    this.pokemonSpawnManager = new PokemonSpawnManager(this);

    // Initialize catch mechanics manager (for Pokemon catching flow)
    this.catchMechanicsManager = new CatchMechanicsManager(this, this.pokemonSpawnManager);

    // Set up Pokemon click handler
    this.setupPokemonClickHandler();
    // Spawn NPCs with listings (async)
    this.time.delayedCall(2000, async () => {
      if (this.npcManager && this.loadingSubtext) {
        // Update loading message
        this.loadingSubtext.setText('Fetching listings from blockchain...');
        
        await this.npcManager.spawnNPCs();
        
        // Update loading message
        if (this.loadingSubtext) {
          const npcCount = this.npcManager.getNPCs().length;
          this.loadingSubtext.setText(`Spawning ${npcCount} NPCs on map...`);
        }
        
        // Small delay to let NPCs render
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Update loading message
        if (this.loadingSubtext) {
          this.loadingSubtext.setText('Setting up NPC interactions...');
        }
        
        this.setupNPCInteractions();
        
        // Update loading message
        if (this.loadingSubtext) {
          this.loadingSubtext.setText('Setting up collisions...');
        }
        
        // Set up collisions with NPCs after they are spawned
        this.setupNPCCollisions();
        
        // Small delay to ensure everything is ready
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Update loading message
        if (this.loadingSubtext) {
          this.loadingSubtext.setText('Ready!');
        }
        
        // Small delay before hiding
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Mark NPCs as loaded and resume physics
        this.areNPCsLoaded = true;
        this.physics.world.resume();
        
        // Re-enable input after loading
        this.input.enabled = true;
        
        // Hide loading screen after all NPCs are loaded and ready
        this.hideLoadingScreen();
      }
    });

    // Set up collision detection
    this.setupCollisions();

    // Set up bike shop interaction
    this.setupBikeShopInteraction();

    // Listen for trade icon clicks
    this.events.on('trade-icon-clicked', (listing: any) => {
      this.events.emit('show-trade-modal', listing);
    });
    
    // Listen for NPC listing clicks
    this.events.on('npc-listing-clicked', (listing: any) => {
      this.events.emit('show-trade-modal', listing);
    });
    
    // Listen for NPC clicks (new event from NPC entity)
    this.events.on('npc-clicked', (npc: any) => {
      if (npc.listing) {
        // Convert OTCListing to TradeListing for modal compatibility
        const tradeListing = {
          id: BigInt(npc.listing.listingId),
          seller: npc.listing.seller as any,
          nftContract: npc.listing.tokenForSale?.contractAddress || '0x0' as any,
          tokenId: npc.listing.tokenForSale?.value || BigInt(0),
          price: npc.listing.tokenToReceive?.value || BigInt(0),
          active: true,
          // Store original OTC listing for detailed view
          otcListing: npc.listing,
        };
        this.events.emit('show-trade-modal', tradeListing);
      }
    });
    
    // Listen for bike rental
    // Note: rentBike() now has built-in protection against infinite recursion
    // so we can safely call it here without checking state
    this.events.on('rent-bike', () => {
      if (this.player) {
        this.player.rentBike();
      }
    });
    
    this.events.on('return-bike', () => {
      if (this.player) {
        this.player.returnBike();
        // Music continues playing (same Mo Bamba track)
      }
    });
  }
  
  getBackgroundMusic(): ChiptuneMusic | undefined {
    return this.backgroundMusic;
  }
  
  getMP3Music(): MP3Music | undefined {
    return this.mp3Music;
  }

  private addBikeShop(): void {
    // Place bike shop near the center of the map
    const shopX = Math.floor(MAP_WIDTH / 2) * TILE_SIZE;
    const shopY = (Math.floor(MAP_HEIGHT / 2) - 5) * TILE_SIZE;
    
    this.bikeShop = new BikeShop(this, shopX, shopY);
    this.houses.push(this.bikeShop as any); // Add to houses for collision
    
    // Place shop owner in front of the shop (at the door)
    // Bike shop is 48px wide, so center is at shopX, door is at center
    const ownerX = shopX; // Center of shop (where door is)
    const ownerY = shopY + TILE_SIZE * 1.5; // Just in front of the shop
    this.bikeShopOwner = new BikeShopOwner(this, ownerX, ownerY);
  }

  /**
   * Set up click handler for Pokemon sprites.
   * When player clicks near a Pokemon, attempts to initiate catch flow.
   */
  private setupPokemonClickHandler(): void {
    // Listen for pointer clicks on the game world
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.pokemonSpawnManager || !this.catchMechanicsManager) return;

      // Convert screen coordinates to world coordinates
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

      // Check if click is near a Pokemon spawn
      const spawn = this.pokemonSpawnManager.getSpawnAt(worldPoint.x, worldPoint.y);

      if (spawn) {
        console.log('[GameScene] Pokemon clicked:', spawn.id.toString());
        this.catchMechanicsManager.onPokemonClicked(spawn.id);
      }
    });

    // Listen for pokemon-clicked events (emitted by Pokemon entities directly)
    this.events.on('pokemon-clicked', (data: { pokemonId: bigint }) => {
      if (this.catchMechanicsManager) {
        console.log('[GameScene] Pokemon entity clicked:', data.pokemonId.toString());
        this.catchMechanicsManager.onPokemonClicked(data.pokemonId);
      }
    });

    console.log('[GameScene] Pokemon click handler set up');
  }

  private setupNPCInteractions(): void {
    if (!this.npcManager) return;
    
    const npcs = this.npcManager.getNPCs();
    console.log('[GameScene] Setting up interactions for', npcs.length, 'NPCs');
    
    // NPCs now handle their own click events via 'npc-clicked' event
    // This method is kept for backwards compatibility but NPCs emit events directly
    npcs.forEach((npc) => {
      if (!npc.listing) {
        console.warn('[GameScene] NPC has no listing, skipping interaction setup');
        return;
      }
      
      console.log('[GameScene] NPC has listing:', npc.listing.listingId);
    });
  }

  private setupNPCCollisions(): void {
    if (!this.player || !this.npcManager) return;

    const npcs = this.npcManager.getNPCs();
    console.log('[GameScene] Setting up collisions with', npcs.length, 'NPCs');
    
    // Set up collisions for each NPC with the player
    npcs.forEach((npc) => {
      // Ensure NPC has physics body
      if (!npc.body) {
        this.physics.add.existing(npc);
      }
      
      const npcBody = npc.body as Phaser.Physics.Arcade.Body | null;
      if (npcBody) {
        // Ensure NPC is immovable (doesn't get pushed by player)
        npcBody.setImmovable(true);
        // Set collision size if not already set
        if (npcBody.width === 0 || npcBody.height === 0) {
          npcBody.setSize(12, 12);
          npcBody.setOffset(2, 4);
        }
      }
      
      // Add collider between player and this NPC
      this.physics.add.collider(this.player, npc);
    });
    
    console.log('[GameScene] ✅ Collisions set up for all NPCs');
  }

  private setupBikeShopInteraction(): void {
    if (!this.bikeShopOwner || !this.player) return;

    const handleClick = () => {
      // Check if player is near the shop owner
      if (this.bikeShopOwner && this.bikeShopOwner.isPlayerInRange()) {
        // Check if player already has a bike
        const isReturning = this.player?.getIsOnBike() || false;
        
        // Show dialog bubble above shop owner
        this.bikeShopOwner!.showDialog(
          () => {
            // Yes - rent or return bike
            if (this.player) {
              if (isReturning) {
                this.player.returnBike();
              } else {
                this.player.rentBike();
              }
            }
          },
          () => {
            // No - close dialog
            this.bikeShopOwner!.hideDialog();
          },
          isReturning
        );
      }
    };

    // Make shop owner clickable
    this.bikeShopOwner.on('pointerdown', handleClick);

    // Also make interaction zone clickable
    const interactionZone = this.bikeShopOwner.getInteractionZone();
    if (interactionZone) {
      interactionZone.on('pointerdown', handleClick);
    }
  }

  private setupCollisions(): void {
    if (!this.player) return;

    // NPC collisions are set up after NPCs are spawned
    // See setupNPCCollisions() which is called after spawnNPCs()

    // Collision with trees - ensure each tree has physics body
    this.trees.forEach(tree => {
      if (!tree.body) {
        this.physics.add.existing(tree);
      }
      const treeBody = tree.body as Phaser.Physics.Arcade.Body | null;
      if (treeBody) {
        treeBody.setSize(12, 12);
        treeBody.setImmovable(true);
        treeBody.setOffset(2, 2);
      }
      if (this.player) {
        this.physics.add.collider(this.player, tree);
      }
    });

    // Collision with houses
    this.houses.forEach(house => {
      if (!house.body) {
        this.physics.add.existing(house);
      }
      const houseBody = house.body as Phaser.Physics.Arcade.Body | null;
      if (houseBody) {
        houseBody.setImmovable(true);
        const houseSize = house.texture.key.includes('small') ? 16 : house.texture.key.includes('medium') ? 32 : 48;
        houseBody.setSize(houseSize, houseSize);
      }
      if (this.player) {
        this.physics.add.collider(this.player, house);
      }
    });

    // Collision with trading outposts
    if (this.tradingOutposts.length > 0 && this.player) {
      this.physics.add.collider(this.player, this.tradingOutposts);
    }

    // Collision with rocks
    if (this.rocks.length > 0 && this.player) {
      this.physics.add.collider(this.player, this.rocks);
    }
  }

  private isOnRoad(tileX: number, tileY: number, width: number = 1, height: number = 1): boolean {
    if (!this.mapManager?.groundLayer) return false;
    
    // Check if any tile in the building area is a road (tile index 1)
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        const x = tileX + dx;
        const y = tileY + dy;
        if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
          const tile = this.mapManager.groundLayer?.getTileAt(x, y);
          if (tile && tile.index === 1) {
            return true; // This tile is a road
          }
        }
      }
    }
    return false;
  }

  private addTownDecorations(): void {
    if (!this.mapManager) return;

    const walkableAreas = this.mapManager.getWalkableArea();
    const usedPositions = new Set<string>();

    // Add trading outposts (replacing the blue squares)
    const outpostPositions = [
      { x: 5, y: 5 },
      { x: MAP_WIDTH - 6, y: 5 },
      { x: 5, y: MAP_HEIGHT - 6 },
      { x: MAP_WIDTH - 6, y: MAP_HEIGHT - 6 },
    ];

    outpostPositions.forEach(({ x, y }) => {
      if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
        const outpost = new TradingOutpost(this, x * TILE_SIZE + TILE_SIZE, y * TILE_SIZE + TILE_SIZE);
        this.tradingOutposts.push(outpost);
        usedPositions.add(`${x},${y}`);
        usedPositions.add(`${x + 1},${y}`);
        usedPositions.add(`${x},${y + 1}`);
        usedPositions.add(`${x + 1},${y + 1}`);
      }
    });

    // Add more houses (distributed across the larger 100x100 map)
    const housePositions = [
      { x: 8, y: 8, type: 'small' as const },
      { x: 15, y: 8, type: 'medium' as const },
      { x: 22, y: 8, type: 'small' as const },
      { x: 8, y: 18, type: 'large' as const },
      { x: 25, y: 15, type: 'medium' as const },
      { x: 35, y: 18, type: 'small' as const },
      { x: 45, y: 10, type: 'medium' as const },
      { x: 55, y: 15, type: 'small' as const },
      { x: 65, y: 12, type: 'large' as const },
      { x: 18, y: 28, type: 'medium' as const },
      { x: 30, y: 30, type: 'small' as const },
      { x: 50, y: 25, type: 'medium' as const },
      { x: 15, y: 40, type: 'small' as const },
      { x: 40, y: 45, type: 'large' as const },
      { x: 60, y: 40, type: 'medium' as const },
      { x: 25, y: 55, type: 'small' as const },
      { x: 50, y: 55, type: 'medium' as const },
      { x: 70, y: 50, type: 'small' as const },
      { x: 20, y: 70, type: 'large' as const },
      { x: 55, y: 72, type: 'medium' as const },
      { x: 75, y: 75, type: 'small' as const },
      { x: 85, y: 20, type: 'medium' as const },
      { x: 90, y: 60, type: 'small' as const },
      { x: 12, y: 85, type: 'large' as const },
      { x: 80, y: 85, type: 'medium' as const },
    ];

    housePositions.forEach(({ x, y, type }) => {
      if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
        const houseWidth = type === 'small' ? 1 : type === 'medium' ? 2 : 3;
        // Check if building would be on a road
        if (!this.isOnRoad(x, y, houseWidth, 2)) {
          const house = new House(this, x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE, type);
          this.houses.push(house);
          // Mark house area as used
          for (let dx = 0; dx < houseWidth; dx++) {
            for (let dy = 0; dy < 2; dy++) {
              usedPositions.add(`${x + dx},${y + dy}`);
            }
          }
        }
      }
    });

    // Add city area with larger buildings (top-right area of map)
    this.addCityArea(usedPositions);

    // Add more buildings throughout the map (shops, offices, etc.)
    this.addBuildings(usedPositions);

    // Add trees around the town (10x more trees for larger map)
    for (let i = 0; i < 600; i++) {
      let attempts = 0;
      let position: { x: number; y: number } | null = null;

      while (attempts < 50 && !position) {
        const randomIndex = Math.floor(Math.random() * walkableAreas.length);
        const candidate = walkableAreas[randomIndex];
        const tileX = Math.floor(candidate.x / TILE_SIZE);
        const tileY = Math.floor(candidate.y / TILE_SIZE);
        const key = `${tileX},${tileY}`;

        // Don't place trees too close to houses or in center paths
        const isNearHouse = housePositions.some(h => 
          Math.abs(h.x - tileX) < 3 && Math.abs(h.y - tileY) < 3
        );
        const isCenterPath = tileX === Math.floor(MAP_WIDTH / 2) || tileY === Math.floor(MAP_HEIGHT / 2);

        if (!usedPositions.has(key) && !isNearHouse && !isCenterPath) {
          position = candidate;
          usedPositions.add(key);
        }
        attempts++;
      }

      if (position) {
        const tree = new Tree(this, position.x, position.y);
        this.trees.push(tree);
        // Add physics body for collision
        this.physics.add.existing(tree);
        const treeBody = tree.body as Phaser.Physics.Arcade.Body;
        treeBody.setSize(12, 12);
        treeBody.setImmovable(true);
        treeBody.setOffset(2, 2);
      }
    }

    // Add bushes (more bushes for larger map)
    for (let i = 0; i < 40; i++) {
      let attempts = 0;
      let position: { x: number; y: number } | null = null;

      while (attempts < 50 && !position) {
        const randomIndex = Math.floor(Math.random() * walkableAreas.length);
        const candidate = walkableAreas[randomIndex];
        const tileX = Math.floor(candidate.x / TILE_SIZE);
        const tileY = Math.floor(candidate.y / TILE_SIZE);
        const key = `${tileX},${tileY}`;

        const isNearHouse = housePositions.some(h => 
          Math.abs(h.x - tileX) < 2 && Math.abs(h.y - tileY) < 2
        );

        if (!usedPositions.has(key) && !isNearHouse) {
          position = candidate;
          usedPositions.add(key);
        }
        attempts++;
      }

      if (position) {
        new Bush(this, position.x, position.y);
      }
    }

    // Add rocks as obstacles
    for (let i = 0; i < 40; i++) {
      let attempts = 0;
      let position: { x: number; y: number } | null = null;

      while (attempts < 50 && !position) {
        const randomIndex = Math.floor(Math.random() * walkableAreas.length);
        const candidate = walkableAreas[randomIndex];
        const tileX = Math.floor(candidate.x / TILE_SIZE);
        const tileY = Math.floor(candidate.y / TILE_SIZE);
        const key = `${tileX},${tileY}`;

        const isNearHouse = housePositions.some(h => 
          Math.abs(h.x - tileX) < 2 && Math.abs(h.y - tileY) < 2
        );
        const isNearOutpost = outpostPositions.some(o => 
          Math.abs(o.x - tileX) < 2 && Math.abs(o.y - tileY) < 2
        );

        if (!usedPositions.has(key) && !isNearHouse && !isNearOutpost) {
          position = candidate;
          usedPositions.add(key);
        }
        attempts++;
      }

      if (position) {
        const rock = this.add.sprite(position.x, position.y, 'rock');
        this.physics.add.existing(rock);
        const rockBody = rock.body as Phaser.Physics.Arcade.Body;
        rockBody.setSize(12, 12);
        rockBody.setImmovable(true);
        rockBody.setOffset(2, 2);
        rock.setDepth(5);
        this.rocks.push(rock);
      }
    }
  }

  private addCityArea(usedPositions: Set<string>): void {
    // City area in top-right quadrant (roughly 60-100 x, 0-40 y)
    const cityStartX = 60;
    const cityEndX = 95;
    const cityStartY = 5;
    const cityEndY = 40;

    const buildingTypes: BuildingType[] = ['shop', 'office', 'apartment', 'skyscraper', 'warehouse'];
    
    // Place larger buildings in city area (3x more buildings)
    for (let i = 0; i < 75; i++) {
      let attempts = 0;
      let position: { x: number; y: number; type: BuildingType } | null = null;

      while (attempts < 100 && !position) {
        const tileX = cityStartX + Math.floor(Math.random() * (cityEndX - cityStartX));
        const tileY = cityStartY + Math.floor(Math.random() * (cityEndY - cityStartY));
        
        // Random building type, but prefer larger buildings in city
        const type = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
        const tempBuilding = new Building(this, 0, 0, type); // Temporary to get dimensions
        const width = tempBuilding.width;
        const height = tempBuilding.height;
        tempBuilding.destroy();

        // Check if position is valid
        if (tileX + width < MAP_WIDTH && tileY + height < MAP_HEIGHT) {
          // Check if on road
          if (!this.isOnRoad(tileX, tileY, width, height)) {
            // Check if area is free
            let isFree = true;
            for (let dx = 0; dx < width; dx++) {
              for (let dy = 0; dy < height; dy++) {
                const key = `${tileX + dx},${tileY + dy}`;
                if (usedPositions.has(key)) {
                  isFree = false;
                  break;
                }
              }
              if (!isFree) break;
            }

            // Also check buffer zone around building
            if (isFree) {
              let hasBuffer = true;
              for (let dx = -1; dx <= width; dx++) {
                for (let dy = -1; dy <= height; dy++) {
                  const checkX = tileX + dx;
                  const checkY = tileY + dy;
                  if (checkX >= 0 && checkX < MAP_WIDTH && checkY >= 0 && checkY < MAP_HEIGHT) {
                    if (this.isOnRoad(checkX, checkY, 1, 1)) {
                      hasBuffer = false;
                      break;
                    }
                  }
                }
                if (!hasBuffer) break;
              }

              if (hasBuffer) {
                position = { x: tileX, y: tileY, type };
                // Mark area as used
                for (let dx = 0; dx < width; dx++) {
                  for (let dy = 0; dy < height; dy++) {
                    usedPositions.add(`${tileX + dx},${tileY + dy}`);
                  }
                }
              }
            }
          }
        }
        attempts++;
      }

      if (position) {
        // Calculate width based on building type
        const buildingWidth = position.type === 'skyscraper' ? 4 : position.type === 'warehouse' ? 5 : 2;
        const building = new Building(
          this,
          position.x * TILE_SIZE + (position.type === 'skyscraper' || position.type === 'warehouse' ? buildingWidth * TILE_SIZE / 2 : TILE_SIZE),
          position.y * TILE_SIZE + TILE_SIZE,
          position.type
        );
        this.buildings.push(building);
        this.houses.push(building as any); // Add to houses for collision
      }
    }
  }

  private addBuildings(usedPositions: Set<string>): void {
    // Add shops and offices throughout the map (3x more buildings for larger map)
    const buildingTypes: BuildingType[] = ['shop', 'office', 'apartment'];
    
    for (let i = 0; i < 90; i++) {
      let attempts = 0;
      let position: { x: number; y: number; type: BuildingType } | null = null;

      while (attempts < 100 && !position) {
        const tileX = Math.floor(Math.random() * MAP_WIDTH);
        const tileY = Math.floor(Math.random() * MAP_HEIGHT);
        
        // Skip city area
        if (tileX >= 60 && tileX < 95 && tileY >= 5 && tileY < 40) {
          attempts++;
          continue;
        }

        const type = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
        const tempBuilding = new Building(this, 0, 0, type);
        const width = tempBuilding.width;
        const height = tempBuilding.height;
        tempBuilding.destroy();

        if (tileX + width < MAP_WIDTH && tileY + height < MAP_HEIGHT) {
          if (!this.isOnRoad(tileX, tileY, width, height)) {
            let isFree = true;
            for (let dx = 0; dx < width; dx++) {
              for (let dy = 0; dy < height; dy++) {
                const key = `${tileX + dx},${tileY + dy}`;
                if (usedPositions.has(key)) {
                  isFree = false;
                  break;
                }
              }
              if (!isFree) break;
            }

            if (isFree) {
              // Check buffer zone
              let hasBuffer = true;
              for (let dx = -1; dx <= width; dx++) {
                for (let dy = -1; dy <= height; dy++) {
                  const checkX = tileX + dx;
                  const checkY = tileY + dy;
                  if (checkX >= 0 && checkX < MAP_WIDTH && checkY >= 0 && checkY < MAP_HEIGHT) {
                    if (this.isOnRoad(checkX, checkY, 1, 1)) {
                      hasBuffer = false;
                      break;
                    }
                  }
                }
                if (!hasBuffer) break;
              }

              if (hasBuffer) {
                position = { x: tileX, y: tileY, type };
                for (let dx = 0; dx < width; dx++) {
                  for (let dy = 0; dy < height; dy++) {
                    usedPositions.add(`${tileX + dx},${tileY + dy}`);
                  }
                }
              }
            }
          }
        }
        attempts++;
      }

      if (position) {
        // Calculate width based on building type
        const buildingWidth = position.type === 'apartment' ? 3 : position.type === 'office' ? 3 : 2;
        const building = new Building(
          this,
          position.x * TILE_SIZE + (position.type === 'apartment' ? buildingWidth * TILE_SIZE / 2 : TILE_SIZE),
          position.y * TILE_SIZE + TILE_SIZE,
          position.type
        );
        this.buildings.push(building);
        this.houses.push(building as any); // Add to houses for collision
      }
    }
  }

  private createTilemapVisuals(): void {
    const mapManager = this.mapManager as any;
    if (!mapManager?.groundLayer) return;

    const layer = mapManager.groundLayer as Phaser.Tilemaps.TilemapLayer;
    
    // Create terrain sprites for new terrain types
    this.createTerrainSprites();
    
    // Replace tile indices with actual sprites
    layer.forEachTile((tile: Phaser.Tilemaps.Tile) => {
      let textureKey = 'grass';
      switch (tile.index) {
        case 0:
          textureKey = 'grass';
          break;
        case 1:
          textureKey = 'path';
          break;
        case 2:
          textureKey = 'garden';
          break;
        case 3:
          textureKey = 'plant';
          break;
        case 4:
          textureKey = 'water';
          break;
        case 5:
          textureKey = 'sand';
          break;
        case 6:
          textureKey = 'rock-tile';
          break;
        case 7:
          textureKey = 'mountain-tile';
          break;
      }
      
      // Create sprite for this tile
      const sprite = this.add.sprite(
        tile.pixelX + TILE_SIZE / 2,
        tile.pixelY + TILE_SIZE / 2,
        textureKey
      );
      sprite.setOrigin(0.5, 0.5);
      sprite.setDepth(0);
    });
  }

  private createTerrainSprites(): void {
    // Water tile
    const waterGraphics = this.make.graphics({ x: 0, y: 0 });
    waterGraphics.fillStyle(0x4169e1, 1);
    waterGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    waterGraphics.fillStyle(0x1e90ff, 1);
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * TILE_SIZE;
      const y = Math.random() * TILE_SIZE;
      waterGraphics.fillRect(x, y, 2, 2);
    }
    waterGraphics.generateTexture('water', TILE_SIZE, TILE_SIZE);
    waterGraphics.destroy();

    // Sand tile
    const sandGraphics = this.make.graphics({ x: 0, y: 0 });
    sandGraphics.fillStyle(0xf4a460, 1);
    sandGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    sandGraphics.fillStyle(0xdaa520, 1);
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * TILE_SIZE;
      const y = Math.random() * TILE_SIZE;
      sandGraphics.fillRect(x, y, 1, 1);
    }
    sandGraphics.generateTexture('sand', TILE_SIZE, TILE_SIZE);
    sandGraphics.destroy();

    // Rock tile (for ground)
    const rockTileGraphics = this.make.graphics({ x: 0, y: 0 });
    rockTileGraphics.fillStyle(0x696969, 1);
    rockTileGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    rockTileGraphics.fillStyle(0x808080, 1);
    rockTileGraphics.fillRect(4, 4, 8, 8);
    rockTileGraphics.fillStyle(0x555555, 1);
    rockTileGraphics.fillRect(2, 2, 4, 4);
    rockTileGraphics.generateTexture('rock-tile', TILE_SIZE, TILE_SIZE);
    rockTileGraphics.destroy();

    // Mountain tile (for ground)
    const mountainTileGraphics = this.make.graphics({ x: 0, y: 0 });
    mountainTileGraphics.fillStyle(0x8b7355, 1);
    mountainTileGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    mountainTileGraphics.fillStyle(0xa9a9a9, 1);
    mountainTileGraphics.fillTriangle(0, TILE_SIZE, 8, 4, TILE_SIZE, TILE_SIZE);
    mountainTileGraphics.fillStyle(0x696969, 1);
    mountainTileGraphics.fillTriangle(8, 4, 12, 8, TILE_SIZE, TILE_SIZE);
    mountainTileGraphics.generateTexture('mountain-tile', TILE_SIZE, TILE_SIZE);
    mountainTileGraphics.destroy();
  }

  resize(): void {
    const width = this.scale.gameSize.width;
    const height = this.scale.gameSize.height;
    
    // Update camera size to fill viewport
    this.cameras.main.setSize(width, height);
    
    // Update camera bounds if map exists
    if (this.mapManager) {
      this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    }
    
    // Update loading screen position if it exists
    if (this.loadingScreen) {
      this.loadingScreen.setPosition(width / 2, height / 2);
      const background = this.loadingScreen.list[0] as Phaser.GameObjects.Rectangle;
      if (background) {
        background.setSize(width, height);
      }
    }
  }

  private showLoadingScreen(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    
    // Create container for loading screen at screen center
    this.loadingScreen = this.add.container(width / 2, height / 2);
    this.loadingScreen.setDepth(10000); // Highest depth to be on top
    this.loadingScreen.setScrollFactor(0); // Fixed to camera viewport
    
    // Create dark background covering entire screen with full opacity
    const background = this.add.rectangle(0, 0, width, height, 0x000000, 1.0);
    background.setScrollFactor(0); // Fixed to camera viewport
    this.loadingScreen.add(background);
    
    // Create spinning character (player sprite)
    // Center it on screen
    const centerX = 0;
    const centerY = -50;
    this.loadingCharacter = this.add.sprite(centerX, centerY, 'player', 0);
    this.loadingCharacter.setScale(4); // Make it larger for loading screen
    this.loadingCharacter.setScrollFactor(0); // Fixed to camera viewport
    this.loadingScreen.add(this.loadingCharacter);
    
    // Create spinning animation
    this.tweens.add({
      targets: this.loadingCharacter,
      rotation: Math.PI * 2,
      duration: 1500,
      repeat: -1,
      ease: 'Linear'
    });
    
    // Create main text "ENTERING THE PIXELVERSE" with pixelated font
    this.loadingText = this.add.text(centerX, centerY + 100, 'ENTERING THE PIXELVERSE', {
      fontSize: '32px',
      fontFamily: 'Courier, monospace',
      color: '#00ff00',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center'
    });
    this.loadingText.setOrigin(0.5, 0.5);
    this.loadingText.setScrollFactor(0); // Fixed to camera viewport
    this.loadingScreen.add(this.loadingText);
    
    // Create loading subtext
    this.loadingSubtext = this.add.text(centerX, centerY + 140, 'Loading NPCs...', {
      fontSize: '16px',
      fontFamily: 'Courier, monospace',
      color: '#ffffff',
      align: 'center'
    });
    this.loadingSubtext.setOrigin(0.5, 0.5);
    this.loadingSubtext.setScrollFactor(0); // Fixed to camera viewport
    this.loadingScreen.add(this.loadingSubtext);
    
    // Create TV glitch effect graphics
    this.glitchGraphics = this.add.graphics();
    this.glitchGraphics.setDepth(10001); // Above loading screen
    this.glitchGraphics.setScrollFactor(0); // Fixed to camera viewport
    
    // Start glitch effect
    this.startGlitchEffect();
  }

  private startGlitchEffect(): void {
    if (!this.glitchGraphics || !this.loadingText || !this.loadingSubtext) return;
    
    const glitchUpdate = () => {
      if (!this.glitchGraphics || !this.loadingScreen) return;
      
      const width = this.cameras.main.width;
      const height = this.cameras.main.height;
      this.glitchGraphics.clear();
      
      // Random horizontal scanlines (TV static effect)
      const numLines = 20 + Math.random() * 10;
      for (let i = 0; i < numLines; i++) {
        const y = Math.random() * height;
        const opacity = 0.1 + Math.random() * 0.2;
        
        // Random color for glitch lines (green, red, blue for TV effect)
        const colors = [0x00ff00, 0xff0000, 0x0000ff, 0xffffff, 0x000000];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        this.glitchGraphics.fillStyle(color, opacity);
        this.glitchGraphics.fillRect(0, y, width, 1 + Math.random() * 3);
      }
      
      // Random vertical glitch lines
      const numVertLines = 5 + Math.random() * 5;
      for (let i = 0; i < numVertLines; i++) {
        const x = Math.random() * width;
        const opacity = 0.05 + Math.random() * 0.15;
        const color = 0x00ff00;
        this.glitchGraphics.fillStyle(color, opacity);
        this.glitchGraphics.fillRect(x, 0, 1 + Math.random() * 2, height);
      }
      
      // Random noise pixels for TV static
      const numPixels = 50 + Math.random() * 50;
      for (let i = 0; i < numPixels; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = 1 + Math.random() * 2;
        const opacity = 0.2 + Math.random() * 0.3;
        const color = Math.random() > 0.5 ? 0x00ff00 : 0x000000;
        this.glitchGraphics.fillStyle(color, opacity);
        this.glitchGraphics.fillRect(x, y, size, size);
      }
      
      // Text glitch effect - random position offset for "ENTERING THE PIXELVERSE"
      if (this.loadingText && Math.random() > 0.7) {
        const offsetX = (Math.random() - 0.5) * 4;
        const offsetY = (Math.random() - 0.5) * 4;
        this.loadingText.setX(0 + offsetX);
        this.loadingText.setY(-50 + 100 + offsetY);
      } else if (this.loadingText) {
        // Return to normal position
        this.loadingText.setX(0);
        this.loadingText.setY(-50 + 100);
      }
      
      // Color shift effect on text
      if (this.loadingText && Math.random() > 0.85) {
        const colorShift = Math.random() > 0.5 ? '#ff0000' : '#0000ff';
        this.loadingText.setTint(Phaser.Display.Color.HexStringToColor(colorShift).color);
      } else if (this.loadingText) {
        this.loadingText.clearTint();
      }
    };
    
    // Update glitch effect every frame
    this.glitchTimer = this.time.addEvent({
      delay: 50, // Update every 50ms for smooth glitch effect
      callback: glitchUpdate,
      loop: true
    });
  }

  private hideLoadingScreen(): void {
    // Fade out loading screen
    if (this.loadingScreen) {
      this.tweens.add({
        targets: this.loadingScreen,
        alpha: 0,
        duration: 500,
        onComplete: () => {
          if (this.loadingScreen) {
            this.loadingScreen.destroy();
            this.loadingScreen = undefined;
          }
        }
      });
    }
    
    // Fade out glitch graphics
    if (this.glitchGraphics) {
      this.tweens.add({
        targets: this.glitchGraphics,
        alpha: 0,
        duration: 500,
        onComplete: () => {
          if (this.glitchGraphics) {
            this.glitchGraphics.destroy();
            this.glitchGraphics = undefined;
          }
        }
      });
    }
    
    // Stop glitch timer
    if (this.glitchTimer) {
      this.glitchTimer.destroy();
      this.glitchTimer = undefined;
    }
    
    // Clean up text and character (they're part of container, but just in case)
    if (this.loadingCharacter) {
      this.loadingCharacter = undefined;
    }
    if (this.loadingText) {
      this.loadingText = undefined;
    }
    if (this.loadingSubtext) {
      this.loadingSubtext = undefined;
    }
  }

  update(): void {
    // Don't update game logic while NPCs are loading
    if (!this.areNPCsLoaded) {
      return;
    }

    if (this.player) {
      this.player.update();

      // Update catch mechanics manager with player position
      if (this.catchMechanicsManager) {
        this.catchMechanicsManager.setPlayerPosition(this.player.x, this.player.y);
      }
    }
    if (this.tradeIconManager) {
      this.tradeIconManager.update();
    }
  }

  destroy(): void {
    // Clean up loading screen
    if (this.glitchTimer) {
      this.glitchTimer.destroy();
    }
    if (this.glitchGraphics) {
      this.glitchGraphics.destroy();
    }
    if (this.loadingScreen) {
      this.loadingScreen.destroy();
    }
    
    if (this.tradeIconManager) {
      this.tradeIconManager.stopAutoRefresh();
      this.tradeIconManager.clearTradeIcons();
    }
    if (this.npcManager) {
      this.npcManager.clearNPCs();
    }
    // Clean up catch mechanics manager
    if (this.catchMechanicsManager) {
      this.catchMechanicsManager.destroy();
      this.catchMechanicsManager = undefined;
    }
    // Clean up background music
    if (this.backgroundMusic) {
      this.backgroundMusic.destroy();
      this.backgroundMusic = undefined;
    }
    if (this.mp3Music) {
      this.mp3Music.destroy();
      this.mp3Music = undefined;
    }
    // Scene cleanup - call parent cleanup if needed
    // Note: Phaser Scenes don't have a destroy() method, so we just clean up manually
  }
}
