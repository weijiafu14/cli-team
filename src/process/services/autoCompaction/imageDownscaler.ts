import { existsSync } from 'node:fs';
import { extname, join, dirname, basename } from 'node:path';
import { DEFAULT_MAX_IMAGE_DIMENSION } from './types';

/**
 * Check if an image exceeds the maximum dimension and downscale it if needed.
 *
 * This prevents Claude's "many-image dimension limit (2000px)" error
 * by ensuring all images sent to the API are within safe bounds.
 *
 * @param imagePath - Absolute path to the image file
 * @param maxDimension - Maximum allowed width or height in pixels (default: 1920)
 * @returns The path to use — original if within limits, or a downscaled copy
 */
export async function downscaleImageIfNeeded(
  imagePath: string,
  maxDimension: number = DEFAULT_MAX_IMAGE_DIMENSION
): Promise<string> {
  if (!existsSync(imagePath)) {
    return imagePath;
  }

  const ext = extname(imagePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.tiff'].includes(ext)) {
    return imagePath;
  }

  let sharp: typeof import('sharp');
  try {
    sharp = (await import('sharp')).default;
  } catch {
    // sharp not available at runtime — return original path
    console.warn('[imageDownscaler] sharp not available, skipping downscale');
    return imagePath;
  }

  try {
    const metadata = await sharp(imagePath).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width <= maxDimension && height <= maxDimension) {
      return imagePath;
    }

    // Build downscaled output path next to original
    const dir = dirname(imagePath);
    const name = basename(imagePath, ext);
    const outputPath = join(dir, `${name}_downscaled${ext}`);

    await sharp(imagePath)
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toFile(outputPath);

    console.log(`[imageDownscaler] Downscaled ${width}x${height} → max ${maxDimension}px: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.warn('[imageDownscaler] Failed to downscale, using original:', err);
    return imagePath;
  }
}
