import { Scene } from 'phaser';

export type BuildingType = 
  | 'house-small' 
  | 'house-medium' 
  | 'house-large'
  | 'shop'
  | 'office'
  | 'skyscraper'
  | 'warehouse'
  | 'apartment';

export class Building extends Phaser.GameObjects.Sprite {
  public buildingType: BuildingType;
  public width: number;
  public height: number;

  constructor(
    scene: Scene, 
    x: number, 
    y: number, 
    buildingType: BuildingType
  ) {
    // Map building types to texture names
    const textureMap: Record<BuildingType, string> = {
      'house-small': 'house-small',
      'house-medium': 'house-medium',
      'house-large': 'house-large',
      'shop': 'building-shop',
      'office': 'building-office',
      'skyscraper': 'building-skyscraper',
      'warehouse': 'building-warehouse',
      'apartment': 'building-apartment',
    };
    
    super(scene, x, y, textureMap[buildingType]);
    
    this.buildingType = buildingType;
    
    // Set building dimensions based on type
    switch (buildingType) {
      case 'house-small':
        this.width = 1;
        this.height = 1;
        break;
      case 'house-medium':
        this.width = 2;
        this.height = 2;
        break;
      case 'house-large':
        this.width = 3;
        this.height = 2;
        break;
      case 'shop':
        this.width = 2;
        this.height = 2;
        break;
      case 'office':
        this.width = 3;
        this.height = 3;
        break;
      case 'skyscraper':
        this.width = 4;
        this.height = 5;
        break;
      case 'warehouse':
        this.width = 5;
        this.height = 4;
        break;
      case 'apartment':
        this.width = 3;
        this.height = 4;
        break;
      default:
        this.width = 2;
        this.height = 2;
    }
    
    scene.add.existing(this);
    this.setDepth(3); // Above ground, below player
    this.setOrigin(0.5, 1); // Anchor at bottom center
  }
}
