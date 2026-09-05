(() => {
  const list = document.querySelector('#work-list');
  if (!list) return;

  const labels = [
    ['urban-wilderness', 'Urban Wilderness'],
    ['more-than-human-relations', 'More-than-human Relations'],
    ['interspecies', 'Interspecies'],
    ['generative-archives', 'Generative Archives'],
    ['digital-access-inclusion', 'Digital Access & Inclusion'],
    ['technology-digitalization', 'Technology & Digitalization'],
    ['eco-feminism', 'Eco-feminism'],
    ['pleasure-activism', 'Pleasure Activism'],
    ['bodies-affects', 'Bodies & Affects'],
    ['body-freedom', 'Body freedom'],
    ['emotional-geographies', 'Emotional Geographies'],
    ['surveillance-politics-of-visibility', 'Surveillance & Politics of Visibility']
  ];

  const aliases = {
    'more-than-human-relations': ['more-than-human-relations', 'interspecies'],
    'interspecies': ['interspecies', 'more-than-human-relations'],
    'digital-access-inclusion': ['digital-access-inclusion', 'technology-digitalization'],
    'technology-digitalization': ['technology-digitalization', 'digital-access-inclusion'],
    'bodies-affects': ['bodies-affects', 'body-freedom', 'emotional-geographies'],
    'body-freedom': ['body-freedom', 'bodies-affects'],
    'emotional-geographies': ['emotional-geographies', 'bodies-affects']
  };

  const field = list.querySelector('.research-field');
  const sourceRows = [...list.querySelectorAll('.work-row')];
  let atlas = null;

  const rowKeys = row => (row.dataset.research || '').split(',').map(x => x.trim()).filter(Boolean);
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

  const renderAtlas = () => {
    if (list.dataset.view !== 'research') return;
    const host = ensureAtlas();
    host.innerHTML = '';
    const used = new Set();

    labels.forEach(([key, label]) => {
      const projects = sourceRows.filter(row => matches(row, key));
      if (!projects.length) return;
      const signature = projects.map(row => row.dataset.title).sort().join('|');
      if (used.has(`${label}|${signature}`)) return;
      used.add(`${label}|${signature}`);

      const group = document.createElement('section');
      group.className = 'research-group';
      const heading = document.createElement('h2');
      heading.className = 'research-group-title';
      heading.textContent = `+ ${label}`;
      group.appendChild(heading);
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
    if (research) renderAtlas();
    if (atlas) atlas.hidden = !research;
  };

  document.querySelectorAll('.view-button[data-view="research"]').forEach(btn => btn.addEventListener('click', () => requestAnimationFrame(update)));
  document.querySelectorAll('.view-button:not([data-view="research"])').forEach(btn => btn.addEventListener('click', () => requestAnimationFrame(update)));
  new MutationObserver(update).observe(list, { attributes:true, attributeFilter:['data-view'] });
  update();
})();
