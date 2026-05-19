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

  var VLOG_SRC = '//player.bilibili.com/player.html?bvid=BV1ty576TE8R&page=1&autoplay=1&high_quality=1';

  function openTravelVlog() {
    var overlay = document.getElementById('vlog-overlay');
    var iframe = document.getElementById('vlog-iframe');
    if (!overlay || !iframe) return;
    iframe.src = VLOG_SRC;
    overlay.classList.add('active');
    document.body.classList.add('lightbox-open');
  }

  function initTravelLogActions() {
    document.querySelectorAll('.js-travel-vlog').forEach(function (btn) {
      btn.addEventListener('click', openTravelVlog);
    });

    document.querySelectorAll('.js-travel-gallery').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var themeItem = document.querySelector('.dropdown-item[data-theme="gallery"]');
        if (themeItem) themeItem.click();
      });
    });
  }

  window.initTravelLogActions = initTravelLogActions;

  document.addEventListener('DOMContentLoaded', function () {
    initTravelLogActions();
    if (document.body.getAttribute('data-theme') === 'travel') {
      initTravelAnimations();
    }
  });
})();
