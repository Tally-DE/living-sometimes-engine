/** Optional local WebAssembly accelerator for author-defined image deformation. */
export class RasterKernel {
  readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private image: ImageData;
  private constructor(
    private exports: WebAssembly.Exports,
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.context = this.canvas.getContext('2d')!;
    this.image = this.context.createImageData(width, height);
    for (const name of ['init', 'source_ptr', 'output_ptr', 'render'])
      if (typeof exports[name] !== 'function') throw Error(`Raster kernel requires ${name}.`);
    if (!(exports.memory instanceof WebAssembly.Memory))
      throw Error('Raster kernel requires exported memory.');
    (exports.init as CallableFunction)();
    this.bytes('source_ptr');
    this.bytes('output_ptr');
  }
  static async load(bytes: Uint8Array, width: number, height: number) {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width * height > 16777216
    )
      throw Error('Invalid raster kernel dimensions.');
    const result = await WebAssembly.instantiate(Uint8Array.from(bytes), {});
    return new RasterKernel(result.instance.exports, width, height);
  }
  private bytes(pointer: string) {
    const at = Number((this.exports[pointer] as CallableFunction)()),
      memory = this.exports.memory as WebAssembly.Memory,
      size = this.width * this.height * 4;
    if (!Number.isSafeInteger(at) || at < 0 || at + size > memory.buffer.byteLength)
      throw Error('Raster kernel buffer is out of bounds.');
    return new Uint8ClampedArray(memory.buffer, at, size);
  }
  setSource(source: ImageData) {
    if (source.width !== this.width || source.height !== this.height)
      throw Error('Raster kernel source size mismatch.');
    this.bytes('source_ptr').set(source.data);
  }
  render(parameters: number[]) {
    if (!parameters.every(Number.isFinite)) throw Error('Invalid raster kernel parameters.');
    (this.exports.render as CallableFunction)(...parameters);
    this.image.data.set(this.bytes('output_ptr'));
    this.context.putImageData(this.image, 0, 0);
    return this.canvas;
  }
  dispose() {
    this.canvas.width = 0;
    this.image = this.context.createImageData(1, 1);
    this.exports = {};
  }
}
