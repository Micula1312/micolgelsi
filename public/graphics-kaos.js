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
    const radius = 9 + Math.random() * 7;
    const tilt = Math.random() * 4 - 2;
    const animation = card.animate([
      { transform: 'translate(0,0) rotate(0deg)' },
      { transform: `translate(${radius}px,${-radius}px) rotate(${tilt}deg)` },
      { transform: `translate(${-radius}px,${radius}px) rotate(${-tilt}deg)` },
      { transform: 'translate(0,0) rotate(0deg)' }
    ], { duration: 15000 + Math.random() * 14000, iterations: Infinity, easing: 'ease-in-out' });
    animations.set(card, animation);
    if (document.hidden || card.matches(':hover, :focus-visible')) animation.pause();
  };
  const scatter = (animate = true) => {
    const before = rects();
    cancel();
    items = cards();
    const width = gallery.clientWidth;
    if (!width) return;
    const margin = Math.min(26, width * .07);
    const columns = width < 540 ? 2 : 3;
    const size = Math.max(1, (width - margin * 2) / columns);
    const height = Math.max(420, Math.ceil(items.length / columns) * size * 1.2);
    gallery.style.setProperty('--kaos-height', `${height}px`);
    gallery.classList.add('is-graphics-kaos');
    items.forEach((card, index) => {
      const cardWidth = Math.min(width - margin * 2, size * (.72 + Math.random() * .25));
      const cardHeight = size * (.85 + Math.random() * .2);
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = Math.max(margin, Math.min(width - cardWidth - margin, margin + column * size + (Math.random() - .5) * size * .5));
      const y = Math.max(margin, Math.min(height - cardHeight - margin, margin + row * size * 1.2 + Math.random() * size * .4));
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
      if (!document.hidden && !card.matches(':hover, :focus-within')) animations.get(card)?.play();
    };
    card.addEventListener('pointerenter', pause);
    card.addEventListener('pointerleave', resume);
    card.addEventListener('focusin', pause);
    card.addEventListener('focusout', resume);
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
    if (document.hidden || card.matches(':hover, :focus-within')) animation.pause();
    else animation.play();
  }));
  reduced.addEventListener('change', () => { if (active) scatter(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && active) restore(); });
  refresh();
})();
