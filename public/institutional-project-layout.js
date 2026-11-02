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
      nestedMedia.forEach(({node,wrapper})=>{wrapper.append(node);media.append(wrapper);if(node.matches('.moment-gallery'))setupMomentHover(node);node.querySelectorAll?.('.moment-gallery').forEach(setupMomentHover)});
    }else{
      nestedMedia.forEach(({node,marker,wrapper})=>{marker.after(node);wrapper.remove()});
      markers.forEach(({node,marker})=>marker.after(node));
      layout.remove();
    }
  };
  // MomentGallery handles its own hover scrolling; generic galleries use the same behavior.
  page.querySelectorAll('.media-stream,.media-grid').forEach(gallery=>{
    let raf=0,last=0,direction=1;
    const tick=now=>{
      if(root.dataset.portfolioMode!=='institutional'){raf=0;return}
      const max=gallery.scrollWidth-gallery.clientWidth;
      if(max<=1){raf=0;return}
      if(last)gallery.scrollLeft+=direction*Math.min((now-last)/1000,.05)*30;
      last=now;
      if(gallery.scrollLeft>=max-1)direction=-1;
      if(gallery.scrollLeft<=1)direction=1;
      raf=requestAnimationFrame(tick);
    };
    gallery.addEventListener('pointerenter',()=>{
      if(root.dataset.portfolioMode!=='institutional'||matchMedia('(prefers-reduced-motion: reduce)').matches||raf)return;
      last=0;raf=requestAnimationFrame(tick);
    });
    gallery.addEventListener('pointerleave',()=>{if(raf)cancelAnimationFrame(raf);raf=0;last=0});
  });
  // Smooth, reversible hover auto-scroll for Institutional Moment galleries.
  // No changes to the Punk gallery behavior or media source files.
  const hoverCarousels=new WeakSet();
  const setupMomentHover=gallery=>{
    if(hoverCarousels.has(gallery))return;
    hoverCarousels.add(gallery);
    let frame=0,previous=0,direction=1;
    const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;previous=0};
    const tick=now=>{
      if(root.dataset.portfolioMode!=='institutional'){stop();return}
      const max=gallery.scrollWidth-gallery.clientWidth;
      if(max<=1){stop();return}
      if(previous)gallery.scrollLeft+=direction*Math.min((now-previous)/1000,.05)*46;
      previous=now;
      if(gallery.scrollLeft>=max-1)direction=-1;
      else if(gallery.scrollLeft<=1)direction=1;
      frame=requestAnimationFrame(tick);
    };
    gallery.addEventListener('pointerenter',()=>{
      if(root.dataset.portfolioMode!=='institutional'||matchMedia('(prefers-reduced-motion: reduce)').matches||frame)return;
      previous=0;frame=requestAnimationFrame(tick);
    });
    gallery.addEventListener('pointerleave',stop);
    gallery.addEventListener('pointercancel',stop);
    window.addEventListener('portfolio-mode-change',stop);
  };
  nestedMedia.forEach(({node})=>{
    if(node.matches('.moment-gallery'))setupMomentHover(node);
    node.querySelectorAll?.('.moment-gallery').forEach(setupMomentHover);
  });
  window.addEventListener('portfolio-mode-change',update);
  update();
})();