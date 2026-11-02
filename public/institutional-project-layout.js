(() => {
  const root=document.documentElement;
  const page=document.querySelector('main.page');
  if(!page || !document.body.dataset.projectDetail && !location.pathname.match(/\/works\/[^/]+\/?$/))return;
  const mediaSelector='.project-cover,.media-stream,.media-grid,.video-list';
  const infoSelector='.eyebrow,.project-head,.intro,.project-body,.project-moments,.project-links,.related';
  const nodes=[...page.children].filter(node=>node.matches?.(mediaSelector+','+infoSelector));
  if(!nodes.length)return;
  const markers=nodes.map(node=>{const marker=document.createComment('institutional-original-position');node.before(marker);return {node,marker};});
  const layout=document.createElement('div');
  layout.className='institutional-project-layout';
  const media=document.createElement('div');media.className='institutional-project-media';
  const info=document.createElement('div');info.className='institutional-project-info';
  layout.append(media,info);
  let active=false;
  const update=()=>{
    const institutional=root.dataset.portfolioMode==='institutional';
    if(institutional===active)return;
    active=institutional;
    if(institutional){
      page.prepend(layout);
      nodes.forEach(node=>(node.matches(mediaSelector)?media:info).append(node));
    }else{
      markers.forEach(({node,marker})=>marker.after(node));
      layout.remove();
    }
  };
  window.addEventListener('portfolio-mode-change',update);
  update();
})();