/**
 * Photography Portfolio — Lightbox, Lazy Loading & EXIF Display
 */
(function () {
  'use strict';

  /* --- Image Source Config --- */
  // true  = local mode: thumbnails from /photos/2026_51/thumbnails/, full images from /photos/2026_51/
  // false = remote mode: all images from Cloudflare R2
  var USE_LOCAL_IMAGES = true;

  var REMOTE_DIR = 'https://pub-c40b81a03e774e4fae8c2e6b28abcb92.r2.dev/2026_51/';
  var LOCAL_THUMB_DIR = '/photo/2026_51/thumbnails/';
  var LOCAL_FULL_DIR = '/photo/2026_51/compressed/';
  var EXIF_JSON_PATH = '/exif.json';
  var PHOTOS = [];

  const overlay = document.querySelector('.lightbox-overlay');
  const lightboxImage = overlay.querySelector('.lightbox-image');
  const counterElement = overlay.querySelector('.lightbox-counter');
  const exifElement = overlay.querySelector('.lightbox-exif');
  const prevButton = overlay.querySelector('.lightbox-prev');
  const nextButton = overlay.querySelector('.lightbox-next');
  const closeButton = overlay.querySelector('.lightbox-close');

  let galleryImages = [];
  let galleryItems = [];
  let currentIndex = 0;
  var exifCache = {};
  var hsvSatCache = {};
  var locationCache = {};
  var gpsCache = {};
  var mapInitialized = false;
  var timelineInitialized = false;
  var riverInitialized = false;
  var currentMonth = null;

  function getThumbSrc(filename) {
    return USE_LOCAL_IMAGES ? LOCAL_THUMB_DIR + filename : REMOTE_DIR + filename;
  }

  function getFullSrc(filename) {
    return USE_LOCAL_IMAGES ? LOCAL_FULL_DIR + filename : REMOTE_DIR + filename;
  }

  function loadDataAndBuild() {
    fetch(EXIF_JSON_PATH)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        // Dynamic photo list from exif.json keys
        PHOTOS = Object.keys(data).sort();

        // Parse EXIF data
        PHOTOS.forEach(function (filename, index) {
          var info = data[filename];
          if (!info) return;

          var paramParts = [];
          if (info.focalLength) paramParts.push(formatFocalLength(info.focalLength));
          if (info.fNumber) paramParts.push(formatAperture(info.fNumber));
          if (info.exposureTime) paramParts.push(formatExposureTime(info.exposureTime));
          if (info.iso) paramParts.push('ISO ' + info.iso);

          exifCache[index] = {
            device: info.device || '',
            params: paramParts.length > 0 ? paramParts.join('  ·  ') : '',
            dateTime: info.dateTime || null,
            focalLength: info.focalLength || null,
            fNumber: info.fNumber || null,
            exposureTime: info.exposureTime || null,
            iso: info.iso || null
          };

          if (info.location) {
            locationCache[index] = info.location;
          }

          if (info.lat != null && info.lon != null) {
            gpsCache[index] = { lat: info.lat, lon: info.lon };
          }
        });

        // Build gallery after data is ready
        buildGallery();
        initGallery();
        initLazyLoad();
        // Render card info after galleryItems is populated
        PHOTOS.forEach(function (_, index) { renderCardInfo(index); });
        buildFilterBar();
        initVlogBanner();
      })
      .catch(function (err) {
        console.error('[gallery] Failed to load EXIF data. Will try reload with cache-bust.', err);
        // Try once more with cache-bust as fallback
        fetch(EXIF_JSON_PATH + '?t=' + Date.now(), { headers: { 'Accept': 'application/json, */*' } })
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (data) {
            console.info('[gallery] EXIF loaded via fallback');
            // Apply the same processing as main path
            PHOTOS = Object.keys(data).sort();
            exifCache = {};
            locationCache = {};
            gpsCache = {};
            PHOTOS.forEach(function (filename, index) {
              var info = data[filename];
              if (!info) return;
              var paramParts = [];
              if (info.focalLength) paramParts.push(formatFocalLength(info.focalLength));
              if (info.fNumber) paramParts.push(formatAperture(info.fNumber));
              if (info.exposureTime) paramParts.push(formatExposureTime(info.exposureTime));
              if (info.iso) paramParts.push('ISO ' + info.iso);
              exifCache[index] = {
                device: info.device || '',
                params: paramParts.length > 0 ? paramParts.join('  ·  ') : '',
                dateTime: info.dateTime || null,
                focalLength: info.focalLength || null,
                fNumber: info.fNumber || null,
                exposureTime: info.exposureTime || null,
                iso: info.iso || null
              };
              if (info.location) locationCache[index] = info.location;
              if (info.lat != null && info.lon != null) gpsCache[index] = { lat: info.lat, lon: info.lon };
            });
            buildGallery();
            initGallery();
            initLazyLoad();
            PHOTOS.forEach(function (_, index) { renderCardInfo(index); });
            buildFilterBar();
            initVlogBanner();
          })
          .catch(function (err2) {
            console.error('[gallery] EXIF fallback also failed. Gallery will use empty state.', err2);
            // Continue with empty gallery - no crash
            PHOTOS = [];
            buildGallery();
            initGallery();
            initLazyLoad();
            buildFilterBar();
            initVlogBanner();
          });
      });
  }

  function buildGallery() {
    var container = document.querySelector('.gallery');
    if (!container) return;

    PHOTOS.forEach(function (filename, index) {
      var thumbSrc = getThumbSrc(filename);
      var fullSrc = getFullSrc(filename);
      var item = document.createElement('div');
      item.className = 'gallery-item loading';
      item.innerHTML =
        '<div class="photo-wrapper">' +
          '<img data-src="' + thumbSrc + '" data-full="' + fullSrc + '" alt="Photo">' +
        '</div>' +
        '<div class="photo-info"></div>';
      container.appendChild(item);
    });
  }

  function initGallery() {
    galleryItems = Array.from(document.querySelectorAll('.gallery-item'));
    galleryImages = galleryItems.map(function (item) {
      return item.querySelector('.photo-wrapper img');
    });
    galleryItems.forEach(function (item, index) {
      item.querySelector('.photo-wrapper').addEventListener('click', function () {
        openLightbox(index);
      });
    });
  }

  /* --- EXIF Helpers --- */

  function formatExposureTime(value) {
    if (!value) return null;
    if (value >= 1) return value + 's';
    return '1/' + Math.round(1 / value) + 's';
  }

  function formatFocalLength(value) {
    if (!value) return null;
    return Math.round(value) + 'mm';
  }

  function formatAperture(value) {
    if (!value) return null;
    var rounded = Math.round(value * 10) / 10;
    return 'ƒ/' + rounded;
  }

  function formatDateTime(value) {
    if (!value) return null;
    // "2026-04-25T18:11:37" or "2026-04-25 18:11:37" → "2026.04.25 18:11"
    var match = value.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!match) return null;
    return match[1] + '.' + match[2] + '.' + match[3] + ' ' + match[4] + ':' + match[5];
  }

  /* --- River View --- */

  var RIVER_CONFIG = [
    {
      key: 'fNumber',
      label: '光圈',
      unit: '',
      gradientStart: '#1b4332',
      gradientEnd: '#e9c46a',
      trendLeft: '虚',
      trendRight: '实',
      affect: '影响表达 - 背景虚化',
      format: function (v) { return 'ƒ/' + (Math.round(v * 10) / 10); },
      scenes: [
        { min: 0, max: 2.8, label: '虚化 / 人像', desc: '景深浅，背景模糊突出主体' },
        { min: 2.8, max: 5.6, label: '旅行 / 通用', desc: '景深适中，前后兼顾' },
        { min: 5.6, max: 11, label: '风景 / 锐利', desc: '景深大，远近都清晰' },
        { min: 11, max: Infinity, label: '星芒 / 微距', desc: '景深极大，灯光出星芒' }
      ]
    },
    {
      key: 'exposureTime',
      label: '快门',
      unit: '',
      gradientStart: '#1b2838',
      gradientEnd: '#e76f51',
      trendLeft: '冻结',
      trendRight: '拖影',
      affect: '影响表达 - 流畅度',
      format: function (v) {
        if (v >= 1) return v + 's';
        return '1/' + Math.round(1 / v) + 's';
      },
      scenes: [
        { min: 0, max: 0.001, label: '冻结运动', desc: '凝固高速瞬间，画面锐利' },
        { min: 0.001, max: 0.004, label: '日常 / 人物', desc: '抓拍清晰，人物不糊' },
        { min: 0.004, max: 0.017, label: '街拍 / 手持', desc: '手持安全快门，不易模糊' },
        { min: 0.017, max: Infinity, label: '长曝 / 夜景 / 光轨', desc: '运动物体拖影，水面雾化' }
      ]
    },
    {
      key: 'iso',
      label: 'ISO',
      unit: '',
      gradientStart: '#1a1a2e',
      gradientEnd: '#f0f0f0',
      trendLeft: '纯净',
      trendRight: '噪点',
      affect: '影响画质',
      format: function (v) { return 'ISO ' + Math.round(v); },
      scenes: [
        { min: 0, max: 200, label: '最佳画质', desc: '噪点极少，画面干净' },
        { min: 200, max: 800, label: '阴天 / 室内', desc: '轻微噪点，日常够用' },
        { min: 800, max: 3200, label: '暗光', desc: '噪点明显，需后期降噪' },
        { min: 3200, max: Infinity, label: '极暗 / 演唱会', desc: '噪点重，换取更多进光' }
      ]
    },
    {
      key: 'focalLength',
      label: '焦距',
      unit: 'mm',
      gradientStart: '#1a3a5c',
      gradientEnd: '#7b2d8b',
      trendLeft: '广',
      trendRight: '窄',
      affect: '影响表达 - 视角与空间感',
      format: function (v) { return Math.round(v) + 'mm'; },
      scenes: [
        { min: 0, max: 35, label: '风景 / 建筑', desc: '视角宽广，收纳大场景' },
        { min: 35, max: 50, label: '街拍 / 纪实', desc: '接近人眼视角，画面自然' },
        { min: 50, max: 85, label: '人像 / 人文', desc: '视角收窄，主体突出' },
        { min: 85, max: 135, label: '特写 / 肖像', desc: '背景压缩，面部比例好' },
        { min: 135, max: Infinity, label: '远摄 / 运动', desc: '拉近远处，空间压缩明显' }
      ]
    }
  ];

  function buildRiverView() {
    var container = document.getElementById('river-container');
    if (!container) return;

    var html = '';

    RIVER_CONFIG.forEach(function (river) {
      // Collect all photos that have this parameter
      var photos = [];
      PHOTOS.forEach(function (filename, index) {
        var exif = exifCache[index];
        if (!exif || exif[river.key] == null) return;
        photos.push({
          filename: filename,
          index: index,
          value: exif[river.key]
        });
      });

      if (photos.length === 0) return;

      html += '<div class="river-lane">';
      html += '<div class="river-header">';
      html += '<span class="river-label">' + river.label + '</span>';
      html += '<span class="river-trend">';
      html += '<span class="river-trend-endpoint">';
      html += '<span class="river-trend-num">小</span>';
      html += '<span class="river-trend-feel">' + river.trendLeft + '</span>';
      html += '</span>';
      html += '<span class="river-trend-arrow"></span>';
      html += '<span class="river-trend-endpoint">';
      html += '<span class="river-trend-num">大</span>';
      html += '<span class="river-trend-feel">' + river.trendRight + '</span>';
      html += '</span>';
      html += '</span>';
      if (river.affect) {
        html += '<span class="river-affect">' + river.affect + '</span>';
      }
      html += '</div>';

      // Render each scene group
      river.scenes.forEach(function (scene) {
        var rangeText = river.format(scene.min) + ' ~ ' + (scene.max === Infinity ? '∞' : river.format(scene.max));

        // Find matching photos in this scene range
        var matched = photos.filter(function (p) {
          return p.value >= scene.min && p.value < (scene.max === Infinity ? Infinity : scene.max);
        });
        matched.sort(function (a, b) { return a.value - b.value; });

        html += '<div class="river-group" style="--grad-start:' + river.gradientStart + ';--grad-end:' + river.gradientEnd + ';">';
        html += '<div class="river-group-header">';
        html += '<span class="river-group-range">' + rangeText + '</span>';
        html += '<span class="river-group-desc">' + scene.desc + '</span>';
        html += '<span class="river-group-label">适用场景：' + scene.label + '</span>';
        html += '</div>';

        if (matched.length > 0) {
          html += '<div class="river-group-cards">';
          matched.forEach(function (photo) {
            var thumbSrc = getThumbSrc(photo.filename);
            html += '<div class="river-card" data-index="' + photo.index + '">';
            html += '<img src="' + thumbSrc + '" alt="Photo" loading="lazy">';
            html += '<div class="river-card-label">' + river.format(photo.value) + '</div>';
            html += '</div>';
          });
          html += '</div>';
        } else {
          html += '<div class="river-group-empty">暂无照片</div>';
        }

        html += '</div>';
      });

      html += '</div>';
    });

    // Tone lane placeholder — will be filled async
    html += '<div class="river-lane river-lane--tone" id="river-tone-lane"></div>';

    // Source attribution
    html += '<div class="river-source">';
    html += '<p>参数场景推荐参考来源：</p>';
    html += '<p>· <a href="https://www.vsco.co/learn/focal-length" target="_blank">VSCO Learn — What is Focal Length in Photography</a></p>';
    html += '<p>· <a href="https://tamron-americas.com/blog/what-is-shutter-speed/" target="_blank">Tamron — What is Shutter Speed</a></p>';
    html += '<p>· <a href="https://photographylife.com/iso-shutter-speed-and-aperture-for-beginners" target="_blank">Photography Life — ISO, Shutter Speed and Aperture for Beginners</a></p>';
    html += '<p>· <a href="https://digital-photography-school.com/5-important-focal-lengths-to-know-and-the-benefits-of-each/" target="_blank">Digital Photography School — Focal Length Guide</a></p>';
    html += '</div>';

    container.innerHTML = html;

    // Bind click events — open lightbox with color grading
    container.querySelectorAll('.river-card').forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = parseInt(el.dataset.index, 10);
        openRiverLightbox(idx);
      });
    });

    // Build tone analysis asynchronously
    buildToneLane();
  }

  /* --- Tone Analysis (影调) — histogram-based --- */

  var TONE_GROUPS = [
    { key: 'low',  label: '暗调 Low Key',  desc: '深沉、神秘、戏剧性' },
    { key: 'mid',  label: '中调 Mid Tone',  desc: '均衡、自然、写实' },
    { key: 'high', label: '明调 High Key',  desc: '明亮、轻盈、通透' }
  ];

  function computeHistogram(imgElement) {
    var canvas = document.createElement('canvas');
    var sampleSize = 64;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(imgElement, 0, 0, sampleSize, sampleSize);
    var imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    var pixels = imageData.data;
    var histogram = new Array(256);
    for (var b = 0; b < 256; b++) histogram[b] = 0;
    var pixelCount = pixels.length / 4;
    for (var i = 0; i < pixels.length; i += 4) {
      var lum = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
      if (lum > 255) lum = 255;
      histogram[lum]++;
    }
    // Normalize to 0-1
    var maxCount = 0;
    for (var j = 0; j < 256; j++) { if (histogram[j] > maxCount) maxCount = histogram[j]; }
    if (maxCount > 0) {
      for (var k = 0; k < 256; k++) histogram[k] = histogram[k] / maxCount;
    }
    // Classify by thirds weight
    var lowWeight = 0, midWeight = 0, highWeight = 0;
    for (var n = 0; n < 256; n++) {
      var raw = histogram[n] * maxCount;
      if (n < 85)       lowWeight  += raw;
      else if (n < 170) midWeight  += raw;
      else              highWeight += raw;
    }
    var total = lowWeight + midWeight + highWeight;
    var toneClass = 'mid';
    if (total > 0) {
      var lowRatio  = lowWeight / total;
      var highRatio = highWeight / total;
      if (lowRatio > 0.5)      toneClass = 'low';
      else if (highRatio > 0.5) toneClass = 'high';
    }
    return { histogram: histogram, tone: toneClass, pixelCount: pixelCount };
  }

  function drawHistogramCanvas(histogram, toneClass) {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 40;
    canvas.className = 'tone-histogram';
    var ctx = canvas.getContext('2d');

    // Color per tone
    var colors = { low: 'rgba(120,140,255,0.7)', mid: 'rgba(180,180,180,0.7)', high: 'rgba(255,220,120,0.7)' };
    var barColor = colors[toneClass] || colors.mid;

    // Draw zone backgrounds
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, 0, 85, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(85, 0, 85, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(170, 0, 86, 40);

    // Draw bars
    for (var i = 0; i < 256; i++) {
      var barHeight = histogram[i] * 36;
      if (barHeight < 0.5 && histogram[i] > 0) barHeight = 0.5;
      ctx.fillStyle = barColor;
      ctx.fillRect(i, 40 - barHeight, 1, barHeight);
    }

    return canvas;
  }

  function loadImageForTone(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function buildToneLane() {
    var toneLane = document.getElementById('river-tone-lane');
    if (!toneLane) return;

    var headerHtml =
      '<div class="river-header">' +
        '<span class="river-label">影调</span>' +
        '<span class="river-trend">' +
          '<span class="river-trend-endpoint"><span class="river-trend-num">暗</span><span class="river-trend-feel">深沉</span></span>' +
          '<span class="river-trend-arrow"></span>' +
          '<span class="river-trend-endpoint"><span class="river-trend-num">亮</span><span class="river-trend-feel">通透</span></span>' +
        '</span>' +
        '<span class="river-affect">影响表达 - 画面情绪与氛围</span>' +
      '</div>';

    toneLane.innerHTML = headerHtml + '<div class="tone-loading">分析图片直方图中…</div>';

    var tasks = PHOTOS.map(function (filename, index) {
      var src = getThumbSrc(filename);
      return loadImageForTone(src).then(function (img) {
        if (!img) return null;
        var result = computeHistogram(img);
        return { filename: filename, index: index, tone: result.tone, histogram: result.histogram };
      });
    });

    Promise.all(tasks).then(function (results) {
      var photos = results.filter(function (r) { return r !== null; });

      // Remove loading
      toneLane.innerHTML = headerHtml;

      TONE_GROUPS.forEach(function (group) {
        var matched = photos.filter(function (p) { return p.tone === group.key; });

        var groupEl = document.createElement('div');
        groupEl.className = 'river-group';
        groupEl.style.setProperty('--grad-start', '#1a1a2e');
        groupEl.style.setProperty('--grad-end', '#f0f0f0');

        var groupHeaderHtml =
          '<div class="river-group-header">' +
            '<span class="river-group-range">' + group.label + '</span>' +
            '<span class="river-group-desc">' + group.desc + '</span>' +
            '<span class="river-group-label">' + matched.length + ' 张</span>' +
          '</div>';
        groupEl.innerHTML = groupHeaderHtml;

        if (matched.length > 0) {
          var cardsContainer = document.createElement('div');
          cardsContainer.className = 'river-group-cards';

          matched.forEach(function (photo) {
            var thumbSrc = getThumbSrc(photo.filename);
            var card = document.createElement('div');
            card.className = 'river-card river-card--tone';
            card.setAttribute('data-index', photo.index);

            var imgEl = document.createElement('img');
            imgEl.src = thumbSrc;
            imgEl.alt = 'Photo';
            imgEl.loading = 'lazy';
            card.appendChild(imgEl);

            var histCanvas = drawHistogramCanvas(photo.histogram, photo.tone);
            card.appendChild(histCanvas);

            card.addEventListener('click', function () {
              openRiverLightbox(photo.index);
            });

            cardsContainer.appendChild(card);
          });

          groupEl.appendChild(cardsContainer);
        } else {
          var emptyEl = document.createElement('div');
          emptyEl.className = 'river-group-empty';
          emptyEl.textContent = '暂无照片';
          groupEl.appendChild(emptyEl);
        }

        toneLane.appendChild(groupEl);
      });
    });
  }

  /* --- Timeline View --- */

  function buildFullTimeline() {
    var container = document.getElementById('timeline-scroll');
    if (!container) return;

    // Collect all photos with dateTime, sort descending
    var allPhotos = [];
    PHOTOS.forEach(function (filename, index) {
      var exif = exifCache[index];
      if (!exif || !exif.dateTime) return;
      allPhotos.push({ filename: filename, index: index, dateTime: exif.dateTime });
    });
    allPhotos.sort(function (a, b) { return b.dateTime.localeCompare(a.dateTime); });

    // Group by month, then by day
    var monthGroups = [];
    var curMonth = null;
    var curDay = null;
    var curMonthGroup = null;
    var curDayGroup = null;

    allPhotos.forEach(function (item) {
      var mMatch = item.dateTime.match(/(\d{4})-(\d{2})/);
      var dMatch = item.dateTime.match(/(\d{4})-(\d{2})-(\d{2})/);
      var monthKey = mMatch ? mMatch[1] + '.' + mMatch[2] : 'Unknown';
      var dayKey = dMatch ? dMatch[1] + '.' + dMatch[2] + '.' + dMatch[3] : 'Unknown';

      if (monthKey !== curMonth) {
        curMonth = monthKey;
        curDay = null;
        curMonthGroup = { month: monthKey, days: [] };
        monthGroups.push(curMonthGroup);
      }
      if (dayKey !== curDay) {
        curDay = dayKey;
        curDayGroup = { day: dayKey, items: [] };
        curMonthGroup.days.push(curDayGroup);
      }
      curDayGroup.items.push(item);
    });

    // Build HTML
    var html = '';
    monthGroups.forEach(function (mg) {
      html += '<div class="tl-month">';
      html += '<div class="tl-month-label">' + mg.month + '</div>';
      html += '<div class="tl-month-body">';

      mg.days.forEach(function (dg) {
        html += '<div class="tl-day">';
        html += '<div class="tl-day-label">' + dg.day + '</div>';
        html += '<div class="tl-day-cards">';

        dg.items.forEach(function (item) {
          var thumbSrc = getThumbSrc(item.filename);
          var exif = exifCache[item.index] || {};
          var timeMatch = (exif.dateTime || '').match(/(\d{2}):(\d{2})/);
          var timeStr = timeMatch ? timeMatch[1] + ':' + timeMatch[2] : '';
          var loc = locationCache[item.index] || '';
          var device = exif.device || '';
          var params = exif.params || '';

          html += '<div class="tl-node" data-index="' + item.index + '">' +
            '<img src="' + thumbSrc + '" alt="Photo" loading="lazy">' +
            '<div class="tl-meta">' +
              (timeStr ? '<span class="tl-time">' + timeStr + '</span>' : '') +
              (device ? '<span class="tl-device">' + device + '</span>' : '') +
              (params ? '<span class="tl-params">' + params + '</span>' : '') +
              (loc ? '<span class="tl-loc">' + loc + '</span>' : '') +
            '</div>' +
          '</div>';
        });

        html += '</div></div>';
      });

      html += '</div></div>';
    });

    container.innerHTML = html;

    // Bind click events
    container.querySelectorAll('.tl-node').forEach(function (el) {
      el.addEventListener('click', function () {
        openLightbox(parseInt(el.dataset.index, 10));
      });
    });
  }

  /* --- Photo Map --- */

  function initPhotoMap() {
    if (typeof L === 'undefined') return;
    var mapContainer = document.getElementById('photo-map');
    if (!mapContainer) return;

    var points = [];
    Object.keys(gpsCache).forEach(function (key) {
      var gps = gpsCache[key];
      points.push({
        lat: gps.lat,
        lon: gps.lon,
        index: parseInt(key, 10)
      });
    });

    if (points.length === 0) {
      mapContainer.parentElement.style.display = 'none';
      return;
    }

    photoMap = L.map('photo-map', {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true
    });

    // Satellite imagery base layer
    L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
      maxZoom: 18,
      subdomains: '1234'
    }).addTo(photoMap);

    // Chinese labels overlay
    L.tileLayer('https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scl=1&style=8&x={x}&y={y}&z={z}', {
      attribution: '© 高德地图',
      maxZoom: 18,
      subdomains: '1234'
    }).addTo(photoMap);

    // Center on China, show full globe
    photoMap.setView([25, 105], 3);

    // Heat layer
    var heatData = points.map(function (p) {
      return [p.lat, p.lon, 0.8];
    });
    L.heatLayer(heatData, {
      radius: 35,
      blur: 25,
      minOpacity: 0.4,
      maxZoom: 10,
      gradient: {
        0.2: '#fed766',
        0.4: '#f6ab6c',
        0.6: '#ef6461',
        0.8: '#e63946',
        1.0: '#d62828'
      }
    }).addTo(photoMap);

    // Marker circles
    var markerIcon = L.divIcon({
      className: 'map-photo-marker',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    points.forEach(function (point) {
      var location = locationCache[point.index] || '';
      var imgSrc = galleryImages[point.index]
        ? (galleryImages[point.index].src || galleryImages[point.index].dataset.src)
        : '';
      var latStr = Math.abs(point.lat).toFixed(4) + '°' + (point.lat >= 0 ? 'N' : 'S');
      var lonStr = Math.abs(point.lon).toFixed(4) + '°' + (point.lon >= 0 ? 'E' : 'W');

      var html = '<div class="map-tooltip-content">';
      if (imgSrc) {
        html += '<img class="map-tooltip-thumb" src="' + imgSrc + '" alt="Photo">';
      }
      html += '<div class="map-tooltip-info">';
      if (location) {
        html += '<div class="map-tooltip-location">' + location + '</div>';
      }
      html += '<div class="map-tooltip-coords">' + latStr + ', ' + lonStr + '</div>';
      html += '</div></div>';

      var marker = L.marker([point.lat, point.lon], { icon: markerIcon })
        .bindTooltip(html, {
          className: 'map-tooltip',
          direction: 'top',
          offset: [0, -8],
          opacity: 1
        })
        .addTo(photoMap);

      marker.on('dblclick', (function (idx) {
        return function (event) {
          L.DomEvent.stopPropagation(event);
          openLightbox(idx);
        };
      })(point.index));
    });

    // Vlog map card — show when viewing New Zealand area
    var vlogMapCard = document.createElement('div');
    vlogMapCard.className = 'vlog-entry vlog-entry--map';
    vlogMapCard.innerHTML = '<span class="vlog-entry-icon">▶</span>' +
      '<div class="vlog-entry-info">' +
      '<span class="vlog-entry-title">📹 新西兰旅行 Vlog</span>' +
      '<span class="vlog-entry-subtitle">点击观看这趟旅程的视频记录</span>' +
      '</div>';
    mapContainer.appendChild(vlogMapCard);

    vlogMapCard.addEventListener('click', openVlogPlayer);

    photoMap.on('moveend', function () {
      var bounds = photoMap.getBounds();
      var nzVisible = bounds.getSouth() < -34 && bounds.getNorth() > -48 &&
                      bounds.getWest() < 179 && bounds.getEast() > 165 &&
                      photoMap.getZoom() >= 4;
      if (nzVisible) {
        vlogMapCard.classList.add('visible');
      } else {
        vlogMapCard.classList.remove('visible');
      }
    });
  }

  function renderCardInfo(index) {
    if (!galleryItems[index]) return;
    var infoElement = galleryItems[index].querySelector('.photo-info');
    if (!infoElement) return;

    var exifData = exifCache[index] || {};
    var locationText = locationCache[index] || '';
    var device = exifData.device || '';
    var params = exifData.params || '';

    var dateTimeText = formatDateTime(exifData.dateTime) || '';

    if (!device && !params && !locationText && !dateTimeText) return;

    var html = '<div class="info-left">';
    if (device) html += '<div class="info-device">' + device + '</div>';
    if (params) html += '<div class="info-params">' + params + '</div>';
    html += '</div><div class="info-right">';
    if (dateTimeText) html += '<div class="info-date">' + dateTimeText + '</div>';
    if (locationText) html += '<div class="info-location">' + locationText + '</div>';
    html += '</div>';
    infoElement.innerHTML = html;
    infoElement.classList.add('visible');
  }

  function showExif() {
    var exifData = exifCache[currentIndex] || {};
    var locationText = locationCache[currentIndex] || '';
    var device = exifData.device || '';
    var params = exifData.params || '';
    var dateTimeText = formatDateTime(exifData.dateTime) || '';

    if (!device && !params && !locationText && !dateTimeText) {
      exifElement.innerHTML = '';
      exifElement.classList.remove('visible');
      return;
    }

    var html = '';
    if (device) html += '<span class="exif-device">' + device + '</span>';
    if (params) html += '<span class="exif-params">' + params + '</span>';
    if (dateTimeText) html += '<span class="exif-date">' + dateTimeText + '</span>';
    if (locationText) html += '<span class="exif-location">' + locationText + '</span>';
    exifElement.innerHTML = html;
    exifElement.classList.add('visible');
  }

  /* --- Lightbox Core --- */

  function openLightbox(index) {
    currentIndex = index;
    updateLightboxImage();
    overlay.classList.add('active');
    document.body.classList.add('lightbox-open');
  }

  function closeLightbox() {
    overlay.classList.remove('active');
    overlay.classList.remove('cg-mode');
    document.body.classList.remove('lightbox-open');
    ColorGrading.detach();
  }

  /* --- River Lightbox (with color grading sidebar) --- */

  var riverCurrentIndex = -1;

  function openRiverLightbox(photoIndex) {
    riverCurrentIndex = photoIndex;
    loadRiverPhoto(photoIndex);

    overlay.classList.add('active', 'cg-mode');
    document.body.classList.add('lightbox-open');
  }

  function loadRiverPhoto(photoIndex) {
    var filename = PHOTOS[photoIndex];
    var fullSrc = getFullSrc(filename);

    ColorGrading.detach();

    lightboxImage.removeAttribute('src');
    lightboxImage.src = fullSrc;
    counterElement.textContent = (photoIndex + 1) + ' / ' + PHOTOS.length;
    exifElement.textContent = '';

    ColorGrading.attach(lightboxImage, fullSrc);
  }

  function updateLightboxImage() {
    var source = galleryImages[currentIndex];
    var fullSrc = source.dataset.full || source.src;

    // Clear old image first so it doesn't linger while new one loads progressively
    lightboxImage.removeAttribute('src');
    lightboxImage.src = fullSrc;

    counterElement.textContent = (currentIndex + 1) + ' / ' + galleryImages.length;
    showExif();
  }

  function showPrev() {
    if (overlay.classList.contains('cg-mode')) {
      riverCurrentIndex = (riverCurrentIndex - 1 + PHOTOS.length) % PHOTOS.length;
      loadRiverPhoto(riverCurrentIndex);
      return;
    }
    currentIndex = (currentIndex - 1 + galleryImages.length) % galleryImages.length;
    updateLightboxImage();
  }

  function showNext() {
    if (overlay.classList.contains('cg-mode')) {
      riverCurrentIndex = (riverCurrentIndex + 1) % PHOTOS.length;
      loadRiverPhoto(riverCurrentIndex);
      return;
    }
    currentIndex = (currentIndex + 1) % galleryImages.length;
    updateLightboxImage();
  }

  // --- Event Listeners ---

  closeButton.addEventListener('click', function (event) {
    event.stopPropagation();
    closeLightbox();
  });

  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) {
      closeLightbox();
    }
  });

  prevButton.addEventListener('click', function (event) {
    event.stopPropagation();
    showPrev();
  });

  nextButton.addEventListener('click', function (event) {
    event.stopPropagation();
    showNext();
  });

  document.addEventListener('keydown', function (event) {
    if (!overlay.classList.contains('active')) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') showPrev();
    if (event.key === 'ArrowRight') showNext();
  });

  // --- Touch Swipe Support ---

  let touchStartX = 0;
  let touchEndX = 0;

  overlay.addEventListener('touchstart', function (event) {
    touchStartX = event.changedTouches[0].screenX;
  }, { passive: true });

  overlay.addEventListener('touchend', function (event) {
    touchEndX = event.changedTouches[0].screenX;
    var swipeDistance = touchEndX - touchStartX;
    if (Math.abs(swipeDistance) > 50) {
      if (swipeDistance > 0) {
        showPrev();
      } else {
        showNext();
      }
    }
  }, { passive: true });

  // --- Lazy Loading with IntersectionObserver ---

  function initLazyLoad() {
    var lazyImages = document.querySelectorAll('.gallery-item img[data-src]');
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var image = entry.target;
            image.src = image.dataset.src;
            image.removeAttribute('data-src');
            image.closest('.gallery-item').classList.remove('loading');
            observer.unobserve(image);
          }
        });
      }, { rootMargin: '200px' });

      lazyImages.forEach(function (image) {
        observer.observe(image);
      });
    } else {
      lazyImages.forEach(function (image) {
        image.src = image.dataset.src;
        image.removeAttribute('data-src');
        image.closest('.gallery-item').classList.remove('loading');
      });
    }
  }

  // --- View Switcher ---

  var photoMap = null;

  var VIEW_META = {
    gallery:  { label: '瀑布', svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' },
    timeline: { label: '时间', svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
    map:      { label: '位置', svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>' },
    river:    { label: '专业', svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' }
  };

  function switchView(viewName) {
    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.remove('active');
    });

    var targetView = document.querySelector('.view-' + viewName);
    if (targetView) targetView.classList.add('active');

    // Update view dropdown
    var viewDropdown = document.getElementById('view-dropdown');
    if (viewDropdown) {
      viewDropdown.querySelectorAll('.dropdown-item[data-view]').forEach(function (item) {
        item.classList.toggle('active', item.getAttribute('data-view') === viewName);
      });
      var meta = VIEW_META[viewName];
      if (meta) {
        var iconEl = viewDropdown.querySelector('.dropdown-view-icon');
        var textEl = viewDropdown.querySelector('.dropdown-text');
        if (iconEl) iconEl.outerHTML = '<span class="dropdown-view-icon">' + meta.svg + '</span>';
        if (textEl) textEl.textContent = meta.label;
      }
    }

    // Hide gallery vlog banner when leaving gallery view
    var vlogBanner = document.getElementById('vlog-banner');
    if (vlogBanner && viewName !== 'gallery') {
      vlogBanner.classList.remove('visible');
    } else if (vlogBanner && viewName === 'gallery') {
      updateVlogBanner();
    }

    if (viewName === 'map') {
      if (!mapInitialized) {
        mapInitialized = true;
        setTimeout(function () {
          initPhotoMap();
        }, 100);
      } else if (photoMap) {
        photoMap.invalidateSize();
      }
    }

    if (viewName === 'timeline') {
      if (!timelineInitialized) {
        timelineInitialized = true;
        setTimeout(function () {
          buildFullTimeline();
        }, 100);
      }
    }

    if (viewName === 'river') {
      if (!riverInitialized) {
        riverInitialized = true;
        setTimeout(function () {
          buildRiverView();
        }, 100);
      }
    }
  }

  // --- Sort ---

  var currentSortKey = null;
  var currentSortDir = null; // 'asc' or 'desc'

  function computeImageSaturation(img) {
    if (!img.complete || img.naturalWidth === 0) return null;
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var side = 50;
    canvas.width = side;
    canvas.height = side;
    ctx.drawImage(img, 0, 0, side, side);
    var data = ctx.getImageData(0, 0, side, side).data;
    var totalSat = 0, count = 0;
    for (var i = 0; i < data.length; i += 16) {
      var r = data[i] / 255, g = data[i+1] / 255, b = data[i+2] / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max === min) continue;
      var sat = (max - min) / max;
      totalSat += sat;
      count++;
    }
    return count > 0 ? totalSat / count : 0;
  }

  function sortGallery(key, direction) {
    var container = document.querySelector('.gallery');
    if (!container || galleryItems.length === 0) return;

    // Build index array with sort values
    var indices = galleryItems.map(function (_, index) {
      var exif = exifCache[index] || {};
      var value;

      if (key === 'hsvSaturation') {
        var item = galleryItems[index];
        var img = item ? item.querySelector('img') : null;
        value = img ? (hsvSatCache[index] != null ? hsvSatCache[index] : (hsvSatCache[index] = computeImageSaturation(img))) : null;
      } else {
        value = exif[key];
      }

      return { index: index, value: value, element: galleryItems[index] };
    });

    indices.sort(function (a, b) {
      // Null values go to end
      if (a.value == null && b.value == null) return 0;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      var diff = (typeof a.value === 'string')
        ? a.value.localeCompare(b.value)
        : a.value - b.value;
      return direction === 'desc' ? -diff : diff;
    });

    // Reorder DOM
    indices.forEach(function (item) {
      container.appendChild(item.element);
    });
  }

  function resetAll() {
    // Clear sort
    currentSortKey = null;
    currentSortDir = null;
    document.querySelectorAll('.sort-btn').forEach(function (b) {
      b.classList.remove('active', 'asc', 'desc');
    });

    // Clear filters
    activeCountries = [];
    activeRegions = [];
    document.querySelectorAll('#filter-country .filter-tag').forEach(function (btn) {
      btn.classList.remove('active');
    });
    updateRegionTags();

    // Show all & restore original order
    galleryItems.forEach(function (el) { el.style.display = ''; });
    var container = document.querySelector('.gallery');
    if (container) {
      galleryItems.forEach(function (el) { container.appendChild(el); });
    }
  }

  function initSortBar() {
    document.querySelectorAll('.sort-btn[data-sort]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');

        if (currentSortKey === key) {
          currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSortKey = key;
          currentSortDir = 'desc';
        }

        document.querySelectorAll('.sort-btn').forEach(function (b) {
          b.classList.remove('active', 'asc', 'desc');
        });
        btn.classList.add('active', currentSortDir);

        sortGallery(currentSortKey, currentSortDir);
      });
    });

    var resetBtn = document.getElementById('reset-all');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetAll);
    }
  }

  /* --- Location Filter --- */

  var activeCountries = [];
  var activeRegions = [];

  function parseLocation(locStr) {
    if (!locStr) return null;
    var clean = locStr.replace(/^📍\s*/, '');
    var parts = clean.split(/\s*·\s*/);
    return {
      country: parts[0] || '',
      region: parts.length > 1 ? parts.slice(1).join(' · ') : ''
    };
  }

  // Build a lookup: country → { region → count }
  var countryRegionMap = {};

  function buildFilterBar() {
    var countryRow = document.getElementById('filter-country');
    var regionRow = document.getElementById('filter-region');
    if (!countryRow || !regionRow) return;

    var countryCount = {};
    countryRegionMap = {};

    Object.keys(locationCache).forEach(function (key) {
      var parsed = parseLocation(locationCache[key]);
      if (!parsed) return;
      if (parsed.country) {
        countryCount[parsed.country] = (countryCount[parsed.country] || 0) + 1;
        if (!countryRegionMap[parsed.country]) countryRegionMap[parsed.country] = {};
        if (parsed.region) {
          countryRegionMap[parsed.country][parsed.region] =
            (countryRegionMap[parsed.country][parsed.region] || 0) + 1;
        }
      }
    });

    // Build country tags
    var countries = Object.keys(countryCount).sort();
    var html = '';
    countries.forEach(function (c) {
      html += '<button class="filter-tag" data-value="' + c + '">' +
        '<span class="ft-label">' + c + '</span>' +
        '<span class="ft-count">' + countryCount[c] + '</span></button>';
    });
    countryRow.innerHTML = html;

    // Bind country events
    countryRow.querySelectorAll('.filter-tag').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.classList.toggle('active');
        activeCountries = collectActive(countryRow);
        activeRegions = [];
        updateRegionTags();
        applyFilter();
        updateVlogBanner();
      });
    });

    // Initial region tags (show all)
    updateRegionTags();
  }

  function updateRegionTags() {
    var regionRow = document.getElementById('filter-region');
    if (!regionRow) return;

    var regionCount = {};
    var sourceCountries = activeCountries.length > 0
      ? activeCountries
      : Object.keys(countryRegionMap);

    sourceCountries.forEach(function (c) {
      var regions = countryRegionMap[c] || {};
      Object.keys(regions).forEach(function (r) {
        regionCount[r] = (regionCount[r] || 0) + regions[r];
      });
    });

    var regionKeys = Object.keys(regionCount).sort();
    var html = '';
    regionKeys.forEach(function (r) {
      var isActive = activeRegions.indexOf(r) !== -1;
      html += '<button class="filter-tag' + (isActive ? ' active' : '') + '" data-value="' + r + '">' +
        '<span class="ft-label">' + r + '</span>' +
        '<span class="ft-count">' + regionCount[r] + '</span></button>';
    });
    regionRow.innerHTML = html;

    // Rebind region events
    regionRow.querySelectorAll('.filter-tag').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.classList.toggle('active');
        activeRegions = collectActive(regionRow);
        applyFilter();
      });
    });
  }

  function collectActive(container) {
    var values = [];
    container.querySelectorAll('.filter-tag.active').forEach(function (btn) {
      values.push(btn.dataset.value);
    });
    return values;
  }

  function applyFilter() {
    var noCountry = activeCountries.length === 0;
    var noRegion = activeRegions.length === 0;

    galleryItems.forEach(function (el, index) {
      if (noCountry && noRegion) { el.style.display = ''; return; }
      var parsed = parseLocation(locationCache[index] || '');
      var matchCountry = noCountry || (parsed && activeCountries.indexOf(parsed.country) !== -1);
      var matchRegion = noRegion || (parsed && activeRegions.indexOf(parsed.region) !== -1);
      el.style.display = (matchCountry && matchRegion) ? '' : 'none';
    });

    updateVlogBanner();
  }

  function initViewSwitcher() {
    var viewDropdown = document.getElementById('view-dropdown');
    if (!viewDropdown) return;

    var trigger = viewDropdown.querySelector('.dropdown-trigger');
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      // Close other dropdowns first
      document.querySelectorAll('.dropdown').forEach(function (d) {
        if (d !== viewDropdown) d.classList.remove('open');
      });
      viewDropdown.classList.toggle('open');
    });

    viewDropdown.querySelectorAll('.dropdown-item[data-view]').forEach(function (item) {
      item.addEventListener('click', function () {
        var viewName = item.getAttribute('data-view');
        switchView(viewName);
        viewDropdown.classList.remove('open');
      });
    });
  }

  /* --- Vlog Player --- */

  var VLOG_CONFIG = {
    country: '新西兰',
    src: '//player.bilibili.com/player.html?bvid=BV1ty576TE8R&page=1&autoplay=1&high_quality=1'
  };

  function openVlogPlayer() {
    var overlay = document.getElementById('vlog-overlay');
    var iframe = document.getElementById('vlog-iframe');
    if (!overlay || !iframe) return;
    iframe.src = VLOG_CONFIG.src;
    overlay.classList.add('active');
    document.body.classList.add('lightbox-open');
  }

  function closeVlogPlayer() {
    var overlay = document.getElementById('vlog-overlay');
    var iframe = document.getElementById('vlog-iframe');
    if (!overlay || !iframe) return;
    overlay.classList.remove('active');
    document.body.classList.remove('lightbox-open');
    iframe.src = '';
  }

  function initVlogPlayer() {
    var overlay = document.getElementById('vlog-overlay');
    if (!overlay) return;

    overlay.querySelector('.vlog-close').addEventListener('click', closeVlogPlayer);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeVlogPlayer();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('active')) {
        closeVlogPlayer();
      }
    });
  }

  /* --- Vlog Gallery Banner --- */

  function initVlogBanner() {
    var banner = document.getElementById('vlog-banner');
    if (!banner) return;
    banner.addEventListener('click', openVlogPlayer);
  }

  function updateVlogBanner() {
    var banner = document.getElementById('vlog-banner');
    if (!banner) return;

    var hasNZ = activeCountries.indexOf(VLOG_CONFIG.country) !== -1;
    if (hasNZ) {
      banner.classList.add('visible');
    } else {
      banner.classList.remove('visible');
    }
  }

  // --- Init ---
  // Expose switchView for music.js to call back
  window.switchGalleryView = switchView;

  function boot() {
    initViewSwitcher();
    initSortBar();
    initVlogPlayer();
    loadDataAndBuild();
  }

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
