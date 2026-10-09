import type { EncodedTile, EncodeTiles } from "./web-screenshot.js";

/**
 * Downscales a PNG screenshot to `maxWidth` (never enlarged) and cuts it into JPEG tiles of at most
 * `tileHeight` px, top to bottom. One decode, one resize, one encode per tile.
 * @complexity O(pixels).
 */
export const encodeScreenshotTiles: EncodeTiles = async ({ png, maxWidth, tileHeight }, { quality = 70 } = {}) => {
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(png).resize({ width: maxWidth, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };
  const tiles: EncodedTile[] = [];
  for (let top = 0; top < info.height; top += tileHeight) {
    const height = Math.min(tileHeight, info.height - top);
    const bytes = await sharp(data, raw).extract({ left: 0, top, width: info.width, height }).jpeg({ quality }).toBuffer();
    tiles.push({ top, width: info.width, height, bytes });
  }
  return tiles;
};
