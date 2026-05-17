/**
 * Travel Theme — Section reveal animations
 */
(function () {
  'use strict';

  function initTravelAnimations() {
    var sections = document.querySelectorAll('.travel-section');
    if (!sections.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('travel-section--visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    sections.forEach(function (section) {
      section.classList.add('travel-section--hidden');
      observer.observe(section);
    });
  }

  /* Expose for theme switcher */
  window.initTravelAnimations = initTravelAnimations;

  document.addEventListener('DOMContentLoaded', function () {
    if (document.body.getAttribute('data-theme') === 'travel') {
      initTravelAnimations();
    }
  });
})();
