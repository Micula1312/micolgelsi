(()=>{
  const path=location.pathname.replace(/\/$/,'')||'/';
  if(path!=='/'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;

  const frames=['/home-loader/01.webp','/home-loader/02.webp','/home-loader/03.webp'];
  const preload=src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(src);i.onerror=()=>resolve(null);i.src=src;});

  Promise.all(frames.map(preload)).then(loaded=>{
    const ready=loaded.filter(Boolean);
    if(!ready.length)return;

    const overlay=document.createElement('div');
    overlay.className='home-flash-loader';
    overlay.setAttribute('aria-hidden','true');
    const image=document.createElement('img');
    image.className='home-flash-loader__image';
    image.alt='';
    overlay.appendChild(image);

    const style=document.createElement('style');
    style.textContent=`
      .home-flash-loader{position:fixed;inset:0;z-index:99999;background:#000;overflow:hidden;pointer-events:none;opacity:1;transition:opacity 110ms linear}
      .home-flash-loader__image{width:100%;height:100%;display:block;object-fit:cover;object-position:center}
      .home-flash-loader.is-leaving{opacity:0}
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    let index=0;
    image.src=ready[0];
    const step=115;
    const tick=()=>{
      index+=1;
      if(index<ready.length){image.src=ready[index];setTimeout(tick,step);return;}
      setTimeout(()=>{overlay.classList.add('is-leaving');setTimeout(()=>{overlay.remove();style.remove();},130);},75);
    };
    setTimeout(tick,step);
  });
})();
