import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const importer = path.join(ROOT, 'scripts', 'import-content.mjs');
const watchRoots = [path.join(ROOT, 'src', 'projects'), path.join(ROOT, 'public', 'media')];
let timer = null;
let importing = false;
let rerun = false;

const runImport = () => {
  if (importing) { rerun = true; return; }
  importing = true;
  const child = spawn(process.execPath, [importer], { stdio: 'inherit', cwd: ROOT });
  child.on('exit', () => {
    importing = false;
    if (rerun) { rerun = false; runImport(); }
  });
};

const scheduleImport = () => {
  clearTimeout(timer);
  timer = setTimeout(runImport, 180);
};

runImport();

const astro = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['astro', 'dev'], {
  stdio: 'inherit',
  cwd: ROOT,
  shell: false
});

for (const root of watchRoots) {
  try {
    watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const normalized = String(filename).replaceAll('\\', '/');
      if (normalized.includes('/_source/') || normalized.startsWith('_source/')) return;
      scheduleImport();
    });
  } catch (error) {
    console.warn(`Could not watch ${root}: ${error.message}`);
  }
}

const shutdown = () => { astro.kill('SIGTERM'); process.exit(); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
astro.on('exit', (code) => process.exit(code ?? 0));
