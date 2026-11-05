import sharp from 'sharp';

export interface ImageProcessor {
  /** Applies EXIF orientation and downsizes, so stored photos and LLM box coordinates share one frame. */
  normalize(img: Buffer): Promise<Buffer>;
  blur(img: Buffer, sigma: number): Promise<Buffer>;
}

export class SharpImageProcessor implements ImageProcessor {
  async normalize(img: Buffer): Promise<Buffer> {
    return sharp(img).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  }

  async blur(img: Buffer, sigma: number): Promise<Buffer> {
    // Downscale first: cheap, and makes faces unrecoverable while seats stay recognisable.
    const small = await sharp(img).resize({ width: 480, withoutEnlargement: true }).blur(sigma / 3).toBuffer();
    return sharp(small).resize({ width: 1200 }).blur(sigma / 2).jpeg({ quality: 70 }).toBuffer();
  }
}
