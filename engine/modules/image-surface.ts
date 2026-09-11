import { Geometry } from './geometry';
import { deform } from './behaviour';
import type { Vec3 } from '../core/math';
/** Static image samples become a deformable geometric surface, rendered live as glyphs. */
export class ImageSurface {
  private pixels: Uint8ClampedArray;
  private width: number;
  private height: number;
  constructor(
    image: HTMLImageElement,
    readonly columns = 64,
    readonly rows = 64,
    crop?: { x: number; y: number; width: number; height: number },
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = columns + 1;
    canvas.height = rows + 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const c = crop ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
    ctx.drawImage(image, c.x, c.y, c.width, c.height, 0, 0, canvas.width, canvas.height);
    this.pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    this.width = canvas.width;
    this.height = canvas.height;
  }
  geometry(time: number, amount = 0.18) {
    const g = new Geometry();
    const p = (i: number, j: number): Vec3 =>
      deform([(i / this.columns - 0.5) * 4, (0.5 - j / this.rows) * 4, 0], time, {
        bend: 0.08,
        ripple: amount,
      });
    for (let j = 0; j < this.rows; j++)
      for (let i = 0; i < this.columns; i++) {
        const at = (j * this.width + i) * 4;
        if (this.pixels[at + 3] < 30) continue;
        const col = [this.pixels[at] / 255, this.pixels[at + 1] / 255, this.pixels[at + 2] / 255];
        g.quad(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1), col, 2);
      }
    return g;
  }
  get samples() {
    return this.width * this.height;
  }
}
