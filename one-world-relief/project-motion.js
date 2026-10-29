(() => {
  if (!document.body.classList.contains('project-motion-page')) return;

  // Decorative arrows keep the accessible link names and native clicks intact.
  document.querySelectorAll('#projectBoard .project-media > span:not(.project-media-banner), #projectBoard .project-actions .button-outline').forEach(label => {
    if (label.querySelector('.project-story-arrow')) return;
    const arrow = document.createElement('span');
    arrow.className = 'project-story-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '\u2192';
    label.append(arrow);
  });

  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const compactMotion = matchMedia('(hover: none), (pointer: coarse)');
  const animations = new Map();
  const targets = [...document.querySelectorAll([
    '#projectBoard .project-media',
    'main > .section > .section-heading',
    '.project-detail-copy > *',
    '.project-detail-feature',
    '.project-fact-grid > div',
    '.project-story-grid > div',
    '.project-detail-section > .section-heading',
    '.project-proof-grid .proof-card',
    '.project-timeline > div',
    '.project-detail-cta'
  ].join(','))];

  if (preference.matches || !('IntersectionObserver' in window) || !Element.prototype.animate) return;

  const getAnchor = () => {
    try {
      return document.getElementById(decodeURIComponent(location.hash.slice(1)));
    } catch {
      return null;
    }
  };
  const containsAnchor = (target, anchor) => anchor && (target.contains(anchor) || anchor.contains(target));
  const cancelAnimations = (within) => {
    animations.forEach((animation, target) => {
      if (within && !target.contains(within) && !within.contains(target)) return;
      animation.cancel();
      animations.delete(target);
    });
  };

  // Begin just before an item enters view; text never waits behind a long stagger.
  const observer = new IntersectionObserver(entries => {
    let order = 0;
    const anchor = getAnchor();
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (preference.matches || document.hidden || entry.target.contains(document.activeElement) || containsAnchor(entry.target, anchor)) continue;
      const hasVideo = !!entry.target.querySelector('video');
      const boardPreview = entry.target.matches('#projectBoard .project-media');
      const animation = entry.target.animate([
        { opacity: 0, translate: hasVideo ? '0 0' : boardPreview ? '0 8px' : compactMotion.matches ? '0 10px' : '0 16px' },
        { opacity: 1, translate: '0 0' }
      ], {
        duration: boardPreview ? 260 : compactMotion.matches ? 340 : 440,
        delay: boardPreview ? 0 : Math.min(order++ * 40, 120),
        easing: 'cubic-bezier(.22,1,.36,1)',
        fill: 'backwards'
      });
      animations.set(entry.target, animation);
      const forget = () => {
        if (animations.get(entry.target) === animation) animations.delete(entry.target);
      };
      animation.finished.then(forget, forget);
    }
  }, { rootMargin: '0px 0px 160px 0px', threshold: 0.01 });

  // The first screen and direct story links stay ready immediately on arrival.
  const initialAnchor = getAnchor();
  targets.forEach(target => {
    if (target.getBoundingClientRect().top >= window.innerHeight && !containsAnchor(target, initialAnchor)) observer.observe(target);
  });
  const stopMotion = () => {
    observer.disconnect();
    cancelAnimations();
  };
  document.addEventListener('focusin', event => cancelAnimations(event.target));
  document.addEventListener('pointerdown', event => cancelAnimations(event.target), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimations();
  });
  window.addEventListener('hashchange', () => {
    const anchor = getAnchor();
    if (anchor) cancelAnimations(anchor);
  });
  preference.addEventListener('change', event => {
    if (event.matches) stopMotion();
  });
  // A cached page comes back immediately rather than replaying an entrance.
  window.addEventListener('pagehide', stopMotion);
})();
