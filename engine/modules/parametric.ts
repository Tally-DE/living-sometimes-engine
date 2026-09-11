import { Geometry, type Colour } from './geometry';
import { V, type Vec3 } from '../core/math';
import type { AsciiRenderer, MeshHandle } from '../core/renderer';

export type SurfaceFunction<P> = (u: number, v: number, parameters: P) => Vec3;
export interface SurfaceOptions<P> {
  columns?: number;
  rows?: number;
  u?: [number, number];
  v?: [number, number];
  colour?: Colour | ((u: number, v: number, p: P) => Colour);
  unlit?: boolean;
}
/** Shared sampled topology with smooth grid normals. Shape and motion belong to the author. */
export function parametricGeometry<P>(
  fn: SurfaceFunction<P>,
  parameters: P,
  options: SurfaceOptions<P> = {},
  output = new Geometry(),
) {
  const nx = options.columns ?? 18,
    ny = options.rows ?? 24;
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || ny < 1 || nx * ny > 250000)
    throw Error('Invalid surface resolution.');
  const ur = options.u ?? [0, 1],
    vr = options.v ?? [0, 1],
    points: Vec3[] = [];
  if (![...ur, ...vr].every(Number.isFinite) || !(ur[1] > ur[0] && vr[1] > vr[0]))
    throw Error('Surface bounds must increase and be finite.');
  const vertices = new Float64Array((nx + 1) * (ny + 1) * 10);
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const u = ur[0] + (x / nx) * (ur[1] - ur[0]),
        v = vr[0] + (y / ny) * (vr[1] - vr[0]);
      const p = fn(u, v, parameters);
      if (!p.every(Number.isFinite)) throw Error('Surface produced non-finite coordinates.');
      const colour =
        typeof options.colour === 'function'
          ? options.colour(u, v, parameters)
          : (options.colour ?? 0.7);
      const rgb = typeof colour === 'number' ? [colour, colour, colour] : colour;
      if (rgb.length !== 3 || !rgb.every(Number.isFinite))
        throw Error('Surface colour must contain three finite channels.');
      const i = points.length * 10;
      vertices.set(p, i);
      vertices.set(rgb, i + 6);
      vertices[i + 9] = options.unlit ? 2 : 0;
      points.push(p);
    }
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const left = points[y * (nx + 1) + Math.max(0, x - 1)],
        right = points[y * (nx + 1) + Math.min(nx, x + 1)];
      const back = points[Math.max(0, y - 1) * (nx + 1) + x],
        front = points[Math.min(ny, y + 1) * (nx + 1) + x];
      vertices.set(
        V.norm(V.cross(V.sub(right, left), V.sub(front, back))),
        (y * (nx + 1) + x) * 10 + 3,
      );
    }
  output.clear();
  const vertex = (i: number) => {
    const at = i * 10;
    for (let j = 0; j < 10; j++) output.a.push(vertices[at + j]);
  };
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const a = y * (nx + 1) + x,
        b = a + 1,
        c = b + nx + 1,
        d = a + nx + 1;
      for (const i of [a, b, c, a, c, d]) vertex(i);
    }
  return output;
}
/** One persistent handle per independently deforming object. Explicit keys avoid needless rebuilds. */
export class ParametricSurface<P> {
  readonly mesh: MeshHandle;
  private geometry = new Geometry();
  private key: string | number | undefined;
  private disposed = false;
  constructor(
    private renderer: AsciiRenderer,
    private fn: SurfaceFunction<P>,
    private options: SurfaceOptions<P> = {},
  ) {
    this.mesh = renderer.mesh(this.geometry);
  }
  update(parameters: P, key?: string | number) {
    if (this.disposed) throw Error('Surface is disposed.');
    if (key !== undefined && key === this.key) return this.mesh;
    parametricGeometry(this.fn, parameters, this.options, this.geometry);
    this.renderer.update(this.mesh, this.geometry);
    this.key = key;
    return this.mesh;
  }
  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      this.mesh.dispose();
      this.geometry.clear();
    }
  }
}
export function surfaceWire<P>(
  fn: SurfaceFunction<P>,
  parameters: P,
  {
    linesU = 4,
    linesV = 6,
    samples = 12,
    radius = 0.006,
    colour = 0.9,
    u = [0, 1],
    v = [0, 1],
  }: {
    linesU?: number;
    linesV?: number;
    samples?: number;
    radius?: number;
    colour?: Colour;
    u?: [number, number];
    v?: [number, number];
  } = {},
) {
  if (
    ![linesU, linesV, samples].every(Number.isInteger) ||
    linesU < 1 ||
    linesV < 1 ||
    samples < 2 ||
    (linesU + linesV + 2) * samples > 100000 ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    ![...u, ...v].every(Number.isFinite) ||
    u[1] <= u[0] ||
    v[1] <= v[0]
  )
    throw Error('Invalid surface wire sampling.');
  const g = new Geometry();
  for (let i = 0; i <= linesU; i++)
    g.tube(
      Array.from({ length: samples }, (_, j) =>
        fn(
          u[0] + (i / linesU) * (u[1] - u[0]),
          v[0] + (j / (samples - 1)) * (v[1] - v[0]),
          parameters,
        ),
      ),
      radius,
      colour,
      3,
    );
  for (let i = 0; i <= linesV; i++)
    g.tube(
      Array.from({ length: samples }, (_, j) =>
        fn(
          u[0] + (j / (samples - 1)) * (u[1] - u[0]),
          v[0] + (i / linesV) * (v[1] - v[0]),
          parameters,
        ),
      ),
      radius,
      colour,
      3,
    );
  return g;
}
