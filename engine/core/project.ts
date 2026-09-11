export const ENGINE_VERSION = '1.0.0';
export interface Cue {
  id: string;
  name: string;
  start: number;
  end: number;
}
export interface Project {
  schemaVersion: 1;
  engineVersion: string;
  id: string;
  title: string;
  duration: number;
  seed: number;
  profile: 'classic' | 'cinematic' | 'type';
  description: string;
  entry: string;
  status: 'adaptation' | 'study' | 'draft' | 'finished';
  audio?: { src: string; offset?: number };
  assets?: Record<string, string>;
  cues: Cue[];
  settings: { exposure: number; density: number; camera: string };
  parameters?: Record<
    string,
    { value: number; min: number; max: number; step: number; label: string }
  >;
}
export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw Error('Project must be an object.');
  const p = value as Project;
  if (p.schemaVersion !== 1 || p.engineVersion !== ENGINE_VERSION)
    throw Error('Project/engine version mismatch. Run an explicit shared upgrade.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)) throw Error('Invalid project id.');
  if (typeof p.title !== 'string' || !p.title.trim() || typeof p.description !== 'string')
    throw Error('Project needs a title and description.');
  if (
    !Number.isFinite(p.duration) ||
    p.duration <= 0 ||
    p.duration > 86400 ||
    !Number.isSafeInteger(p.seed)
  )
    throw Error('Invalid duration or seed.');
  if (
    !['classic', 'cinematic', 'type'].includes(p.profile) ||
    !['adaptation', 'study', 'draft', 'finished'].includes(p.status)
  )
    throw Error('Invalid profile or status.');
  const safePath = (s: unknown) =>
    typeof s === 'string' &&
    !/[:\\?#]|(^|\/)\.\.(\/|$)|\.(mp4|webm|mov|avi|mkv|m3u8)$/i.test(s) &&
    !s.startsWith('/');
  if (!safePath(p.entry) || (!p.entry.endsWith('.ts') && !p.entry.endsWith('.js')))
    throw Error('Invalid scene entry.');
  if (p.audio && (!safePath(p.audio.src) || !/^.*\.(m4a|mp3|wav|ogg|flac)$/i.test(p.audio.src)))
    throw Error('Only local audio assets are accepted.');
  if (p.audio && (p.audio.offset ?? 0) !== 0)
    throw Error(
      'Score must start at timeline zero. Include any leading silence in the audio asset.',
    );
  for (const s of Object.values(p.assets ?? {}))
    if (!safePath(s)) throw Error('Invalid asset path.');
  if (!Array.isArray(p.cues) || new Set(p.cues.map((c) => c.id)).size !== p.cues.length)
    throw Error('Cue ids must be unique.');
  for (const c of p.cues)
    if (
      typeof c.id !== 'string' ||
      typeof c.name !== 'string' ||
      ![c.start, c.end].every(Number.isFinite) ||
      c.start < 0 ||
      c.end <= c.start ||
      c.end > p.duration
    )
      throw Error('Invalid cue interval.');
  if (
    !p.settings ||
    ![p.settings.exposure, p.settings.density].every(Number.isFinite) ||
    p.settings.exposure < 0.25 ||
    p.settings.exposure > 3 ||
    p.settings.density < 0.5 ||
    p.settings.density > 1.5 ||
    !['authored', 'wide', 'close'].includes(p.settings.camera)
  )
    throw Error('Invalid artistic settings.');
  for (const q of Object.values(p.parameters ?? {}))
    if (
      ![q.value, q.min, q.max, q.step].every(Number.isFinite) ||
      q.min > q.max ||
      q.value < q.min ||
      q.value > q.max ||
      q.step <= 0 ||
      typeof q.label !== 'string'
    )
      throw Error('Invalid parameter.');
  return structuredClone(p);
}
