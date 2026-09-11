import { Runtime, type PieceFactory } from '../core/runtime';
import { validateProject } from '../core/project';
import { Geo } from '../modules/geometry';
import { camera } from '../core/renderer';
import { matrix } from '../core/math';
import { presentationModes } from '../core/presentation';
import { ParametricSurface } from '../modules/parametric';
import { CanvasAscii } from '../modules/canvas-ascii';
import { ImageWarp } from '../modules/image-warp';

async function digest(runtime: Runtime) {
  const canvas = runtime.snapshot(),
    pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  canvas.width = 0;
  let visible = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 24) visible++;
  return { hash, pixels, visible };
}
const tick = () => new Promise(requestAnimationFrame);
export async function runAudit(
  factories: Record<string, () => Promise<PieceFactory>>,
  progress: (text: string) => void,
) {
  const cases: Record<string, unknown>[] = [],
    stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:-2000px;top:0;width:640px;height:360px';
  document.body.append(stage);
  let current: Runtime | undefined;
  try {
    for (const [id, load] of Object.entries(factories)) {
      progress(`Checking ${id}…`);
      await tick();
      try {
        const project = validateProject(await (await fetch(`/projects/${id}/project.json`)).json());
        const factory = await load(),
          asset = (p: string) => new URL(`/projects/${id}/${p}`, location.href).href;
        current = new Runtime(stage, project, asset);
        await current.load(factory);
        const explicit = project.verification?.times ?? [],
          cueTimes = project.cues.flatMap((c) => [
            c.start + Math.min(0.1, (c.end - c.start) / 4),
            (c.start + c.end) / 2,
            c.end - Math.min(0.1, (c.end - c.start) / 4),
          ]);
        const times = [
          ...new Set([
            project.duration * 0.12,
            project.duration * 0.43,
            project.duration * 0.75,
            ...explicit,
            ...cueTimes,
          ]),
        ].sort((a, b) => a - b);
        const fingerprints = new Map<number, string>(),
          samples: Record<string, unknown>[] = [],
          work: number[] = [];
        for (const t of times) {
          current.seek(t);
          const frame = await digest(current);
          fingerprints.set(t, frame.hash);
          work.push(current.frameMs);
          samples.push({
            time: +t.toFixed(3),
            visiblePixels: frame.visible,
            workMs: +current.frameMs.toFixed(2),
            diagnostics: structuredClone(current.diagnostics.piece),
          });
          await tick();
        }
        const seekMismatches: number[] = [],
          seekMismatchDetails: unknown[] = [];
        for (const t of [...times].reverse()) {
          current.seek(t);
          if ((await digest(current)).hash !== fingerprints.get(t)) {
            seekMismatches.push(t);
            seekMismatchDetails.push({
              time: t,
              before: samples[times.indexOf(t)].diagnostics,
              after: structuredClone(current.diagnostics.piece),
            });
          }
          await tick();
        }
        const deterministic = seekMismatches.length === 0;
        let timelineSamples = 0;
        if (project.status === 'adaptation')
          for (let t = 0; t <= project.duration; t += 2) {
            current.seek(t);
            work.push(current.frameMs);
            timelineSamples++;
            if (timelineSamples % 6 === 0) {
              progress(`Checking ${id}: ${t.toFixed(0)} / ${project.duration}s`);
              await tick();
            }
          }
        current.seek(project.duration);
        const end = await digest(current);
        let ending = true;
        if (project.verification?.ending === 'black')
          ending = end.pixels.every((v, i) => i % 4 === 3 || v <= 3);
        if (project.verification?.ending === 'hold') {
          current.seek(project.duration - 0.5);
          ending = (await digest(current)).hash === end.hash;
        }
        const mid = project.duration * 0.43;
        current.seek(mid);
        const reference = await digest(current);
        let inputReplay = true;
        const input = project.verification?.input;
        if (input) {
          current.inputs.add(mid - 0.1, input.name, input.value);
          current.seek(mid);
          const altered = await digest(current);
          current.seek(0);
          current.seek(mid);
          const replayed = await digest(current);
          current.inputs.clear();
          current.seek(mid);
          const restored = await digest(current);
          inputReplay =
            altered.hash !== reference.hash &&
            altered.hash === replayed.hash &&
            restored.hash === reference.hash;
        }
        const error = current.error;
        current.dispose();
        current = undefined;
        const cleanedUp = stage.childElementCount === 0;
        let cpuForegroundDifference: number | undefined;
        if (project.verification?.compareCpu) {
          current = new Runtime(stage, project, asset, 'cpu');
          await current.load(factory);
          current.seek(mid);
          const cpu = await digest(current);
          let sum = 0,
            count = 0;
          for (let i = 0; i < cpu.pixels.length; i += 4)
            if (
              reference.pixels[i] + reference.pixels[i + 1] + reference.pixels[i + 2] > 24 ||
              cpu.pixels[i] + cpu.pixels[i + 1] + cpu.pixels[i + 2] > 24
            ) {
              for (let c = 0; c < 3; c++)
                sum += Math.abs(reference.pixels[i + c] - cpu.pixels[i + c]);
              count += 3;
            }
          cpuForegroundDifference = +(sum / Math.max(1, count)).toFixed(3);
          current.dispose();
          current = undefined;
        }
        const sorted = work.slice().sort((a, b) => a - b),
          p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
        cases.push({
          id,
          passed:
            deterministic &&
            ending &&
            inputReplay &&
            cleanedUp &&
            !error &&
            (project.status === 'draft' || reference.visible > 10) &&
            (cpuForegroundDifference === undefined || cpuForegroundDifference < 35),
          deterministic,
          seekMismatches,
          seekMismatchDetails,
          ending,
          inputReplay,
          cleanedUp,
          error,
          timelineSamples,
          seekSamples: times.length,
          cpuForegroundDifference,
          workMedianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
          workP95Ms: +p95.toFixed(2),
          samples,
        });
      } catch (error) {
        cases.push({ id, passed: false, error: String(error) });
        current?.dispose();
        current = undefined;
      }
    }
    progress('Checking shared presentation, surfaces and canvas composition…');
    await tick();
    const fixture = validateProject({
      schemaVersion: 1,
      engineVersion: '1.1.0',
      id: 'engine-fixture',
      title: 'Engine fixture',
      description: 'Synthetic diagnostics.',
      duration: 8,
      seed: 1,
      profile: 'classic',
      entry: 'scene.ts',
      status: 'study',
      cues: [],
      settings: { exposure: 1, density: 1, camera: 'authored' },
    });
    current = new Runtime(stage, fixture, (p) => p);
    await current.load((host) => {
      const r = host.renderer,
        mesh = r.mesh(new Geo().sphere([0, 0, 0], [0.35, 0.35, 0.35], 0.8, 20, 12));
      const surface = new ParametricSurface(
        r,
        (u, v, p: number) => [(u - 0.5) * 1.3, (v - 0.5) * 1.4, Math.sin(u * 6 + v * 4) * p],
        { columns: 12, rows: 14, colour: [0.7, 0.2, 0.1] },
      );
      return {
        render(t) {
          r.begin(t);
          camera(r, { height: 2, minWidth: 4, centre: [0, 0, 0], eye: [0, 0, 10] });
          r.draw(mesh, matrix([-1.2, 0, 0]));
          r.draw(mesh, matrix([1.2, 0, 0]), { gain: 0.35 });
          r.draw(surface.update(0.2, 1));
          r.finish(1, {
            mode: presentationModes[Math.min(4, Math.floor(t))],
            progress: 0.55,
            amount: 0.8,
          });
        },
        dispose() {
          mesh.dispose();
          surface.dispose();
        },
      };
    });
    const modeHashes = [];
    for (let t = 0; t < 5; t++) {
      current.seek(t);
      modeHashes.push((await digest(current)).hash);
      await tick();
    }
    current.seek(0);
    const meshFrame = await digest(current),
      width = current.renderer.canvas.width;
    let left = 0,
      right = 0;
    for (let i = 0; i < meshFrame.pixels.length; i += 4)
      if (meshFrame.pixels[i] > 24) {
        if ((i / 4) % width < width / 3) left++;
        if ((i / 4) % width > (width * 2) / 3) right++;
      }
    current.dispose();
    current = undefined;
    cases.push({
      id: 'shared-presentation',
      passed:
        new Set(modeHashes).size === 5 && left > 50 && right > 50 && stage.childElementCount === 0,
      modesDistinct: new Set(modeHashes).size,
      leftVisible: left,
      rightVisible: right,
      cleanedUp: stage.childElementCount === 0,
    });
    current = new Runtime(stage, fixture, (p) => p);
    await current.load((host) => {
      const source = document.createElement('canvas');
      source.width = 120;
      source.height = 120;
      const c = source.getContext('2d')!;
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < 6; x++) {
          c.fillStyle = (x + y) % 2 ? '#ddaa77' : '#315f8a';
          c.fillRect(x * 20, y * 20, 20, 20);
        }
      const warp = new ImageWarp(source, 120, 120),
        ascii = new CanvasAscii(stage);
      host.scope.own(() => {
        warp.dispose();
        ascii.dispose();
        source.width = 0;
      });
      return {
        render(t) {
          ascii.begin();
          const image = warp.render(
            [{ centre: [60, 60], radius: [60, 60], offset: [Math.sin(t) * 12, Math.cos(t) * 9] }],
            8,
            8,
          );
          ascii.present(image, { definition: t / 8, time: t });
        },
        resize() {
          ascii.resize();
        },
      };
    });
    current.seek(5);
    const a = await digest(current);
    current.seek(1);
    const b = await digest(current);
    current.seek(5);
    const c = await digest(current);
    current.dispose();
    current = undefined;
    cases.push({
      id: 'live-image-composition',
      passed:
        a.hash === c.hash && a.hash !== b.hash && a.visible > 50 && stage.childElementCount === 0,
      deterministic: a.hash === c.hash,
      definitionChanges: a.hash !== b.hash,
      visiblePixels: a.visible,
      cleanedUp: stage.childElementCount === 0,
    });
    return {
      passed: cases.every((c) => c.passed),
      testedAt: new Date().toISOString(),
      engineVersion: '1.1.0',
      cases,
      note: 'Live native-engine checks. Foreground CPU differences exclude dark background. Timings measure CPU submission, not total GPU time. Original-browser parity and independent listening are not asserted.',
    };
  } finally {
    current?.dispose();
    stage.remove();
  }
}
