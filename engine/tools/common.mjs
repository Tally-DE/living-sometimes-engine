import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.md': 'text/plain; charset=utf-8',
};
export async function projects() {
  const dirs = await fs.readdir(path.join(ROOT, 'projects'), { withFileTypes: true });
  const result = [];
  for (const d of dirs)
    if (d.isDirectory()) {
      const file = path.join(ROOT, 'projects', d.name, 'project.json');
      try {
        const p = JSON.parse(await fs.readFile(file, 'utf8'));
        if (p.id !== d.name) throw Error('Project folder/id mismatch.');
        result.push(p);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
  return result.sort((a, b) =>
    a.id === 'signal' ? -1 : b.id === 'signal' ? 1 : a.title.localeCompare(b.title),
  );
}
export async function registry() {
  const all = await projects();
  await fs.mkdir(path.join(ROOT, '.cache'), { recursive: true });
  await fs.writeFile(
    path.join(ROOT, '.cache/registry.ts'),
    `import type { PieceFactory } from '../core/runtime';\nimport type { Project } from '../core/project';\nexport const entries: Record<string, { load: () => Promise<{ default: PieceFactory }>; manifest: Project }> = {\n${all.map((p) => `${JSON.stringify(p.id)}: { load: () => import(${JSON.stringify('../projects/' + p.id + '/' + p.entry)}), manifest: ${JSON.stringify(p)} }`).join(',\n')}\n};\n`,
  );
  return all;
}
export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
export function safeId(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw Error('Invalid project id.');
  return id;
}
