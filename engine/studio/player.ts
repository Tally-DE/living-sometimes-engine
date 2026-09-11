import { entries } from '../.cache/registry';
import { Runtime, type PieceFactory } from '../core/runtime';
import { validateProject, type Project } from '../core/project';
const data = JSON.parse(document.getElementById('project-data')!.textContent!) as {
  project: Project;
  assets?: Record<string, string>;
  base?: string;
};
const project = validateProject(data.project),
  stage = document.getElementById('stage')!,
  status = document.getElementById('status')!,
  button = document.getElementById('play')!,
  begin = document.getElementById('begin')!,
  seek = document.getElementById('seek') as HTMLInputElement;
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
let runtime: Runtime;
async function start() {
  try {
    runtime = new Runtime(
      stage,
      project,
      (p) => data.assets?.[p] ?? new URL((data.base ?? '') + p, location.href).href,
    );
    const entry = entries[project.id as keyof typeof entries];
    if (!entry) throw Error('This project is not included in this build.');
    await runtime.load((await entry.load()).default as PieceFactory);
    runtime.addEventListener('change', () => {
      button.textContent = runtime.playing
        ? 'Pause'
        : runtime.time >= project.duration
          ? 'Replay'
          : 'Play';
      seek.value = String(runtime.time);
      document.getElementById('time')!.textContent =
        `${fmt(runtime.time)} / ${fmt(project.duration)}`;
      status.textContent = runtime.error;
      if (runtime.playing) begin.hidden = true;
    });
    button.onclick = () => (runtime.playing ? runtime.pause() : void runtime.play());
    begin.onclick = () => void runtime.play();
    document.getElementById('silent')!.onclick = () => {
      begin.hidden = true;
      runtime.playSilent();
    };
    document.getElementById('mute')!.onclick = (e) => {
      runtime.score.element.muted = !runtime.score.element.muted;
      const b = e.currentTarget as HTMLElement;
      b.textContent = runtime.score.element.muted ? 'Unmute' : 'Mute';
      b.setAttribute('aria-pressed', String(runtime.score.element.muted));
    };
    seek.oninput = () => {
      begin.hidden = true;
      runtime.seek(Number(seek.value));
    };
    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).matches('button,input')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        button.click();
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        runtime.seek(runtime.time + (e.key === 'ArrowRight' ? 5 : -5));
      }
    });
    window.addEventListener('pagehide', (e) => (e.persisted ? runtime.pause() : runtime.dispose()));
    status.textContent = runtime.error;
  } catch (e) {
    status.textContent = `Unable to load live scene: ${String(e)}`;
  }
}
void start();
