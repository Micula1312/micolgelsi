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

/* YEAR VIEW — shared rotating avatar stage. The stage becomes visible as soon
   as a project enters the existing .is-year-focus state; media loading can no
   longer keep the star hidden. */
(() => {
  const base = '/portfolio';
  const cache = new Map();
  const pending = new Map();
  let activeRow = null;
  let focusObserver = null;

  const getList = () => document.querySelector('#work-list');
  const withBase = value => {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith(base + '/')) return value;
    if (value.startsWith('/') && !value.startsWith('//')) return `${base}${value}`;
    return value;
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

  const forceVisible = stage => {
    stage.classList.add('is-visible', 'is-loading');
    stage.style.display = 'block';
    stage.style.opacity = '1';
    stage.style.visibility = 'visible';
  };

  const projectHref = row => {
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
        return {
          src: new URL(withBase(src), window.location.origin).href,
          kind: media.tagName.toLowerCase() === 'video' ? 'video' : 'image'
        };
      })
      .catch(() => null)
      .then(result => {
        if (result) cache.set(href, result);
        return result;
      })
      .finally(() => pending.delete(href));

    pending.set(href, job);
    return job;
  };

  const mountMedia = (stage, avatar) => {
    if (stage.dataset.src === avatar.src && stage.firstElementChild) {
      stage.classList.remove('is-loading');
      const existing = stage.firstElementChild;
      if (existing.tagName === 'VIDEO') {
        existing.muted = true;
        existing.loop = true;
        existing.playsInline = true;
        existing.play().catch(() => {});
      }
      return;
    }

    stage.replaceChildren();
    stage.dataset.src = '';
    const media = document.createElement(avatar.kind === 'video' ? 'video' : 'img');
    media.className = 'year-avatar-star-media';

    const loaded = () => {
      stage.classList.remove('is-loading');
      forceVisible(stage);
      stage.classList.remove('is-loading');
    };

    if (avatar.kind === 'video') {
      media.muted = true;
      media.defaultMuted = true;
      media.loop = true;
      media.autoplay = true;
      media.playsInline = true;
      media.preload = 'auto';
      media.setAttribute('muted', '');
      media.setAttribute('loop', '');
      media.setAttribute('autoplay', '');
      media.setAttribute('playsinline', '');
      media.src = avatar.src;
      const play = () => media.play().catch(() => {});
      media.addEventListener('loadeddata', () => { loaded(); play(); });
      media.addEventListener('canplay', () => { loaded(); play(); });
      stage.appendChild(media);
      media.load();
      play();
    } else {
      media.alt = '';
      media.decoding = 'async';
      media.addEventListener('load', loaded, { once: true });
      media.src = avatar.src;
      stage.appendChild(media);
    }

    stage.dataset.src = avatar.src;
  };

  const showForRow = async row => {
    const list = getList();
    if (!list || list.dataset.view !== 'year' || !row?.classList.contains('is-year-focus')) return;

    activeRow = row;
    const stage = ensureStage();
    if (!stage) return;

    /* Crucial: reveal the star now, before any async media request. */
    forceVisible(stage);

    const avatar = await findAvatar(projectHref(row));
    if (activeRow !== row || !row.classList.contains('is-year-focus') || getList()?.dataset.view !== 'year') return;

    if (avatar) mountMedia(stage, avatar);
    else stage.classList.remove('is-loading');
  };

  const hideStage = () => {
    activeRow = null;
    const stage = ensureStage();
    if (!stage) return;
    stage.classList.remove('is-visible', 'is-loading');
    stage.style.opacity = '0';
    stage.style.visibility = 'hidden';
    const video = stage.querySelector('video');
    if (video && !video.paused) video.pause();
  };

  const syncFromFocusState = () => {
    const list = getList();
    if (!list || list.dataset.view !== 'year') {
      hideStage();
      return;
    }
    const focused = list.querySelector('.work-row.is-year-focus');
    if (focused) showForRow(focused);
    else hideStage();
  };

  const boot = () => {
    const list = getList();
    if (!list) {
      requestAnimationFrame(boot);
      return;
    }

    ensureStage();
    focusObserver?.disconnect();
    focusObserver = new MutationObserver(mutations => {
      if (mutations.some(m => m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'data-view'))) {
        syncFromFocusState();
      }
    });
    focusObserver.observe(list, { subtree: true, attributes: true, attributeFilter: ['class','data-view'] });
    syncFromFocusState();
  };

  boot();
})();
