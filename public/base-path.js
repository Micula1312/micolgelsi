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

/* YEAR VIEW — reveal the project's own avatar as a small rotating star while
   the title travels across its timeline segment. Avatar URLs are discovered
   lazily from the project page so the index stays lightweight. */
(() => {
  const cache = new Map();
  const pending = new Map();
  const isYearRow = row => row?.matches?.('.work-row') && row.closest('.work-list')?.dataset.view === 'year';
  const sameOriginHref = row => {
    const raw = row?.getAttribute('href');
    if (!raw || row?.dataset.external === 'true') return '';
    try {
      const url = new URL(raw, window.location.href);
      return url.origin === window.location.origin ? url.href : '';
    } catch { return ''; }
  };

  const findAvatar = async href => {
    if (!href) return null;
    if (cache.has(href)) return cache.get(href);
    if (pending.has(href)) return pending.get(href);
    const job = fetch(href, { credentials: 'same-origin' })
      .then(response => response.ok ? response.text() : '')
      .then(html => {
        if (!html) return null;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const media = doc.querySelector('[data-project-loader] .project-entry-media');
        if (!media) return null;
        const src = media.getAttribute('src');
        if (!src) return null;
        const result = {
          src: new URL(src, href).href,
          kind: media.tagName.toLowerCase() === 'video' ? 'video' : 'image'
        };
        cache.set(href, result);
        return result;
      })
      .catch(() => null)
      .finally(() => pending.delete(href));
    pending.set(href, job);
    return job;
  };

  const ensureStar = async row => {
    if (!isYearRow(row)) return;
    let star = row.querySelector('.year-avatar-star');
    if (!star) {
      star = document.createElement('span');
      star.className = 'year-avatar-star';
      star.setAttribute('aria-hidden', 'true');
      row.appendChild(star);
    }
    row.classList.add('is-avatar-pending');
    const href = sameOriginHref(row);
    const avatar = await findAvatar(href);
    row.classList.remove('is-avatar-pending');
    if (!avatar || !isYearRow(row) || !(row.matches(':hover') || row.matches(':focus-within') || document.activeElement === row)) return;
    if (!star.dataset.src || star.dataset.src !== avatar.src) {
      star.replaceChildren();
      const media = document.createElement(avatar.kind === 'video' ? 'video' : 'img');
      media.src = avatar.src;
      media.className = 'year-avatar-star-media';
      if (avatar.kind === 'video') {
        media.muted = true;
        media.loop = true;
        media.autoplay = true;
        media.playsInline = true;
        media.preload = 'metadata';
        media.play?.().catch(() => {});
      } else {
        media.alt = '';
        media.decoding = 'async';
      }
      star.appendChild(media);
      star.dataset.src = avatar.src;
    }
    row.classList.add('has-year-avatar');
  };

  const hideStar = row => {
    row?.classList?.remove('has-year-avatar', 'is-avatar-pending');
    const video = row?.querySelector?.('.year-avatar-star video');
    if (video && !video.paused) video.pause();
  };

  document.addEventListener('mouseover', event => {
    const row = event.target.closest?.('.work-row');
    if (!row || row.contains(event.relatedTarget) || !isYearRow(row)) return;
    ensureStar(row);
  });
  document.addEventListener('mouseout', event => {
    const row = event.target.closest?.('.work-row');
    if (!row || row.contains(event.relatedTarget)) return;
    hideStar(row);
  });
  document.addEventListener('focusin', event => {
    const row = event.target.closest?.('.work-row');
    if (isYearRow(row)) ensureStar(row);
  });
  document.addEventListener('focusout', event => {
    const row = event.target.closest?.('.work-row');
    if (row && !row.contains(event.relatedTarget)) hideStar(row);
  });
})();
