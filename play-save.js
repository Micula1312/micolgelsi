(()=>{
  const send=document.querySelector('[data-send]');
  const stage=document.querySelector('[data-stage]');
  const video=document.querySelector('[data-video]');
  const canvas=document.querySelector('[data-canvas]');
  const textInput=document.querySelector('[data-text]');
  const note=document.querySelector('[data-note]');
  if(!send||!stage||!video||!canvas)return;

  const save=document.createElement('button');
  save.type='button';
  save.className='save';
  save.textContent='↓ SAVE';
  send.parentNode?.insertBefore(save,send);

  const signal=()=>getComputedStyle(document.documentElement).getPropertyValue('--signal').trim()||'#39ff14';

  const makeBlob=async()=>{
    const r=stage.getBoundingClientRect(),scale=2,out=document.createElement('canvas');
    out.width=Math.round(r.width*scale);
    out.height=Math.round(r.height*scale);
    const o=out.getContext('2d');
    if(!o)return null;

    o.save();
    o.translate(out.width,0);
    o.scale(-1,1);
    o.filter='grayscale(1) contrast(1.45) brightness(.82)';
    if(video.videoWidth)o.drawImage(video,0,0,out.width,out.height);
    else{o.fillStyle='#050505';o.fillRect(0,0,out.width,out.height);}
    o.restore();
    o.filter='none';

    o.save();
    o.globalAlpha=.12;
    o.fillStyle=signal();
    o.fillRect(0,0,out.width,out.height);
    o.restore();
    o.drawImage(canvas,0,0,out.width,out.height);

    const message=(textInput?.value||'').trim();
    if(message){
      const panelW=out.width*.36,margin=24*scale,x=out.width-panelW-margin,y=margin,h=out.height-margin*2;
      o.save();
      o.fillStyle='rgba(5,5,5,.72)';
      o.fillRect(x,y,panelW,h);
      o.strokeStyle='rgba(255,255,255,.34)';
      o.lineWidth=1*scale;
      o.strokeRect(x,y,panelW,h);
      const pad=22*scale,size=Math.max(20,Math.min(42,r.width*.035))*scale;
      o.fillStyle=signal();
      o.font=`700 ${size}px Wingdings, "Segoe UI Symbol", sans-serif`;
      o.textBaseline='top';
      const words=message.split(/\s+/),lines=[];
      let line='';
      const maxWidth=panelW-pad*2;
      words.forEach(word=>{const test=line?`${line} ${word}`:word;if(o.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test});
      if(line)lines.push(line);
      lines.slice(0,7).forEach((txt,i)=>o.fillText(txt,x+pad,y+pad+i*size*1.08,maxWidth));
      o.restore();
    }

    return await new Promise(resolve=>out.toBlob(resolve,'image/png'));
  };

  save.addEventListener('click',async()=>{
    const blob=await makeBlob();
    if(!blob)return;
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;
    a.download=`play-with-me-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    if(note)note.textContent='postcard saved ★';
  });
})();
