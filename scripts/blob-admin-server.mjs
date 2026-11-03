import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const UI_PATH=path.join(ROOT,'admin','blob.html');
const DATA_PATH=path.join(ROOT,'config','blob.json');
const PORT=4311;
const MEDIA_ROOT=path.join(ROOT,'public','media','blob');
const MEDIA_TYPES={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.svg':'image/svg+xml','.mp4':'video/mp4','.webm':'video/webm'};
const MAX_UPLOAD=80*1024*1024;
const BIBLIO_PATH=path.join(ROOT,'config','bibliography.json');

const send=(res,status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(body):body);};
const readBody=async req=>{const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((n,c)=>n+c.length,0)>MAX_UPLOAD)throw new Error('File too large (80 MB max)');}return Buffer.concat(chunks).toString('utf8');};
const cleanString=value=>String(value??'').trim();
const cleanThemes=value=>Array.isArray(value)?value.map(cleanString).filter(Boolean):String(value??'').split(',').map(cleanString).filter(Boolean);
const readPosts=async()=>{try{const parsed=JSON.parse(await fs.readFile(DATA_PATH,'utf8'));return Array.isArray(parsed)?parsed:[];}catch{return[];}};
const readRefs=async()=>{try{const data=JSON.parse(await fs.readFile(BIBLIO_PATH,'utf8'));return Array.isArray(data)?data:[];}catch{return[];}};
const writeRefs=async refs=>fs.writeFile(BIBLIO_PATH,JSON.stringify(refs,null,2)+'\n','utf8');
const writePosts=async posts=>fs.writeFile(DATA_PATH,JSON.stringify(posts,null,2)+'\n','utf8');

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/')return send(res,200,await fs.readFile(UI_PATH,'utf8'),'text/html; charset=utf-8');
    if(req.method==='GET'&&url.pathname==='/api/media'){
      await fs.mkdir(MEDIA_ROOT,{recursive:true});const names=await fs.readdir(MEDIA_ROOT);return send(res,200,names.filter(n=>MEDIA_TYPES[path.extname(n).toLowerCase()]).map(name=>({name,url:'/media/blob/'+encodeURIComponent(name),type:MEDIA_TYPES[path.extname(name).toLowerCase()]})).sort((a,b)=>a.name.localeCompare(b.name)));
    }
    if(req.method==='GET'&&url.pathname.startsWith('/media/blob/')){
      const name=decodeURIComponent(url.pathname.slice('/media/blob/'.length));if(name!==path.basename(name)||name==='.'||name==='..')return send(res,400,{error:'Invalid filename'});
      const type=MEDIA_TYPES[path.extname(name).toLowerCase()];if(!type)return send(res,415,{error:'Unsupported media'});
      const bytes=await fs.readFile(path.join(MEDIA_ROOT,name));res.writeHead(200,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(bytes);
    }
    if(req.method==='POST'&&url.pathname==='/api/media'){
      const original=cleanString(url.searchParams.get('name'));const ext=path.extname(original).toLowerCase();if(!MEDIA_TYPES[ext]||ext==='.svg')return send(res,415,{error:'Choose JPG, PNG, WebP, GIF, AVIF, MP4 or WebM'});
      const bytes=Buffer.from(await readBody(req));if(!bytes.length)return send(res,400,{error:'Empty file'});
      const signature=bytes.subarray(0,16);const imageOk=ext==='.jpg'||ext==='.jpeg'?signature[0]===255&&signature[1]===216:ext==='.png'?signature.subarray(0,4).equals(Buffer.from([137,80,78,71])):ext==='.gif'?signature.toString('ascii',0,3)==='GIF':ext==='.webp'?signature.toString('ascii',0,4)==='RIFF'&&signature.toString('ascii',8,12)==='WEBP':ext==='.avif'?signature.toString('ascii',4,8)==='ftyp':ext==='.mp4'?signature.toString('ascii',4,8)==='ftyp':ext==='.webm'?signature.subarray(0,4).equals(Buffer.from([26,69,223,163])):false;
      if(!imageOk)return send(res,415,{error:'File content does not match its extension'});
      await fs.mkdir(MEDIA_ROOT,{recursive:true});const base=path.basename(original,ext).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,60)||'media';const name=Date.now().toString(36)+'-'+base+ext;
      await fs.writeFile(path.join(MEDIA_ROOT,name),bytes,{flag:'wx'});return send(res,200,{name,url:'/media/blob/'+encodeURIComponent(name),type:MEDIA_TYPES[ext]});
    }
    if(req.method==='GET'&&url.pathname==='/api/biblio')return send(res,200,await readRefs());
    if(req.method==='POST'&&url.pathname==='/api/biblio'){
      const raw=JSON.parse(await readBody(req)||'{}');
      const item={id:cleanString(raw.id),title:cleanString(raw.title),creator:cleanString(raw.creator),year:cleanString(raw.year),type:cleanString(raw.type)||'web',url:cleanString(raw.url),description:cleanString(raw.description),tags:cleanThemes(raw.tags)};
      if(!item.id||!item.title)return send(res,400,{error:'ID and title required'});
      if(item.url&&!/^https?:\\/\\//i.test(item.url))return send(res,400,{error:'URL must start with http:// or https://'});
      const refs=await readRefs(),idx=refs.findIndex(r=>r.id===item.id);
      if(idx>=0)refs[idx]=item;else refs.push(item);
      await writeRefs(refs);return send(res,200,refs);
    }
    if(req.method==='DELETE'&&url.pathname==='/api/biblio'){
      const id=cleanString(url.searchParams.get('id'));
      const refs=(await readRefs()).filter(r=>r.id!==id);await writeRefs(refs);
      const posts=await readPosts();for(const p of posts)p.references=(p.references||[]).filter(r=>r!==id);
      await writePosts(posts);return send(res,200,refs);
    }
    if(req.method==='GET'&&url.pathname==='/api/blob')return send(res,200,await readPosts());
    if(req.method==='POST'&&url.pathname==='/api/blob'){
      const raw=JSON.parse(await readBody(req)||'{}');
      const post={id:cleanString(raw.id),title:cleanString(raw.title),date:cleanString(raw.date),themes:cleanThemes(raw.themes),body:cleanString(raw.body),media:Array.isArray(raw.media)?raw.media.filter(x=>typeof x==='string'&&/^\/media\/blob\/[a-zA-Z0-9_.%\-]+$/.test(x)):[],cover:typeof raw.cover==='string'&&/^\/media\/blob\/[a-zA-Z0-9_.%\-]+$/.test(raw.cover)?raw.cover:'',references:Array.isArray(raw.references)?[...new Set(raw.references.map(cleanString).filter(Boolean))]:[]};
      if(!post.id||!post.title)return send(res,400,{error:'Title and id are required'});
      const posts=await readPosts(),index=posts.findIndex(item=>item.id===post.id);
      if(index>=0)posts[index]=post;else posts.push(post);
      posts.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
      await writePosts(posts);return send(res,200,posts);
    }
    if(req.method==='DELETE'&&url.pathname==='/api/blob'){
      const id=cleanString(url.searchParams.get('id'));const posts=(await readPosts()).filter(item=>item.id!==id);await writePosts(posts);return send(res,200,posts);
    }
    return send(res,404,{error:'Not found'});
  }catch(error){console.error(error);return send(res,500,{error:error.message||'Server error'});}
});
server.listen(PORT,()=>console.log(`BLOB admin: http://localhost:${PORT}`));
