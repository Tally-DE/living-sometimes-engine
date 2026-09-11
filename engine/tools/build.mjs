import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { ROOT, projects, registrySource, MIME, escapeHtml, safeId } from './common.mjs';
import { policy } from './policy.mjs';
/** @param {{only?: string, out?: string}} options */
export async function buildAll({ only, out = path.join(ROOT, 'dist') } = {}) {
  await policy();
  const all = await projects(),
    selected = only ? all.filter((p) => p.id === safeId(only)) : all;
  if (only && !selected.length) throw Error('Unknown project.');
  const target = path.resolve(out),
    relative = path.relative(ROOT, target);
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    relative.split(path.sep)[0] !== 'dist'
  )
    throw Error('Build output must stay inside engine/dist.');
  await fs.rm(target, { recursive: true, force: true });
  const site = path.join(target, 'site'),
    standalone = path.join(target, 'standalone');
  for (const d of [site, standalone]) await fs.mkdir(d, { recursive: true });
  const bundle = async (projects) =>
    await build({
      entryPoints: [path.join(ROOT, 'studio/player.ts')],
      bundle: true,
      format: 'iife',
      write: false,
      minify: true,
      target: 'es2022',
      metafile: true,
      plugins: [
        {
          name: 'isolated-project-registry',
          setup(b) {
            b.onResolve({ filter: /\.cache\/registry$/ }, () => ({
              path: 'project-registry',
              namespace: 'isolated',
            }));
            b.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({
              contents: registrySource(projects),
              loader: 'ts',
              resolveDir: path.join(ROOT, '.cache'),
            }));
          },
        },
      ],
    });
  const threeLicense = await fs.readFile(path.join(ROOT, 'node_modules/three/LICENSE'), 'utf8');
  let engineLicense = '';
  try {
    engineLicense = await fs.readFile(path.join(ROOT, '..', 'LICENSE'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const notices = `Bundled engine licenses. Project content may have separate terms.\n\n${engineLicense}\n\nthree.js\n${threeLicense}`;
  const wrap = (result) =>
    `/*\n${notices.replace(/\*\//g, '* /')}\n*/\n${result.outputFiles[0].text}`;
  const css = await fs.readFile(path.join(ROOT, 'studio/player.css'), 'utf8');
  await fs.writeFile(path.join(site, 'player.js'), wrap(await bundle([])));
  await fs.writeFile(path.join(site, 'player.css'), css);
  await fs.writeFile(path.join(site, 'LICENSES.txt'), notices);
  for (const p of selected) {
    const result = await bundle([p]),
      js = wrap(result);
    // Make accidental imports of another story fail before a release can expose it.
    for (const file of Object.keys(result.metafile.inputs)) {
      const relative = path.relative(path.join(ROOT, 'projects'), path.resolve(file));
      if (
        !relative.startsWith('..') &&
        !path.isAbsolute(relative) &&
        relative.split(path.sep).length > 1 &&
        relative.split(path.sep)[0] !== p.id
      )
        throw Error(
          `Project ${p.id} imports another project's source: ${relative}. Move reusable code to a shared module.`,
        );
    }
    await fs.writeFile(path.join(site, p.id + '.js'), js);
    const assets = {};
    for (const rel of new Set([p.audio?.src, ...Object.values(p.assets ?? {})].filter(Boolean))) {
      const source = path.join(ROOT, 'projects', p.id, rel),
        bytes = await fs.readFile(source),
        type = MIME[path.extname(rel)] ?? 'application/octet-stream';
      assets[rel] = `data:${type};base64,${bytes.toString('base64')}`;
      const dest = path.join(site, 'projects', p.id, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, bytes);
    }
    const body = (data) =>
      `<div id="player"><div id="stage"></div><button id="begin">Play with sound</button><div id="controls"><button id="play">Play</button><button id="silent">Play silently</button><button id="mute" aria-pressed="false">Mute</button><input id="seek" type="range" min="0" max="${p.duration}" step="0.01" value="0" aria-label="Timeline"><output id="time">0:00</output></div><p id="status" role="status"></p></div><script id="project-data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
    const head = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(p.title)}</title>`;
    await fs.writeFile(
      path.join(standalone, p.id + '.html'),
      head +
        `<style>${css}</style>` +
        body({ project: p, assets }) +
        `<script>${js.replace(/<\/script/gi, '<\\/script')}</script></html>`,
    );
    await fs.writeFile(
      path.join(site, p.id + '.html'),
      head +
        '<link rel="stylesheet" href="player.css">' +
        body({ project: p, base: `projects/${p.id}/` }) +
        `<script src="${p.id}.js"></script></html>`,
    );
  }
  await fs.writeFile(
    path.join(site, 'index.html'),
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Living Sometimes — engine previews</title><style>body{background:#080a09;color:#bbc5be;font:16px monospace;max-width:700px;margin:12vh auto;padding:24px}a{color:inherit;line-height:2.5}small{color:#7e8981}code{overflow-wrap:anywhere}</style><h1>Engine previews</h1><p>Live project previews.</p>' +
      (selected.length
        ? ''
        : '<p>No projects yet. Create one locally, then build again:</p><code>npm --prefix engine run new -- story-id "Story Title"</code>') +
      selected
        .map(
          (p) =>
            `<div><a href="${p.id}.html">${escapeHtml(p.title)}</a> <small>${p.status}</small></div>`,
        )
        .join(''),
  );
  const manifest = {
    engineVersion: '1.1.0',
    output: 'live-rendered-code',
    projects: selected.map((p) => ({
      id: p.id,
      status: p.status,
      standalone: `standalone/${p.id}.html`,
      site: `site/${p.id}.html`,
    })),
  };
  await fs.writeFile(path.join(out, 'release.json'), JSON.stringify(manifest, null, 2));
  await policy({ outputs: true });
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'tools/build.mjs'))
  console.log(await buildAll({ only: process.argv[2] }));
