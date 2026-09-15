(() => {
  const list = document.querySelector('#work-list');
  if (!list) return;

  const fallback = [
    {key:'urban-wilderness',label:'Urban Wilderness',subtitle:''},
    {key:'more-than-human-relations',label:'More-than-human Relations',subtitle:''},
    {key:'generative-archives',label:'Generative Archives',subtitle:''},
    {key:'digital-access-inclusion',label:'Digital Access & Inclusion',subtitle:''},
    {key:'eco-feminism',label:'Eco-feminism',subtitle:''},
    {key:'hydro-feminism',label:'Hydro-feminism',subtitle:''},
    {key:'bodies-affects',label:'Bodies & Affects',subtitle:''},
    {key:'surveillance-politics-of-visibility',label:'Surveillance & Politics of Visibility',subtitle:''},
    {key:'live-data-manipulation',label:'Live Data Manipulation',subtitle:''}
  ];
  let categories = fallback;

  const aliases = {
    'more-than-human-relations': ['more-than-human-relations', 'interspecies'],
    'digital-access-inclusion': ['digital-access-inclusion', 'technology-digitalization'],
    'bodies-affects': ['bodies-affects', 'body-freedom', 'emotional-geographies']
  };

  const field = list.querySelector('.research-field');
  const sourceRows = [...list.querySelectorAll('.work-row')];
  let atlas = null;

  const rowKeys = row => (row.dataset.research || '').split(',').map(x => x.trim()).filter(Boolean);
  const humanize = key => key.split('-').map(x => x ? x[0].toUpperCase()+x.slice(1) : '').join(' ');
  const matches = (row, key) => {
    const keys = rowKeys(row);
    const accepted = aliases[key] || [key];
    return accepted.some(k => keys.includes(k));
  };

  const ensureAtlas = () => {
    if (atlas) return atlas;
    atlas = document.createElement('div');
    atlas.className = 'research-atlas';
    atlas.setAttribute('aria-label', 'Projects grouped by research area');
    list.appendChild(atlas);
    return atlas;
  };

  const cloneProject = row => {
    const link = document.createElement('a');
    link.className = `research-project${row.classList.contains('is-featured') ? ' is-featured' : ''}`;
    link.href = row.getAttribute('href') || '#';
    link.textContent = `↳ ${row.dataset.title || row.textContent.trim()}`;
    if (row.dataset.external === 'true') {
      link.addEventListener('click', event => {
        event.preventDefault();
        row.click();
      });
    }
    return link;
  };

  const allCategories = () => {
    const registered = new Map(categories.map(c => [c.key,c]));
    const seenKeys = new Set(sourceRows.flatMap(rowKeys));
    for (const key of seenKeys) if (!registered.has(key)) registered.set(key,{key,label:humanize(key),subtitle:''});
    return [...registered.values()];
  };

  const renderAtlas = () => {
    if (list.dataset.view !== 'research') return;
    const host = ensureAtlas();
    host.innerHTML = '';

    allCategories().forEach(category => {
      const projects = sourceRows.filter(row => matches(row, category.key));
      if (!projects.length) return;
      const group = document.createElement('section');
      group.className = 'research-group';
      const heading = document.createElement('h2');
      heading.className = 'research-group-title';
      heading.textContent = `+ ${category.label}`;
      group.appendChild(heading);
      if (category.subtitle) {
        const subtitle = document.createElement('p');
        subtitle.className = 'research-group-subtitle';
        subtitle.textContent = category.subtitle;
        group.appendChild(subtitle);
      }
      projects.sort((a,b)=>(a.dataset.title||'').localeCompare(b.dataset.title||'')).forEach(row => group.appendChild(cloneProject(row)));
      host.appendChild(group);
    });

    const uncategorized = sourceRows.filter(row => !rowKeys(row).length);
    if (uncategorized.length) {
      const group = document.createElement('section');
      group.className = 'research-group';
      const heading = document.createElement('h2');
      heading.className = 'research-group-title';
      heading.textContent = '+ Other';
      group.appendChild(heading);
      uncategorized.forEach(row => group.appendChild(cloneProject(row)));
      host.appendChild(group);
    }
  };

  const update = () => {
    const research = list.dataset.view === 'research';
    sourceRows.forEach(row => row.hidden = research);
    if (field) field.hidden = research;
    const yearTrack = list.querySelector('[data-year-track]');
    if (yearTrack) yearTrack.hidden = research;
    if (research) renderAtlas();
    if (atlas) atlas.hidden = !research;
  };

  const loadCategories = async () => {
    try {
      const script = [...document.scripts].find(s => /research-layout\.js(?:\?|$)/.test(s.src));
      if (!script) return;
      const url = new URL('research-areas.json', script.src);
      const response = await fetch(url,{cache:'no-store'});
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data) && data.length) categories = data.filter(x=>x&&x.key&&x.label);
    } catch {}
    update();
  };

  document.querySelectorAll('.view-button[data-view="research"]').forEach(btn => btn.addEventListener('click', () => requestAnimationFrame(update)));
  document.querySelectorAll('.view-button:not([data-view="research"])').forEach(btn => btn.addEventListener('click', () => requestAnimationFrame(update)));
  new MutationObserver(update).observe(list, { attributes:true, attributeFilter:['data-view'] });
  update();
  loadCategories();
})();
