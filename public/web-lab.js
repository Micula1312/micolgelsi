(() => {
  const archive = document.querySelector('[data-institutional-archive]');
  const gallery = archive?.querySelector('[data-institutional-entries]');
  if (!gallery) return;
  const cards = [...gallery.querySelectorAll('[data-lab-window]')];
  const dialog = document.createElement('dialog');
  dialog.className = 'lab-preview-dialog';
  dialog.setAttribute('aria-label', 'Web Lab experiment');
  const header = document.createElement('div');
  header.className = 'lab-preview-header';
  const title = document.createElement('strong');
  title.id = 'lab-preview-title';
  dialog.setAttribute('aria-labelledby', title.id);
  const play = document.createElement('a');
  play.target = '_blank';
  play.rel = 'noopener noreferrer';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close experiment');
  const content = document.createElement('div');
  content.className = 'lab-preview-content';
  const hint = document.createElement('p');
  hint.className = 'lab-preview-hint';
  hint.textContent = 'If the preview does not load, open the experiment with the link above.';
  header.append(title, play, close);
  dialog.append(header, content, hint);
  document.body.append(dialog);
  let opener;
  const safeURL = value => {
    if (!value || value === '#') return '';
    try { const url = new URL(value, location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  };
  const frameFor = (url, name) => {
    const frame = document.createElement('iframe');
    frame.title = name;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.referrerPolicy = 'no-referrer';
    frame.src = url;
    return frame;
  };
  const unload = card => {
    const frame = card.querySelector('[data-lab-live] iframe');
    frame?.remove();
    card.querySelector('video')?.pause();
  };
  const load = card => {
    if (card.hidden || !gallery.classList.contains('is-lab-windows') || document.hidden || dialog.open) return;
    const host = card.querySelector('[data-lab-live]');
    const url = safeURL(host?.dataset.labLive || '');
    if (host && url && !host.querySelector('iframe')) {
      const frame = frameFor(url, `Preview: ${card.dataset.labTitle}`);
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      host.append(frame);
    }
    card.querySelector('video')?.play().catch(() => {});
  };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? load(entry.target) : unload(entry.target));
  }, { threshold: .15 });
  const refresh = () => {
    cards.forEach(card => {
      observer.unobserve(card);
      if (!card.hidden && gallery.classList.contains('is-lab-windows')) observer.observe(card);
      else unload(card);
    });
  };
  const open = card => {
    opener = card;
    title.textContent = card.dataset.labTitle;
    const demo = safeURL(card.dataset.labDemo || '');
    const destination = demo || safeURL(card.href);
    play.href = destination || '#';
    play.hidden = !destination;
    play.textContent = demo ? 'PLAY ↗' : 'SOURCE ↗';
    content.replaceChildren();
    const media = card.querySelector('.institutional-entry-image img, .institutional-entry-image video');
    if (demo) content.append(frameFor(demo, card.dataset.labTitle));
    else if (media) {
      const copy = media.cloneNode(true);
      if (copy.tagName === 'VIDEO') { copy.controls = true; copy.autoplay = true; }
      content.append(copy);
    } else {
      const description = document.createElement('p');
      description.textContent = card.querySelector('.institutional-entry-info p')?.textContent || 'Local prototype';
      content.append(description);
    }
    hint.hidden = !demo;
    cards.forEach(unload);
    dialog.showModal();
    close.focus();
  };
  cards.forEach(card => {
    const image = card.querySelector('.institutional-entry-image');
    if (image) new ResizeObserver(() => card.style.setProperty('--lab-preview-scale', String(image.clientWidth / 1200))).observe(image);
    card.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(card);
    });
    card.addEventListener('pointerenter', () => load(card));
    card.addEventListener('focusin', () => load(card));
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    content.querySelector('video')?.pause();
    content.replaceChildren();
    opener?.focus({ preventScroll: true });
    refresh();
  });
  document.addEventListener('visibilitychange', () => document.hidden ? cards.forEach(unload) : refresh());
  archive.addEventListener('graphics:layout', refresh);
  refresh();
})();
