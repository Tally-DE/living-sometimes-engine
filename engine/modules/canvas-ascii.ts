import { clamp, mix } from '../core/math';
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface CanvasPresentation {
  crop?: Crop;
  definition?: number;
  columns?: number;
  time?: number;
  fade?: number;
}
/** Live raster composition -> individually area-filtered glyphs. No photographic output branch. */
export class CanvasAscii {
  readonly canvas = document.createElement('canvas');
  readonly context: CanvasRenderingContext2D;
  private sample = document.createElement('canvas');
  private sampler: CanvasRenderingContext2D;
  private atlas = document.createElement('canvas');
  private raster = document.createElement('canvas');
  private rasterContext: CanvasRenderingContext2D;
  private output?: ImageData;
  private coverage = new Map<string, Uint8Array>();
  readonly characters = ' .,:;!ilItfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
  grid: [number, number] = [0, 0];
  constructor(parent: HTMLElement) {
    this.canvas.className = 'scene-canvas';
    parent.append(this.canvas);
    this.context = this.canvas.getContext('2d', { alpha: false })!;
    this.sampler = this.sample.getContext('2d', { willReadFrequently: true })!;
    this.rasterContext = this.raster.getContext('2d')!;
    this.atlas.width = this.characters.length * 12;
    this.atlas.height = 64 * 2 * 20;
    const c = this.atlas.getContext('2d')!;
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.font = 'bold 18px "Courier New",monospace';
    for (let hue = 0; hue < 2; hue++)
      for (let level = 1; level < 64; level++) {
        const v = Math.round((255 * level) / 63);
        c.fillStyle = hue
          ? `rgb(${v},${Math.round(v * 0.32)},${Math.round(v * 0.23)})`
          : `rgb(${Math.round(v * 0.97)},${Math.round(v * 0.98)},${v})`;
        for (let j = 1; j < this.characters.length; j++)
          c.fillText(this.characters[j], j * 12 + 6, (hue * 64 + level) * 20 + 10);
      }
    this.resize();
  }
  resize() {
    const rect = this.canvas.parentElement!.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }
  begin(background = '#020304') {
    const c = this.context;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = background;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  frame(crop: Crop) {
    const ratio = crop.w / crop.h,
      width = Math.min(this.canvas.width, this.canvas.height * ratio),
      height = width / ratio;
    return {
      x: (this.canvas.width - width) / 2,
      y: (this.canvas.height - height) / 2,
      width,
      height,
    };
  }
  present(
    source: HTMLCanvasElement,
    {
      crop = { x: 0, y: 0, w: source.width, h: source.height },
      definition = 1,
      columns,
      time = 0,
      fade = 1,
    }: CanvasPresentation = {},
  ) {
    if (
      ![crop.x, crop.y, crop.w, crop.h, definition, time, fade].every(Number.isFinite) ||
      crop.w <= 0 ||
      crop.h <= 0
    )
      throw Error('Invalid canvas presentation.');
    const q = clamp(definition),
      frame = this.frame(crop),
      c = this.context;
    const density = this.canvas.width / (this.canvas.clientWidth || 1280),
      maximum = Math.max(40, Math.min(506, Math.floor(frame.width / (2.65 * density))));
    const cols = columns ?? Math.round(mix(crop.w / crop.h < 0.92 ? 27 : 38, maximum, q ** 1.23)),
      rows = Math.max(1, Math.round(cols / (crop.w / crop.h) / 1.64));
    if (!Number.isInteger(cols) || cols < 1 || cols > 2048 || rows > 4096)
      throw Error('Invalid glyph grid.');
    this.grid = [cols, rows];
    if (this.sample.width !== cols || this.sample.height !== rows) {
      this.sample.width = cols;
      this.sample.height = rows;
    }
    this.sampler.clearRect(0, 0, cols, rows);
    this.sampler.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, cols, rows);
    const pixels = this.sampler.getImageData(0, 0, cols, rows).data;
    if (q > 0.35) {
      this.dense(pixels, cols, rows, frame, fade);
      return;
    }
    const cw = frame.width / cols,
      ch = frame.height / rows,
      noise = (1 - q) ** 2,
      freeze = Math.floor(time * mix(5, 30, q));
    for (let y = 0; y < rows; y++) {
      const bend = noise * 2.9 * Math.sin(y * 0.49 + time * 0.73);
      for (let x = 0; x < cols; x++) {
        const at = (y * cols + x) * 4,
          rr = pixels[at],
          gg = pixels[at + 1],
          bb = pixels[at + 2];
        let v = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722) / 255;
        const hash = ((x * 374761 + y * 668265 + freeze * 37) ^ ((y + freeze) * 127)) >>> 0;
        if (q < 0.24) {
          v *= 0.68 + ((hash % 83) / 83) * 0.68;
          if (hash % 37 === 0) v *= 0.1;
        }
        if (v < 0.013) continue;
        const luminance = clamp(v ** 0.69 * 1.35),
          level = Math.round(clamp(0.17 + v ** 0.57 * 1.02) * 63 * clamp(fade));
        let index = Math.max(
          1,
          Math.min(
            this.characters.length - 1,
            Math.floor(luminance * (this.characters.length - 1)),
          ),
        );
        if (hash % 119 === 0 && noise > 0.05) index = 1 + (hash % (this.characters.length - 1));
        const warm = rr > gg * 1.9 && rr > 40 ? 1 : 0,
          xx = frame.x + (x + bend) * cw,
          yy = frame.y + y * ch;
        if (xx < frame.x || xx + cw > frame.x + frame.width) continue;
        c.drawImage(
          this.atlas,
          index * 12,
          (warm * 64 + level) * 20,
          12,
          20,
          xx,
          yy,
          cw + 0.1,
          ch + 0.1,
        );
      }
    }
  }
  private scaledCoverage(w: number, h: number) {
    const key = `${w}:${h}`;
    let result = this.coverage.get(key);
    if (result) return result;
    const canvas = document.createElement('canvas'),
      n = this.characters.length;
    canvas.width = w * n;
    canvas.height = h;
    const c = canvas.getContext('2d', { willReadFrequently: true })!;
    c.imageSmoothingQuality = 'high';
    for (let j = 1; j < n; j++) c.drawImage(this.atlas, j * 12, 63 * 20, 12, 20, j * w, 0, w, h);
    const pixels = c.getImageData(0, 0, canvas.width, h).data;
    result = new Uint8Array(w * h * n);
    for (let j = 0; j < n; j++)
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++)
          result[(j * h + yy) * w + xx] = pixels[(yy * n * w + j * w + xx) * 4 + 3];
    if (this.coverage.size >= 64) this.coverage.delete(this.coverage.keys().next().value!);
    this.coverage.set(key, result);
    canvas.width = 0;
    return result;
  }
  private dense(
    pixels: Uint8ClampedArray,
    cols: number,
    rows: number,
    frame: { x: number; y: number; width: number; height: number },
    fade: number,
  ) {
    const W = Math.max(2, Math.round(frame.width)),
      H = Math.max(2, Math.round(frame.height));
    if (this.raster.width !== W || this.raster.height !== H || !this.output) {
      this.raster.width = W;
      this.raster.height = H;
      this.output = this.rasterContext.createImageData(W, H);
    }
    const out = this.output.data,
      n = this.characters.length;
    out.fill(0);
    const caches = new Map<string, Uint8Array>();
    for (const w of [Math.floor(W / cols), Math.ceil(W / cols)])
      for (const h of [Math.floor(H / rows), Math.ceil(H / rows)])
        if (w && h) caches.set(`${w}:${h}`, this.scaledCoverage(w, h));
    for (let y = 0; y < rows; y++) {
      const y0 = Math.round((y * H) / rows),
        y1 = Math.round(((y + 1) * H) / rows),
        h = y1 - y0;
      if (h < 1) continue;
      for (let x = 0; x < cols; x++) {
        const j = (y * cols + x) * 4,
          rr = pixels[j],
          gg = pixels[j + 1],
          bb = pixels[j + 2],
          v = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
        if (v < 0.018) continue;
        const luminance = clamp(v ** 0.69 * 1.35),
          index = Math.max(1, Math.min(n - 1, Math.floor(luminance * (n - 1)))),
          gain = clamp(0.12 + v ** 0.55 * 1.12) * fade,
          warm = rr > gg * 1.9 && rr > 40;
        const red = gain * (warm ? 1 : 0.97),
          green = gain * (warm ? 0.32 : 0.98),
          blue = gain * (warm ? 0.23 : 1),
          x0 = Math.round((x * W) / cols),
          x1 = Math.round(((x + 1) * W) / cols),
          w = x1 - x0;
        if (w < 1) continue;
        const coverage = caches.get(`${w}:${h}`)!;
        let ci = index * w * h;
        for (let yy = y0; yy < y1; yy++) {
          let oi = (yy * W + x0) * 4;
          for (let xx = x0; xx < x1; xx++, oi += 4) {
            const a = coverage[ci++];
            out[oi] = a * red;
            out[oi + 1] = a * green;
            out[oi + 2] = a * blue;
            out[oi + 3] = 255;
          }
        }
      }
    }
    this.rasterContext.putImageData(this.output, 0, 0);
    this.context.drawImage(this.raster, frame.x, frame.y, frame.width, frame.height);
  }
  dispose() {
    this.canvas.remove();
    for (const canvas of [this.canvas, this.sample, this.atlas, this.raster]) canvas.width = 0;
    this.coverage.clear();
    this.output = undefined;
  }
}
