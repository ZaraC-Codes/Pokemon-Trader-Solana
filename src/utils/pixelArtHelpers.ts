/**
 * Utility functions for pixel art rendering and manipulation
 */

/**
 * Converts an image to pixel art by applying nearest-neighbor scaling
 */
export function pixelateCanvas(
  canvas: HTMLCanvasElement,
  pixelSize: number = 1
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const width = canvas.width;
  const height = canvas.height;

  // Create a new canvas with the pixelated size
  const pixelatedCanvas = document.createElement('canvas');
  pixelatedCanvas.width = Math.floor(width / pixelSize);
  pixelatedCanvas.height = Math.floor(height / pixelSize);
  const pixelatedCtx = pixelatedCanvas.getContext('2d');

  if (!pixelatedCtx) return canvas;

  // Draw the original image scaled down using nearest-neighbor
  pixelatedCtx.imageSmoothingEnabled = false;
  pixelatedCtx.drawImage(canvas, 0, 0, pixelatedCanvas.width, pixelatedCanvas.height);

  // Scale it back up
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = height;
  const finalCtx = finalCanvas.getContext('2d');

  if (!finalCtx) return canvas;

  finalCtx.imageSmoothingEnabled = false;
  finalCtx.drawImage(pixelatedCanvas, 0, 0, width, height);

  return finalCanvas;
}

/**
 * Extracts a gorilla shape from the mask PNG to create walkable boundaries
 * This would ideally be done server-side or with image processing
 */
export function extractGorillaBoundary(imageData: ImageData): boolean[][] {
  // This is a placeholder - actual implementation would process the PNG
  // and extract the gorilla silhouette boundary as a 2D boolean array
  const width = imageData.width;
  const height = imageData.height;
  const boundary: boolean[][] = [];

  for (let y = 0; y < height; y++) {
    boundary[y] = [];
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const r = imageData.data[index];
      const g = imageData.data[index + 1];
      const b = imageData.data[index + 2];
      const a = imageData.data[index + 3];

      // Check if pixel is part of the gorilla (white silhouette)
      // Adjust threshold based on actual image
      const isGorilla = r > 200 && g > 200 && b > 200 && a > 128;
      boundary[y][x] = isGorilla;
    }
  }

  return boundary;
}

/**
 * Converts tile coordinates to pixel coordinates
 */
export function tileToPixel(tileX: number, tileY: number, tileSize: number = 16): {
  x: number;
  y: number;
} {
  return {
    x: tileX * tileSize,
    y: tileY * tileSize,
  };
}

/**
 * Converts pixel coordinates to tile coordinates
 */
export function pixelToTile(pixelX: number, pixelY: number, tileSize: number = 16): {
  x: number;
  y: number;
} {
  return {
    x: Math.floor(pixelX / tileSize),
    y: Math.floor(pixelY / tileSize),
  };
}
