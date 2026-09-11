import { clamp, I, mul } from './math';
import { RendererBase, light, createAtlas, type AsciiRenderer, type MeshHandle } from './renderer';
import type { VisualProfile } from './profiles';
import type { Geometry } from '../modules/geometry';
export class CpuAsciiRenderer extends RendererBase implements AsciiRenderer {
  readonly backend = 'cpu' as const;
  private ctx: CanvasRenderingContext2D;
  private atlas = createAtlas();
  private tint = document.createElement('canvas');
  private colourAtlases = new Map<string, HTMLCanvasElement>();
  private z = new Float32Array();
  private rgb = new Float32Array();
  private cells = new Float32Array();
  constructor(canvas: HTMLCanvasElement, profile: VisualProfile) {
    super(canvas, profile);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw Error('Canvas unavailable.');
    this.ctx = ctx;
    this.resize();
  }
  resize() {
    this.dimensions();
    this.z = new Float32Array(this.W * this.H);
    this.rgb = new Float32Array(this.W * this.H * 3);
    this.cells = new Float32Array(this.grid[0] * this.grid[1] * 3);
    this.tint.width = this.atlas.width;
    this.tint.height = 40 * 32 * 2;
    const ctx = this.tint.getContext('2d')!;
    for (let red = 0; red < 2; red++)
      for (let level = 0; level < 32; level++) {
        ctx.drawImage(this.atlas, 0, (red * 32 + level) * 40);
        ctx.globalCompositeOperation = 'source-atop';
        const v = Math.round((level / 31) * 247);
        ctx.fillStyle = red
          ? `rgb(${v},${Math.round(v * this.profile.accent[1])},${Math.round(v * this.profile.accent[2])})`
          : `rgb(${v},${v},${v})`;
        ctx.fillRect(0, (red * 32 + level) * 40, this.tint.width, 40);
        ctx.globalCompositeOperation = 'source-over';
      }
  }
  mesh(g: Geometry) {
    const m: MeshHandle = {
      a: new Float32Array(g.a),
      count: g.a.length / 10,
      dispose: () => this.handles.delete(m),
    };
    this.handles.add(m);
    return m;
  }
  update(m: MeshHandle, g: Geometry) {
    m.a = new Float32Array(g.a);
    m.count = g.a.length / 10;
  }
  begin(_t: number) {
    this.z.fill(1e10);
    this.rgb.fill(0);
    this.triangles = 0;
    this.draws = 0;
  }
  private raster(v: Float64Array) {
    const [ax, ay, az, ar, ag, ab, bx, by, bz, br, bg, bb, cx, cy, cz, cr, cg, cb] = v,
      den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-7) return;
    const minx = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5)),
      maxx = Math.min(this.W - 1, Math.floor(Math.max(ax, bx, cx) - 0.5)),
      miny = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)),
      maxy = Math.min(this.H - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
    for (let y = miny; y <= maxy; y++)
      for (let x = minx; x <= maxx; x++) {
        const a = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / den,
          b = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / den,
          c = 1 - a - b;
        if (a < -0.00001 || b < -0.00001 || c < -0.00001) continue;
        const i = y * this.W + x,
          z = a * az + b * bz + c * cz;
        if (z < this.z[i]) {
          this.z[i] = z;
          this.rgb[i * 3] = a * ar + b * br + c * cr;
          this.rgb[i * 3 + 1] = a * ag + b * bg + c * cg;
          this.rgb[i * 3 + 2] = a * ab + b * bb + c * cb;
        }
      }
  }
  draw(mesh: MeshHandle, m: ArrayLike<number> = I()) {
    const a = mesh.a,
      pm = mul(this.vp, m),
      ps = new Float64Array(18);
    for (let k = 0; k < a.length; k += 30) {
      for (let j = 0; j < 3; j++) {
        const i = k + j * 10,
          q = j * 6,
          x = a[i],
          y = a[i + 1],
          z = a[i + 2],
          nx = a[i + 3],
          ny = a[i + 4],
          nz = a[i + 5],
          w = pm[3] * x + pm[7] * y + pm[11] * z + pm[15],
          l =
            (a[i + 9] > 1.5
              ? 1
              : light(
                  m[0] * nx + m[4] * ny + m[8] * nz,
                  m[1] * nx + m[5] * ny + m[9] * nz,
                  m[2] * nx + m[6] * ny + m[10] * nz,
                )) * this.exposure;
        ps[q] = (((pm[0] * x + pm[4] * y + pm[8] * z + pm[12]) / w) * 0.5 + 0.5) * this.W;
        ps[q + 1] = (0.5 - ((pm[1] * x + pm[5] * y + pm[9] * z + pm[13]) / w) * 0.5) * this.H;
        ps[q + 2] = (pm[2] * x + pm[6] * y + pm[10] * z + pm[14]) / w;
        const ink = a[i + 6] > a[i + 7] * 1.3 ? this.profile.accent : [1, 1, 1];
        for (let c = 0; c < 3; c++)
          ps[q + 3 + c] = clamp((this.profile.colour ? a[i + 6 + c] : a[i + 6] * ink[c]) * l);
      }
      this.raster(ps);
    }
    this.triangles += a.length / 30;
    this.draws++;
  }
  finish(fade = 1) {
    const ctx = this.ctx,
      [cols, rows] = this.grid,
      lum = (i: number) =>
        this.profile.colour
          ? this.cells[i] * 0.25 + this.cells[i + 1] * 0.62 + this.cells[i + 2] * 0.13
          : this.cells[i];
    ctx.fillStyle = '#020202';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const sum = [0, 0, 0],
          peak = [0, 0, 0];
        let max = 0;
        for (let yy = 0; yy < 3; yy++)
          for (let xx = 0; xx < 3; xx++) {
            const p = ((y * 3 + yy) * this.W + x * 3 + xx) * 3,
              v = this.profile.colour
                ? this.rgb[p] * 0.25 + this.rgb[p + 1] * 0.62 + this.rgb[p + 2] * 0.13
                : this.rgb[p];
            for (let c = 0; c < 3; c++) sum[c] += this.rgb[p + c];
            if (v > max) {
              max = v;
              for (let c = 0; c < 3; c++) peak[c] = this.rgb[p + c];
            }
          }
        for (let c = 0; c < 3; c++)
          this.cells[(y * cols + x) * 3 + c] = (sum[c] / 9) * 0.55 + peak[c] * 0.45;
      }
    const cw = this.canvas.width / cols,
      ch = this.canvas.height / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 3,
          v = lum(i);
        if (v < 0.012) continue;
        const gx =
            lum((y * cols + Math.min(cols - 1, x + 1)) * 3) -
            lum((y * cols + Math.max(0, x - 1)) * 3),
          gy =
            lum((Math.min(rows - 1, y + 1) * cols + x) * 3) -
            lum((Math.max(0, y - 1) * cols + x) * 3),
          edge = Math.hypot(gx, gy);
        let idx = Math.floor(clamp(v ** this.profile.densityPower * 14, 1, 14));
        if (v < 0.16 && edge > this.profile.edgeThreshold)
          idx =
            Math.abs(gx) > Math.abs(gy) * 1.7
              ? 15
              : Math.abs(gy) > Math.abs(gx) * 1.7
                ? 16
                : gx * gy > 0
                  ? 18
                  : 17;
        const strength =
            clamp(0.2 + v ** this.profile.brightnessPower * 0.83 + edge * 0.07) *
            (1 - ((x / cols - 0.5) ** 2 + (y / rows - 0.5) ** 2) * 0.43) *
            fade,
          level = Math.round(strength * 31),
          red = +(this.cells[i] > this.cells[i + 1] * 1.3);
        if (this.profile.colour) {
          const peak = Math.max(this.cells[i], this.cells[i + 1], this.cells[i + 2], 0.0001),
            channels = [0, 1, 2].map((c) => Math.round((this.cells[i + c] / peak) * 15) * 17),
            key = channels.join(',');
          let atlas = this.colourAtlases.get(key);
          if (!atlas) {
            atlas = document.createElement('canvas');
            atlas.width = this.atlas.width;
            atlas.height = this.atlas.height;
            const ink = atlas.getContext('2d')!;
            ink.drawImage(this.atlas, 0, 0);
            ink.globalCompositeOperation = 'source-in';
            ink.fillStyle = `rgb(${key})`;
            ink.fillRect(0, 0, atlas.width, atlas.height);
            if (this.colourAtlases.size >= 64) {
              const oldest = this.colourAtlases.keys().next().value!;
              this.colourAtlases.get(oldest)!.width = 0;
              this.colourAtlases.delete(oldest);
            }
            this.colourAtlases.set(key, atlas);
          }
          ctx.globalAlpha = (strength * 247) / 255;
          ctx.drawImage(atlas, idx * 24, 0, 24, 40, x * cw, y * ch, cw, ch);
          ctx.globalAlpha = 1;
        } else
          ctx.drawImage(
            this.tint,
            idx * 24,
            (red * 32 + level) * 40,
            24,
            40,
            x * cw,
            y * ch,
            cw,
            ch,
          );
      }
  }
  dispose() {
    for (const m of [...this.handles]) m.dispose();
    this.z = new Float32Array();
    this.rgb = new Float32Array();
    this.cells = new Float32Array();
    this.tint.width = 0;
    this.atlas.width = 0;
    for (const atlas of this.colourAtlases.values()) atlas.width = 0;
    this.colourAtlases.clear();
  }
}
