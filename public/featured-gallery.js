(() => {
  const body = document.body;
  const galleries = [...document.querySelectorAll('[data-featured-gallery]')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  galleries.forEach(gallery => {
    let running = false;
    let animationFrame = 0;
    let lastTime = 0;

    const animate = time => {
      if (!running) return;
      const elapsed = Math.min(32, time - (lastTime || time));
      lastTime = time;
      const rect = gallery.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight && gallery.scrollWidth > gallery.clientWidth) {
        gallery.scrollLeft += elapsed * .045;
        if (gallery.scrollLeft >= gallery.scrollWidth - gallery.clientWidth - 1) gallery.scrollLeft = 0;
      }
      animationFrame = requestAnimationFrame(animate);
    };

    const toggle = () => {
      gallery.classList.add('is-carousel');
      running = !running && !reduced;
      gallery.classList.toggle('is-running', running);
      gallery.setAttribute('aria-label', running ? 'Highlighted gallery carousel playing' : 'Highlighted gallery carousel paused');
      cancelAnimationFrame(animationFrame);
      lastTime = 0;
      if (running) animationFrame = requestAnimationFrame(animate);
    };

    gallery.addEventListener('click', event => {
      if (!event.target.closest('[data-featured-image]')) return;
      event.preventDefault();
      toggle();
    });
    gallery.addEventListener('keydown', event => {
      if (!event.target.closest('[data-featured-image]') || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      toggle();
    });
  });
})();
