import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PROJECTS_ROOT = path.join(ROOT, 'public', 'media');
const APPLY = process.argv.includes('--apply');
const LEGACY_BUCKETS = ['images', 'video', 'videos'];
const TARGET_BUCKET = 'media';

const exists = async (filePath) => {
  try { await fs.access(filePath); return true; } catch { return false; }
};

const uniqueTarget = async (targetDir, name) => {
  const parsed = path.parse(name);
  let candidate = path.join(targetDir, name);
  let index = 2;
  while (await exists(candidate)) {
    candidate = path.join(targetDir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
};

const listDirs = async (dir) => {
  try {
    return (await fs.readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
};

const migrateProject = async (projectDir, label) => {
  const targetDir = path.join(projectDir, TARGET_BUCKET);
  const moves = [];

  for (const bucket of LEGACY_BUCKETS) {
    const sourceDir = path.join(projectDir, bucket);
    if (!(await exists(sourceDir))) continue;

    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const source = path.join(sourceDir, entry.name);
      const target = await uniqueTarget(targetDir, entry.name);
      moves.push({ source, target, bucket });
    }
  }

  if (!moves.length) return 0;

  console.log(`\n${label}`);
  for (const move of moves) {
    console.log(`  ${path.basename(move.source)}  [${move.bucket}]  ->  media/${path.basename(move.target)}`);
  }

  if (APPLY) {
    await fs.mkdir(targetDir, { recursive: true });
    for (const move of moves) await fs.rename(move.source, move.target);

    for (const bucket of LEGACY_BUCKETS) {
      const sourceDir = path.join(projectDir, bucket);
      try {
        const remaining = await fs.readdir(sourceDir);
        if (!remaining.length) await fs.rmdir(sourceDir);
      } catch {}
    }
  }

  return moves.length;
};

let total = 0;
for (const sourceKind of await listDirs(PROJECTS_ROOT)) {
  const sourceRoot = path.join(PROJECTS_ROOT, sourceKind);
  for (const slug of await listDirs(sourceRoot)) {
    total += await migrateProject(path.join(sourceRoot, slug), `${sourceKind}/${slug}`);
  }
}

console.log(`\n${APPLY ? 'Migrated' : 'Dry run:'} ${total} media file${total === 1 ? '' : 's'}.`);
if (!APPLY && total) {
  console.log('Nothing was changed. Run again with --apply when the list looks correct:');
  console.log('  node scripts/migrate-media-folders.mjs --apply');
}
