import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'src', 'projects');
const MEDIA_ROOT = path.join(ROOT, 'public', 'media');
const CONTENT_ROOT = path.join(ROOT, 'src', 'content');

const VALID_RESEARCH = new Set([
  'urban-wilderness',
  'generative-archives',
  'interspecies',
  'technology-digitalization',
  'emotional-geographies'
]);

const SECTION_NAMES = new Set([
  'TITLE','START','END','STATUS','TYPE','MEDIUM','RESEARCH','WITH','SHORT','LINKS','MOMENTS'
]);

const splitList = (value = '') => value.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
const yamlString = (value = '') => JSON.stringify(String(value));

const parseInfo = (text) => {
  const result = {};
  let current = null;
  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const match = rawLine.match(/^([A-Z]+):\s*(.*)$/);
    if (match && SECTION_NAMES.has(match[1])) {
      current = match[1];
      result[current] = match[2] ? match[2].trim() : '';
      continue;
    }
    if (!current) continue;
    result[current] += `${result[current] ? '\n' : ''}${rawLine}`;
  }
  return result;
};

const parseMoments = (raw = '') => {
  const chunks = raw.trim().split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  return chunks.map((chunk) => {
    const lines = chunk.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!lines.length) return null;
    const moment = { date: lines.shift() };
    if (lines.length) moment.title = lines.shift();
    for (const line of lines) {
      const m = line.match(/^([a-zA-Z]+):\s*(.*)$/);
      if (m) {
        const key = m[1].toLowerCase();
        if (['location','media','href'].includes(key)) moment[key] = m[2].trim();
      } else if (!moment.location) moment.location = line;
    }
    if (!moment.title) moment.title = moment.date;
    return moment;
  }).filter(Boolean);
};

const inferCollection = (type = '') => {
  const t = type.trim().toLowerCase();
  if (t === 'exhibition') return 'exhibitions';
  if (t === 'work' || t === 'installation' || t === 'performance') return 'works';
  if (t === 'external' || t === 'website' || t === 'interface' || t === 'commission') return 'external';
  return 'projects';
};

const detectAsset = async (dir, names) => {
  for (const name of names) {
    try { await fs.access(path.join(dir, name)); return name; } catch {}
  }
  return null;
};

const generateMarkdown = async (slug, sourceDir, data) => {
  const mediaDir = path.join(MEDIA_ROOT, slug);
  const collection = inferCollection(data.TYPE || 'project');
  const title = (data.TITLE || slug.replaceAll('-', ' ')).trim();
  const start = (data.START || '').trim();
  const end = (data.END || '').trim();
  const status = ((data.STATUS || '').trim().toLowerCase() === 'ongoing' || end.toLowerCase() === 'ongoing') ? 'ongoing' : 'completed';
  const yearMatch = (start || end).match(/\d{4}/);
  const year = yearMatch?.[0] || new Date().getFullYear();
  const medium = splitList(data.MEDIUM);
  const collaborators = splitList(data.WITH).filter((x) => x !== '—' && x !== '-');
  const research = splitList(data.RESEARCH).map((x) => x.toLowerCase().replace(/\s*&\s*/g, '-').replace(/\s+/g, '-'));
  const researchAreas = research.filter((x) => VALID_RESEARCH.has(x));
  const invalidResearch = research.filter((x) => !VALID_RESEARCH.has(x));
  if (invalidResearch.length) console.warn(`⚠ ${slug}: ignored unknown research keys: ${invalidResearch.join(', ')}`);

  const avatarName = await detectAsset(mediaDir, ['avatar.webp','avatar.gif','avatar.webm','avatar.png','avatar.jpg','avatar.jpeg']);
  const coverName = await detectAsset(mediaDir, ['cover.webp','cover.jpg','cover.jpeg','cover.png','cover.gif']);
  const baseUrl = `/media/${slug}`;
  const moments = parseMoments(data.MOMENTS).map((moment) => {
    if (moment.media && !moment.media.startsWith('/')) moment.media = `${baseUrl}/${moment.media.replace(/^\.\//,'')}`;
    return moment;
  });

  const front = ['---', `title: ${yamlString(title)}`];
  if (collection === 'external') front.push(`kind: ${yamlString((data.TYPE || 'external project').trim())}`);
  else front.push(`type: ${collection === 'exhibitions' ? 'exhibition' : collection === 'works' ? 'work' : 'project'}`);
  front.push(`year: ${yamlString(year)}`);
  if (start) front.push(`startDate: ${yamlString(start)}`);
  if (end && end.toLowerCase() !== 'ongoing') front.push(`endDate: ${yamlString(end)}`);
  front.push(`status: ${status}`);
  if (data.SHORT?.trim()) front.push(`summary: ${yamlString(data.SHORT.trim().replace(/\n+/g, ' '))}`);
  if (collection !== 'external') {
    front.push('medium:');
    if (medium.length) medium.forEach((x) => front.push(`  - ${yamlString(x)}`)); else front.push('  []');
  }
  front.push('researchAreas:');
  if (researchAreas.length) researchAreas.forEach((x) => front.push(`  - ${x}`)); else front.push('  []');
  front.push('collaborators:');
  if (collaborators.length) collaborators.forEach((x) => front.push(`  - ${yamlString(x)}`)); else front.push('  []');
  if (avatarName) front.push(`avatar: ${yamlString(`${baseUrl}/${avatarName}`)}`);
  if (coverName && collection !== 'external') front.push(`cover: ${yamlString(`${baseUrl}/${coverName}`)}`);
  front.push('moments:');
  if (moments.length) {
    for (const m of moments) {
      front.push(`  - date: ${yamlString(m.date)}`);
      front.push(`    title: ${yamlString(m.title)}`);
      if (m.location) front.push(`    location: ${yamlString(m.location)}`);
      if (m.media) front.push(`    media: ${yamlString(m.media)}`);
      if (m.href) front.push(`    href: ${yamlString(m.href)}`);
    }
  } else front.push('  []');
  if (collection === 'projects' || collection === 'exhibitions') front.push('works: []');
  front.push('---', '');
  if (data.SHORT?.trim()) front.push(data.SHORT.trim());
  if (data.LINKS?.trim()) {
    front.push('', '## Links', '');
    splitList(data.LINKS).forEach((link) => front.push(`- ${link}`));
  }
  front.push('');
  return { collection, markdown: front.join('\n') };
};

const run = async () => {
  let entries = [];
  try { entries = await fs.readdir(SOURCE_ROOT, { withFileTypes: true }); }
  catch {
    await fs.mkdir(SOURCE_ROOT, { recursive: true });
    console.log(`Created ${SOURCE_ROOT}. Add <slug>/info.txt folders there, then run again.`);
    return;
  }

  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const slug = entry.name;
    const sourceDir = path.join(SOURCE_ROOT, slug);
    const infoPath = path.join(sourceDir, 'info.txt');
    let text;
    try { text = await fs.readFile(infoPath, 'utf8'); } catch { continue; }
    const parsed = parseInfo(text);
    const { collection, markdown } = await generateMarkdown(slug, sourceDir, parsed);
    const outDir = path.join(CONTENT_ROOT, collection);
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `${slug}.md`);
    await fs.writeFile(outPath, markdown, 'utf8');
    console.log(`✓ src/projects/${slug}/info.txt → src/content/${collection}/${slug}.md`);
    count++;
  }
  console.log(`\nImported ${count} info.txt file${count === 1 ? '' : 's'}.`);
};

run().catch((error) => { console.error(error); process.exit(1); });
