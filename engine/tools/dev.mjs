import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { context, build } from 'esbuild';
import { ROOT, registry, MIME, safeId } from './common.mjs';
import { pathToFileURL } from 'node:url';
await registry();
await fs.mkdir(path.join(ROOT, '.cache'), { recursive: true });
await build({
  entryPoints: [path.join(ROOT, 'core/project.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(ROOT, '.cache/validator.mjs'),
});
const { validateProject } = await import(
  pathToFileURL(path.join(ROOT, '.cache/validator.mjs')).href
);
const ctx = await context({
  entryPoints: [path.join(ROOT, 'studio/main.ts')],
  bundle: true,
  format: 'esm',
  outfile: path.join(ROOT, '.cache/studio.js'),
  sourcemap: true,
  target: 'es2022',
});
await ctx.watch();
await ctx.rebuild();
const port = Number(process.env.ENGINE_PORT || 4177);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`),
      hostname = req.headers.host;
    if (hostname !== `127.0.0.1:${port}` && hostname !== `localhost:${port}`) {
      res.writeHead(403);
      res.end('Local access only.');
      return;
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/projects/')) {
      if (![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) {
        res.writeHead(403);
        res.end('Local origin required.');
        return;
      }
      const id = safeId(url.pathname.split('/')[3]),
        folder = path.join(ROOT, 'projects', id),
        current = JSON.parse(await fs.readFile(path.join(folder, 'project.json'), 'utf8'));
      let text = '';
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 200000) throw Error('Edit is too large.');
      }
      const edit = JSON.parse(text);
      if (typeof edit.story !== 'string' || !edit.settings)
        throw Error('Story and settings are required.');
      const updated = validateProject({
        ...current,
        settings: edit.settings,
        parameters: edit.parameters ?? current.parameters,
      });
      await fs.writeFile(
        path.join(folder, 'project.json'),
        JSON.stringify(updated, null, 2) + '\n',
      );
      await fs.writeFile(path.join(folder, 'story.md'), edit.story);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ saved: true, id }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\//, ''),
      file =
        relative === ''
          ? path.join(ROOT, 'studio/index.html')
          : relative === 'studio.js'
            ? path.join(ROOT, '.cache/studio.js')
            : relative === 'style.css'
              ? path.join(ROOT, 'studio/style.css')
              : path.resolve(ROOT, relative);
    const safe = path.relative(ROOT, file);
    if (
      safe.startsWith('..') ||
      path.isAbsolute(safe) ||
      (safe.split(path.sep).some((p) => p.startsWith('.')) &&
        file !== path.join(ROOT, '.cache/studio.js'))
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (
      !['studio', 'projects', 'dist'].includes(safe.split(path.sep)[0]) &&
      file !== path.join(ROOT, '.cache/studio.js')
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const data = await fs.readFile(file);
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { 'Content-Range': `bytes */${data.length}` });
        res.end();
        return;
      }
      const start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2])),
        end = match[1]
          ? match[2]
            ? Math.min(Number(match[2]), data.length - 1)
            : data.length - 1
          : data.length - 1;
      if (start > end || start >= data.length) {
        res.writeHead(416, { 'Content-Range': `bytes */${data.length}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${data.length}`,
        'Content-Length': end - start + 1,
      });
      res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
      return;
    }
    res.setHeader('Content-Length', data.length);
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 400, { 'Content-Type': 'text/plain' });
    res.end(e.message);
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Living Sometimes Studio: http://127.0.0.1:${port}`),
);
async function close() {
  server.close();
  await ctx.dispose();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
