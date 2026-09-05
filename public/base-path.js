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

/* YEAR VIEW — one shared avatar stage. Prefer avatar data already rendered on
   each project row; fall back to the project page only for older content. */
(() => {
  const base = '/portfolio';
  const cache = new Map();
  let activeRow = null;

  const withBase = value => {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith(base + '/')) return value;
    if (value.startsWith('/') && !value.startsWith('//')) return `${base}${value}`;
    return value;
  };

  const avatarKind = src => /\.(?:mp4|webm|mov)(?:[?#].*)?$/i.test(src || '') ? 'video' : 'image';

  const boot = () => {
    const list = document.querySelector('#work-list');
    if (!list) return;
    const rows = [...list.querySelectorAll('.work-row')];

    const stage = document.createElement('span');
    stage.className = 'year-avatar-star';
    stage.setAttribute('aria-hidden', 'true');
    list.appendChild(stage);

    const hide = row => {
      if (row && activeRow !== row) return;
      activeRow = null;
      stage.classList.remove('is-visible');
      stage.style.background = 'transparent';
      const video = stage.querySelector('video');
      if (video && !video.paused) video.pause();
    };

    const getAvatar = async row => {
      if (row.dataset.external === 'true') return null;

      const direct = String(row.dataset.avatar || '').trim();
      if (direct) {
        const src = new URL(withBase(direct), window.location.origin).href;
        return { src, kind: avatarKind(src) };
      }

      const raw = row.getAttribute('href');
      if (!raw) return null;
      const href = new URL(raw, window.location.href).href;
      if (cache.has(href)) return cache.get(href);

      try {
        const response = await fetch(href, { credentials: 'same-origin' });
        if (!response.ok) return null;
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const media = doc.querySelector('[data-project-loader] .project-entry-media');
        const src = media?.getAttribute('src');
        if (!src) return null;
        const avatar = {
          src: new URL(withBase(src), window.location.origin).href,
          kind: media.tagName.toLowerCase() === 'video' ? 'video' : 'image'
        };
        cache.set(href, avatar);
        return avatar;
      } catch {
        return null;
      }
    };

    const mount = avatar => {
      if (!avatar) return;
      if (stage.dataset.src === avatar.src && stage.firstElementChild) {
        const video = stage.querySelector('video');
        if (video) video.play().catch(() => {});
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
        media.preload = 'metadata';
        media.src = avatar.src;
        stage.appendChild(media);
        media.play().catch(() => {});
      } else {
        media.alt = '';
        media.decoding = 'async';
        media.src = avatar.src;
        stage.appendChild(media);
      }
      stage.dataset.src = avatar.src;
    };

    const show = async row => {
      if (list.dataset.view !== 'year' || row.dataset.external === 'true') return;
      activeRow = row;
      const hasDirectAvatar = Boolean(String(row.dataset.avatar || '').trim());
      stage.style.background = hasDirectAvatar ? 'transparent' : 'var(--signal)';
      stage.classList.add('is-visible');

      const avatar = await getAvatar(row);
      if (activeRow !== row || list.dataset.view !== 'year') return;
      if (avatar) {
        mount(avatar);
        stage.style.background = 'transparent';
      } else {
        stage.classList.remove('is-visible');
      }
    };

    rows.forEach(row => {
      row.addEventListener('mouseenter', () => show(row), { passive: true });
      row.addEventListener('mouseleave', () => hide(row), { passive: true });
      row.addEventListener('focus', () => show(row));
      row.addEventListener('blur', () => hide(row));
    });

    document.querySelectorAll('.view-button').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.view !== 'year') hide();
      });
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
