import { clamp, mix, smooth } from './math';
import type { Cue } from './project';
export interface Key {
  time: number;
  value: number;
  easing?: 'linear' | 'smooth' | 'hold';
}
export class Track {
  readonly keys: Key[];
  constructor(keys: Key[]) {
    if (!keys.length || keys.some((k) => !Number.isFinite(k.time) || !Number.isFinite(k.value)))
      throw Error('Invalid keyframes.');
    this.keys = [...keys].sort((a, b) => a.time - b.time);
    if (new Set(this.keys.map((k) => k.time)).size !== keys.length)
      throw Error('Duplicate key time.');
  }
  sample(t: number) {
    const ks = this.keys;
    if (t <= ks[0].time) return ks[0].value;
    for (let i = 1; i < ks.length; i++)
      if (t < ks[i].time) {
        const a = ks[i - 1],
          b = ks[i],
          u = clamp((t - a.time) / (b.time - a.time));
        return mix(
          a.value,
          b.value,
          a.easing === 'hold' ? 0 : a.easing === 'smooth' ? smooth(0, 1, u) : u,
        );
      }
    return ks.at(-1)!.value;
  }
}
export class Timeline {
  constructor(readonly cues: Cue[]) {}
  at(t: number) {
    return this.cues.filter((c) => t >= c.start && t < c.end);
  }
  time(id: string, offset = 0) {
    const cue = this.cues.find((c) => c.id === id);
    if (!cue) throw Error(`Unknown cue: ${id}`);
    return cue.start + offset;
  }
}
export interface InputEvent {
  time: number;
  type: string;
  value: number;
  sequence: number;
}
export class InputHistory {
  private events: InputEvent[] = [];
  private sequence = 0;
  add(time: number, type: string, value: number) {
    if (!Number.isFinite(time) || time < 0 || !Number.isFinite(value))
      throw Error('Invalid input.');
    this.events.push({ time, type, value, sequence: this.sequence++ });
    this.events.sort((a, b) => a.time - b.time || a.sequence - b.sequence);
  }
  at(time: number) {
    const state: Record<string, number> = {};
    for (const e of this.events) {
      if (e.time > time) break;
      state[e.type] = e.value;
    }
    return state;
  }
  serialize() {
    return structuredClone(this.events);
  }
  clear(type?: string) {
    this.events = type === undefined ? [] : this.events.filter((e) => e.type !== type);
  }
  restore(events: InputEvent[]) {
    this.events = [];
    for (const e of events) this.add(e.time, e.type, e.value);
  }
}
export class Simulation<T> {
  private checkpoints = new Map<number, T>();
  private state: T;
  private step = 0;
  constructor(
    private initial: () => T,
    private advance: (state: T, dt: number, step: number) => void,
    readonly dt = 1 / 60,
    readonly interval = 120,
    readonly maxCheckpoints = 64,
  ) {
    if (
      !Number.isFinite(dt) ||
      dt <= 0 ||
      !Number.isSafeInteger(interval) ||
      interval < 1 ||
      !Number.isSafeInteger(maxCheckpoints) ||
      maxCheckpoints < 2
    )
      throw Error('Invalid simulation clock.');
    this.state = initial();
    this.checkpoints.set(0, structuredClone(this.state));
  }
  sample(time: number): T {
    if (!Number.isFinite(time) || time < 0) throw Error('Invalid simulation time.');
    const target = Math.floor((time + 1e-9) / this.dt);
    if (target < this.step) {
      const prior = Math.max(...[...this.checkpoints.keys()].filter((k) => k <= target));
      this.step = prior;
      this.state = structuredClone(this.checkpoints.get(prior)!);
    }
    while (this.step < target) {
      this.advance(this.state, this.dt, this.step);
      this.step++;
      if (this.step % this.interval === 0) {
        this.checkpoints.set(this.step, structuredClone(this.state));
        if (this.checkpoints.size > this.maxCheckpoints)
          this.checkpoints.delete([...this.checkpoints.keys()].find((k) => k !== 0)!);
      }
    }
    return structuredClone(this.state);
  }
  get checkpointCount() {
    return this.checkpoints.size;
  }
  reset() {
    this.state = this.initial();
    this.step = 0;
    this.checkpoints.clear();
    this.checkpoints.set(0, structuredClone(this.state));
  }
}
