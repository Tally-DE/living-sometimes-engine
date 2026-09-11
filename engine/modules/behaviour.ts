import { clamp, ease, V, type Vec3 } from '../core/math';
export function reach(
  root: Vec3,
  target: Vec3,
  upper: number,
  lower: number,
  pole: Vec3 = [0, 0, 1],
) {
  if (upper <= 0 || lower <= 0) throw Error('Limb lengths must be positive.');
  const delta = V.sub(target, root),
    requested = Math.hypot(...delta),
    distance = clamp(requested, Math.abs(upper - lower) + 1e-6, upper + lower - 1e-6),
    axis = requested < 1e-8 ? ([0, 1, 0] as Vec3) : V.norm(delta);
  let side = V.cross(axis, pole);
  if (Math.hypot(...side) < 1e-7)
    side = V.cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const bend = V.norm(V.cross(V.norm(side), axis)),
    along = (upper * upper - lower * lower + distance * distance) / (2 * distance),
    height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return {
    joint: V.add(root, V.add(V.mul(axis, along), V.mul(bend, height))),
    end: V.add(root, V.mul(axis, distance)),
    error: Math.abs(requested - distance),
  };
}
export function plantedFoot(
  distance: number,
  stride = 0.8,
  side: 0 | 1 = 0,
): { position: Vec3; stance: boolean } {
  const phase = distance / stride + side * 0.5,
    cycle = Math.floor(phase),
    u = phase - cycle,
    anchor = (cycle - side * 0.5) * stride;
  if (u < 0.6) return { position: [anchor, 0, side === 0 ? -0.1 : 0.1], stance: true };
  const swing = (u - 0.6) / 0.4;
  return {
    position: [
      anchor + stride * ease(0, 1, swing),
      Math.sin(Math.PI * swing) * 0.16,
      side === 0 ? -0.1 : 0.1,
    ],
    stance: false,
  };
}
export function pathAt(time: number, points: Array<{ time: number; position: Vec3 }>): Vec3 {
  if (!points.length) throw Error('Path needs points.');
  if (time <= points[0].time) return [...points[0].position];
  for (let i = 1; i < points.length; i++)
    if (time < points[i].time)
      return V.lerp(
        points[i - 1].position,
        points[i].position,
        ease(points[i - 1].time, points[i].time, time),
      );
  return [...points.at(-1)!.position];
}
export function breathe(time: number, rate = 0.22, amplitude = 0.025) {
  return Math.sin(time * Math.PI * 2 * rate) * amplitude;
}
export function deform(
  point: Vec3,
  time: number,
  {
    bend = 0,
    ripple = 0,
    frequency = 2,
  }: { bend?: number; ripple?: number; frequency?: number } = {},
): Vec3 {
  const [x, y, z] = point;
  return [
    x + Math.sin(y * frequency + time) * ripple,
    y,
    z + bend * x * x + Math.sin(y * frequency - time) * ripple * 0.4,
  ];
}
