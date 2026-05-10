/**
 * Common — Shared utilities across all themes
 * Day/Night mode, theme tab styling, etc.
 */
(function () {
  'use strict';

  // --- Day/Night Auto Theme ---
  function applyAutoTheme() {
    var saved = null;
    try { saved = localStorage.getItem('theme'); } catch (e) {}

    if (saved) {
      if (saved === 'light') {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }
      return;
    }

    // Auto: 9:00-18:00 light, otherwise dark
    var hour = new Date().getHours();
    if (hour >= 9 && hour < 18) {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }

  function initDayNightToggle() {
    var themeToggle = document.querySelector('.theme-toggle');
    if (!themeToggle) return;

    themeToggle.addEventListener('click', function () {
      document.body.classList.toggle('light-theme');
      var isLight = document.body.classList.contains('light-theme');
      try { localStorage.setItem('theme', isLight ? 'light' : 'dark'); } catch (e) {}
    });
  }

  // --- Boot ---
  function bootCommon() {
    applyAutoTheme();
    initDayNightToggle();
  }

  document.addEventListener('DOMContentLoaded', bootCommon);
  if (document.readyState !== 'loading') bootCommon();
})();
