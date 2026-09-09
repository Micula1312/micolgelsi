import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MEDIA_ROOT = path.join(ROOT, 'public', 'media');
const CONTENT_ROOT = path.join(ROOT, 'src', 'content');
const COLLECTIONS = ['projects', 'exhibitions', 'works', 'external'];
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov']);
const ALL_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT]);

const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

async function listFiles(dir, extensions = ALL_EXT) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true }))
      .filter(entry => entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()))
      .map(entry => entry.name)
      .sort(natural);
  } catch {
    return [];
  }
}

async function findContentFile(slug) {
  for (const collection of COLLECTIONS) {
    const file = path.join(CONTENT_ROOT, collection, `${slug}.md`);
    try {
      await fs.access(file);
      return file;
    } catch {}
  }
  return null;
}

function yamlList(key, values) {
  if (!values.length) return `${key}:\n  []`;
  return `${key}:\n${values.map(value => `  - ${JSON.stringify(value)}`).join('\n')}`;
}

function setFrontmatterList(frontmatter, key, values) {
  const block = yamlList(key, values);
  const pattern = new RegExp(`^${key}:\\s*\\n(?:(?:  - .*|  \\[\\])(?:\\n|$))*`, 'm');
  if (pattern.test(frontmatter)) return frontmatter.replace(pattern, `${block}\n`);

  const insertBefore = /^(?:criticalTexts|publications|communication|links|moments):/m;
  if (insertBefore.test(frontmatter)) return frontmatter.replace(insertBefore, `${block}\n$&`);
  return `${frontmatter.replace(/\s+$/, '')}\n${block}\n`;
}

async function collectMedia(sourceKind, slug) {
  const root = path.join(MEDIA_ROOT, sourceKind, slug);
  const base = `/media/${sourceKind}/${slug}`;

  const unified = await listFiles(path.join(root, 'media'));
  if (unified.length) {
    const media = unified.map(name => `${base}/media/${name}`);
    return {
      media,
      gallery: media.filter(src => IMAGE_EXT.has(path.extname(src).toLowerCase())),
      videos: media.filter(src => VIDEO_EXT.has(path.extname(src).toLowerCase()))
    };
  }

  const images = (await listFiles(path.join(root, 'images'), IMAGE_EXT))
    .filter(name => !/^avatar\./i.test(name) && !/^cover\./i.test(name))
    .map(name => `${base}/images/${name}`);
  const video = (await listFiles(path.join(root, 'video'), VIDEO_EXT)).map(name => `${base}/video/${name}`);
  const videos = (await listFiles(path.join(root, 'videos'), VIDEO_EXT)).map(name => `${base}/videos/${name}`);
  const moving = [...new Set([...video, ...videos])];

  return { media: [...images, ...moving], gallery: images, videos: moving };
}

async function syncGroup(sourceKind) {
  const group = path.join(MEDIA_ROOT, sourceKind);
  let entries = [];
  try {
    entries = await fs.readdir(group, { withFileTypes: true });
  } catch {
    return 0;
  }

  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const slug = entry.name;
    const contentFile = await findContentFile(slug);
    if (!contentFile) continue;

    const { media, gallery, videos } = await collectMedia(sourceKind, slug);
    let source = await fs.readFile(contentFile, 'utf8');
    const match = source.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) continue;

    let frontmatter = match[1];
    frontmatter = setFrontmatterList(frontmatter, 'media', media);
    // Backward compatibility while the templates/admin are migrated.
    frontmatter = setFrontmatterList(frontmatter, 'gallery', gallery);
    frontmatter = setFrontmatterList(frontmatter, 'videos', videos);

    source = source.replace(match[0], `---\n${frontmatter.replace(/\s+$/, '')}\n---`);
    await fs.writeFile(contentFile, source, 'utf8');
    console.log(`✓ unified media: ${sourceKind}/${slug} (${media.length})`);
    count++;
  }
  return count;
}

const artistic = await syncGroup('artistic');
const external = await syncGroup('external');
console.log(`\nSynced unified media gallery for ${artistic + external} content items.`);
