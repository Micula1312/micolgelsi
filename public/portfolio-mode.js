(() => {
  const root=document.documentElement;
  const buttons=[...document.querySelectorAll('[data-portfolio-mode-toggle]')];
  const params=new URLSearchParams(location.search);
  const requested=params.get('theme');
  let saved=null;
  try {saved=localStorage.getItem('portfolio-mode')} catch {}
  const initial=['punk','institutional'].includes(requested)?requested:(['punk','institutional'].includes(saved)?saved:'punk');
  const apply=(mode,persist=true)=>{
    root.dataset.portfolioMode=mode;
    buttons.forEach(button=>{const sidebar=button.classList.contains('institutional-mode-switch');button.textContent=sidebar?'← PUNK MODE':(mode==='institutional'?'Institutional':'Punk');button.setAttribute('aria-pressed',String(mode==='institutional'));button.setAttribute('aria-label','Switch portfolio theme from '+mode);});
    if(mode==='institutional'){
      document.querySelector('[data-entry-gate]')?.remove();
      document.querySelector('[data-project-loader]')?.remove();
      if(document.body.style.overflow==='hidden')document.body.style.overflow='';
    }
    if(persist){try{localStorage.setItem('portfolio-mode',mode)}catch{}}
    window.dispatchEvent(new CustomEvent('portfolio-mode-change',{detail:{mode}}));
  };
  apply(initial,false);
  buttons.forEach(button=>button.addEventListener('click',()=>apply(root.dataset.portfolioMode==='institutional'?'punk':'institutional')));
})();
