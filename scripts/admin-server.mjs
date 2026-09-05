import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT=process.cwd();
const PROJECTS_ROOT=path.join(ROOT,'src','projects');
const MEDIA_ROOT=path.join(ROOT,'public','media');
const CONFIG_PATH=path.join(ROOT,'config','research-areas.json');
const PUBLIC_CONFIG_PATH=path.join(ROOT,'public','research-areas.json');
const UI_PATH=path.join(ROOT,'admin','index.html');
const PORT=4310;
const SECTION_NAMES=['TITLE','AUTHOR','TEASER','AVATAR','FEATURED','START','END','STATUS','TYPE','PRACTICE','ROLE','CLIENT','STACK','URL','MEDIUM','RESEARCH','WITH','COLLABORATORS','MAIN LINK','ARTISTS INVOLVED','CURATED BY','CREDITS','PHOTO CREDITS','EXCERPT','DESCRIPTION','SHORT','CRITICAL TEXTS','PUBLICATIONS','COMMUNICATION','LINKS','MOMENTS','OUTPUTS','PARENT','WORKS'];

const send=(res,status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(body):body);};
const safe=(value='')=>String(value).replace(/[^a-zA-Z0-9._-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
const readBody=async(req,limit=1024*1024*250)=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('Payload too large');chunks.push(chunk);}return Buffer.concat(chunks);};
const jsonBody=async req=>JSON.parse((await readBody(req,1024*1024*5)).toString('utf8')||'{}');
const exists=async p=>{try{await fs.access(p);return true;}catch{return false;}};

function parseInfo(text=''){
  const result={};let current=null;
  for(const rawLine of String(text).replace(/\r/g,'').split('\n')){
    const match=rawLine.match(/^([A-Z][A-Z ]+):\s*(.*)$/);
    if(match&&SECTION_NAMES.includes(match[1])){current=match[1];result[current]=match[2]||'';continue;}
    if(current)result[current]+=`${result[current]?'\n':''}${rawLine}`;
  }
  return result;
}
function setSection(text,name,value){
  const lines=String(text||'').replace(/\r/g,'').split('\n');
  const start=lines.findIndex(line=>line.match(/^([A-Z][A-Z ]+):/)?.[1]===name);
  const block=[`${name}: ${String(value||'').split('\n')[0]||''}`,...String(value||'').split('\n').slice(1)];
  if(start<0){return `${text?.trimEnd()?text.trimEnd()+'\n\n':''}${block.join('\n')}\n`;}
  let end=start+1;while(end<lines.length&&!/^([A-Z][A-Z ]+):/.test(lines[end]))end++;
  lines.splice(start,end-start,...block);return lines.join('\n').replace(/\n{3,}/g,'\n\n').trimEnd()+'\n';
}

async function scanMedia(kind,slug){
  const root=path.join(MEDIA_ROOT,kind,slug);const out=[];
  async function walk(dir,rel=''){
    let entries=[];try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{return;}
    for(const entry of entries){const r=rel?`${rel}/${entry.name}`:entry.name,p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p,r);else out.push({name:entry.name,rel:r,url:`/media/${kind}/${slug}/${r.replaceAll('\\','/')}`});}
  }
  await walk(root);return out;
}
async function listProjects(){
  const result=[];
  for(const kind of ['artistic','external']){
    const root=path.join(PROJECTS_ROOT,kind);let entries=[];try{entries=await fs.readdir(root,{withFileTypes:true});}catch{}
    for(const e of entries.filter(e=>e.isDirectory()&&!e.name.startsWith('_'))){const infoPath=path.join(root,e.name,'info.txt');if(!(await exists(infoPath)))continue;const text=await fs.readFile(infoPath,'utf8'),data=parseInfo(text);result.push({kind,slug:e.name,title:data.TITLE||e.name,type:data.TYPE||'',research:(data.RESEARCH||'').split(/[,;\n]/).map(x=>x.trim()).filter(Boolean)});}
  }
  return result.sort((a,b)=>a.title.localeCompare(b.title));
}
const runNodeScript=script=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{cwd:ROOT,windowsHide:true});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('close',code=>code===0?resolve(output):reject(new Error(output||`${script} exited ${code}`)));});
async function runSync(){return await runNodeScript('scripts/sync-research-config.mjs');}
async function runImport(){const sync=await runSync();const imported=await runNodeScript('scripts/import-content.mjs');return `${sync}${imported}`;}
async function categories(){try{return JSON.parse(await fs.readFile(CONFIG_PATH,'utf8'));}catch{return[];}}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/'){return send(res,200,await fs.readFile(UI_PATH,'utf8'),'text/html; charset=utf-8');}
    if(req.method==='GET'&&url.pathname==='/api/projects')return send(res,200,await listProjects());
    if(req.method==='GET'&&url.pathname==='/api/categories')return send(res,200,await categories());
    if(req.method==='GET'&&url.pathname==='/api/project'){
      const kind=safe(url.searchParams.get('kind')),slug=safe(url.searchParams.get('slug'));if(!['artistic','external'].includes(kind)||!slug)return send(res,400,{error:'Invalid project'});
      const infoPath=path.join(PROJECTS_ROOT,kind,slug,'info.txt');const text=await fs.readFile(infoPath,'utf8');return send(res,200,{kind,slug,text,data:parseInfo(text),media:await scanMedia(kind,slug)});
    }
    if(req.method==='POST'&&url.pathname==='/api/project'){
      const body=await jsonBody(req),kind=safe(body.kind),slug=safe(body.slug);if(!['artistic','external'].includes(kind)||!slug)return send(res,400,{error:'Invalid project'});
      const dir=path.join(PROJECTS_ROOT,kind,slug);await fs.mkdir(dir,{recursive:true});const infoPath=path.join(dir,'info.txt');let text=await exists(infoPath)?await fs.readFile(infoPath,'utf8'):'';
      if(typeof body.text==='string')text=body.text;
      if(body.sections&&typeof body.sections==='object')for(const [name,value] of Object.entries(body.sections))if(SECTION_NAMES.includes(name))text=setSection(text,name,value);
      await fs.writeFile(infoPath,text.trimEnd()+'\n','utf8');await fs.mkdir(path.join(MEDIA_ROOT,kind,slug),{recursive:true});
      let imported='';if(body.import!==false)imported=await runImport();return send(res,200,{ok:true,imported,text});
    }
    if(req.method==='POST'&&url.pathname==='/api/create'){
      const body=await jsonBody(req),kind=['artistic','external'].includes(body.kind)?body.kind:'artistic',slug=safe(body.slug||body.title);if(!slug)return send(res,400,{error:'Slug required'});
      const dir=path.join(PROJECTS_ROOT,kind,slug);if(await exists(dir))return send(res,409,{error:'Project already exists'});await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(MEDIA_ROOT,kind,slug,'images'),{recursive:true});await fs.mkdir(path.join(MEDIA_ROOT,kind,slug,'videos'),{recursive:true});
      const text=`TITLE: ${body.title||slug}\nTYPE: ${kind==='external'?'website':'project'}\nSTART: \nEND: ongoing\nSTATUS: ongoing\nRESEARCH: \nMEDIUM: \nEXCERPT: \nDESCRIPTION: \n`;await fs.writeFile(path.join(dir,'info.txt'),text,'utf8');return send(res,200,{ok:true,kind,slug});
    }
    if(req.method==='POST'&&url.pathname==='/api/media'){
      const kind=safe(url.searchParams.get('kind')),slug=safe(url.searchParams.get('slug')),bucket=safe(url.searchParams.get('bucket')||'images'),name=safe(url.searchParams.get('name'));if(!['artistic','external'].includes(kind)||!slug||!name)return send(res,400,{error:'Invalid media target'});
      const allowed=new Set(['images','videos','video','root']);if(!allowed.has(bucket))return send(res,400,{error:'Invalid bucket'});const dir=bucket==='root'?path.join(MEDIA_ROOT,kind,slug):path.join(MEDIA_ROOT,kind,slug,bucket);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,name),await readBody(req));return send(res,200,{ok:true,name,bucket});
    }
    if(req.method==='DELETE'&&url.pathname==='/api/media'){
      const kind=safe(url.searchParams.get('kind')),slug=safe(url.searchParams.get('slug')),rel=String(url.searchParams.get('rel')||'').replaceAll('\\','/');if(!['artistic','external'].includes(kind)||!slug||rel.includes('..'))return send(res,400,{error:'Invalid media'});await fs.unlink(path.join(MEDIA_ROOT,kind,slug,...rel.split('/')));return send(res,200,{ok:true});
    }
    if(req.method==='POST'&&url.pathname==='/api/categories'){
      const body=await jsonBody(req);if(!Array.isArray(body.categories))return send(res,400,{error:'categories must be an array'});const clean=body.categories.map(item=>({key:safe(item.key).toLowerCase(),label:String(item.label||'').trim(),subtitle:String(item.subtitle||'').trim()})).filter(x=>x.key&&x.label);await fs.mkdir(path.dirname(CONFIG_PATH),{recursive:true});const text=JSON.stringify(clean,null,2)+'\n';await fs.writeFile(CONFIG_PATH,text,'utf8');await fs.writeFile(PUBLIC_CONFIG_PATH,text,'utf8');const synced=await runSync();return send(res,200,{ok:true,categories:clean,synced});
    }
    if(req.method==='POST'&&url.pathname==='/api/import')return send(res,200,{ok:true,output:await runImport()});
    send(res,404,{error:'Not found'});
  }catch(error){console.error(error);send(res,500,{error:error.message||String(error)});}
});
server.listen(PORT,'127.0.0.1',()=>console.log(`Portfolio admin → http://localhost:${PORT}`));
