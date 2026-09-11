import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { validateProject } from '../core/project';
import { createProject } from '../tools/new-project.mjs';
import { policy, verifyArchive, walk } from '../tools/policy.mjs';
import { ROOT, projects, MIME } from '../tools/common.mjs';
test('all native projects validate and import shared modules without private engines', async () => {
  const all = await projects();
  for (const p of all) {
    validateProject(p);
    const code = await fs.readFile(path.join(ROOT, 'projects', p.id, p.entry), 'utf8');
    assert.doesNotMatch(code, /class\s+\w*Renderer|requestAnimationFrame|new\s+Audio\(|<iframe/);
    assert.match(code, /\.\.\/\.\.\/(?:core|modules)\//);
  }
});
test('project generator creates a valid buildable scene without touching engine source', async () => {
  const dirs = ['core', 'modules'],
    files = (await Promise.all(dirs.map((d) => walk(path.join(ROOT, d))))).flat();
  const before = await Promise.all(
    files.map(async (f) =>
      createHash('sha256')
        .update(await fs.readFile(f))
        .digest('hex'),
    ),
  );
  const base = path.join(ROOT, 'projects'),
    id = 'engine-generator-test';
  let created = false;
  try {
    await createProject(id, 'Generator verification', base);
    created = true;
    const p = validateProject(
      JSON.parse(await fs.readFile(path.join(base, id, 'project.json'), 'utf8')),
    );
    const result = await build({
      entryPoints: [path.join(base, id, p.entry)],
      bundle: true,
      format: 'esm',
      write: false,
    });
    assert.ok(result.outputFiles[0].contents.length > 1000);
    assert.equal(p.status, 'draft');
  } finally {
    if (created) {
      const target = path.resolve(base, id);
      assert.equal(path.dirname(target), path.resolve(ROOT, 'projects'));
      await fs.rm(target, { recursive: true });
    }
  }
  const after = await Promise.all(
    files.map(async (f) =>
      createHash('sha256')
        .update(await fs.readFile(f))
        .digest('hex'),
    ),
  );
  assert.deepEqual(after, before);
});
test('release policy preserves all existing HTMLs and excludes video delivery', async () => {
  const result = await policy({ outputs: true });
  assert.equal(result.videoFiles, 0);
  assert.ok(['verified', 'not-present', 'not-configured'].includes(result.archiveStatus));
  assert.equal(
    result.protectedHtmls,
    result.archiveStatus === 'verified' ? result.recordedHtmls : 0,
  );
  if (result.archiveStatus === 'not-configured') assert.equal(result.recordedHtmls, 0);
});
test('an engine-only checkout reports absent originals rather than claiming verification', async () => {
  await fs.mkdir(path.join(ROOT, '.cache'), { recursive: true });
  const folder = await fs.mkdtemp(path.join(ROOT, '.cache/archive-check-'));
  try {
    const hashes = { 'original.html': createHash('sha256').update('original').digest('hex') };
    assert.deepEqual(await verifyArchive(folder, hashes), {
      status: 'not-present',
      verified: 0,
      recorded: 1,
    });
    await assert.rejects(
      verifyArchive(folder, hashes, { required: true }),
      /Existing HTML missing/,
    );
    await assert.rejects(verifyArchive(folder, {}), /Archive hash manifest is empty/);
  } finally {
    assert.equal(path.dirname(path.resolve(folder)), path.resolve(ROOT, '.cache'));
    await fs.rm(folder, { recursive: true });
  }
});
test('a present archive requires every original and rejects changed bytes', async () => {
  await fs.mkdir(path.join(ROOT, '.cache'), { recursive: true });
  const folder = await fs.mkdtemp(path.join(ROOT, '.cache/archive-check-'));
  try {
    const hashes = Object.fromEntries(
      ['one.html', 'two.html'].map((name) => [
        name,
        createHash('sha256').update(name).digest('hex'),
      ]),
    );
    await fs.writeFile(path.join(folder, 'one.html'), 'one.html');
    await assert.rejects(verifyArchive(folder, hashes), /Existing HTML missing: two.html/);
    await fs.writeFile(path.join(folder, 'two.html'), 'two.html');
    assert.deepEqual(await verifyArchive(folder, hashes), {
      status: 'verified',
      verified: 2,
      recorded: 2,
    });
    await fs.writeFile(path.join(folder, 'one.html'), 'changed');
    await assert.rejects(verifyArchive(folder, hashes), /Existing HTML changed: one.html/);
  } finally {
    assert.equal(path.dirname(path.resolve(folder)), path.resolve(ROOT, '.cache'));
    await fs.rm(folder, { recursive: true });
  }
});
test('every native project packages live code and exact local asset bytes', async () => {
  const all = await projects();
  const release = JSON.parse(await fs.readFile(path.join(ROOT, 'dist/release.json'), 'utf8'));
  assert.deepEqual(
    release.projects.map((p: { id: string }) => p.id),
    all.map((p: { id: string }) => p.id),
  );
  const player = await fs.readFile(path.join(ROOT, 'dist/site/player.js'), 'utf8');
  assert.ok(player.length > 1000);
  assert.doesNotMatch(player, /<video\b|MediaRecorder|captureStream\(/i);
  assert.match(
    await fs.readFile(path.join(ROOT, 'dist/site/LICENSES.txt'), 'utf8'),
    /Permission is hereby granted/,
  );
  const index = await fs.readFile(path.join(ROOT, 'dist/site/index.html'), 'utf8');
  if (!all.length) assert.match(index, /No projects yet/);
  for (const project of all) {
    const html = await fs.readFile(
      path.join(ROOT, 'dist/standalone', project.id + '.html'),
      'utf8',
    );
    assert.doesNotMatch(html, /<video\b|<iframe\b|MediaRecorder|captureStream\(/i);
    const match = html.match(
      /<script id="project-data" type="application\/json">([\s\S]*?)<\/script>/,
    );
    assert.ok(match);
    const packaged = JSON.parse(match[1]);
    assert.equal(packaged.project.id, project.id);
    for (const rel of new Set(
      [project.audio?.src, ...Object.values(project.assets ?? {})].filter(Boolean) as string[],
    )) {
      const expected = await fs.readFile(path.join(ROOT, 'projects', project.id, rel));
      const uri = packaged.assets[rel];
      assert.ok(
        uri.startsWith(
          `data:${MIME[path.extname(rel) as keyof typeof MIME] ?? 'application/octet-stream'};base64,`,
        ),
      );
      assert.deepEqual(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64'), expected);
      assert.deepEqual(
        await fs.readFile(path.join(ROOT, 'dist/site/projects', project.id, rel)),
        expected,
      );
    }
  }
});
