(() => {
  const root=document.documentElement;
  const page=document.querySelector('main.page');
  if(!page || !document.body.dataset.projectDetail && !location.pathname.match(/\/works\/[^/]+\/?$/))return;
  const mediaSelector='.project-cover,.media-stream,.media-grid,.video-list,.teaser-embed';
  const infoSelector='.eyebrow,.project-head,.intro,.project-body,.project-moments,.project-links,.related';
  const nodes=[...page.children].filter(node=>node.matches?.(mediaSelector+','+infoSelector));
  if(!nodes.length)return;
  const markers=nodes.map(node=>{const marker=document.createComment('institutional-original-position');node.before(marker);return {node,marker};});
  const layout=document.createElement('div');
  layout.className='institutional-project-layout';
  const media=document.createElement('div');media.className='institutional-project-media';
  const info=document.createElement('div');info.className='institutional-project-info';
  layout.append(media,info);
  const nestedMedia=[];
  // Move the actual moment galleries, videos and photos to the media column in Institutional.
  // Preserve original DOM positions so Punk is restored exactly when switching themes.
  const collectNested=()=>{
    if(nestedMedia.length)return;
    page.querySelectorAll('.project-moment .moment-gallery,.project-moment .moment-single-video,.project-moment > img,.project-moment > video').forEach(node=>{
      const moment=node.closest('.project-moment');
      const heading=moment?.querySelector('.output-title')?.textContent?.trim()||'';
      const marker=document.createComment('original-moment-media');node.before(marker);
      const wrapper=document.createElement('figure');wrapper.className='institutional-moment-media';
      if(heading){const caption=document.createElement('figcaption');caption.textContent=heading;wrapper.append(caption)}
      nestedMedia.push({node,marker,wrapper});
    });
  };
  let active=false;
  const update=()=>{
    const institutional=root.dataset.portfolioMode==='institutional';
    if(institutional===active)return;
    active=institutional;
    if(institutional){
      collectNested();
      page.prepend(layout);
      nodes.forEach(node=>(node.matches(mediaSelector)?media:info).append(node));
      nestedMedia.forEach(({node,wrapper})=>{wrapper.append(node);media.append(wrapper)});
      // Keep the project's featured gallery directly below its cover.
      // It was previously appended after other media, sometimes far below the fold.
      const featured=media.querySelector('[data-featured-gallery]');
      const cover=media.querySelector('.project-cover');
      if(featured&&cover)cover.after(featured);
      else if(featured)media.prepend(featured);

    }else{
      nestedMedia.forEach(({node,marker,wrapper})=>{marker.after(node);wrapper.remove()});
      markers.forEach(({node,marker})=>marker.after(node));
      layout.remove();
    }
  };
  // Delegate hover so galleries moved into the Institutional column still work.
  // Avoid duplicate animation loops and leave Punk gallery behavior unchanged.
  const animations=new Map();
  const stopGallery=gallery=>{
    const state=animations.get(gallery);
    if(state)cancelAnimationFrame(state.raf);
    animations.delete(gallery);
  };
  const startGallery=gallery=>{
    if(root.dataset.portfolioMode!=='institutional'||
       matchMedia('(prefers-reduced-motion: reduce)').matches||
       animations.has(gallery))return;
    const state={raf:0,previous:0,direction:1};
    const tick=now=>{
      if(root.dataset.portfolioMode!=='institutional'){stopGallery(gallery);return}
      const max=gallery.scrollWidth-gallery.clientWidth;
      if(max<=1){stopGallery(gallery);return}
      if(state.previous){
        gallery.scrollLeft+=state.direction*Math.min((now-state.previous)/1000,.05)*58;
        if(gallery.scrollLeft>=max-1)state.direction=-1;
        else if(gallery.scrollLeft<=1)state.direction=1;
      }
      state.previous=now;
      state.raf=requestAnimationFrame(tick);
    };
    animations.set(gallery,state);
    state.raf=requestAnimationFrame(tick);
  };
  // MomentGallery already has its own hover loop. We only provide a fallback
  // for galleries that are not initialized, and for generic media strips.
  media.addEventListener('pointerover',event=>{
    const gallery=event.target.closest?.('.moment-gallery');
    if(!gallery||!media.contains(gallery))return;
    if(gallery.matches('.moment-gallery')&&gallery.hasAttribute('data-gallery-ready'))return;
    if(event.relatedTarget&&gallery.contains(event.relatedTarget))return;
    startGallery(gallery);
  });
  media.addEventListener('pointerout',event=>{
    const gallery=event.target.closest?.('.media-stream,.media-grid,.moment-gallery');
    if(!gallery)return;
    if(event.relatedTarget&&gallery.contains(event.relatedTarget))return;
    stopGallery(gallery);
  });
  // Scroll fallback for older page-layout CSS: wheel over media must scroll media,
  // not the clipped outer page. Only intercept if this column has room to scroll.
  media.addEventListener('wheel',event=>{
    if(root.dataset.portfolioMode!=='institutional'||event.ctrlKey)return;
    if(Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    const delta=event.deltaMode===1?event.deltaY*16:event.deltaMode===2?event.deltaY*media.clientHeight:event.deltaY;
    const max=Math.max(0,media.scrollHeight-media.clientHeight);
    if(max<=1)return;
    const next=Math.max(0,Math.min(max,media.scrollTop+delta));
    if(Math.abs(next-media.scrollTop)>.5){event.preventDefault();media.scrollTop=next}
  },{passive:false});
  // Restore Punk's exact original document flow when switching back.
  // Featured gallery rail: attach directly, not through delegated pointerover.
  // A horizontal rail can have more content than its clipped viewport.
  const railStates=new WeakMap();
  const attachRails=()=>{
    page.querySelectorAll('.media-stream,.media-grid').forEach(rail=>{
      if(railStates.has(rail))return;
      const state={raf:0,last:0,direction:1};
      railStates.set(rail,state);
      const stop=()=>{cancelAnimationFrame(state.raf);state.raf=0;state.last=0};
      const frame=t=>{
        if(root.dataset.portfolioMode!=='institutional'){stop();return}
        const max=rail.scrollWidth-rail.clientWidth;
        if(max>1){
          const dt=state.last?Math.min((t-state.last)/1000,.05):0;
          rail.scrollLeft=Math.max(0,Math.min(max,rail.scrollLeft+state.direction*90*dt));
          if(rail.scrollLeft>=max-1)state.direction=-1;
          if(rail.scrollLeft<=1)state.direction=1;
        }
        state.last=t;
        state.raf=requestAnimationFrame(frame);
      };
      rail.addEventListener('pointerenter',()=>{
        if(root.dataset.portfolioMode!=='institutional'||matchMedia('(prefers-reduced-motion: reduce)').matches||state.raf)return;
        state.raf=requestAnimationFrame(frame);
      });
      rail.addEventListener('pointerleave',stop);
      rail.addEventListener('wheel',event=>{
        if(root.dataset.portfolioMode!=='institutional'||event.ctrlKey)return;
        const max=rail.scrollWidth-rail.clientWidth;
        if(max<=1)return;
        const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
        const next=Math.max(0,Math.min(max,rail.scrollLeft+delta));
        if(Math.abs(next-rail.scrollLeft)>.5){
          event.preventDefault();rail.scrollLeft=next;
        }
      },{passive:false});
    });
  };
  // The rail may be reparented on theme change; listeners remain attached.
  window.addEventListener('portfolio-mode-change',()=>requestAnimationFrame(attachRails));
  attachRails();
  window.addEventListener('portfolio-mode-change',update);
  update();
})();