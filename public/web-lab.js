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
  const open = card => {
    opener = card;
    title.textContent = card.dataset.labTitle;
    const demo = safeURL(card.dataset.labDemo || '');
    const destination = demo || safeURL(card.href);
    play.href = destination || '#';
    play.hidden = !destination;
    play.textContent = demo ? 'PLAY ↗' : 'SOURCE ↗';
    content.replaceChildren();
    const mediaURL = safeURL(card.dataset.labImage || '');
    const media = mediaURL ? document.createElement(/\.(mp4|webm|ogg|mov)(?:$|[?#])/i.test(mediaURL) ? 'video' : 'img') : null;
    if (media) {
      media.src = mediaURL;
      if (media.tagName === 'IMG') media.alt = card.dataset.labTitle || '';
    }
    if (demo) content.append(frameFor(demo, card.dataset.labTitle));
    else if (media) {
      const copy = media.cloneNode(true);
      if (copy.tagName === 'VIDEO') { copy.controls = true; copy.autoplay = true; }
      content.append(copy);
    } else {
      const description = document.createElement('p');
      description.textContent = card.dataset.labDescription || 'Local prototype';
      content.append(description);
    }
    hint.hidden = !demo;
    dialog.showModal();
    close.focus();
  };
  cards.forEach(card => {
    card.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(card);
    });
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    content.querySelector('video')?.pause();
    content.replaceChildren();
    opener?.focus({ preventScroll: true });
  });
})();
