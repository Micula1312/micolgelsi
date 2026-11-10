(() => {
  const archive = document.querySelector('[data-institutional-archive]');
  const gallery = archive?.querySelector('[data-institutional-entries]');
  const button = archive?.querySelector('[data-graphics-kaos]');
  if (!gallery || !button) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false;
  let pending = 0;
  let items = [];
  const animations = new Map();
  const cards = () => [...gallery.querySelectorAll('.institutional-graphic-entry')].filter(card => !card.hidden);
  const rects = () => new Map(cards().map(card => [card, card.getBoundingClientRect()]));
  const cancel = () => {
    animations.forEach(animation => animation.cancel());
    animations.clear();
  };
  const settle = (before) => {
    if (reduced.matches) return;
    cards().forEach(card => {
      const previous = before.get(card);
      if (!previous) return;
      const next = card.getBoundingClientRect();
      const animation = card.animate([
        { transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px) scale(${previous.width / Math.max(1, next.width)})` },
        { transform: 'none' }
      ], { duration: 700, easing: 'cubic-bezier(.22,.61,.36,1)' });
      animations.set(card, animation);
      animation.finished.then(() => {
        if (animations.get(card) === animation) animations.delete(card);
        if (active) float(card);
      }).catch(() => {});
    });
  };
  const float = card => {
    if (reduced.matches || !active || card.hidden || animations.has(card)) return;
    const x = parseFloat(card.style.getPropertyValue('--kaos-x')) || 0;
    const y = parseFloat(card.style.getPropertyValue('--kaos-y')) || 0;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const limitX = Math.max(0, gallery.clientWidth - width - 12);
    const limitY = Math.max(0, gallery.clientHeight - height - 12);
    const points = [{ transform: 'translate(0,0) rotate(0deg)' }];
    for (let i = 0; i < 5; i++) {
      const targetX = 6 + Math.random() * Math.max(0, limitX - 6);
      const targetY = 6 + Math.random() * Math.max(0, limitY - 6);
      points.push({ transform: `translate(${targetX - x}px,${targetY - y}px) rotate(${Math.random() * 16 - 8}deg)` });
    }
    points.push(points[0]);
    const animation = card.animate(points, {
      duration: 14000 + Math.random() * 10000, iterations: Infinity, easing: 'linear'
    });
    animations.set(card, animation);
    if (document.hidden || lightbox.open || card.matches(':focus-visible')) animation.pause();
  };
  const scatter = (animate = true) => {
    const before = rects();
    cancel();
    items = cards();
    const width = gallery.clientWidth;
    if (!width) return;
    const margin = Math.min(26, width * .07);
    const columns = width < 540 ? 3 : 4;
    const size = Math.max(1, (width - margin * 2) / columns);
    const height = Math.max(460, Math.min(850, window.innerHeight * .82));
    gallery.style.setProperty('--kaos-height', `${height}px`);
    gallery.classList.add('is-graphics-kaos');
    items.forEach((card, index) => {
      const cardWidth = Math.min(width - margin * 2, size * (.72 + Math.random() * .25));
      const cardHeight = size * (.85 + Math.random() * .2);

      const x = Math.max(margin, Math.min(width - cardWidth - margin, Math.random() * (width - cardWidth)));
      const y = Math.max(margin, Math.min(height - cardHeight - margin, Math.random() * (height - cardHeight)));
      card.style.setProperty('--kaos-x', `${x}px`);
      card.style.setProperty('--kaos-y', `${y}px`);
      card.style.setProperty('--kaos-width', `${cardWidth}px`);
      card.style.setProperty('--kaos-card-height', `${cardHeight}px`);
    });
    if (animate && !reduced.matches) settle(before);
    else items.forEach(float);
  };
  const restore = (animate = true) => {
    const before = rects();
    active = false;
    cancel();
    gallery.classList.remove('is-graphics-kaos');
    gallery.style.removeProperty('--kaos-height');
    items.forEach(card => ['--kaos-x', '--kaos-y', '--kaos-width', '--kaos-card-height'].forEach(prop => card.style.removeProperty(prop)));
    button.textContent = 'KAOS ↗';
    button.setAttribute('aria-pressed', 'false');
    if (animate) settle(before);
  };
  const refresh = () => {
    const visible = gallery.classList.contains('is-graphics-masonry');
    button.hidden = !visible;
    button.disabled = !cards().length;
    if (!visible) restore(false);
    else if (active) scatter(false);
  };
  button.addEventListener('click', () => {
    if (active) restore();
    else {
      active = true;
      button.textContent = 'GRID ↙';
      button.setAttribute('aria-pressed', 'true');
      scatter();
    }
  });
  gallery.querySelectorAll('.institutional-graphic-entry').forEach(card => {
    const pause = () => animations.get(card)?.pause();
    const resume = () => {
      if (!document.hidden && !lightbox.open && !card.matches(':focus-within')) animations.get(card)?.play();
    };
    card.addEventListener('focusin', pause);
    card.addEventListener('focusout', resume);
  });

  const lightbox = document.createElement('dialog');
  lightbox.className = 'graphics-lightbox';
  lightbox.setAttribute('aria-label', 'Graphic preview');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'graphics-lightbox-close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close graphic');
  const preview = document.createElement('div');
  preview.className = 'graphics-lightbox-media';
  lightbox.append(closeButton, preview);
  document.body.append(lightbox);
  let opener = null;
  const openGraphic = card => {
    const source = card.querySelector('.institutional-entry-image img, .institutional-entry-image video');
    if (!source) return;
    opener = card;
    const media = source.cloneNode(true);
    media.removeAttribute('loading');
    if (media.tagName === 'VIDEO') {
      media.controls = true;
      media.autoplay = true;
      media.loop = true;
    }
    preview.replaceChildren(media);
    animations.forEach(animation => animation.pause());
    lightbox.showModal();
    closeButton.focus();
  };
  closeButton.addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox || event.target === preview) lightbox.close();
  });
  lightbox.addEventListener('close', () => {
    preview.querySelector('video')?.pause();
    preview.replaceChildren();
    opener?.focus({ preventScroll: true });
    animations.forEach((animation, card) => {
      if (!document.hidden && !card.matches(':focus-within')) animation.play();
    });
  });
  gallery.addEventListener('click', event => {
    const card = event.target.closest('.institutional-graphic-entry');
    if (!card || !gallery.classList.contains('is-graphics-masonry') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openGraphic(card);
  });

  archive.addEventListener('graphics:layout', refresh);
  let lastWidth = gallery.clientWidth;
  new ResizeObserver(() => {
    const width = gallery.clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => { if (active) scatter(false); });
  }).observe(gallery);
  document.addEventListener('visibilitychange', () => animations.forEach((animation, card) => {
    if (document.hidden || lightbox.open || card.matches(':focus-within')) animation.pause();
    else animation.play();
  }));
  reduced.addEventListener('change', () => { if (active) scatter(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && active && !lightbox.open && !event.defaultPrevented) restore(); });
  refresh();
})();
