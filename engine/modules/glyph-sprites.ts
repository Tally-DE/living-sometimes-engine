/** Cached glyphs for procedural particles. Positions and choreography remain author-defined. */
export class GlyphSprites {
  readonly atlas = document.createElement('canvas');
  readonly cellWidth = 20;
  readonly cellHeight = 32;
  constructor(
    readonly characters = '.:,;!/?+%#&@0123456789',
    colour = '#ffffff',
  ) {
    if (!characters.length || characters.length > 1024)
      throw Error('Glyph atlas needs 1 to 1024 characters.');
    this.atlas.width = characters.length * this.cellWidth;
    this.atlas.height = this.cellHeight;
    const c = this.atlas.getContext('2d')!;
    c.font = 'bold 22px "Courier New",monospace';
    c.fillStyle = colour;
    c.textBaseline = 'middle';
    for (let i = 0; i < characters.length; i++) c.fillText(characters[i], i * this.cellWidth, 16);
  }
  draw(
    c: CanvasRenderingContext2D,
    index: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const i =
      ((Math.floor(index) % this.characters.length) + this.characters.length) %
      this.characters.length;
    c.drawImage(
      this.atlas,
      i * this.cellWidth,
      0,
      this.cellWidth,
      this.cellHeight,
      x,
      y,
      width,
      height,
    );
  }
  dispose() {
    this.atlas.width = 0;
  }
}
export function textPoints(
  lines: Array<{ text: string; x: number; y: number; size: number; at?: number }>,
  {
    width = 1600,
    height = 900,
    step = 3,
    left = 0,
    right = width,
  }: { width?: number; height?: number; step?: number; left?: number; right?: number } = {},
) {
  if (
    ![width, height].every(Number.isInteger) ||
    width < 1 ||
    height < 1 ||
    width * height > 16000000 ||
    !Number.isFinite(step) ||
    step < 1 ||
    left < 0 ||
    right > width ||
    left >= right
  )
    throw Error('Invalid text sampling grid.');
  if (
    lines.some(
      (line) => ![line.x, line.y, line.size, line.at ?? 0].every(Number.isFinite) || line.size <= 0,
    )
  )
    throw Error('Invalid text sample line.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d', { willReadFrequently: true })!;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'white';
  const points: Array<{ x: number; y: number; at: number }> = [];
  for (const line of lines) {
    c.clearRect(0, 0, width, height);
    c.font = `bold ${line.size}px "Courier New",monospace`;
    c.fillText(line.text, line.x, line.y);
    const pixels = c.getImageData(0, 0, width, height).data;
    for (
      let y = Math.max(0, line.y - line.size);
      y < Math.min(height, line.y + line.size);
      y += step
    )
      for (let x = left; x < right; x += step)
        if (pixels[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] > 140)
          points.push({ x, y, at: line.at ?? 0 });
  }
  canvas.width = 0;
  return points;
}
