import { GpuAsciiRenderer } from './gpu-renderer';
import { CpuAsciiRenderer } from './cpu-renderer';
import { profiles } from './profiles';
import { Score } from './audio';
import { World, ResourceScope } from './world';
import { InputHistory, Timeline } from './timeline';
import { GlyphLayer } from '../modules/typography';
import { clamp } from './math';
import { validateProject, type Project } from './project';
import type { AsciiRenderer } from './renderer';
export interface Piece {
  render(time: number): void;
  resize?(): void;
  dispose?(): void;
  diagnostics?: Record<string, unknown>;
  cameraBookmarks?: string[];
}
export interface Host {
  renderer: AsciiRenderer;
  glyphs: GlyphLayer;
  world: World;
  inputs: InputHistory;
  timeline: Timeline;
  project: Project;
  asset: (path: string) => string;
  scope: ResourceScope;
}
export type PieceFactory = (host: Host) => Piece | Promise<Piece>;
export class Runtime extends EventTarget {
  readonly project: Project;
  readonly score: Score;
  readonly world = new World();
  readonly inputs = new InputHistory();
  readonly timeline: Timeline;
  readonly glyphs: GlyphLayer;
  readonly renderer: AsciiRenderer;
  private scope = new ResourceScope();
  private piece?: Piece;
  private raf = 0;
  private serial = 0;
  private last = 0;
  private wall = 0;
  private origin = 0;
  private disposed = false;
  private audioRunning = false;
  time = 0;
  playing = false;
  rate = 1;
  loop: [number, number] | null = null;
  frameMs = 0;
  frames = 0;
  error = '';
  ready = false;
  constructor(
    readonly stage: HTMLElement,
    project: Project,
    readonly asset: (path: string) => string,
    backend: 'gpu' | 'cpu' = 'gpu',
  ) {
    super();
    this.project = validateProject(project);
    this.timeline = new Timeline(project.cues);
    const canvas = document.createElement('canvas');
    const profile = { ...profiles[project.profile], ...project.visual };
    canvas.className = 'scene-canvas';
    canvas.setAttribute('aria-label', project.title);
    stage.replaceChildren(canvas);
    try {
      this.renderer =
        backend === 'cpu'
          ? new CpuAsciiRenderer(canvas, profile)
          : new GpuAsciiRenderer(canvas, profile);
    } catch (e) {
      canvas.remove();
      const fallback = document.createElement('canvas');
      fallback.className = 'scene-canvas';
      stage.append(fallback);
      this.renderer = new CpuAsciiRenderer(fallback, profile);
      this.error = `GPU unavailable; using shared CPU renderer. ${String(e)}`;
    }
    this.renderer.exposure = project.settings.exposure;
    this.renderer.density = project.settings.density;
    this.renderer.viewScale =
      project.settings.camera === 'wide' ? 1.25 : project.settings.camera === 'close' ? 0.8 : 1;
    this.renderer.resize();
    this.glyphs = new GlyphLayer(stage);
    this.score = new Score(
      project.audio ? asset(project.audio.src) : undefined,
      project.audio?.offset ?? 0,
    );
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(stage);
    this.scope.own(() => observer.disconnect());
    const visibility = () => {
      if (document.hidden) this.pause();
    };
    document.addEventListener('visibilitychange', visibility);
    this.scope.own(() => document.removeEventListener('visibilitychange', visibility));
    const ended = () => {
      if (!this.loop && this.time >= this.project.duration - 0.1) {
        this.pause();
        this.seek(this.project.duration);
      } else if (this.playing) {
        this.audioRunning = false;
        this.wall = performance.now();
        this.origin = this.time;
      }
    };
    this.score.element.addEventListener('ended', ended);
    this.scope.own(() => this.score.element.removeEventListener('ended', ended));
  }
  async load(factory: PieceFactory) {
    const piece = await factory({
      renderer: this.renderer,
      glyphs: this.glyphs,
      world: this.world,
      inputs: this.inputs,
      timeline: this.timeline,
      project: this.project,
      asset: this.asset,
      scope: this.scope,
    });
    if (this.disposed) {
      piece.dispose?.();
      return;
    }
    this.piece = piece;
    this.ready = true;
    this.seek(0);
  }
  private emit() {
    this.dispatchEvent(new Event('change'));
  }
  private render() {
    if (!this.piece || this.disposed) return;
    const start = performance.now();
    this.glyphs.clear();
    this.piece.render(this.time);
    this.frameMs = performance.now() - start;
    this.frames++;
    this.emit();
  }
  seek(time: number) {
    if (!Number.isFinite(time)) throw Error('Invalid time.');
    this.time = clamp(time, 0, this.project.duration);
    this.origin = this.time;
    this.wall = performance.now();
    this.score.seek(this.time);
    this.render();
    if (this.time >= this.project.duration && this.playing) this.pause();
  }
  async play() {
    if (!this.ready || this.disposed) return;
    if (this.playing) return;
    const token = ++this.serial;
    if (this.time >= this.project.duration) this.seek(this.loop?.[0] ?? 0);
    this.error = '';
    if (this.score.available) {
      try {
        await this.score.play(this.time, this.rate);
        if (token !== this.serial || this.disposed) {
          this.score.pause();
          return;
        }
        this.audioRunning = true;
      } catch (e) {
        this.error = 'Sound could not start. Press play to retry, or choose silent playback.';
        this.emit();
        return;
      }
    }
    this.start();
  }
  playSilent() {
    if (!this.ready || this.disposed || this.playing) return;
    if (this.time >= this.project.duration) this.seek(this.loop?.[0] ?? 0);
    this.serial++;
    this.score.pause();
    this.audioRunning = false;
    this.start();
  }
  private start() {
    this.playing = true;
    this.wall = performance.now();
    this.origin = this.time;
    this.last = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
    this.emit();
  }
  private tick = (now: number) => {
    if (!this.playing || this.disposed) return;
    this.time = this.audioRunning
      ? this.score.time
      : this.origin + ((now - this.wall) / 1000) * this.rate;
    if (this.loop && this.time >= this.loop[1]) {
      this.time = this.loop[0] + ((this.time - this.loop[0]) % (this.loop[1] - this.loop[0]));
      this.score.seek(this.time);
      this.origin = this.time;
      this.wall = now;
    }
    if (this.time >= this.project.duration) {
      this.time = this.project.duration;
      this.pause();
      this.render();
      return;
    }
    if (now - this.last >= 1000 / 30 - 0.5) {
      try {
        this.render();
      } catch (e) {
        this.error = `Rendering stopped: ${String(e)}`;
        this.pause();
        this.emit();
        return;
      }
      this.last = now;
    }
    this.raf = requestAnimationFrame(this.tick);
  };
  pause() {
    const wasPlaying = this.playing;
    this.serial++;
    if (this.playing) {
      this.time = clamp(
        this.audioRunning
          ? this.score.time
          : this.origin + ((performance.now() - this.wall) / 1000) * this.rate,
        0,
        this.project.duration,
      );
    }
    this.playing = false;
    this.audioRunning = false;
    this.score.pause();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (wasPlaying) {
      try {
        this.render();
      } catch (e) {
        this.error = String(e);
      }
    }
    this.emit();
  }
  setRate(rate: number) {
    if (!Number.isFinite(rate) || rate < 0.1 || rate > 4) throw Error('Invalid playback rate.');
    const play = this.playing,
      audio = this.audioRunning;
    this.pause();
    this.rate = rate;
    if (play) audio ? void this.play() : this.playSilent();
  }
  setLoop(range: [number, number] | null) {
    if (
      range &&
      (!range.every(Number.isFinite) ||
        range[0] < 0 ||
        range[1] > this.project.duration ||
        range[1] <= range[0])
    )
      throw Error('Invalid loop.');
    this.loop = range;
  }
  step(frames: number, fps = 30) {
    this.pause();
    this.seek(this.time + frames / fps);
  }
  resize() {
    if (this.disposed) return;
    this.renderer.resize();
    this.glyphs.resize();
    this.piece?.resize?.();
    if (this.ready) this.render();
  }
  setSettings(settings: Project['settings']) {
    validateProject({ ...this.project, settings });
    this.project.settings = settings;
    this.renderer.exposure = settings.exposure;
    this.renderer.density = settings.density;
    this.renderer.viewScale =
      settings.camera === 'wide' ? 1.25 : settings.camera === 'close' ? 0.8 : 1;
    this.resize();
  }
  get bookmarks() {
    return this.piece?.cameraBookmarks ?? ['authored'];
  }
  /** Composite live layers for diagnostics without recording a sequence. */
  snapshot() {
    const canvas = document.createElement('canvas');
    canvas.width = this.renderer.canvas.width;
    canvas.height = this.renderer.canvas.height;
    const c = canvas.getContext('2d')!;
    for (const layer of this.stage.querySelectorAll('canvas'))
      c.drawImage(layer, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  get diagnostics() {
    return {
      time: this.time,
      playing: this.playing,
      frames: this.frames,
      frameMs: this.frameMs,
      audioTime: this.score.time,
      audioPaused: this.score.element.paused,
      ...this.renderer.stats(),
      piece: this.piece?.diagnostics ?? {},
      objects: this.world.describe(),
    };
  }
  dispose() {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    const errors: unknown[] = [];
    for (const cleanup of [
      () => this.piece?.dispose?.(),
      () => this.scope.dispose(),
      () => this.score.dispose(),
      () => this.renderer.dispose(),
      () => this.glyphs.dispose(),
      () => this.world.clear(),
      () => this.stage.replaceChildren(),
    ]) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    this.ready = false;
    if (errors.length) throw new AggregateError(errors, 'Runtime cleanup failed.');
  }
}
