import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const SOURCE=path.join(ROOT,'src/pages/otherwise-hyperarchive.astro');
const UI=path.join(ROOT,'admin/hyperarchive.html');
const PORT=4312;
const HOST='127.0.0.1';
const tags='h1|h2|h3|p|li|small|figcaption';
const rx=()=>new RegExp('<('+tags+')(\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>','gi');
const send=(res,status,data,type='application/json; charset=utf-8')=>{
  res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(type.startsWith('application/json')?JSON.stringify(data):data);
};
const blocks=source=>[...source.matchAll(rx())].map((m,index)=>({index,tag:m[1],html:m[3],start:m.index,end:m.index+m[0].length,original:m[0]}));
const escapeHtml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function sanitize(input){
  let html=String(input??'');
  if(html.length>30000)throw new Error('Text too long');
  // Permit only inline editorial markup. No scripts, styles, attributes or embedded media.
  html=html.replace(/<!--[\s\S]*?-->/g,'');
  html=html.replace(/<(script|style|iframe|svg|object|math|template)[^>]*>[\s\S]*?<\/\1>/gi,'');
  html=html.replace(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi,(raw,name)=>{
    const tag=name.toLowerCase(),closing=/^<\//.test(raw);
    if(tag==='br')return closing?'':'<br />';
    if(['em','i','strong','b'].includes(tag))return closing?`</${tag}>`:`<${tag}>`;
    if(tag==='a'){
      if(closing)return '</a>';
      const href=raw.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(Boolean)||'';
      if(!/^(https?:\/\/|mailto:|#|\/)/i.test(href))return '<a>';
      return `<a href="${escapeHtml(href).replaceAll('"','&quot;')}" target="_blank" rel="noopener noreferrer">`;
    }
    return '';
  });
  return html;
}
const readBody=async req=>{
  let body='',size=0;
  for await(const part of req){size+=part.length;if(size>100000)throw new Error('Request too large');body+=part;}
  return JSON.parse(body||'{}');
};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/')return send(res,200,await fs.readFile(UI,'utf8'),'text/html; charset=utf-8');
    if(req.method==='GET'&&url.pathname==='/api/blocks'){
      const source=await fs.readFile(SOURCE,'utf8');
      return send(res,200,{blocks:blocks(source).map(({index,tag,html,original})=>({index,tag,html,original}))});
    }
    if(req.method==='POST'&&url.pathname==='/api/blocks'){
      const {index,html,original}=await readBody(req);
      if(!Number.isInteger(index)||typeof original!=='string'||typeof html!=='string')return send(res,400,{error:'Invalid edit'});
      const source=await fs.readFile(SOURCE,'utf8'),block=blocks(source)[index];
      if(!block||block.original!==original)return send(res,409,{error:'The source changed. Reload the editor before saving.'});
      const next=sanitize(html);
      const updated=source.slice(0,block.start)+block.original.replace(block.html,next)+source.slice(block.end);
      const backup=SOURCE+'.hyperarchive-backup';
      await fs.copyFile(SOURCE,backup);
      await fs.writeFile(SOURCE,updated,'utf8');
      return send(res,200,{ok:true,backup:path.basename(backup)});
    }
    return send(res,404,{error:'Not found'});
  }catch(error){console.error(error);send(res,500,{error:error.message||'Server error'});}
});
server.listen(PORT,HOST,()=>console.log(`Hyperarchive editor: http://localhost:${PORT}`));
