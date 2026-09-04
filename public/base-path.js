(() => {
  const base = '/portfolio';
  const isRootRelative = value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith(base + '/');
  const prefix = value => isRootRelative(value) ? `${base}${value}` : value;

  const rewrite = root => {
    root.querySelectorAll?.('a[href]').forEach(el => {
      const value = el.getAttribute('href');
      if (isRootRelative(value)) el.setAttribute('href', prefix(value));
    });
    root.querySelectorAll?.('img[src],video[src],source[src],audio[src]').forEach(el => {
      const value = el.getAttribute('src');
      if (isRootRelative(value)) el.setAttribute('src', prefix(value));
    });
    root.querySelectorAll?.('[poster]').forEach(el => {
      const value = el.getAttribute('poster');
      if (isRootRelative(value)) el.setAttribute('poster', prefix(value));
    });
  };

  rewrite(document);
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node.nodeType === 1) {
        const el = node;
        ['href','src','poster'].forEach(attr => {
          const value = el.getAttribute?.(attr);
          if (isRootRelative(value)) el.setAttribute(attr, prefix(value));
        });
        rewrite(el);
      }
    }));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
