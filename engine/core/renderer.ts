import { clamp, I, lookAt, mul, ortho, type Vec3 } from './math';
import { glyphs, type VisualProfile } from './profiles';
import type { Geometry } from '../modules/geometry';
import type { Presentation } from './presentation';
export interface DrawOptions {
  gain?: number;
}
export interface MeshHandle {
  a: Float32Array;
  dispose: () => void;
  native?: unknown;
  count: number;
}
export interface CameraSettings {
  height?: number;
  centre?: Vec3;
  eye?: Vec3;
  minWidth?: number;
}
export interface RendererStats {
  backend: string;
  columns: number;
  rows: number;
  triangles: number;
  draws: number;
  meshes: number;
}
export interface AsciiRenderer {
  readonly backend: 'gpu' | 'cpu';
  canvas: HTMLCanvasElement;
  aspect: number;
  grid: [number, number];
  W: number;
  H: number;
  vp: Float32Array;
  profile: VisualProfile;
  exposure: number;
  density: number;
  viewScale: number;
  mesh(g: Geometry): MeshHandle;
  update(m: MeshHandle, g: Geometry): void;
  begin(t: number): void;
  draw(m: MeshHandle, transform?: ArrayLike<number>, options?: DrawOptions): void;
  finish(fade?: number, presentation?: Presentation): void;
  resize(): void;
  dispose(): void;
  stats(): RendererStats;
}
export function camera(
  r: AsciiRenderer,
  { height = 7, centre = [0, 2, 0], eye = [6, 6, 20], minWidth = 5 }: CameraSettings = {},
) {
  const h = Math.max(height, minWidth / r.aspect) * r.viewScale;
  r.vp = mul(
    ortho((-h * r.aspect) / 2, (h * r.aspect) / 2, -h / 2, h / 2, 0.1, 90),
    lookAt(eye, centre),
  );
}
export abstract class RendererBase {
  abstract readonly backend: 'gpu' | 'cpu';
  aspect = 1;
  grid: [number, number] = [1, 1];
  W = 3;
  H = 3;
  vp = I();
  exposure = 1;
  density = 1;
  viewScale = 1;
  triangles = 0;
  draws = 0;
  protected handles = new Set<MeshHandle>();
  constructor(
    public canvas: HTMLCanvasElement,
    public profile: VisualProfile,
  ) {}
  protected dimensions() {
    const w = this.canvas.clientWidth || 1280,
      h = this.canvas.clientHeight || 720,
      dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.aspect = w / h;
    const p = this.profile;
    this.grid = [Math.round(clamp(w / p.cellWidth, p.minColumns, p.maxColumns) * this.density), 0];
    this.grid[1] = Math.max(1, Math.round(((this.grid[0] * h) / w) * p.cellAspect));
    this.W = this.grid[0] * 3;
    this.H = this.grid[1] * 3;
  }
  stats() {
    return {
      backend: this.backend,
      columns: this.grid[0],
      rows: this.grid[1],
      triangles: this.triangles,
      draws: this.draws,
      meshes: this.handles.size,
    };
  }
}
export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 32 * 24;
  canvas.height = 40;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 34px "Courier New",monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'white';
  glyphs.forEach((c, i) => ctx.fillText(c, i * 24 + 12, 20));
  return canvas;
}
export function light(nx: number, ny: number, nz: number) {
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  if (nx * 0.327 + ny * 0.209 + nz * 0.922 < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const d = Math.max(0, -nx * 0.476 + ny * 0.661 + nz * 0.582),
    fill = Math.max(0, nx * 0.638 + ny * 0.279 - nz * 0.718),
    rim = (1 - Math.abs(nx * 0.312 + ny * 0.201 + nz * 0.928)) ** 3;
  return 0.16 + 0.73 * d + 0.17 * fill + 0.08 * rim;
}
