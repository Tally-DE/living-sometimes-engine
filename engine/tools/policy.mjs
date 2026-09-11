import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './common.mjs';
const forbidden = /\.(mp4|webm|mov|avi|mkv|m3u8)$/i;
export async function walk(root) {
  let out = [];
  for (const e of await fs.readdir(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
export async function verifyArchive(root, hashes, { required = false } = {}) {
  const missing = [],
    changed = [];
  let verified = 0;
  for (const [name, expected] of Object.entries(hashes)) {
    try {
      const actual = crypto
        .createHash('sha256')
        .update(await fs.readFile(path.join(root, name)))
        .digest('hex');
      if (actual === expected) verified++;
      else changed.push(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing.push(name);
    }
  }
  const recorded = Object.keys(hashes).length;
  if (!recorded) throw Error('Archive hash manifest is empty.');
  if (!required && recorded > 0 && missing.length === recorded)
    return { status: 'not-present', verified: 0, recorded };
  if (missing.length || changed.length)
    throw Error(
      [
        ...missing.map((name) => `Existing HTML missing: ${name}`),
        ...changed.map((name) => `Existing HTML changed: ${name}`),
      ].join('\n'),
    );
  return { status: 'verified', verified, recorded };
}

export async function policy({ outputs = false, requireArchive = false } = {}) {
  const errors = [];
  for (const dir of [
    'core',
    'modules',
    'studio',
    'projects',
    'templates',
    ...(outputs ? ['dist'] : []),
  ]) {
    const folder = path.join(ROOT, dir);
    try {
      for (const file of await walk(folder)) {
        if (forbidden.test(file)) errors.push(`Forbidden output: ${file}`);
        if (/\.(ts|js|html|json)$/i.test(file)) {
          const source = await fs.readFile(file, 'utf8');
          if (
            /<video\b|\bMediaRecorder\b|\.captureStream\s*\(|video\/(?:mp4|webm)|\bVideoEncoder\b|new\s+(?:\w+\.)?(?:VideoFrame|VideoTexture)\b|createElement\s*\(\s*['"]video['"]|\bffmpeg\b/i.test(
              source,
            )
          )
            errors.push(`Video-producing or playback capability: ${file}`);
        }
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  let hashes;
  try {
    hashes = JSON.parse(
      await fs.readFile(path.join(ROOT, 'references/original-html-hashes.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (errors.length) throw Error(errors.join('\n'));
  const marker = path.join(ROOT, '.local/archive-required');
  let previouslyPresent = false;
  try {
    await fs.access(marker);
    previouslyPresent = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!hashes && (requireArchive || previouslyPresent))
    throw Error('Original archive hash manifest is required.');
  const archive = hashes
    ? await verifyArchive(path.join(ROOT, '..'), hashes, {
        required: requireArchive || previouslyPresent,
      })
    : { status: 'not-configured', verified: 0, recorded: 0 };
  // Preserve strict protection in a workspace after its archive has been verified.
  // The marker is local state, so an engine-only clone can report archive absence honestly.
  if (archive.status === 'verified' && !previouslyPresent) {
    await fs.mkdir(path.dirname(marker), { recursive: true });
    await fs.writeFile(
      marker,
      'This workspace contains the original HTML archive. Its full preservation is required.\n',
    );
  }
  return {
    protectedHtmls: archive.verified,
    recordedHtmls: archive.recorded,
    archiveStatus: archive.status,
    videoFiles: 0,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'tools/policy.mjs'))
  console.log(
    await policy({ outputs: true, requireArchive: process.argv.includes('--require-archive') }),
  );
