import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const SOURCE_ROOT=path.join(ROOT,'src','projects');
const MEDIA_ROOT=path.join(ROOT,'public','media');
const CONTENT_ROOT=path.join(ROOT,'src','content');
const VALID_RESEARCH=new Set(['urban-wilderness','generative-archives','interspecies','technology-digitalization','emotional-geographies','eco-feminism','pleasure-activism']);
const SECTION_NAMES=new Set(['TITLE','AUTHOR','TEASER','AVATAR','FEATURED','START','END','STATUS','TYPE','MEDIUM','RESEARCH','WITH','COLLABORATORS','MAIN LINK','ARTISTS INVOLVED','CURATED BY','CREDITS','PHOTO CREDITS','EXCERPT','DESCRIPTION','SHORT','LINKS','MOMENTS','OUTPUTS','PARENT','WORKS']);
const IMAGE_EXT=new Set(['.jpg','.jpeg','.png','.webp','.gif','.avif']);
const VIDEO_EXT=new Set(['.mp4','.webm','.mov']);
const splitList=(value='')=>value.split(/[,;\n]/).map(v=>v.trim()).filter(Boolean);
const yamlString=(value='')=>JSON.stringify(String(value));
const normalizeUrl=(value='')=>{const raw=String(value).trim();if(!raw)return'';if(/^(?:https?:\/\/|mailto:|tel:|\/|#)/i.test(raw))return raw;return`https://${raw}`;};
const parseBoolean=(value='')=>/^(?:1|true|yes|y|featured|main)$/i.test(String(value).trim());

const parseInfo=text=>{const result={};let current=null;for(const rawLine of text.replace(/\r/g,'').split('\n')){const match=rawLine.match(/^([A-Z][A-Z ]+):\s*(.*)$/);if(match&&SECTION_NAMES.has(match[1])){current=match[1];result[current]=match[2]?match[2].trim():'';continue;}if(current)result[current]+=`${result[current]?'\n':''}${rawLine}`;}return result;};
const parseMoments=(raw='')=>raw.trim().split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean).map(chunk=>{const lines=chunk.split('\n').map(x=>x.trim()).filter(Boolean);if(!lines.length)return null;const moment={date:lines.shift()};if(lines.length)moment.title=lines.shift();for(const line of lines){const m=line.match(/^([a-zA-Z ]+):\s*(.*)$/);if(m){const key=m[1].trim().toLowerCase();if(['type','location','media','href','url','curated by','artists involved','credits','photo credits','collaborators'].includes(key)){const target=key==='url'?'href':key.replaceAll(' ','_');moment[target]=key==='url'||key==='href'?normalizeUrl(m[2]):m[2].trim();}}else if(!moment.location)moment.location=line;}if(!moment.title)moment.title=moment.date;return moment;}).filter(Boolean);
const inferCollection=(data,sourceKind='artistic')=>{if(sourceKind==='external')return'external';const t=(data.TYPE||'project').trim().toLowerCase();if(t==='exhibition')return'exhibitions';if(t==='work'||data.PARENT?.trim())return'works';return'projects';};
const detectAsset=async(dir,names)=>{for(const name of names){try{await fs.access(path.join(dir,name));return name;}catch{}}return null;};
const listMedia=async(dir,exts)=>{try{return(await fs.readdir(dir,{withFileTypes:true})).filter(e=>e.isFile()&&exts.has(path.extname(e.name).toLowerCase())).map(e=>e.name).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));}catch{return[];}};
const removeStale=async(slug,keep)=>{for(const collection of ['projects','exhibitions','works','external']){if(collection===keep)continue;try{await fs.unlink(path.join(CONTENT_ROOT,collection,`${slug}.md`));console.log(`  ↳ removed stale src/content/${collection}/${slug}.md`);}catch{}}};
const resolveMomentMedia=async(moment,mediaDir,baseUrl)=>{if(!moment.media)return moment;const raw=moment.media.replace(/^\.\//,'').replace(/^\/+|\/+$/g,'');for(const dir of [path.join(mediaDir,'moments',raw),path.join(mediaDir,raw)]){try{if((await fs.stat(dir)).isDirectory()){const names=await listMedia(dir,IMAGE_EXT);if(names.length){const rel=path.relative(mediaDir,dir).split(path.sep).join('/');moment.gallery=names.map(name=>`${baseUrl}/${rel}/${name}`);delete moment.media;return moment;}}}catch{}}if(!moment.media.startsWith('/'))moment.media=`${baseUrl}/${raw}`;return moment;};

const resolveAvatar=async(mediaDir,baseUrl,explicit='')=>{
  const raw=String(explicit||'').trim().replace(/^\.\//,'').replace(/^\/+|\/+$/g,'');
  if(raw){
    if(/^https?:\/\//i.test(raw)||raw.startsWith('/'))return raw;
    try{await fs.access(path.join(mediaDir,raw));return`${baseUrl}/${raw.split(path.sep).join('/')}`;}catch{}
  }
  const names=['avatar.mp4','avatar.webm','avatar.mov','avatar.webp','avatar.gif','avatar.png','avatar.jpg','avatar.jpeg','avatar.avif'];
  const rootAvatar=await detectAsset(mediaDir,names);if(rootAvatar)return`${baseUrl}/${rootAvatar}`;
  const imageAvatar=await detectAsset(path.join(mediaDir,'images'),names);if(imageAvatar)return`${baseUrl}/images/${imageAvatar}`;
  return'';
};

const generateMarkdown=async({slug,sourceKind,data})=>{
  const mediaDir=path.join(MEDIA_ROOT,sourceKind,slug),collection=inferCollection(data,sourceKind),title=(data.TITLE||slug.replaceAll('-',' ')).trim(),author=(data.AUTHOR||'').trim(),teaser=(data.TEASER||'').trim(),mainLink=normalizeUrl(data['MAIN LINK']||''),featured=parseBoolean(data.FEATURED),displayType=(data.TYPE||'').trim(),start=(data.START||'').trim(),end=(data.END||'').trim(),rawStatus=(data.STATUS||'').trim().toLowerCase(),status=(rawStatus==='ongoing'||end.toLowerCase()==='ongoing')?'ongoing':'completed',year=(start||end).match(/\d{4}/)?.[0]||'',medium=splitList(data.MEDIUM),collaborators=splitList(data.COLLABORATORS||data.WITH).filter(x=>x!=='—'&&x!=='-'),artistsInvolved=splitList(data['ARTISTS INVOLVED']),curatedBy=splitList(data['CURATED BY']),credits=splitList(data.CREDITS),photoCredits=splitList(data['PHOTO CREDITS']),research=splitList(data.RESEARCH).map(x=>x.toLowerCase().replace(/\s*&\s*/g,'-').replace(/\s+/g,'-')),researchAreas=research.filter(x=>VALID_RESEARCH.has(x));
  const invalid=research.filter(x=>!VALID_RESEARCH.has(x));if(invalid.length)console.warn(`⚠ ${sourceKind}/${slug}: ignored unknown research keys: ${invalid.join(', ')}`);
  const baseUrl=`/media/${sourceKind}/${slug}`;
  const avatar=await resolveAvatar(mediaDir,baseUrl,data.AVATAR);
  const coverName=await detectAsset(mediaDir,['cover.webp','cover.jpg','cover.jpeg','cover.png','cover.gif']);
  const gallery=(await listMedia(path.join(mediaDir,'images'),IMAGE_EXT)).filter(n=>!/^avatar\./i.test(n)).map(n=>`${baseUrl}/images/${n}`);
  const videoSingular=await listMedia(path.join(mediaDir,'video'),VIDEO_EXT);
  const videoPlural=await listMedia(path.join(mediaDir,'videos'),VIDEO_EXT);
  const videos=[...new Set([...videoSingular.map(n=>`${baseUrl}/video/${n}`),...videoPlural.map(n=>`${baseUrl}/videos/${n}`)])];
  const links=splitList(data.LINKS).map(normalizeUrl);
  const moments=await Promise.all(parseMoments((data.OUTPUTS||'').trim()?data.OUTPUTS:data.MOMENTS).map(m=>resolveMomentMedia(m,mediaDir,baseUrl)));
  const excerpt=(data.EXCERPT||data.SHORT||'').trim();
  const description=(data.DESCRIPTION||(!data.EXCERPT?.trim()?data.SHORT:'')||'').trim();
  const front=['---',`title: ${yamlString(title)}`];
  if(author)front.push(`author: ${yamlString(author)}`);if(teaser)front.push(`teaser: ${yamlString(teaser)}`);if(mainLink)front.push(`mainLink: ${yamlString(mainLink)}`);if(featured)front.push('featured: true');
  if(collection==='external')front.push(`kind: ${yamlString(displayType||'external project')}`);else{front.push(`type: ${collection==='exhibitions'?'exhibition':collection==='works'?'work':'project'}`);if(displayType)front.push(`displayType: ${yamlString(displayType)}`);}
  if(year)front.push(`year: ${yamlString(year)}`);if(start)front.push(`startDate: ${yamlString(start)}`);if(end&&end.toLowerCase()!=='ongoing')front.push(`endDate: ${yamlString(end)}`);if(rawStatus||end.toLowerCase()==='ongoing')front.push(`status: ${status}`);if(excerpt)front.push(`summary: ${yamlString(excerpt.replace(/\n+/g,' '))}`);
  if(collection!=='external'){front.push('medium:');medium.length?medium.forEach(x=>front.push(`  - ${yamlString(x)}`)):front.push('  []');}
  front.push('researchAreas:');researchAreas.length?researchAreas.forEach(x=>front.push(`  - ${x}`)):front.push('  []');
  for(const[key,values]of[['collaborators',collaborators],['artistsInvolved',artistsInvolved],['curatedBy',curatedBy],['credits',credits],['photoCredits',photoCredits]]){front.push(`${key}:`);values.length?values.forEach(x=>front.push(`  - ${yamlString(x)}`)):front.push('  []');}
  if(avatar)front.push(`avatar: ${yamlString(avatar)}`);if(coverName&&collection!=='external')front.push(`cover: ${yamlString(`${baseUrl}/${coverName}`)}`);
  if(collection!=='external'){for(const[key,values]of[['gallery',gallery],['videos',videos],['links',links]]){front.push(`${key}:`);values.length?values.forEach(x=>front.push(`  - ${yamlString(x)}`)):front.push('  []');}}
  front.push('moments:');if(moments.length){for(const m of moments){front.push(`  - date: ${yamlString(m.date)}`,`    title: ${yamlString(m.title)}`);if(m.type)front.push(`    type: ${yamlString(m.type)}`);if(m.location)front.push(`    location: ${yamlString(m.location)}`);if(m.media)front.push(`    media: ${yamlString(m.media)}`);if(m.gallery?.length){front.push('    gallery:');m.gallery.forEach(src=>front.push(`      - ${yamlString(src)}`));}if(m.href)front.push(`    href: ${yamlString(m.href)}`);if(m.curated_by)front.push(`    curatedBy: ${yamlString(m.curated_by)}`);if(m.artists_involved)front.push(`    artistsInvolved: ${yamlString(m.artists_involved)}`);if(m.credits)front.push(`    credits: ${yamlString(m.credits)}`);if(m.photo_credits)front.push(`    photoCredits: ${yamlString(m.photo_credits)}`);if(m.collaborators)front.push(`    collaborators: ${yamlString(m.collaborators)}`);}}else front.push('  []');
  if(collection==='works'&&data.PARENT?.trim()){const raw=data.PARENT.trim(),parts=raw.includes(':')?raw.split(':',2):['project',raw],kind=parts[0].trim().toLowerCase()==='exhibition'?'exhibition':'project';front.push('parent:',`  type: ${kind}`,`  slug: ${yamlString(parts[1].trim())}`);}
  if(['projects','exhibitions'].includes(collection)){const works=splitList(data.WORKS);front.push('works:');works.length?works.forEach(x=>front.push(`  - ${yamlString(x)}`)):front.push('  []');}
  front.push('---','');if(description)front.push(description);front.push('');return{collection,markdown:front.join('\n')};
};

const importGroup=async sourceKind=>{const groupRoot=path.join(SOURCE_ROOT,sourceKind);let entries=[];try{entries=await fs.readdir(groupRoot,{withFileTypes:true});}catch{await fs.mkdir(groupRoot,{recursive:true});return 0;}let count=0;for(const entry of entries){if(!entry.isDirectory()||entry.name.startsWith('_'))continue;const slug=entry.name;let text;try{text=await fs.readFile(path.join(groupRoot,slug,'info.txt'),'utf8');}catch{continue;}const parsed=parseInfo(text),{collection,markdown}=await generateMarkdown({slug,sourceKind,data:parsed});await removeStale(slug,collection);const outDir=path.join(CONTENT_ROOT,collection);await fs.mkdir(outDir,{recursive:true});await fs.writeFile(path.join(outDir,`${slug}.md`),markdown,'utf8');console.log(`✓ src/projects/${sourceKind}/${slug}/info.txt → src/content/${collection}/${slug}.md`);count++;}return count;};
const run=async()=>{await fs.mkdir(SOURCE_ROOT,{recursive:true});await fs.mkdir(MEDIA_ROOT,{recursive:true});const artistic=await importGroup('artistic'),external=await importGroup('external');console.log(`\nImported ${artistic+external} info.txt files (${artistic} artistic, ${external} external).`);};
run().catch(error=>{console.error(error);process.exit(1);});
