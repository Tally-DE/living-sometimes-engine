import test from 'node:test';
import assert from 'node:assert/strict';
import { parametricGeometry, ParametricSurface, surfaceWire } from '../modules/parametric';
import { bitmapText } from '../modules/text-geometry';
import { Geometry } from '../modules/geometry';
import { presentationCell, presentationModes } from '../core/presentation';
import type { AsciiRenderer, MeshHandle } from '../core/renderer';

test('parametric sampling evaluates each point once and preserves finite oriented normals', () => {
  let calls = 0,
    colours = 0;
  const g = parametricGeometry(
    (u, v, z: number) => {
      calls++;
      return [u, v, z];
    },
    2,
    {
      columns: 3,
      rows: 4,
      colour: () => {
        colours++;
        return [0.2, 0.4, 0.8];
      },
    },
  );
  assert.equal(calls, 20);
  assert.equal(colours, 20);
  assert.equal(g.a.length, 3 * 4 * 6 * 10);
  for (let i = 0; i < g.a.length; i += 10) {
    assert.deepEqual(g.a.slice(i + 3, i + 6), [0, 0, 1]);
    assert.deepEqual(g.a.slice(i + 6, i + 9), [0.2, 0.4, 0.8]);
    assert.equal(g.a[i + 2], 2);
  }
  assert.throws(() => parametricGeometry(() => [NaN, 0, 0], null));
  assert.throws(() => parametricGeometry(() => [0, 0, 0], null, { u: [0, Infinity] }));
  assert.throws(() => surfaceWire(() => [0, 0, 0], null, { linesU: 0 }));
});

test('surface handles are reused, keys avoid rebuilding, reverse requests reproduce geometry and disposal is idempotent', () => {
  let updates = 0,
    disposed = 0;
  const mesh: MeshHandle = {
    a: new Float32Array(),
    count: 0,
    dispose() {
      disposed++;
    },
  };
  const renderer = {
    mesh: () => mesh,
    update(m: MeshHandle, g: Geometry) {
      updates++;
      m.a = Float32Array.from(g.a);
      m.count = g.a.length / 10;
    },
  } as unknown as AsciiRenderer;
  const surface = new ParametricSurface(renderer, (u, v, p: number) => [u, v, Math.sin(u) * p], {
    columns: 3,
    rows: 4,
  });
  assert.equal(surface.update(0.4, 'a'), mesh);
  const first = mesh.a.slice();
  surface.update(0.4, 'a');
  assert.equal(updates, 1);
  surface.update(0.7, 'b');
  assert.notDeepEqual(mesh.a, first);
  surface.update(0.4, 'a');
  assert.deepEqual(mesh.a, first);
  surface.dispose();
  surface.dispose();
  assert.equal(disposed, 1);
  assert.throws(() => surface.update(0));
});

test('cached 3D glyph geometry preserves author font, size, alignment, depth and colour across calls', () => {
  const font = { X: ['1'] };
  const a = bitmapText('X', font, {
    align: 'left',
    position: [2, 3, 4],
    size: 2,
    fill: 1,
    depth: 0.5,
    colour: [0.1, 0.2, 0.3],
  });
  for (let i = 0; i < a.a.length; i += 10) {
    assert.ok([1, 3].includes(a.a[i]));
    assert.ok([2, 4].includes(a.a[i + 1]));
    assert.ok([3.5, 4.5].includes(a.a[i + 2]));
    assert.deepEqual(a.a.slice(i + 6, i + 9), [0.1, 0.2, 0.3]);
  }
  assert.equal(a.a.length, 36 * 10);
  bitmapText('X', font, { size: 1, colour: 1 });
  assert.deepEqual(
    bitmapText('X', font, {
      align: 'left',
      position: [2, 3, 4],
      size: 2,
      fill: 1,
      depth: 0.5,
      colour: [0.1, 0.2, 0.3],
    }),
    a,
  );
  font.X = ['11'];
  assert.equal(bitmapText('X', font).a.length, 72 * 10);
  assert.throws(() => bitmapText('X', font, { size: NaN }));
});

test('presentation effects stay within the source grid and are independent of visit order', () => {
  for (const mode of presentationModes) {
    const expected = [];
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 40; x++) {
        const e = presentationCell(x, y, 40, 20, 5, { mode, progress: 0.5, amount: 0.8 });
        assert.ok(Number.isInteger(e.sourceX) && e.sourceX >= 0 && e.sourceX < 40);
        expected.push(e);
      }
    presentationCell(9, 8, 40, 20, 100, { mode, progress: 1, amount: 1 });
    assert.deepEqual(
      expected[329],
      presentationCell(9, 8, 40, 20, 5, { mode, progress: 0.5, amount: 0.8 }),
    );
  }
});
