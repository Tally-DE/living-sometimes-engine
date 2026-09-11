import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, safeId } from './common.mjs';
export async function createProject(id, title, base = path.join(ROOT, 'projects')) {
  safeId(id);
  const folder = path.join(base, id);
  await fs.mkdir(folder);
  await fs.mkdir(path.join(folder, 'assets'));
  const template = JSON.parse(
    await fs.readFile(path.join(ROOT, 'templates/blank/project.json'), 'utf8'),
  );
  template.id = id;
  template.title =
    title ||
    id
      .split('-')
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join(' ');
  await fs.writeFile(path.join(folder, 'project.json'), JSON.stringify(template, null, 2) + '\n');
  await fs.copyFile(path.join(ROOT, 'templates/blank/scene.ts'), path.join(folder, 'scene.ts'));
  await fs.writeFile(
    path.join(folder, 'story.md'),
    `# ${template.title}\n\nDescribe the story, cast, setting, recurring behaviour, emotional turn, sound and ending.\n\nFollow the quality references and constraints in your workspace's AGENTS.md.\n\nEvery frame is live code. Use shared engine modules; no private renderer or player.\n\nCredit request: please represent Living Sometimes Engine within the piece, using its name, a symbol or another creative acknowledgement, and credit it in the announcement post. Include https://github.com/Tally-DE/living-sometimes-engine in the post where possible. Placement and treatment are yours. This is a community request, not an additional MIT licence condition.\n`,
  );
  return folder;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'tools/new-project.mjs')) {
  const [id, ...title] = process.argv.slice(2);
  if (!id) throw Error('Usage: npm run new -- story-id Story title');
  console.log(await createProject(id, title.join(' ')));
}
