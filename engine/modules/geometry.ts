import { I, V, point, type Vec3 } from '../core/math';
export type Colour = number | number[];
export class Geometry {
  a: number[] = [];
  tri(a: Vec3, b: Vec3, c: Vec3, col: Colour = 0.7, kind = 0, ns: Vec3[] | null = null) {
    const n = V.norm(V.cross(V.sub(b, a), V.sub(c, a))),
      rgb = typeof col === 'number' ? [col, col, col] : col;
    [a, b, c].forEach((p, i) => this.a.push(...p, ...(ns ? ns[i] : n), ...rgb, kind));
    return this;
  }
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, col: Colour = 0.7, kind = 0) {
    this.tri(a, b, c, col, kind);
    this.tri(a, c, d, col, kind);
    return this;
  }
  sphere(p: Vec3, s: Vec3, col: Colour = 0.7, seg = 20, rings = 12) {
    const pt = (a: number, b: number): Vec3 => [
      Math.sin(b) * Math.cos(a),
      Math.cos(b),
      Math.sin(b) * Math.sin(a),
    ];
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < seg; i++) {
        const vs = [
            pt((i / seg) * Math.PI * 2, (j / rings) * Math.PI),
            pt((i / seg) * Math.PI * 2, ((j + 1) / rings) * Math.PI),
            pt(((i + 1) / seg) * Math.PI * 2, ((j + 1) / rings) * Math.PI),
            pt(((i + 1) / seg) * Math.PI * 2, (j / rings) * Math.PI),
          ],
          ps = vs.map((v) => V.add(p, [v[0] * s[0], v[1] * s[1], v[2] * s[2]]));
        this.tri(ps[0], ps[1], ps[2], col, 0, [vs[0], vs[1], vs[2]]);
        this.tri(ps[0], ps[2], ps[3], col, 0, [vs[0], vs[2], vs[3]]);
      }
    return this;
  }
  tube(ps: Vec3[], radius: number | ((u: number) => number) = 0.035, col: Colour = 0.6, sides = 7) {
    if (ps.length < 2) return this;
    const rings: Vec3[][] = [];
    for (let i = 0; i < ps.length; i++) {
      const tan = V.norm(V.sub(ps[Math.min(i + 1, ps.length - 1)], ps[Math.max(0, i - 1)])),
        u = V.norm(V.cross(tan, Math.abs(tan[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0])),
        v = V.cross(tan, u),
        rad = typeof radius === 'function' ? radius(i / (ps.length - 1)) : radius;
      rings.push(
        Array.from({ length: sides }, (_, j) =>
          V.add(
            ps[i],
            V.mul(
              V.add(
                V.mul(u, Math.cos((j / sides) * Math.PI * 2)),
                V.mul(v, Math.sin((j / sides) * Math.PI * 2)),
              ),
              rad,
            ),
          ),
        ),
      );
    }
    for (let i = 0; i < ps.length - 1; i++)
      for (let j = 0; j < sides; j++) {
        const k = (j + 1) % sides;
        this.quad(rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j], col);
      }
    return this;
  }
  box(p: Vec3, s: Vec3, c: Colour = 0.4) {
    solidBox(this, p, s, c);
    return this;
  }
  clear() {
    this.a.length = 0;
    return this;
  }
  append(g: Geometry, m: ArrayLike<number> = I()) {
    for (let i = 0; i < g.a.length; i += 10) {
      const p = point(m, g.a.slice(i, i + 3) as Vec3),
        n: Vec3 = [g.a[i + 3], g.a[i + 4], g.a[i + 5]];
      this.a.push(
        ...p,
        m[0] * n[0] + m[4] * n[1] + m[8] * n[2],
        m[1] * n[0] + m[5] * n[1] + m[9] * n[2],
        m[2] * n[0] + m[6] * n[1] + m[10] * n[2],
        ...g.a.slice(i + 6, i + 10),
      );
    }
    return this;
  }
}
export { Geometry as Geo };
export function segment(g: Geometry, a: Vec3, b: Vec3, w = 0.025, c: Colour = 0.6, sides = 6) {
  g.tube([a, b], w, c, sides);
}
export function curve(a: Vec3, b: Vec3, c: Vec3, n = 16): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    return a.map((v, j) => (1 - u) ** 2 * v + 2 * u * (1 - u) * b[j] + u * u * c[j]) as Vec3;
  });
}
export function surface(
  g: Geometry,
  fn: (u: number, v: number) => Vec3,
  nu: number,
  nv: number,
  col: Colour | ((u: number, v: number) => Colour) = 0.7,
  kind = 0,
) {
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const u = i / nu,
        v = j / nv,
        un = (i + 1) / nu,
        vn = (j + 1) / nv,
        c = typeof col === 'function' ? col((u + un) / 2, (v + vn) / 2) : col;
      g.quad(fn(u, v), fn(un, v), fn(un, vn), fn(u, vn), c, kind);
    }
}
export function solidBox(g: Geometry, p: Vec3, s: Vec3, c: Colour = 0.4) {
  const [x, y, z] = p,
    [w, h, d] = s,
    a: Vec3 = [x - w, y - h, z - d],
    b: Vec3 = [x + w, y - h, z - d],
    cc: Vec3 = [x + w, y + h, z - d],
    dd: Vec3 = [x - w, y + h, z - d],
    e: Vec3 = [x - w, y - h, z + d],
    f: Vec3 = [x + w, y - h, z + d],
    k: Vec3 = [x + w, y + h, z + d],
    l: Vec3 = [x - w, y + h, z + d];
  g.quad(e, f, k, l, c)
    .quad(b, a, dd, cc, c)
    .quad(a, e, l, dd, c)
    .quad(f, b, cc, k, c)
    .quad(dd, l, k, cc, c)
    .quad(a, b, f, e, c);
}
