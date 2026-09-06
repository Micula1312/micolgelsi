(() => {
  const body = document.body;
  const galleries = [...document.querySelectorAll('[data-featured-gallery]')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let frame = 0;
  const scenes = [];

  const documentTop = element => element.getBoundingClientRect().top + window.scrollY;

  const measureScene = scene => {
    const { wrapper, gallery } = scene;
    gallery.style.removeProperty('height');
    const galleryHeight = gallery.offsetHeight;
    const distance = Math.max(0, gallery.scrollWidth - gallery.clientWidth);
    const stickyTop = Number.parseFloat(getComputedStyle(gallery).top) || 0;

    scene.distance = distance;
    scene.start = documentTop(wrapper) - stickyTop;
    wrapper.style.height = `${Math.ceil(galleryHeight + distance)}px`;
    gallery.setAttribute(
      'aria-label',
      distance > 0
        ? 'Highlighted gallery. Vertical scrolling moves the images horizontally.'
        : 'Highlighted gallery.'
    );
  };

  const paint = () => {
    frame = 0;

    const pageDistance = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    body.style.setProperty(
      '--project-scroll',
      String(Math.max(0, Math.min(1, window.scrollY / pageDistance)))
    );

    scenes.forEach(scene => {
      const distance = scene.distance || 0;
      if (!distance) {
        scene.gallery.scrollLeft = 0;
        return;
      }
      const progress = Math.max(0, Math.min(1, (window.scrollY - scene.start) / distance));
      scene.gallery.scrollLeft = progress * distance;
      scene.gallery.classList.toggle('is-running', progress > 0 && progress < 1);
    });
  };

  const requestPaint = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const measureAll = () => {
    scenes.forEach(measureScene);
    requestPaint();
  };

  galleries.forEach(gallery => {
    const items = [...gallery.querySelectorAll('[data-featured-image]')];
    if (items.length < 2 || reduced) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'featured-scroll-scene';
    gallery.parentNode.insertBefore(wrapper, gallery);
    wrapper.appendChild(gallery);
    gallery.classList.add('is-scroll-gallery');

    items.forEach(item => {
      item.removeAttribute('role');
      item.removeAttribute('tabindex');
      item.removeAttribute('aria-label');
    });

    scenes.push({ wrapper, gallery, distance: 0, start: 0 });

    gallery.querySelectorAll('img').forEach(image => {
      if (!image.complete) image.addEventListener('load', measureAll, { once: true });
    });
  });

  if (scenes.length) {
    const observer = new ResizeObserver(measureAll);
    scenes.forEach(scene => observer.observe(scene.gallery));
    window.addEventListener('scroll', requestPaint, { passive: true });
    window.addEventListener('resize', measureAll, { passive: true });
    requestAnimationFrame(measureAll);
  } else {
    window.addEventListener('scroll', requestPaint, { passive: true });
    window.addEventListener('resize', requestPaint, { passive: true });
    paint();
  }
})();
