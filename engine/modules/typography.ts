import { clamp } from '../core/math';
export class GlyphLayer {
  readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  constructor(parent: HTMLElement) {
    this.canvas.className = 'glyph-layer';
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.append(this.canvas);
    this.context = this.canvas.getContext('2d')!;
    this.resize();
  }
  resize() {
    const rect = this.canvas.parentElement!.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }
  clear() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  word(
    text: string,
    {
      x = 0.5,
      y = 0.5,
      size = 0.12,
      ink = '.:+*#',
      colour = '#cdd3cf',
      opacity = 1,
      time = 0,
    }: {
      x?: number;
      y?: number;
      size?: number;
      ink?: string;
      colour?: string;
      opacity?: number;
      time?: number;
    } = {},
  ) {
    const w = this.canvas.width,
      h = this.canvas.height,
      fontSize = Math.min(w * size, h * 0.65, (w * 0.88) / Math.max(1, text.length * 0.61)),
      mask = document.createElement('canvas');
    mask.width = Math.max(1, Math.round(w * 0.9));
    mask.height = Math.max(1, Math.round(fontSize * 1.4));
    const m = mask.getContext('2d')!;
    m.font = `bold ${fontSize}px "Courier New",monospace`;
    m.textAlign = 'center';
    m.textBaseline = 'middle';
    m.fillStyle = 'white';
    m.fillText(text, mask.width / 2, mask.height / 2);
    const pixels = m.getImageData(0, 0, mask.width, mask.height).data;
    const wordInk = ink.length > 5 || ink === 'HELP',
      step = wordInk ? Math.max(8, fontSize / 11) : Math.max(4, fontSize / 22),
      font = wordInk ? step * 0.38 : step * 0.88,
      ctx = this.context;
    ctx.globalAlpha = clamp(opacity);
    ctx.fillStyle = colour;
    ctx.font = `bold ${font}px "Courier New",monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let yy = 0; yy < mask.height; yy += step)
      for (let xx = 0; xx < mask.width; xx += step) {
        const at = (Math.floor(yy) * mask.width + Math.floor(xx)) * 4 + 3;
        if (pixels[at] > 100) {
          const char = wordInk
            ? ink
            : ink[Math.floor(xx / step + yy / step + time * 0.2) % ink.length];
          ctx.fillText(char, x * w - mask.width / 2 + xx, y * h - mask.height / 2 + yy);
        }
      }
    ctx.globalAlpha = 1;
  }
  dispose() {
    this.canvas.remove();
  }
}
