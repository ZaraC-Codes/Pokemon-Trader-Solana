import { Scene } from 'phaser';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from '../config/gameConfig';

export class MapManager {
  private scene: Scene;
  public groundLayer?: Phaser.Tilemaps.TilemapLayer;
  private map?: Phaser.Tilemaps.Tilemap;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  createMap(): void {
    // Create a blank tilemap
    this.map = this.scene.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    });

    // Add tileset placeholder (we'll use sprite-based rendering instead)
    // Create a tileset texture with 8 tiles (0=grass, 1=path, 2=garden, 3=plant, 4=water, 5=sand, 6=rock, 7=mountain)
    if (!this.scene.textures.exists('tiles')) {
      const tilesGraphics = this.scene.make.graphics({ x: 0, y: 0 });
      const tilesPerRow = 8;
      const totalWidth = TILE_SIZE * tilesPerRow;
      
      // Tile 0: Grass
      tilesGraphics.fillStyle(0x88cc44, 1);
      tilesGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      
      // Tile 1: Path
      tilesGraphics.fillStyle(0xccccaa, 1);
      tilesGraphics.fillRect(TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
      
      // Tile 2: Garden/Dirt
      tilesGraphics.fillStyle(0x996633, 1);
      tilesGraphics.fillRect(TILE_SIZE * 2, 0, TILE_SIZE, TILE_SIZE);
      
      // Tile 3: Plant
      tilesGraphics.fillStyle(0x996633, 1);
      tilesGraphics.fillRect(TILE_SIZE * 3, 0, TILE_SIZE, TILE_SIZE);
      tilesGraphics.fillStyle(0x44aa44, 1);
      tilesGraphics.fillRect(TILE_SIZE * 3 + 7, 8, 2, 8);
      tilesGraphics.fillStyle(0xff00ff, 1);
      tilesGraphics.fillCircle(TILE_SIZE * 3 + 8, 6, 3);
      
      // Tile 4: Water
      tilesGraphics.fillStyle(0x4169e1, 1); // Royal blue
      tilesGraphics.fillRect(TILE_SIZE * 4, 0, TILE_SIZE, TILE_SIZE);
      tilesGraphics.fillStyle(0x1e90ff, 1); // Dodger blue highlights
      for (let i = 0; i < 4; i++) {
        const x = TILE_SIZE * 4 + Math.random() * TILE_SIZE;
        const y = Math.random() * TILE_SIZE;
        tilesGraphics.fillRect(x, y, 2, 2);
      }
      
      // Tile 5: Sand
      tilesGraphics.fillStyle(0xf4a460, 1); // Sandy brown
      tilesGraphics.fillRect(TILE_SIZE * 5, 0, TILE_SIZE, TILE_SIZE);
      tilesGraphics.fillStyle(0xdaa520, 1); // Goldenrod highlights
      for (let i = 0; i < 6; i++) {
        const x = TILE_SIZE * 5 + Math.random() * TILE_SIZE;
        const y = Math.random() * TILE_SIZE;
        tilesGraphics.fillRect(x, y, 1, 1);
      }
      
      // Tile 6: Rock
      tilesGraphics.fillStyle(0x696969, 1); // Dim gray
      tilesGraphics.fillRect(TILE_SIZE * 6, 0, TILE_SIZE, TILE_SIZE);
      tilesGraphics.fillStyle(0x808080, 1); // Gray highlights
      tilesGraphics.fillRect(TILE_SIZE * 6 + 4, 4, 8, 8);
      tilesGraphics.fillStyle(0x555555, 1); // Dark gray shadows
      tilesGraphics.fillRect(TILE_SIZE * 6 + 2, 2, 4, 4);
      
      // Tile 7: Mountain
      tilesGraphics.fillStyle(0x8b7355, 1); // Brownish gray
      tilesGraphics.fillRect(TILE_SIZE * 7, 0, TILE_SIZE, TILE_SIZE);
      tilesGraphics.fillStyle(0xa9a9a9, 1); // Dark gray
      tilesGraphics.fillTriangle(TILE_SIZE * 7, TILE_SIZE, TILE_SIZE * 7 + 8, 4, TILE_SIZE * 7 + TILE_SIZE, TILE_SIZE);
      tilesGraphics.fillStyle(0x696969, 1);
      tilesGraphics.fillTriangle(TILE_SIZE * 7 + 8, 4, TILE_SIZE * 7 + 12, 8, TILE_SIZE * 7 + TILE_SIZE, TILE_SIZE);
      
      tilesGraphics.generateTexture('tiles', totalWidth, TILE_SIZE);
      tilesGraphics.destroy();
    }
    // Add tileset - Phaser will automatically calculate tile count from image width
    const tiles = this.map.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, 0);

    // Create ground layer
    if (tiles) {
      this.groundLayer = this.map.createBlankLayer('ground', tiles, 0, 0, MAP_WIDTH, MAP_HEIGHT)!;
      if (this.groundLayer) {
        this.groundLayer.setDepth(0);
        // Ensure layer is properly initialized
        this.groundLayer.setVisible(true);
        this.groundLayer.setActive(true);
      }
    }

    // Fill with grass
    this.fillGrass();

    // Add paths
    this.addPaths();

    // Add gorilla garden area
    this.addGorillaGarden();

    // Set camera bounds
    this.scene.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
  }

  private fillGrass(): void {
    if (!this.groundLayer) return;

    // Fill entire map with grass (tile 0)
    this.groundLayer.fill(0, 0, 0, MAP_WIDTH, MAP_HEIGHT);
  }

  private addTerrainVariety(): void {
    if (!this.groundLayer) return;

    // Add water areas (tile 4)
    this.addWaterAreas();
    
    // Add sand areas (tile 5)
    this.addSandAreas();
    
    // Add rocky/mountain areas (tiles 6, 7)
    this.addRockyAreas();
  }

  private addWaterAreas(): void {
    if (!this.groundLayer) return;

    // Add water patches around the map
    const waterPatches = [
      { x: 20, y: 20, width: 8, height: 6 },
      { x: 60, y: 15, width: 6, height: 8 },
      { x: 15, y: 70, width: 10, height: 5 },
      { x: 75, y: 80, width: 8, height: 8 },
      { x: 40, y: 50, width: 5, height: 5 },
    ];

    waterPatches.forEach(patch => {
      this.groundLayer!.fill(4, patch.x, patch.y, patch.width, patch.height);
    });
  }

  private addSandAreas(): void {
    if (!this.groundLayer) return;

    // Add sand/beach areas
    const sandPatches = [
      { x: 25, y: 25, width: 10, height: 8 },
      { x: 70, y: 30, width: 8, height: 10 },
      { x: 30, y: 75, width: 12, height: 6 },
      { x: 80, y: 20, width: 6, height: 8 },
    ];

    sandPatches.forEach(patch => {
      this.groundLayer!.fill(5, patch.x, patch.y, patch.width, patch.height);
    });
  }

  private addRockyAreas(): void {
    if (!this.groundLayer) return;

    // Add rocky/mountain areas
    const rockyPatches = [
      { x: 10, y: 10, width: 6, height: 6, type: 6 }, // Rock
      { x: 85, y: 15, width: 8, height: 8, type: 7 }, // Mountain
      { x: 20, y: 85, width: 7, height: 7, type: 6 }, // Rock
      { x: 90, y: 90, width: 6, height: 6, type: 7 }, // Mountain
      { x: 50, y: 10, width: 5, height: 5, type: 6 }, // Rock
      { x: 10, y: 50, width: 6, height: 6, type: 7 }, // Mountain
    ];

    rockyPatches.forEach(patch => {
      this.groundLayer!.fill(patch.type, patch.x, patch.y, patch.width, patch.height);
    });
  }

  private addPaths(): void {
    if (!this.groundLayer) return;

    // Create a small town street layout
    const centerX = Math.floor(MAP_WIDTH / 2);
    const centerY = Math.floor(MAP_HEIGHT / 2);

    // Main horizontal street (wider)
    this.groundLayer.fill(1, 0, centerY - 1, MAP_WIDTH, 3); // 3-tile wide main street
    
    // Main vertical street (wider)
    this.groundLayer.fill(1, centerX - 1, 0, 3, MAP_HEIGHT); // 3-tile wide main street
    
    // Secondary horizontal streets
    this.groundLayer.fill(1, 0, Math.floor(MAP_HEIGHT / 4), MAP_WIDTH, 1);
    this.groundLayer.fill(1, 0, Math.floor(MAP_HEIGHT * 3 / 4), MAP_WIDTH, 1);
    
    // Secondary vertical streets
    this.groundLayer.fill(1, Math.floor(MAP_WIDTH / 4), 0, 1, MAP_HEIGHT);
    this.groundLayer.fill(1, Math.floor(MAP_WIDTH * 3 / 4), 0, 1, MAP_HEIGHT);
    
    // Cross streets connecting neighborhoods
    for (let i = 8; i < MAP_WIDTH - 8; i += 12) {
      this.groundLayer.fill(1, i, 0, 1, MAP_HEIGHT);
    }
    for (let i = 8; i < MAP_HEIGHT - 8; i += 12) {
      this.groundLayer.fill(1, 0, i, MAP_WIDTH, 1);
    }
  }

  private addGorillaGarden(): void {
    if (!this.groundLayer) return;

    // Create gorilla-shaped garden area based on mask PNG
    // The gorilla silhouette is roughly centered and takes up about 15x15 tiles
    const centerX = Math.floor(MAP_WIDTH / 2);
    const centerY = Math.floor(MAP_HEIGHT / 2);

    // Simplified gorilla shape approximation
    // This would ideally be generated from the PNG mask
    const gorillaPattern = [
      // Head area
      [centerX, centerY - 7, 1],
      [centerX - 1, centerY - 6, 1], [centerX, centerY - 6, 1], [centerX + 1, centerY - 6, 1],
      [centerX - 2, centerY - 5, 1], [centerX - 1, centerY - 5, 1], [centerX, centerY - 5, 1], [centerX + 1, centerY - 5, 1], [centerX + 2, centerY - 5, 1],
      // Body area
      [centerX - 2, centerY - 4, 1], [centerX - 1, centerY - 4, 1], [centerX, centerY - 4, 1], [centerX + 1, centerY - 4, 1], [centerX + 2, centerY - 4, 1],
      [centerX - 3, centerY - 3, 1], [centerX - 2, centerY - 3, 1], [centerX - 1, centerY - 3, 1], [centerX, centerY - 3, 1], [centerX + 1, centerY - 3, 1], [centerX + 2, centerY - 3, 1], [centerX + 3, centerY - 3, 1],
      [centerX - 3, centerY - 2, 1], [centerX - 2, centerY - 2, 1], [centerX - 1, centerY - 2, 1], [centerX, centerY - 2, 1], [centerX + 1, centerY - 2, 1], [centerX + 2, centerY - 2, 1], [centerX + 3, centerY - 2, 1],
      // Lower body
      [centerX - 3, centerY - 1, 1], [centerX - 2, centerY - 1, 1], [centerX - 1, centerY - 1, 1], [centerX, centerY - 1, 1], [centerX + 1, centerY - 1, 1], [centerX + 2, centerY - 1, 1], [centerX + 3, centerY - 1, 1],
      [centerX - 3, centerY, 1], [centerX - 2, centerY, 1], [centerX - 1, centerY, 1], [centerX, centerY, 1], [centerX + 1, centerY, 1], [centerX + 2, centerY, 1], [centerX + 3, centerY, 1],
      [centerX - 3, centerY + 1, 1], [centerX - 2, centerY + 1, 1], [centerX - 1, centerY + 1, 1], [centerX, centerY + 1, 1], [centerX + 1, centerY + 1, 1], [centerX + 2, centerY + 1, 1], [centerX + 3, centerY + 1, 1],
      [centerX - 3, centerY + 2, 1], [centerX - 2, centerY + 2, 1], [centerX - 1, centerY + 2, 1], [centerX, centerY + 2, 1], [centerX + 1, centerY + 2, 1], [centerX + 2, centerY + 2, 1], [centerX + 3, centerY + 2, 1],
      // Legs
      [centerX - 2, centerY + 3, 1], [centerX - 1, centerY + 3, 1], [centerX + 1, centerY + 3, 1], [centerX + 2, centerY + 3, 1],
      [centerX - 2, centerY + 4, 1], [centerX - 1, centerY + 4, 1], [centerX + 1, centerY + 4, 1], [centerX + 2, centerY + 4, 1],
    ];

    // Place garden tiles (tile index 2 for garden/dirt)
    gorillaPattern.forEach(([x, y]) => {
      if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
        this.groundLayer!.putTileAt(2, x, y);
      }
    });

    // Add decorative plants/flowers in garden area (tile index 3)
    const plantPositions = [
      [centerX - 1, centerY - 3],
      [centerX + 1, centerY - 3],
      [centerX - 2, centerY - 1],
      [centerX + 2, centerY - 1],
      [centerX, centerY + 2],
    ];

    plantPositions.forEach(([x, y]) => {
      if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
        this.groundLayer!.putTileAt(3, x, y);
      }
    });
  }


  getWalkableArea(): { x: number; y: number }[] {
    // Return array of walkable tile positions (for random trade icon placement)
    // Since the layer may not be fully initialized when this is called,
    // we'll generate positions based on map dimensions
    // This is safe because we know the map structure
    const walkable: { x: number; y: number }[] = [];
    
    // Generate walkable positions based on map dimensions
    // Skip edges (5 tiles from each side) to avoid spawning on map boundaries
    for (let x = 5; x < MAP_WIDTH - 5; x++) {
      for (let y = 5; y < MAP_HEIGHT - 5; y++) {
        walkable.push({ x: x * TILE_SIZE, y: y * TILE_SIZE });
      }
    }
    
    return walkable;
  }
}
