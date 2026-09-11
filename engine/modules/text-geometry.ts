import { Geometry, solidBox, type Colour } from './geometry';
import type { Vec3 } from '../core/math';

const glyphs = new Map<string, number[]>();
function glyph(rows: string[], fill: number, depth: number) {
  const key = rows.join('/') + ':' + fill + ':' + depth;
  let data = glyphs.get(key);
  if (data) return data;
  const g = new Geometry();
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++)
      if (rows[y][x] === '1') solidBox(g, [x, -y, 0], [fill / 2, fill / 2, depth / 2], 1);
  data = g.a;
  if (glyphs.size >= 128) glyphs.delete(glyphs.keys().next().value!);
  glyphs.set(key, data);
  return data;
}

/** A supplied bitmap font becomes lit, depth-tested geometry, sharing every presentation effect. */
export function bitmapText(
  text: string,
  font: Record<string, string[]>,
  {
    position = [0, 0, 0],
    size = 0.1,
    colour = 0.9,
    align = 'center',
    advance = 6,
    space = 3,
    fill = 0.68,
    depth = 0.2,
  }: {
    position?: Vec3;
    size?: number;
    colour?: Colour;
    align?: 'left' | 'center' | 'right';
    advance?: number;
    space?: number;
    fill?: number;
    depth?: number;
  } = {},
  output = new Geometry(),
) {
  if (
    ![size, advance, space, fill, depth, ...position].every(Number.isFinite) ||
    size <= 0 ||
    advance <= 0 ||
    space < 0 ||
    fill <= 0 ||
    depth <= 0
  )
    throw Error('Invalid bitmap text dimensions.');
  const rgb = typeof colour === 'number' ? [colour, colour, colour] : colour;
  const width = Array.from(text).reduce((sum, ch) => sum + (font[ch] ? advance : space) * size, 0);
  let x = position[0] - (align === 'center' ? width / 2 : align === 'right' ? width : 0);
  for (const ch of text) {
    const rows = font[ch];
    if (rows) {
      const a = glyph(rows, fill, depth);
      for (let i = 0; i < a.length; i += 10)
        output.a.push(
          x + a[i] * size,
          position[1] + a[i + 1] * size,
          position[2] + a[i + 2] * size,
          a[i + 3],
          a[i + 4],
          a[i + 5],
          rgb[0],
          rgb[1],
          rgb[2],
          a[i + 9],
        );
    }
    x += (rows ? advance : space) * size;
  }
  return output;
}
