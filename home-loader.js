(()=>{
  const base='/portfolio';

  const bindUnifiedMediaGallery=()=>{
    document.querySelectorAll('[data-featured-gallery]').forEach(gallery=>{
      if(gallery.dataset.runtimeLightboxBound==='true')return;
      gallery.dataset.runtimeLightboxBound='true';
      const title=document.querySelector('.project-head h1')?.textContent?.trim()||'';
      const figures=[...gallery.querySelectorAll(':scope > figure')];
      const media=figures.map(figure=>{
        const element=figure.querySelector('img,video');
        return element?.currentSrc||element?.getAttribute('src')||'';
      }).filter(Boolean);
      figures.forEach((figure,index)=>{
        const element=figure.querySelector('img,video');
        if(!element)return;
        figure.setAttribute('role','button');
        figure.setAttribute('tabindex','0');
        figure.setAttribute('aria-label',`Open media ${index+1} of ${media.length}`);
        const activate=event=>{
          if(event?.type==='click'&&event.target?.closest('a,button'))return;
          document.dispatchEvent(new CustomEvent('portfolio:open-media',{detail:{media,title,index}}));
        };
        figure.addEventListener('click',activate);
        figure.addEventListener('keydown',event=>{
          if(!['Enter',' '].includes(event.key))return;
          event.preventDefault();
          activate(event);
        });
      });
    });
  };

  const bootGlobal=()=>{
    bindUnifiedMediaGallery();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootGlobal,{once:true});
  else bootGlobal();

  const cleanPath=location.pathname.replace(/\/$/,'')||'/';
  if(![base,`${base}/`].includes(cleanPath))return;

  const style=document.createElement('style');
  style.textContent=`
    .home-flash-loader{position:fixed;inset:0;z-index:99999;background:#000;overflow:hidden;pointer-events:none;opacity:1;transition:opacity 150ms linear;display:grid;place-items:center}
    .home-flash-loader__image{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover;object-position:center;opacity:0;transition:opacity 50ms linear}
    .home-flash-loader__image.is-visible{opacity:1}
    .home-flash-loader__signal{position:absolute;left:max(16px,env(safe-area-inset-left));right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));display:flex;justify-content:space-between;gap:16px;color:#39ff14;font:700 10px/1.2 ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;text-transform:uppercase;letter-spacing:.05em;z-index:2}
    .home-flash-loader.is-leaving{opacity:0}
  `;
  document.head.appendChild(style);

  const overlay=document.createElement('div');
  overlay.className='home-flash-loader';
  overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML='<img class="home-flash-loader__image" alt=""><div class="home-flash-loader__signal"><span>MICOL GELSI</span><span>LOADING PROJECTS ✦</span></div>';
  const mount=()=>{if(!overlay.isConnected)document.body.appendChild(overlay);};
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount,{once:true});

  const image=overlay.querySelector('.home-flash-loader__image');
  const frames=[`${base}/home-loader/01.webp`,`${base}/home-loader/02.webp`,`${base}/home-loader/03.webp`];
  const preload=src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(src);i.onerror=()=>resolve(null);i.src=src;});
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

  let yearObserver=null;
  const compactMobileYear=()=>{
    const list=document.querySelector('#work-list');
    if(!list||window.innerWidth>760||list.dataset.view!=='year')return;
    const track=list.querySelector('[data-year-track]');
    const rowYears=[...list.querySelectorAll('.work-row')].map(row=>(row.dataset.year||'').match(/\d{4}/)?.[0]).filter(Boolean);
    const yearCount=new Set(rowYears).size;
    if(yearCount<=1){
      const width=Math.max(1,list.clientWidth);
      list.style.setProperty('--year-width',`${width}px`,'important');
      list.classList.remove('is-scrollable-year');
      list.style.setProperty('overflow-x','hidden','important');
      if(track)track.style.setProperty('width','100%','important');
      if(list.scrollLeft!==0)list.scrollLeft=0;
      return;
    }
    if(track)track.style.removeProperty('width');
    list.style.removeProperty('overflow-x');
  };

  const installYearGuard=()=>{
    const list=document.querySelector('#work-list');
    if(!list||window.innerWidth>760)return;
    compactMobileYear();
    yearObserver?.disconnect();
    yearObserver=new MutationObserver(()=>requestAnimationFrame(compactMobileYear));
    yearObserver.observe(list,{attributes:true,attributeFilter:['class','style']});
    const track=list.querySelector('[data-year-track]');
    if(track)yearObserver.observe(track,{attributes:true,attributeFilter:['style']});
    setTimeout(compactMobileYear,120);
    setTimeout(compactMobileYear,420);
  };

  let stableWidth=window.innerWidth;
  window.addEventListener('resize',()=>{
    const changed=Math.abs(window.innerWidth-stableWidth)>2;
    if(!changed)return;
    stableWidth=window.innerWidth;
    requestAnimationFrame(()=>requestAnimationFrame(installYearGuard));
  },{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(installYearGuard,180),{passive:true});

  const waitForLayout=async()=>{
    try{if(document.fonts?.ready)await document.fonts.ready;}catch{}
    await nextFrame();
    await new Promise(resolve=>setTimeout(resolve,80));
    await nextFrame();
    installYearGuard();
    await nextFrame();
  };
  const leave=async()=>{
    await waitForLayout();
    overlay.classList.add('is-leaving');
    setTimeout(()=>{overlay.remove();style.remove();},180);
  };

  Promise.all(frames.map(preload)).then(async loaded=>{
    const ready=loaded.filter(Boolean);
    if(!ready.length){await leave();return;}
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){await leave();return;}
    let index=0;
    image.src=ready[0];
    image.classList.add('is-visible');
    const step=105;
    const tick=()=>{
      index+=1;
      if(index<ready.length){image.src=ready[index];setTimeout(tick,step);return;}
      setTimeout(leave,65);
    };
    setTimeout(tick,step);
  }).catch(leave);

  setTimeout(()=>{if(overlay.isConnected)leave();},1800);
})();
