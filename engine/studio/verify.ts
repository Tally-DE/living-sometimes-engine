import { Runtime, type PieceFactory } from '../core/runtime';
import { validateProject } from '../core/project';
import { Geo } from '../modules/geometry';
import { camera } from '../core/renderer';
import { matrix } from '../core/math';
async function digest(canvas: HTMLCanvasElement, overlay?: HTMLCanvasElement) {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const c = copy.getContext('2d')!;
  c.drawImage(canvas, 0, 0);
  if (overlay) c.drawImage(overlay, 0, 0);
  const pixels = c.getImageData(0, 0, copy.width, copy.height).data;
  const hash = await crypto.subtle.digest('SHA-256', pixels);
  return {
    hash: Array.from(new Uint8Array(hash))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join(''),
    pixels,
  };
}
export async function runAudit(
  factories: Record<string, () => Promise<PieceFactory>>,
  progress: (text: string) => void,
) {
  const cases: Record<string, unknown>[] = [];
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:-2000px;top:0;width:640px;height:360px';
  document.body.append(stage);
  let current: Runtime | undefined;
  try {
    for (const [id, load] of Object.entries(factories)) {
      progress(`Checking ${id}...`);
      const project = validateProject(await (await fetch(`/projects/${id}/project.json`)).json());
      current = new Runtime(
        stage,
        project,
        (p) => new URL(`/projects/${id}/${p}`, location.href).href,
      );
      await current.load(await load());
      const times = [project.duration * 0.12, project.duration * 0.43, project.duration * 0.75];
      const ms = [];
      for (const t of times) {
        current.seek(t);
        ms.push(current.frameMs);
        await new Promise(requestAnimationFrame);
      }
      const mid = times[1];
      current.seek(mid);
      const first = await digest(current.renderer.canvas, current.glyphs.canvas);
      current.seek(times[2]);
      current.seek(mid);
      const second = await digest(current.renderer.canvas, current.glyphs.canvas);
      const deterministic = first.hash === second.hash;
      const diagnostics = current.diagnostics;
      let visible = 0;
      for (let i = 0; i < first.pixels.length; i += 4)
        if (first.pixels[i] + first.pixels[i + 1] + first.pixels[i + 2] > 24) visible++;
      const result: Record<string, unknown> = {
        id,
        backend: current.renderer.backend,
        deterministic,
        visiblePixels: visible,
        cpuSubmissionMs: ms.map((n) => +n.toFixed(2)),
        meshes: diagnostics.meshes,
        diagnostics: diagnostics.piece,
        error: current.error,
      };
      if (id === 'surface-study') {
        current.inputs.add(mid - 0.1, 'bend', 0.7);
        current.seek(mid);
        const altered = await digest(current.renderer.canvas, current.glyphs.canvas);
        current.seek(0);
        current.seek(mid);
        const replayed = await digest(current.renderer.canvas, current.glyphs.canvas);
        current.inputs.clear();
        current.seek(mid);
        const restored = await digest(current.renderer.canvas, current.glyphs.canvas);
        result.inputReplay =
          altered.hash !== first.hash &&
          altered.hash === replayed.hash &&
          restored.hash === first.hash;
      }
      if (id === 'signal') {
        let sampled = 0;
        for (let t = 0; t <= project.duration; t += 2) {
          current.seek(t);
          sampled++;
          if (sampled % 12 === 0) await new Promise(requestAnimationFrame);
        }
        result.timelineSamples = sampled;
        const end = await digest(current.renderer.canvas, current.glyphs.canvas);
        result.endingBlack = end.pixels.every((v, i) => i % 4 === 3 || v <= 3);
        const gpuPixels = first.pixels;
        current.dispose();
        current = new Runtime(
          stage,
          project,
          (p) => new URL(`/projects/${id}/${p}`, location.href).href,
          'cpu',
        );
        await current.load(await load());
        current.seek(mid);
        const cpu = await digest(current.renderer.canvas, current.glyphs.canvas);
        let diff = 0;
        for (let i = 0; i < gpuPixels.length; i += 4)
          diff +=
            Math.abs(gpuPixels[i] - cpu.pixels[i]) +
            Math.abs(gpuPixels[i + 1] - cpu.pixels[i + 1]) +
            Math.abs(gpuPixels[i + 2] - cpu.pixels[i + 2]);
        result.cpuMeanChannelDifference = +(diff / ((gpuPixels.length / 4) * 3)).toFixed(3);
        result.cpuRenderMs = +current.frameMs.toFixed(2);
      }
      current.dispose();
      result.cleanedUp = stage.childElementCount === 0;
      result.passed =
        deterministic &&
        result.cleanedUp &&
        !result.error &&
        (project.status === 'draft' || visible > 10) &&
        (id !== 'surface-study' || result.inputReplay === true) &&
        (id !== 'signal' ||
          (result.endingBlack === true && Number(result.cpuMeanChannelDifference) < 8));
      cases.push(result);
      current = undefined;
      await new Promise(requestAnimationFrame);
    }
    const fixture = validateProject({
      schemaVersion: 1,
      engineVersion: '1.0.0',
      id: 'shared-mesh-check',
      title: 'Shared mesh check',
      description: 'Synthetic renderer diagnostic.',
      duration: 1,
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
        m = r.mesh(new Geo().sphere([0, 0, 0], [0.35, 0.35, 0.35], 0.8, 20, 12));
      return {
        render(t) {
          r.begin(t);
          camera(r, { height: 2, minWidth: 4, centre: [0, 0, 0], eye: [0, 0, 10] });
          r.draw(m, matrix([-1, 0, 0]));
          r.draw(m, matrix([1, 0, 0]));
          r.finish();
        },
        dispose() {
          m.dispose();
        },
      };
    });
    const instances = await digest(current.renderer.canvas),
      width = current.renderer.canvas.width;
    let left = 0,
      right = 0;
    for (let i = 0; i < instances.pixels.length; i += 4) {
      if (instances.pixels[i] > 24) {
        if ((i / 4) % width < width / 2) left++;
        else right++;
      }
    }
    current.dispose();
    cases.push({
      id: 'shared-mesh-check',
      leftVisible: left,
      rightVisible: right,
      cleanedUp: stage.childElementCount === 0,
      passed: left > 50 && right > 50 && stage.childElementCount === 0,
    });
    current = undefined;
    return {
      passed: cases.every((c) => c.passed),
      testedAt: new Date().toISOString(),
      engineVersion: '1.0.0',
      cases,
      note: 'New shared runtime only. Original HTML playback and independent listening are not asserted.',
    };
  } finally {
    current?.dispose();
    stage.remove();
  }
}
