(() => {
  const body = document.body;
  const galleries = [...document.querySelectorAll('[data-featured-gallery]')];

  let scrollFrame = 0;
  const paintProgress = () => {
    scrollFrame = 0;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    body.style.setProperty('--project-scroll', String(Math.max(0, Math.min(1, window.scrollY / max))));
  };
  const requestProgress = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(paintProgress);
  };
  window.addEventListener('scroll', requestProgress, { passive: true });
  window.addEventListener('resize', requestProgress, { passive: true });
  paintProgress();

  let lightbox = document.querySelector('[data-moment-lightbox]');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.className = 'moment-lightbox';
    lightbox.dataset.momentLightbox = '';
    lightbox.setAttribute('aria-hidden', 'true');
    lightbox.innerHTML = `<button class="moment-lightbox-close" type="button" aria-label="Close">×</button><button class="moment-lightbox-prev" type="button" aria-label="Previous media">←</button><figure><div class="moment-lightbox-stage"></div><figcaption></figcaption></figure><button class="moment-lightbox-next" type="button" aria-label="Next media">→</button>`;
    document.body.append(lightbox);
  }

  const stage = lightbox.querySelector('.moment-lightbox-stage');
  const caption = lightbox.querySelector('figcaption');
  let currentMedia = [];
  let currentTitle = '';
  let currentIndex = 0;

  const isVideo = src => /\.(?:mp4|webm|mov)(?:$|\?)/i.test(src || '');
  const stopVideo = () => lightbox.querySelector('video')?.pause();

  const show = () => {
    if (!currentMedia.length || !stage || !caption) return;
    stopVideo();
    const src = currentMedia[currentIndex] || '';
    stage.innerHTML = '';

    if (isVideo(src)) {
      const video = document.createElement('video');
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = 'metadata';
      stage.append(video);
      video.play().catch(() => {});
    } else {
      const image = document.createElement('img');
      image.src = src;
      image.alt = `${currentTitle} — ${currentIndex + 1}`;
      stage.append(image);
    }
    caption.textContent = `${currentIndex + 1} / ${currentMedia.length}`;
  };

  const open = ({ media = [], title = '', index = 0 } = {}) => {
    if (!Array.isArray(media) || !media.length) return;
    currentMedia = media;
    currentTitle = title;
    currentIndex = Math.max(0, Math.min(media.length - 1, Number(index) || 0));
    show();
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('has-lightbox');
  };

  const close = () => {
    stopVideo();
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('has-lightbox');
  };

  const previous = () => {
    if (!currentMedia.length) return;
    currentIndex = (currentIndex - 1 + currentMedia.length) % currentMedia.length;
    show();
  };
  const next = () => {
    if (!currentMedia.length) return;
    currentIndex = (currentIndex + 1) % currentMedia.length;
    show();
  };

  lightbox.querySelector('.moment-lightbox-close')?.addEventListener('click', close);
  lightbox.querySelector('.moment-lightbox-prev')?.addEventListener('click', previous);
  lightbox.querySelector('.moment-lightbox-next')?.addEventListener('click', next);
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) close();
  });
  document.addEventListener('keydown', event => {
    if (!lightbox.classList.contains('is-open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') previous();
    if (event.key === 'ArrowRight') next();
  });
  document.addEventListener('portfolio:open-media', event => open(event.detail));

  galleries.forEach(gallery => {
    const title = document.querySelector('.project-head h1')?.textContent?.trim() || '';
    const figures = [...gallery.querySelectorAll(':scope > figure')];
    const media = figures.map(figure => {
      const element = figure.querySelector('img,video');
      return element?.currentSrc || element?.getAttribute('src') || '';
    }).filter(Boolean);

    figures.forEach((figure, index) => {
      if (!figure.matches('[data-featured-image]')) return;
      figure.setAttribute('role', 'button');
      figure.setAttribute('tabindex', '0');
      figure.setAttribute('aria-label', `Open image ${index + 1} of ${media.length}`);

      const activate = () => open({ media, title, index });
      figure.addEventListener('click', activate);
      figure.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        activate();
      });
    });
  });
})();
