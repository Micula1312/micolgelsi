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

/* YEAR VIEW — one shared avatar stage pinned inside the Year panel. */
(() => {
  const base = '/portfolio';
  const cache = new Map();
  const pending = new Map();
  let activeRow = null;

  const getList = () => document.querySelector('#work-list');
  const isYearRow = row => row?.matches?.('.work-row') && getList()?.dataset.view === 'year';
  const withBase = value => {
    if (!value) return '';
    if (value.startsWith(base + '/')) return value;
    if (value.startsWith('/') && !value.startsWith('//')) return `${base}${value}`;
    return value;
  };

  const sameOriginHref = row => {
    const raw = row?.getAttribute('href');
    if (!raw || row?.dataset.external === 'true') return '';
    try {
      const url = new URL(raw, window.location.href);
      return url.origin === window.location.origin ? url.href : '';
    } catch { return ''; }
  };

  const ensureStage = () => {
    const list = getList();
    if (!list) return null;
    let stage = list.querySelector(':scope > .year-avatar-star');
    if (!stage) {
      stage = document.createElement('span');
      stage.className = 'year-avatar-star';
      stage.setAttribute('aria-hidden', 'true');
      list.appendChild(stage);
    }
    return stage;
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
          src: new URL(withBase(src), window.location.origin).href,
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

  const mountMedia = (stage, avatar) => {
    if (stage.dataset.src === avatar.src && stage.firstElementChild) {
      const existing = stage.firstElementChild;
      if (existing.tagName === 'VIDEO') {
        existing.muted = true;
        existing.playsInline = true;
        existing.loop = true;
        existing.play().catch(() => {});
      }
      return;
    }

    stage.replaceChildren();
    const media = document.createElement(avatar.kind === 'video' ? 'video' : 'img');
    media.className = 'year-avatar-star-media';

    if (avatar.kind === 'video') {
      media.muted = true;
      media.defaultMuted = true;
      media.loop = true;
      media.autoplay = true;
      media.playsInline = true;
      media.setAttribute('muted', '');
      media.setAttribute('playsinline', '');
      media.setAttribute('autoplay', '');
      media.setAttribute('loop', '');
      media.preload = 'auto';
      media.src = avatar.src;
      const play = () => media.play().catch(() => {});
      media.addEventListener('loadeddata', play, { once: true });
      media.addEventListener('canplay', play, { once: true });
      media.addEventListener('error', () => stage.classList.remove('is-visible'), { once: true });
      media.load();
      play();
    } else {
      media.alt = '';
      media.decoding = 'async';
      media.src = avatar.src;
    }

    stage.appendChild(media);
    stage.dataset.src = avatar.src;
  };

  const show = async row => {
    if (!isYearRow(row)) return;
    activeRow = row;
    const stage = ensureStage();
    if (!stage) return;
    const href = sameOriginHref(row);
    const avatar = await findAvatar(href);
    if (activeRow !== row || !avatar || getList()?.dataset.view !== 'year') return;
    mountMedia(stage, avatar);
    stage.classList.add('is-visible');
  };

  const hide = row => {
    if (row && activeRow && row !== activeRow) return;
    activeRow = null;
    const stage = ensureStage();
    stage?.classList.remove('is-visible');
    const video = stage?.querySelector('video');
    if (video && !video.paused) video.pause();
  };

  document.addEventListener('mouseover', event => {
    const row = event.target.closest?.('.work-row');
    if (!row || row.contains(event.relatedTarget) || !isYearRow(row)) return;
    show(row);
  });
  document.addEventListener('mouseout', event => {
    const row = event.target.closest?.('.work-row');
    if (!row || row.contains(event.relatedTarget)) return;
    hide(row);
  });
  document.addEventListener('focusin', event => {
    const row = event.target.closest?.('.work-row');
    if (isYearRow(row)) show(row);
  });
  document.addEventListener('focusout', event => {
    const row = event.target.closest?.('.work-row');
    if (row && !row.contains(event.relatedTarget)) hide(row);
  });
})();
