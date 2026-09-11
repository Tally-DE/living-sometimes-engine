import { entries } from '../.cache/registry';
import { Runtime, type PieceFactory } from '../core/runtime';
import { validateProject, type Project } from '../core/project';
import { runAudit } from './verify';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<header><h1>Living Sometimes <span>STUDIO / 1.1</span></h1><span>Stories, rendered live.</span></header><div class="workspace"><nav aria-label="Projects"><div class="nav-label">WORKSPACE</div></nav><main class="main"><div class="stage-header"><div><h2 id="title">Loading</h2><p id="kind"></p></div><div class="view-tools"><select id="backend" aria-label="Rendering backend"><option value="gpu">GPU</option><option value="cpu">CPU reference</option></select><select id="framing" aria-label="Preview framing"><option value="wide">Wide</option><option value="portrait">Portrait</option></select><select id="camera" aria-label="Camera bookmark"><option value="authored">Authored camera</option><option value="wide">Wide camera</option><option value="close">Close camera</option></select></div></div><div class="stage-wrap"><div id="stage" class="stage"></div></div><div class="transport"><button id="play">Play with sound</button><button id="silent">Play silently</button><button id="back" aria-label="Previous frame">−1 frame</button><button id="forward" aria-label="Next frame">+1 frame</button><button id="mute" aria-pressed="false">Mute</button><select id="rate" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><output id="time" class="readout">0:00 / 0:00</output></div><div class="timeline"><svg class="waveform" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-label="Audio waveform"><path id="wave" fill="none" stroke="#92b49f" stroke-width="2"/></svg><input id="seek" type="range" min="0" max="264" value="0" step="0.001" aria-label="Timeline"><div id="cues" class="cues"></div></div><div class="loop-tools"><button id="loop" aria-pressed="false">Loop range</button><label>In <input id="in" type="number" min="0" value="0" step="0.1"></label><label>Out <input id="out" type="number" min="0" value="10" step="0.1"></label><button id="mark-in">Mark in</button><button id="mark-out">Mark out</button></div><p id="status" class="status" role="status"></p><span id="performance" class="backend-note"></span><details><summary>Engine verification</summary><p>Runs the shared projects, seek comparisons and renderer checks. No recordings are made.</p><button id="audit">Run engine checks</button><button id="audit-current">Check this project</button><pre id="audit-report"></pre></details></main><aside><p class="inspector-title">Artistic settings</p><label for="exposure">Exposure <output id="exposure-value">1.00</output></label><input id="exposure" type="range" min="0.25" max="3" step="0.05" value="1"><label for="density">Character density <output id="density-value">1.00</output></label><input id="density" type="range" min="0.5" max="1.5" step="0.05" value="1"><div id="parameters"></div><label for="story">Story & direction</label><textarea id="story" class="story" spellcheck="false"></textarea><button id="save" class="save">Save to project</button><p id="saved" class="save-state">Local source files.</p><details><summary>Objects & diagnostics</summary><pre id="diagnostics"></pre></details><p class="hint">Space: play / pause<br>← / →: one frame<br>Shift + ← / →: five seconds<br><br>All existing pieces remain unchanged. Studies are tools for checking the engine.</p></aside></div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const fmt = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor(t * 10) % 10)}`;
let runtime: Runtime | undefined,
  selected = 'signal',
  serial = 0,
  dirty = false;
const factories = Object.fromEntries(
  Object.entries(entries).map(([id, e]) => [
    id,
    async () => {
      const m = await e.load();
      return m.default as PieceFactory;
    },
  ]),
) as Record<string, () => Promise<PieceFactory>>;
function status(text: string, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}
function changed() {
  dirty = true;
  $('saved').textContent = 'Unsaved changes';
}
function update() {
  if (!runtime) return;
  const d = runtime.diagnostics;
  $('play').textContent = runtime.playing
    ? 'Pause'
    : runtime.time >= runtime.project.duration
      ? 'Replay'
      : 'Play with sound';
  input('seek').value = String(runtime.time);
  $('time').textContent = `${fmt(runtime.time)} / ${fmt(runtime.project.duration)}`;
  $('performance').textContent =
    `${d.backend} · ${d.columns} × ${d.rows} characters · ${runtime.frameMs.toFixed(1)} ms CPU submission`;
  $('diagnostics').textContent = JSON.stringify(d, null, 2);
  for (const button of $('cues').querySelectorAll('button'))
    button.classList.toggle(
      'current',
      runtime.timeline.at(runtime.time).some((c) => c.id === button.dataset.id),
    );
  if (runtime.error) status(runtime.error, true);
}
async function select(id: string, keepTime = 0) {
  const token = ++serial;
  runtime?.dispose();
  runtime = undefined;
  selected = id;
  status('Preparing live scene…');
  $('save').setAttribute('disabled', '');
  try {
    const project = validateProject(await (await fetch(`/projects/${id}/project.json`)).json()),
      story = await (await fetch(`/projects/${id}/story.md`)).text(),
      factory = await factories[id]();
    if (token !== serial) return;
    const r = new Runtime(
      $('stage'),
      project,
      (p) => new URL(`/projects/${id}/${p}`, location.href).href,
      $<HTMLSelectElement>('backend').value as 'gpu' | 'cpu',
    );
    runtime = r;
    r.addEventListener('change', update);
    await r.load(factory);
    if (token !== serial) return;
    $('title').textContent = project.title;
    $('kind').textContent =
      project.status === 'adaptation'
        ? 'Separate engine adaptation'
        : project.status === 'study'
          ? 'Internal craft study'
          : project.status === 'draft'
            ? 'Story draft'
            : 'Finished piece';
    input('seek').max = String(project.duration);
    input('out').value = String(Math.min(10, project.duration));
    input('in').value = '0';
    input('rate').value = '1';
    $('loop').setAttribute('aria-pressed', 'false');
    $('mute').setAttribute('aria-pressed', 'false');
    $('mute').textContent = 'Mute';
    input('exposure').value = String(project.settings.exposure);
    input('density').value = String(project.settings.density);
    $('exposure-value').textContent = project.settings.exposure.toFixed(2);
    $('density-value').textContent = project.settings.density.toFixed(2);
    $<HTMLSelectElement>('camera').value = project.settings.camera;
    $<HTMLTextAreaElement>('story').value = story;
    $('saved').textContent = 'Saved in local source files.';
    dirty = false;
    $('cues').replaceChildren();
    for (const cue of project.cues) {
      const button = document.createElement('button');
      button.textContent = cue.name;
      button.style.flex = String(cue.end - cue.start);
      button.dataset.id = cue.id;
      button.title = `${cue.name} · ${fmt(cue.start)}`;
      button.onclick = () => r.seek(cue.start);
      $('cues').append(button);
    }
    $('parameters').replaceChildren();
    for (const [name, p] of Object.entries(project.parameters ?? {})) {
      const label = document.createElement('label');
      label.textContent = p.label;
      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(p.min);
      range.max = String(p.max);
      range.step = String(p.step);
      range.value = String(p.value);
      range.setAttribute('aria-label', p.label);
      range.oninput = () => {
        if (r.playing) {
          r.inputs.add(r.time, name, Number(range.value));
          status(
            'Live input recorded for this preview session. Pause to edit the saved base value.',
          );
        } else {
          r.inputs.clear(name);
          r.project.parameters![name].value = Number(range.value);
          changed();
        }
        r.seek(r.time);
      };
      $('parameters').append(label, range);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('nav button'))
      button.classList.toggle('active', button.dataset.id === id);
    $('save').removeAttribute('disabled');
    r.seek(keepTime);
    status(r.error || 'Ready.', !!r.error);
    $('wave').setAttribute('d', '');
    void r.score
      .waveform()
      .then((values) => {
        if (runtime !== r) return;
        const peak = Math.max(...values, 0.00001);
        $('wave').setAttribute(
          'd',
          values
            .map(
              (v, i) => `M${(i / values.length) * 1000} ${20 - (v / peak) * 17}v${(v / peak) * 34}`,
            )
            .join(''),
        );
      })
      .catch(() => {
        if (runtime === r) status('Scene ready. Audio waveform could not be decoded.', true);
      });
  } catch (e) {
    if (token === serial) {
      runtime?.dispose();
      runtime = undefined;
      status(String(e), true);
    }
  }
}
for (const [id, entry] of Object.entries(entries)) {
  const button = document.createElement('button');
  button.dataset.id = id;
  button.textContent = entry.manifest.title;
  const small = document.createElement('small');
  small.textContent = entry.manifest.status;
  button.append(small);
  button.onclick = () => {
    if (dirty && !confirm('Discard unsaved story/settings changes?')) return;
    void select(id);
  };
  document.querySelector('nav')!.append(button);
}
$('play').onclick = () => {
  if (runtime?.playing) runtime.pause();
  else void runtime?.play();
};
$('silent').onclick = () => runtime?.playSilent();
$('back').onclick = () => runtime?.step(-1);
$('forward').onclick = () => runtime?.step(1);
input('seek').oninput = () => runtime?.seek(Number(input('seek').value));
$('mute').onclick = () => {
  if (!runtime) return;
  const muted = !runtime.score.element.muted;
  runtime.score.element.muted = muted;
  $('mute').setAttribute('aria-pressed', String(muted));
  $('mute').textContent = muted ? 'Unmute' : 'Mute';
};
$('rate').onchange = () => runtime?.setRate(Number(input('rate').value));
$('framing').onchange = () => {
  $('stage').classList.toggle('portrait', input('framing').value === 'portrait');
  runtime?.resize();
};
$('backend').onchange = () => {
  if (dirty) {
    status('Save changes before switching rendering backend.', true);
    input('backend').value = runtime?.renderer.backend ?? 'gpu';
    return;
  }
  void select(selected, runtime?.time ?? 0);
};
function artistic() {
  if (!runtime) return;
  const settings = {
    exposure: Number(input('exposure').value),
    density: Number(input('density').value),
    camera: input('camera').value,
  };
  runtime.setSettings(settings);
  $('exposure-value').textContent = settings.exposure.toFixed(2);
  $('density-value').textContent = settings.density.toFixed(2);
  changed();
}
$('exposure').oninput = artistic;
$('density').onchange = artistic;
$('camera').onchange = artistic;
$('story').oninput = changed;
function loop() {
  if (!runtime) return;
  try {
    runtime.setLoop(
      $('loop').getAttribute('aria-pressed') === 'true'
        ? [Number(input('in').value), Number(input('out').value)]
        : null,
    );
    status('Ready.');
  } catch (e) {
    status(String(e), true);
  }
}
$('loop').onclick = () => {
  $('loop').setAttribute('aria-pressed', String($('loop').getAttribute('aria-pressed') !== 'true'));
  loop();
};
$('in').onchange = loop;
$('out').onchange = loop;
$('mark-in').onclick = () => {
  input('in').value = (runtime?.time ?? 0).toFixed(2);
  loop();
};
$('mark-out').onclick = () => {
  input('out').value = (runtime?.time ?? 0).toFixed(2);
  loop();
};
$('save').onclick = async () => {
  if (!runtime) return;
  const r = runtime;
  try {
    $('save').setAttribute('disabled', '');
    const response = await fetch(`/api/projects/${r.project.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        story: $<HTMLTextAreaElement>('story').value,
        settings: r.project.settings,
        parameters: r.project.parameters,
      }),
    });
    if (!response.ok) throw Error(await response.text());
    dirty = false;
    $('saved').textContent = 'Saved to story.md and project.json.';
  } catch (e) {
    $('saved').textContent = `Save failed: ${String(e)}`;
  } finally {
    $('save').removeAttribute('disabled');
  }
};
async function audit(onlyCurrent = false) {
  runtime?.pause();
  $('audit').setAttribute('disabled', '');
  $('audit-current').setAttribute('disabled', '');
  try {
    const result = await runAudit(
      onlyCurrent && runtime ? { [runtime.project.id]: factories[runtime.project.id] } : factories,
      (t) => ($('audit-report').textContent = t),
    );
    $('audit-report').textContent = JSON.stringify(result, null, 2);
  } catch (e) {
    $('audit-report').textContent = JSON.stringify({ passed: false, error: String(e) });
  } finally {
    $('audit').removeAttribute('disabled');
    if (runtime) $('audit-current').removeAttribute('disabled');
  }
}
$('audit').onclick = () => void audit();
$('audit-current').onclick = () => void audit(true);
document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).matches('input,textarea,select,button')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    $('play').click();
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const direction = e.key === 'ArrowLeft' ? -1 : 1;
    if (e.shiftKey) {
      runtime?.pause();
      runtime?.seek(runtime.time + direction * 5);
    } else runtime?.step(direction);
  }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
const requested = new URLSearchParams(location.search).get('project');
const initial = requested && factories[requested] ? requested : Object.keys(factories)[0];
if (initial) void select(initial);
else {
  $('title').textContent = 'No projects yet';
  $('kind').textContent = 'Create a local project, then restart the studio.';
  $('stage').textContent = 'Your live scene will appear here.';
  $('stage').classList.add('empty');
  status('npm --prefix engine run new -- story-id "Story Title"');
  $('saved').textContent = 'No project selected.';
  for (const control of app.querySelectorAll<
    HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('button, input, select, textarea')) {
    if (control.id !== 'audit') control.disabled = true;
  }
}
