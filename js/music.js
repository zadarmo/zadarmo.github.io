/**
 * Music Theme — Annual Reports, Genre Evolution & Theme Switching
 */
(function () {
  'use strict';

  var MUSIC_JSON_PATH = '/music.json';
  var musicData = null;
  var musicInitialized = false;

  // --- Theme Dropdown ---
  var THEME_META = {
    gallery:  { icon: '📷', label: '摄影' },
    music:    { icon: '🎵', label: '音乐' },
    design:   { icon: '🎨', label: '设计' },
    reading:  { icon: '📖', label: '阅读' },
    travel:   { icon: '✈️', label: '旅行' }
  };

  function initThemeDropdown() {
    var dropdown = document.getElementById('theme-dropdown');
    if (!dropdown) return;

    // Toggle open/close
    var trigger = dropdown.querySelector('.dropdown-trigger');
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      closeAllDropdowns();
      dropdown.classList.toggle('open');
    });

    // Item click
    dropdown.querySelectorAll('.dropdown-item[data-theme]').forEach(function (item) {
      item.addEventListener('click', function () {
        var theme = item.getAttribute('data-theme');
        switchTheme(theme);
        dropdown.classList.remove('open');
      });
    });
  }

  function switchTheme(theme) {
    document.body.setAttribute('data-theme', theme);

    // Update dropdown active state + trigger label
    var dropdown = document.getElementById('theme-dropdown');
    if (dropdown) {
      dropdown.querySelectorAll('.dropdown-item[data-theme]').forEach(function (item) {
        item.classList.toggle('active', item.getAttribute('data-theme') === theme);
      });
      var meta = THEME_META[theme];
      if (meta) {
        var iconEl = dropdown.querySelector('.dropdown-icon');
        var textEl = dropdown.querySelector('.dropdown-text');
        if (iconEl) iconEl.textContent = meta.icon;
        if (textEl) textEl.textContent = meta.label;
      }
    }

    // Hide all views first
    document.querySelectorAll('.view').forEach(function (el) { el.classList.remove('active'); });

    var vlogBanner = document.getElementById('vlog-banner');

    if (theme === 'music') {
      var musicView = document.querySelector('.view-music');
      if (musicView) musicView.classList.add('active');
      if (vlogBanner) vlogBanner.classList.remove('visible');

      if (!musicInitialized) {
        musicInitialized = true;
        loadMusicData();
      } else {
        animateCounters();
      }
    } else if (theme === 'design') {
      var designView = document.querySelector('.view-design');
      if (designView) designView.classList.add('active');
      if (vlogBanner) vlogBanner.classList.remove('visible');
    } else if (theme === 'reading') {
      var readingView = document.querySelector('.view-reading');
      if (readingView) readingView.classList.add('active');
      if (vlogBanner) vlogBanner.classList.remove('visible');
    } else if (theme === 'travel') {
      var travelView = document.querySelector('.view-travel');
      if (travelView) travelView.classList.add('active');
      if (vlogBanner) vlogBanner.classList.remove('visible');
      if (typeof window.initTravelAnimations === 'function') {
        window.initTravelAnimations();
      }
    } else {
      // gallery theme — restore photo view
      if (typeof window.switchGalleryView === 'function') {
        window.switchGalleryView('gallery');
      }
    }
  }

  // Close all dropdowns on outside click
  function closeAllDropdowns() {
    document.querySelectorAll('.dropdown').forEach(function (d) { d.classList.remove('open'); });
  }

  document.addEventListener('click', function () { closeAllDropdowns(); });

  // --- Data Loading ---
  function loadMusicData() {
    fetch(MUSIC_JSON_PATH)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        musicData = data;
        buildMusicCards(data);
        buildGenreChart(data);
        setTimeout(animateCounters, 300);
        setTimeout(animateGenreBars, 600);
      });
  }

  // --- Counter Animation ---
  function animateCounters() {
    var counters = document.querySelectorAll('.music-stat-num');
    counters.forEach(function (counter) {
      var target = parseInt(counter.getAttribute('data-target'), 10);
      var duration = 1800;
      var startTime = null;

      function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        counter.textContent = Math.floor(eased * target).toLocaleString();
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          counter.textContent = target.toLocaleString();
        }
      }

      counter.textContent = '0';
      requestAnimationFrame(step);
    });
  }

  // --- Annual Panorama Infographic ---
  var MAX_MINUTES = 118634;
  var MAX_SONGS = 7191;

  function buildMusicCards(data) {
    var container = document.getElementById('music-cards');
    if (!container || !data.annualReports) return;

    var reports = data.annualReports;
    var ringRadius = 36;
    var circumference = 2 * Math.PI * ringRadius;

    // Rings row
    var ringsHtml = '<div class="mc-rings">';
    reports.forEach(function (report, index) {
      var totalHours = Math.round(report.totalMinutes / 60);
      var ratio = report.totalMinutes / MAX_MINUTES;
      var dashOffset = circumference * (1 - ratio);
      var size = Math.round(80 + (120 - 80) * ratio);

      ringsHtml += '<div class="mc-ring-col mc-col-' + index + '">' +
        '<svg class="mc-ring-svg" width="' + size + '" height="' + size + '" viewBox="0 0 80 80">' +
          '<circle class="mc-ring-bg" cx="40" cy="40" r="' + ringRadius + '"/>' +
          '<circle class="mc-ring-fg" cx="40" cy="40" r="' + ringRadius + '" stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + dashOffset.toFixed(1) + '"/>' +
        '</svg>' +
        '<span class="mc-ring-hours">' + totalHours.toLocaleString() + '</span>' +
        '<span class="mc-ring-unit">小时</span>' +
        '<span class="mc-ring-year">' + report.year + '</span>' +
      '</div>';
    });
    ringsHtml += '</div>';

    // Comparison table
    var tableHtml = '<table class="mc-table">';
    tableHtml += '<thead><tr><th class="mc-label"></th>';
    reports.forEach(function (report) {
      tableHtml += '<th>' + report.year + '</th>';
    });
    tableHtml += '</tr></thead><tbody>';

    // Row: Artist
    tableHtml += '<tr><td class="mc-label">年度歌手</td>';
    reports.forEach(function (report, index) {
      tableHtml += '<td class="mc-col-' + index + '">' +
        '<div class="mc-artist">' + report.topArtist + '</div>' +
        '<span class="mc-genre-tag">' + report.favoriteGenre + '</span>' +
      '</td>';
    });
    tableHtml += '</tr>';

    // Row: Songs count
    tableHtml += '<tr><td class="mc-label">听歌总数</td>';
    reports.forEach(function (report, index) {
      var barWidth = Math.round((report.totalSongs / MAX_SONGS) * 100);
      tableHtml += '<td class="mc-col-' + index + '">' +
        '<div class="mc-bar-wrap">' +
          '<div class="mc-bar-num">' + report.totalSongs.toLocaleString() + '</div>' +
          '<div class="mc-bar" style="width: ' + barWidth + '%;"></div>' +
          '<div class="mc-bar-sub">首</div>' +
        '</div>' +
      '</td>';
    });
    tableHtml += '</tr>';

    // Row: Active time
    tableHtml += '<tr><td class="mc-label">活跃时段</td>';
    reports.forEach(function (report) {
      tableHtml += '<td><span class="mc-text">' + report.activeTime + '</span></td>';
    });
    tableHtml += '</tr>';

    // Row: Keyword
    tableHtml += '<tr><td class="mc-label">年度关键词</td>';
    reports.forEach(function (report, index) {
      var keyword = report.keyword || report.title || '—';
      tableHtml += '<td class="mc-col-' + index + '"><span class="mc-keyword">' + keyword + '</span></td>';
    });
    tableHtml += '</tr>';

    // Row: Top songs
    tableHtml += '<tr><td class="mc-label">年度歌曲</td>';
    reports.forEach(function (report, index) {
      var songsHtml = '<div class="mc-songs">';
      (report.topSongs || []).forEach(function (song) {
        songsHtml += '<div class="mc-song-item">' + song + '</div>';
      });
      songsHtml += '</div>';
      tableHtml += '<td class="mc-col-' + index + '">' + songsHtml + '</td>';
    });
    tableHtml += '</tr>';

    tableHtml += '</tbody></table>';
    container.innerHTML = ringsHtml + tableHtml;
  }

  // --- Genre Evolution Chart ---
  var GENRE_COLORS = {
    '嘻哈说唱': '#a855f7',
    '欧美流行': '#f43f5e',
    '国风':     '#ec4899',
    '民谣':     '#22c55e',
    'R&B':      '#6366f1',
    '另类/独立': '#f59e0b',
    '流行摇滚':  '#8b5cf6',
    '粤语流行':  '#14b8a6'
  };

  function buildGenreChart(data) {
    var chartEl = document.getElementById('genre-chart');
    var summaryEl = document.getElementById('genre-summary');
    if (!chartEl || !data.genreEvolution) return;

    var timeline = data.genreEvolution.timeline;
    var years = ['2021', '2022', '2023', '2024', '2025'];

    var yearsHtml = '<div class="genre-years">';
    years.forEach(function (year) {
      yearsHtml += '<span class="genre-year-label">' + year + '</span>';
    });
    yearsHtml += '</div>';

    var rowsHtml = '';
    var genres = Object.keys(timeline);
    genres.forEach(function (genre) {
      var values = timeline[genre];
      var color = GENRE_COLORS[genre] || '#888';

      var barsHtml = '';
      years.forEach(function (year) {
        var value = values[year] || 0;
        var heightPercent = (value / 5) * 100;
        barsHtml += '<div class="genre-bar-cell">' +
          '<div class="genre-bar" style="height: 0%; background: ' + color + ';" data-height="' + heightPercent + '"></div>' +
        '</div>';
      });

      rowsHtml += '<div class="genre-row">' +
        '<span class="genre-label">' + genre + '</span>' +
        '<div class="genre-bars">' + barsHtml + '</div>' +
      '</div>';
    });

    chartEl.innerHTML = yearsHtml + rowsHtml;

    if (summaryEl && data.genreEvolution.summary) {
      summaryEl.textContent = data.genreEvolution.summary;
    }
  }

  function animateGenreBars() {
    var bars = document.querySelectorAll('.genre-bar');
    bars.forEach(function (bar, index) {
      var targetHeight = bar.getAttribute('data-height');
      setTimeout(function () {
        bar.style.height = targetHeight + '%';
        bar.classList.add('visible');
      }, index * 40);
    });
  }

  // --- Init ---
  function bootMusic() {
    initThemeDropdown();
    document.body.setAttribute('data-theme', 'gallery');
  }

  // Expose for gallery.js integration
  window.initMusicTheme = bootMusic;

  document.addEventListener('DOMContentLoaded', bootMusic);
  if (document.readyState !== 'loading') bootMusic();
})();
