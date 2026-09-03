(() => {
  const list = document.querySelector('#work-list');
  if (!list) return;

  const points = {
    'urban-wilderness': [14, 22],
    'more-than-human-relations': [30, 15],
    'eco-feminism': [22, 72],
    'bodies-affects': [48, 78],
    'generative-archives': [48, 20],
    'digital-access-inclusion': [72, 24],
    'surveillance-politics-of-visibility': [82, 72]
  };

  const labels = [
    ['urban-wilderness', 'Urban Wilderness'],
    ['more-than-human-relations', 'More-than-human Relations'],
    ['generative-archives', 'Generative Archives'],
    ['digital-access-inclusion', 'Digital Access & Inclusion'],
    ['eco-feminism', 'Ecofeminism'],
    ['bodies-affects', 'Bodies & Affects'],
    ['surveillance-politics-of-visibility', 'Surveillance & Politics of Visibility']
  ];

  const field = list.querySelector('.research-field');
  const rows = [...list.querySelectorAll('.work-row')];

  const renderAnchors = () => {
    if (!field) return;
    field.innerHTML = '';
    labels.forEach(([key, label]) => {
      const p = points[key];
      const el = document.createElement('span');
      el.className = `research-anchor anchor-${key}`;
      el.textContent = label;
      el.style.left = `${p[0]}%`;
      el.style.top = `${p[1]}%`;
      field.appendChild(el);
    });
  };

  const placeRows = () => {
    if (list.dataset.view !== 'research') return;
    rows.forEach((row, index) => {
      const keys = (row.dataset.research || '').split(',').filter(Boolean);
      const coords = keys.map(k => points[k]).filter(Boolean);
      const base = coords.length
        ? coords.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]).map(v => v / coords.length)
        : [50, 50];
      const jitterX = ((index * 17) % 13) - 6;
      const jitterY = ((index * 29) % 11) - 5;
      row.style.setProperty('--x', `${Math.max(7, Math.min(92, base[0] + jitterX))}%`);
      row.style.setProperty('--y', `${Math.max(10, Math.min(90, base[1] + jitterY))}%`);
    });
  };

  renderAnchors();
  document.querySelectorAll('.view-button[data-view="research"]').forEach(btn => {
    btn.addEventListener('click', () => requestAnimationFrame(() => {
      renderAnchors();
      placeRows();
    }));
  });

  const observer = new MutationObserver(() => {
    if (list.dataset.view === 'research') {
      renderAnchors();
      placeRows();
    }
  });
  observer.observe(list, { attributes: true, attributeFilter: ['data-view'] });
})();
