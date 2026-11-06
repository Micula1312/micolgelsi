import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const SOURCE=path.join(ROOT,'src/pages/otherwise-hyperarchive.astro');
const UI=path.join(ROOT,'admin/hyperarchive.html');
const PORT=4312;
const HOST='127.0.0.1';
const tags='h1|h2|h3|h4|h5|h6|p|li|small|figcaption|span|label|button|summary|blockquote|time|dt|dd';
const rx=()=>new RegExp('<('+tags+')(\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>','gi');
const send=(res,status,data,type='application/json; charset=utf-8')=>{
  res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(type.startsWith('application/json')?JSON.stringify(data):data);
};
const blocks=source=>{
  const ignored=[...source.matchAll(/<(script|style|svg|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi)].map(m=>[m.index,m.index+m[0].length]);
  return [...source.matchAll(rx())].filter(m=>!ignored.some(([a,b])=>m.index>=a&&m.index<b))
    .map((m,index)=>({index,tag:m[1],html:m[3],start:m.index,end:m.index+m[0].length,original:m[0]}));
};
const bibliography=source=>{
 const section=source.match(/<section\\b[^>]*\\bid=["']references["'][^>]*>[\\s\\S]*?<ol>([\\s\\S]*?)<\\/ol>/i);
 if(!section)return null;
 const items=[...section[1].matchAll(/<li\\b[^>]*>([\\s\\S]*?)<\\/li>/gi)].map(m=>m[1].replace(/<\\/a>/gi,'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim());
 return {original:section[1],items};
};
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
      const sections=[...source.matchAll(/<section\\b[^>]*\\bid=["']([^"']+)["'][^>]*>/gi)].map(m=>({start:m.index,id:m[1]}));
      const entries=blocks(source);
      let section='INTRO / HEADER',subsection='';
      const cleaned=html=>html.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim();
      const result=entries.map(({index,tag,html,original})=>{
        const kind=tag.toLowerCase(),title=cleaned(html);
        const enclosing=[...sections].reverse().find(s=>s.start<=entries[index].start);
        if(enclosing?.id) section=enclosing.id.toUpperCase().replace(/-/g,' / ');
        else if(kind==='h2'){section=title||'UNTITLED SECTION';subsection='';}
        if(kind==='h3')subsection=title||'UNTITLED SUBSECTION';
        const cls=original.match(/^<[^>]+\\bclass=["']([^"']+)/i)?.[1]||'';
        return {index,tag,html,original,section,subsection,component:cls.split(/\\s+/).slice(0,2).join(' ')||kind};
      });
      return send(res,200,{blocks:result});
    }
    if(req.method==='GET'&&url.pathname==='/api/bibliography'){
      const source=await fs.readFile(SOURCE,'utf8'),data=bibliography(source);
      if(!data)return send(res,404,{error:'Bibliography not found'});
      return send(res,200,data);
    }
    if(req.method==='POST'&&url.pathname==='/api/bibliography'){
      const {original,items}=await readBody(req);
      if(typeof original!=='string'||!Array.isArray(items)||items.length>200||items.some(x=>typeof x!=='string'||x.length>2000))
        return send(res,400,{error:'Invalid bibliography'});
      const source=await fs.readFile(SOURCE,'utf8'),data=bibliography(source);
      if(!data||data.original!==original)return send(res,409,{error:'Bibliography changed. Reload before saving.'});
      const escaped=items.map(x=>x.trim()).filter(Boolean).map(x=>'<li>'+escapeHtml(x)+'</li>').join('');
      const section=source.match(/<section\\b[^>]*\\bid=["']references["'][^>]*>[\\s\\S]*?<ol>([\\s\\S]*?)<\\/ol>/i);
      const start=section.index+section[0].indexOf(data.original);
      const updated=source.slice(0,start)+escaped+source.slice(start+data.original.length);
      if(updated!==source){await fs.copyFile(SOURCE,SOURCE+'.hyperarchive-backup');await fs.writeFile(SOURCE,updated,'utf8');}
      return send(res,200,{ok:true,count:items.filter(x=>x.trim()).length});
    }
    if(req.method==='POST'&&url.pathname==='/api/blocks/structure'){
      const {action,index,target,original}=await readBody(req);
      if(!['duplicate','move'].includes(action)||!Number.isInteger(index)||typeof original!=='string')
        return send(res,400,{error:'Invalid structural edit'});
      const source=await fs.readFile(SOURCE,'utf8'),current=blocks(source),item=current[index];
      if(!item||item.original!==original)return send(res,409,{error:'Page changed. Reload the editor before restructuring.'});
      let updated;
      if(action==='duplicate'){
        // Only clone complete standalone text elements, never a wrapper with nested editable blocks.
        if(current.some(b=>b.index!==index&&b.start>item.start&&b.end<item.end))
          return send(res,400,{error:'This block contains nested blocks and cannot be duplicated safely.'});
        updated=source.slice(0,item.end)+'\\n'+item.original+source.slice(item.end);
      }else{
        if(!Number.isInteger(target)||!current[target]||target===index)
          return send(res,400,{error:'Invalid destination'});
        const dest=current[target],low=Math.min(index,target),high=Math.max(index,target);
        const group=current.slice(low,high+1);
        // Moving is allowed only across directly adjacent sibling elements.
        if(group.some((b,i)=>i&&source.slice(group[i-1].end,b.start).trim()!==''))
          return send(res,400,{error:'These blocks belong to different containers. Move within a contiguous group of sibling blocks.'});
        if(group.some(b=>current.some(other=>other!==b&&other.start>b.start&&other.end<b.end)))
          return send(res,400,{error:'Nested content cannot be reordered safely.'});
        const chunks=group.map(b=>source.slice(b.start,b.end));
        const gaps=group.slice(1).map((b,i)=>source.slice(group[i].end,b.start));
        const moved=chunks.splice(index-low,1)[0];
        chunks.splice(target-low,0,moved);
        let replacement=chunks[0];
        for(let i=1;i<chunks.length;i++)replacement+=gaps[i-1]+chunks[i];
        updated=source.slice(0,group[0].start)+replacement+source.slice(group.at(-1).end);
      }
      if(updated!==source){
        await fs.copyFile(SOURCE,SOURCE+'.hyperarchive-backup');
        await fs.writeFile(SOURCE,updated,'utf8');
      }
      return send(res,200,{ok:true,action});
    }
    if(req.method==='POST'&&url.pathname==='/api/blocks/batch'){
      const {edits}=await readBody(req);
      if(!Array.isArray(edits)||edits.length>250)return send(res,400,{error:'Invalid batch'});
      const source=await fs.readFile(SOURCE,'utf8'),current=blocks(source);
      const seen=new Set(),replacements=[];
      for(const edit of edits){
        if(!Number.isInteger(edit.index)||seen.has(edit.index)||typeof edit.original!=='string'||typeof edit.html!=='string')
          return send(res,400,{error:'Invalid or duplicate edit'});
        seen.add(edit.index);
        const block=current[edit.index];
        if(!block||block.original!==edit.original)return send(res,409,{error:'The page changed. Reload before saving.'});
        replacements.push({...block,nextHtml:sanitize(edit.html)});
      }
      let updated=source;
      for(const block of replacements.sort((a,b)=>b.start-a.start))
        updated=updated.slice(0,block.start)+block.original.replace(block.html,block.nextHtml)+updated.slice(block.end);
      if(updated!==source){
        await fs.copyFile(SOURCE,SOURCE+'.hyperarchive-backup');
        await fs.writeFile(SOURCE,updated,'utf8');
      }
      return send(res,200,{ok:true,saved:replacements.length});
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
