/* Institutional project detail: one layout, one gallery behavior.
   Original nodes are restored when returning to Punk. */
(() => {
  const root=document.documentElement;
  const page=document.querySelector('main.page');
  if(!page||document.body.dataset.projectDetail!=='true')return;
  const mediaSelector='.project-cover,.media-stream,.media-grid,.video-list,.teaser-embed';
  const infoSelector='.eyebrow,.project-head,.intro,.project-body,.project-moments,.project-links,.related';
  const nodes=[...page.children].filter(el=>el.matches?.(mediaSelector+','+infoSelector));
  if(!nodes.length)return;

  const layout=document.createElement('div');
  layout.className='institutional-project-layout';
  const media=document.createElement('div');
  media.className='institutional-project-media';
  const info=document.createElement('div');
  info.className='institutional-project-info';
  layout.append(media,info);
  const original=nodes.map(node=>{
    const anchor=document.createComment('institutional-original');
    node.before(anchor);
    return {node,anchor};
  });
  let nested=[];
  let active=false;

  function collectNested(){
    if(nested.length)return;
    page.querySelectorAll('.project-moment .moment-gallery,.project-moment .moment-single-video,.project-moment > img,.project-moment > video').forEach(node=>{
      const moment=node.closest('.project-moment');
      const title=moment?.querySelector('.output-title')?.textContent?.trim()||'';
      const anchor=document.createComment('moment-original');
      node.before(anchor);
      const figure=document.createElement('figure');
      figure.className='institutional-moment-media';
      if(title){
        const caption=document.createElement('figcaption');
        caption.textContent=title;
        figure.append(caption);
      }
      nested.push({node,anchor,figure});
    });
  }

  function update(){
    const enabled=root.dataset.portfolioMode==='institutional';
    if(enabled===active)return;
    active=enabled;
    if(enabled){
      collectNested();
      page.prepend(layout);
      original.forEach(({node})=>(node.matches(mediaSelector)?media:info).append(node));
      nested.forEach(({node,figure})=>{figure.append(node);media.append(figure)});
      const featured=media.querySelector('[data-featured-gallery]');
      const cover=media.querySelector('.project-cover,.teaser-embed');
      if(featured){if(cover)cover.after(featured);else media.prepend(featured);}
    }else{
      nested.forEach(({node,anchor,figure})=>{anchor.after(node);figure.remove()});
      original.forEach(({node,anchor})=>anchor.after(node));
      layout.remove();
    }
  }

  // Scroll each rail with the wheel/trackpad, without trapping vertical column scroll
  // when the rail has reached either edge.
  page.addEventListener('wheel',event=>{
    if(!active||event.ctrlKey)return;
    const rail=event.target.closest?.('[data-featured-gallery],.moment-gallery,.media-grid,.video-list');
    if(!rail||!media.contains(rail))return;
    const max=rail.scrollWidth-rail.clientWidth;
    if(max<2)return;
    const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
    const next=Math.max(0,Math.min(max,rail.scrollLeft+delta));
    if(Math.abs(next-rail.scrollLeft)>.5){event.preventDefault();rail.scrollLeft=next;}
  },{passive:false});

  // MomentGallery has its own hover animation; do not duplicate it.
  const animations=new WeakMap();
  page.addEventListener('pointerover',event=>{
    if(!active)return;
    const rail=event.target.closest?.('[data-featured-gallery],.media-grid,.video-list');
    if(!rail||!media.contains(rail)||animations.has(rail))return;
    if(event.relatedTarget&&rail.contains(event.relatedTarget))return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    let raf=0,previous=0,direction=1;
    const tick=time=>{
      if(!active){cancelAnimationFrame(raf);animations.delete(rail);return;}
      const max=rail.scrollWidth-rail.clientWidth;
      if(max>1){
        const dt=previous?Math.min((time-previous)/1000,.05):0;
        rail.scrollLeft=Math.max(0,Math.min(max,rail.scrollLeft+direction*65*dt));
        if(rail.scrollLeft>=max-1)direction=-1;
        if(rail.scrollLeft<=1)direction=1;
      }
      previous=time;raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    animations.set(rail,()=>cancelAnimationFrame(raf));
  });
  page.addEventListener('pointerout',event=>{
    const rail=event.target.closest?.('[data-featured-gallery],.media-grid,.video-list');
    if(!rail||event.relatedTarget&&rail.contains(event.relatedTarget))return;
    const stop=animations.get(rail);
    if(stop){stop();animations.delete(rail);}
  });
  window.addEventListener('portfolio-mode-change',update);
  update();
})();
