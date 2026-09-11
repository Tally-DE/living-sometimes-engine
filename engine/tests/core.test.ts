import test from 'node:test';
import assert from 'node:assert/strict';
import { rng, V, matrix, point } from '../core/math';
import { Track, Timeline, Simulation, InputHistory } from '../core/timeline';
import { World, ResourceScope } from '../core/world';
import { validateProject } from '../core/project';
import { reach, plantedFoot, pathAt } from '../modules/behaviour';
import { Geo } from '../modules/geometry';
const manifest = {
  schemaVersion: 1 as const,
  engineVersion: '1.0.0',
  id: 'timeline-fixture',
  title: 'Timeline fixture',
  description: 'Synthetic contract test data.',
  duration: 264,
  seed: 42,
  profile: 'classic' as const,
  entry: 'scene.ts',
  status: 'draft' as const,
  audio: { src: 'assets/score.wav' },
  settings: { exposure: 1, density: 1, camera: 'authored' },
  cues: [
    { id: 'before', name: 'Before', start: 0, end: 104 },
    { id: 'conversation', name: 'Conversation', start: 104, end: 264 },
  ],
};
test('reference manifest validates; incompatible and forbidden project assets fail', () => {
  assert.equal(validateProject(manifest).id, 'timeline-fixture');
  for (const patch of [
    { duration: NaN },
    { seed: 1.5 },
    { engineVersion: '0.1' },
    { entry: '../../outside.ts' },
    { audio: { src: 'assets/movie.mp4' } },
    { assets: { source: 'https://remote/image.png' } },
    { cues: [{ id: 'x', name: 'x', start: 10, end: 9 }] },
  ])
    assert.throws(() => validateProject({ ...manifest, ...patch }));
});
test('track samples preserve holds and resolve boundaries independently of visit order', () => {
  const track = new Track([
    { time: 0, value: 0, easing: 'smooth' },
    { time: 2, value: 1, easing: 'hold' },
    { time: 4, value: 4 },
  ]);
  assert.equal(track.sample(-1), 0);
  assert.equal(track.sample(1), 0.5);
  assert.equal(track.sample(3.99), 1);
  assert.equal(track.sample(4), 4);
  track.sample(99);
  assert.equal(track.sample(1), 0.5);
  assert.throws(
    () =>
      new Track([
        { time: 1, value: 2 },
        { time: 1, value: 3 },
      ]),
  );
});
test('named cues have unambiguous adjacent boundaries', () => {
  const timeline = new Timeline(manifest.cues);
  assert.deepEqual(
    timeline.at(104).map((c) => c.id),
    ['conversation'],
  );
  assert.equal(timeline.time('conversation', 2), 106);
  assert.throws(() => timeline.time('unknown'));
});
test('simulation random seeks reproduce fixed-step state', () => {
  const initial = () => ({ x: 0, v: 1 }),
    step = (s: { x: number; v: number }, dt: number) => {
      s.v -= dt * 0.1;
      s.x += s.v * dt;
    };
  const sim = new Simulation(initial, step, 0.01, 10),
    a = sim.sample(0.67);
  sim.sample(3);
  assert.deepEqual(sim.sample(0.67), a);
  assert.deepEqual(sim.sample(1.2), new Simulation(initial, step, 0.01, 10).sample(1.2));
  assert.throws(() => sim.sample(-1));
});
test('simulation memory stays bounded and evicted history can be reconstructed', () => {
  const init = () => ({ x: 0 }),
    advance = (s: { x: number }) => {
      s.x++;
    };
  const sim = new Simulation(init, advance, 0.01, 10, 4);
  sim.sample(20);
  assert.equal(sim.checkpointCount, 4);
  assert.deepEqual(sim.sample(0.3), { x: 30 });
  assert.deepEqual(sim.sample(19), { x: 1900 });
  assert.ok(sim.checkpointCount <= 4);
});
test('unsupported sound offsets and camera settings fail explicitly', () => {
  assert.throws(
    () => validateProject({ ...manifest, audio: { ...manifest.audio, offset: 3 } }),
    /timeline zero/,
  );
  assert.throws(() =>
    validateProject({ ...manifest, settings: { ...manifest.settings, camera: 'missing' } }),
  );
});
test('timestamped live inputs serialize and replay without future events leaking', () => {
  const events = new InputHistory();
  events.add(3, 'bend', 0.5);
  events.add(1, 'bend', 0.1);
  events.add(3, 'bend', 0.7);
  assert.deepEqual(events.at(2), { bend: 0.1 });
  assert.deepEqual(events.at(0), {});
  const replay = new InputHistory();
  replay.restore(events.serialize());
  assert.deepEqual(replay.at(3), { bend: 0.7 });
});
test('attachments preserve world position; parent motion carries child; cycles rejected', () => {
  const world = new World();
  world.create('person');
  world.create('hand', 'person');
  world.create('prop');
  world.move('hand', [1, 2, 0]);
  world.move('prop', [1, 2, 0]);
  world.attach('prop', 'hand');
  assert.deepEqual(world.position('prop'), [1, 2, 0]);
  world.move('hand', [2, 3, 0]);
  assert.deepEqual(world.position('prop'), [2, 3, 0]);
  world.attach('prop');
  world.move('hand', [5, 8, 0]);
  assert.deepEqual(world.position('prop'), [2, 3, 0]);
  assert.throws(() => world.attach('person', 'hand'));
});
test('reach solves both bone lengths and contact, including singular pole and unreachable target', () => {
  for (const target of [
    [0.5, 1, 0],
    [0, 1, 0],
    [0, 0, 0],
    [9, 0, 0],
  ] as [number, number, number][]) {
    const solved = reach([0, 0, 0], target, 0.8, 0.7, [0, 1, 0]);
    assert.ok(Math.abs(Math.hypot(...solved.joint) - 0.8) < 1e-6);
    assert.ok(Math.abs(Math.hypot(...V.sub(solved.end, solved.joint)) - 0.7) < 1e-6);
    assert.ok(solved.end.every(Number.isFinite));
  }
  assert.ok(reach([0, 0, 0], [0.5, 1, 0], 0.8, 0.7).error < 1e-6);
});
test('stance feet stay planted as the root travels; swing clears ground', () => {
  const a = plantedFoot(0.1),
    b = plantedFoot(0.3);
  assert.equal(a.stance, true);
  assert.deepEqual(a.position, b.position);
  const swing = plantedFoot(0.65);
  assert.equal(swing.stance, false);
  assert.ok(swing.position[1] > 0);
});
test('resource disposal is once-only, reverse order and continues after an error', () => {
  const seen: number[] = [],
    scope = new ResourceScope();
  scope.own(() => seen.push(1));
  scope.own(() => {
    seen.push(2);
    throw Error('test');
  });
  scope.own(() => seen.push(3));
  assert.throws(() => scope.dispose());
  assert.deepEqual(seen, [3, 2, 1]);
  scope.dispose();
  assert.equal(scope.size, 0);
});
test('seed and geometry are deterministic, finite and reusable', () => {
  const a = rng(4),
    b = rng(4);
  assert.deepEqual(Array.from({ length: 20 }, a), Array.from({ length: 20 }, b));
  const g = new Geo().sphere([0, 0, 0], [1, 1, 1], 0.5, 8, 6).tube(
    [
      [0, 0, 0],
      [0, 1, 0],
    ],
    0.1,
  );
  assert.equal(g.a.length % 30, 0);
  assert.ok(g.a.every(Number.isFinite));
  assert.deepEqual(point(matrix([1, 2, 3]), [2, 3, 4]), [3, 5, 7]);
  assert.deepEqual(
    pathAt(2, [
      { time: 0, position: [0, 0, 0] },
      { time: 4, position: [4, 0, 0] },
    ]),
    [2, 0, 0],
  );
});
