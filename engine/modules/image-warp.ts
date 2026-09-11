export interface WarpControl {
  centre: [number, number];
  radius: [number, number];
  offset: [number, number];
}
/** A triangulated live image rig. Controls are in source pixels; no pre-rendered frames are stored. */
export class ImageWarp {
  readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private source = document.createElement('canvas');
  constructor(
    image: CanvasImageSource,
    readonly width: number,
    readonly height: number,
    crop: [number, number, number, number] = [0, 0, width, height],
  ) {
    if (
      ![width, height].every(Number.isInteger) ||
      width < 1 ||
      height < 1 ||
      width * height > 16000000 ||
      !crop.every(Number.isFinite) ||
      crop[2] <= 0 ||
      crop[3] <= 0
    )
      throw Error('Invalid image warp dimensions.');
    this.canvas.width = this.source.width = width;
    this.canvas.height = this.source.height = height;
    this.context = this.canvas.getContext('2d')!;
    this.source.getContext('2d')!.drawImage(image, ...crop, 0, 0, width, height);
  }
  render(controls: WarpControl[], columns = 18, rows = 30) {
    if (
      ![columns, rows].every(Number.isInteger) ||
      columns < 1 ||
      rows < 1 ||
      columns * rows > 10000 ||
      controls.length > 128
    )
      throw Error('Invalid image warp grid.');
    for (const control of controls)
      if (
        ![...control.centre, ...control.radius, ...control.offset].every(Number.isFinite) ||
        control.radius.some((v) => v <= 0)
      )
        throw Error('Invalid image warp control.');
    const c = this.context,
      w = this.width,
      h = this.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    if (controls.every((control) => control.offset.every((v) => v === 0))) {
      c.drawImage(this.source, 0, 0);
      return this.canvas;
    }
    const point = (x: number, y: number): [number, number] => {
      let dx = 0,
        dy = 0;
      for (const control of controls) {
        const u = (x - control.centre[0]) / control.radius[0],
          v = (y - control.centre[1]) / control.radius[1],
          weight = Math.max(0, 1 - u * u - v * v) ** 2;
        dx += control.offset[0] * weight;
        dy += control.offset[1] * weight;
      }
      return [x + dx, y + dy];
    };
    const triangle = (src: [number, number][], dst: [number, number][]) => {
      const [a, b, d] = src,
        [A, B, D] = dst,
        den = (b[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (b[1] - a[1]);
      const xx = ((B[0] - A[0]) * (d[1] - a[1]) - (D[0] - A[0]) * (b[1] - a[1])) / den;
      const xy = ((D[0] - A[0]) * (b[0] - a[0]) - (B[0] - A[0]) * (d[0] - a[0])) / den;
      const yx = ((B[1] - A[1]) * (d[1] - a[1]) - (D[1] - A[1]) * (b[1] - a[1])) / den;
      const yy = ((D[1] - A[1]) * (b[0] - a[0]) - (B[1] - A[1]) * (d[0] - a[0])) / den;
      c.save();
      c.beginPath();
      c.moveTo(...A);
      c.lineTo(...B);
      c.lineTo(...D);
      c.closePath();
      c.clip();
      c.setTransform(xx, yx, xy, yy, A[0] - xx * a[0] - xy * a[1], A[1] - yx * a[0] - yy * a[1]);
      c.drawImage(this.source, 0, 0);
      c.restore();
    };
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const a: [number, number] = [(x / columns) * w, (y / rows) * h],
          b: [number, number] = [((x + 1) / columns) * w, (y / rows) * h],
          d: [number, number] = [(x / columns) * w, ((y + 1) / rows) * h],
          e: [number, number] = [b[0], d[1]];
        const A = point(...a),
          B = point(...b),
          D = point(...d),
          E = point(...e);
        triangle([a, b, e], [A, B, E]);
        triangle([a, e, d], [A, E, D]);
      }
    return this.canvas;
  }
  dispose() {
    this.canvas.width = 0;
    this.source.width = 0;
  }
}
