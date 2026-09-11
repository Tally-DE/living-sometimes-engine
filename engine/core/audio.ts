export class Score {
  readonly element: HTMLAudioElement;
  private context?: AudioContext;
  private buffer?: AudioBuffer;
  constructor(
    src?: string,
    readonly offset = 0,
  ) {
    this.element = new Audio();
    this.element.preload = 'auto';
    if (src) this.element.src = src;
  }
  async play(time: number, rate: number) {
    this.element.playbackRate = rate;
    this.element.currentTime = Math.max(0, time - this.offset);
    await this.element.play();
  }
  pause() {
    this.element.pause();
  }
  seek(time: number) {
    this.element.currentTime = Math.max(0, time - this.offset);
  }
  get time() {
    return this.element.currentTime + this.offset;
  }
  get available() {
    return !!this.element.getAttribute('src');
  }
  async waveform(bins = 240) {
    if (!this.available) return [];
    this.context ??= new AudioContext();
    this.buffer ??= await this.context.decodeAudioData(
      await (await fetch(this.element.src)).arrayBuffer(),
    );
    const a = this.buffer.getChannelData(0),
      values = [];
    for (let i = 0; i < bins; i++) {
      const begin = Math.floor((i * a.length) / bins),
        end = Math.floor(((i + 1) * a.length) / bins);
      let sum = 0;
      for (let j = begin; j < end; j++) sum += a[j] * a[j];
      values.push(Math.sqrt(sum / Math.max(1, end - begin)));
    }
    return values;
  }
  dispose() {
    this.pause();
    this.element.removeAttribute('src');
    this.element.load();
    void this.context?.close();
    this.buffer = undefined;
  }
}
