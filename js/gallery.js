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
  var LOCAL_FULL_DIR = '/photo/2026_51/';
  var EXIF_JSON_PATH = '/exif.json';
  var PHOTOS = [
    'IMG_20260425_181137.jpg',
    'IMG_20260427_111532.jpg',
    'IMG_20260427_113259.jpg',
    'IMG_20260427_131821.jpg',
    'IMG_20260427_174715.jpg',
    'IMG_20260427_213441.jpg',
    'IMG_20260428_195228.jpg',
    'IMG_20260429_045357.jpg',
    'IMG_20260429_151701.jpg',
    'IMG_20260429_160256.jpg',
    'IMG_20260430_105946.jpg',
    'IMG_20260430_165743.jpg',
    'IMG_20260430_170353.jpg',
    'IMG_20260430_200835.jpg',
    'IMG_20260501_131956.jpg',
    'IMG_20260501_161327.jpg',
    'IMG_20260501_172029.jpg',
    'IMG_20260501_182117.jpg',
    'IMG_20260502_120331.jpg',
    'IMG_20260502_144902.jpg',
    'IMG_20260502_152453.jpg',
    'IMG_20260502_170815_1.jpg'
  ];

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
  var locationCache = {};
  var gpsCache = {};
  var mapInitialized = false;

  function getThumbSrc(filename) {
    return USE_LOCAL_IMAGES ? LOCAL_THUMB_DIR + filename : REMOTE_DIR + filename;
  }

  function getFullSrc(filename) {
    return USE_LOCAL_IMAGES ? LOCAL_FULL_DIR + filename : REMOTE_DIR + filename;
  }

  function buildGallery() {
    var container = document.querySelector('.gallery');
    if (!container) return;

    PHOTOS.forEach(function (filename) {
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
    loadExifData();
  }

  function loadExifData() {
    fetch(EXIF_JSON_PATH)
      .then(function (res) { return res.json(); })
      .then(function (data) {
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
            focalLength: info.focalLength || null,
            fNumber: info.fNumber || null,
            exposureTime: info.exposureTime || null,
            iso: info.iso || null
          };
          renderCardInfo(index);

          if (info.lat != null && info.lon != null) {
            gpsCache[index] = { lat: info.lat, lon: info.lon };
            reverseGeocode(info.lat, info.lon, index);
          }
        });
      })
      .catch(function (err) {
        console.warn('Failed to load EXIF data:', err);
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

  function convertDMSToDecimal(dmsArray, ref) {
    if (!dmsArray || dmsArray.length < 3) return null;
    var degrees = dmsArray[0];
    var minutes = dmsArray[1];
    var seconds = dmsArray[2];
    var decimal = degrees + minutes / 60 + seconds / 3600;
    if (ref === 'S' || ref === 'W') decimal = -decimal;
    return decimal;
  }

  function reverseGeocode(latitude, longitude, index) {
    var url = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' +
      latitude + '&longitude=' + longitude + '&localityLanguage=zh';
    fetch(url)
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (!data) return;
        var parts = [];
        var country = data.countryName || '';
        var state = data.principalSubdivision || '';
        var city = data.city || data.locality || '';
        if (country) parts.push(country);
        if (state && state !== country) parts.push(state);
        if (city && city !== state) parts.push(city);
        if (parts.length > 0) {
          locationCache[index] = '📍 ' + parts.join(' · ');
          renderCardInfo(index);
          showExif();
        }
      })
      .catch(function () {});
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
  }

  function renderCardInfo(index) {
    if (!galleryItems[index]) return;
    var infoElement = galleryItems[index].querySelector('.photo-info');
    if (!infoElement) return;

    var exifData = exifCache[index] || {};
    var locationText = locationCache[index] || '';
    var device = exifData.device || '';
    var params = exifData.params || '';

    if (!device && !params && !locationText) return;

    var html = '';
    if (device) {
      html += '<div class="info-device">' + device + '</div>';
    }
    if (params) {
      html += '<div class="info-params">' + params + '</div>';
    }
    if (locationText) {
      html += '<div class="info-location">' + locationText + '</div>';
    }
    infoElement.innerHTML = html;
    infoElement.classList.add('visible');
  }

  function showExif() {
    var exifData = exifCache[currentIndex] || {};
    var locationText = locationCache[currentIndex] || '';
    var device = exifData.device || '';
    var params = exifData.params || '';

    if (!device && !params && !locationText) {
      exifElement.innerHTML = '';
      exifElement.classList.remove('visible');
      return;
    }

    var html = '';
    if (device) {
      html += '<span class="exif-device">' + device + '</span>';
    }
    if (params) {
      if (html) html += '<br>';
      html += '<span class="exif-params">' + params + '</span>';
    }
    if (locationText) {
      if (html) html += '<br>';
      html += '<span class="exif-location">' + locationText + '</span>';
    }
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
    document.body.classList.remove('lightbox-open');
  }

  function updateLightboxImage() {
    var source = galleryImages[currentIndex];
    var fullSrc = source.dataset.full || source.src;
    lightboxImage.src = fullSrc;
    counterElement.textContent = (currentIndex + 1) + ' / ' + galleryImages.length;
    showExif();
  }

  function showPrev() {
    currentIndex = (currentIndex - 1 + galleryImages.length) % galleryImages.length;
    updateLightboxImage();
  }

  function showNext() {
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

  function switchView(viewName) {
    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.remove('active');
    });
    document.querySelectorAll('.view-btn').forEach(function (btn) {
      btn.classList.remove('active');
    });

    var targetView = document.querySelector('.view-' + viewName);
    var targetBtn = document.querySelector('.view-btn[data-view="' + viewName + '"]');
    if (targetView) targetView.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');

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
  }

  // --- Sort ---

  var currentSortKey = null;
  var currentSortDir = null; // 'asc' or 'desc'

  function sortGallery(key, direction) {
    var container = document.querySelector('.gallery');
    if (!container || galleryItems.length === 0) return;

    // Build index array with sort values
    var indices = galleryItems.map(function (_, index) {
      var exif = exifCache[index] || {};
      var value = exif[key];
      return { index: index, value: value, element: galleryItems[index] };
    });

    indices.sort(function (a, b) {
      // Null values go to end
      if (a.value == null && b.value == null) return 0;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      var diff = a.value - b.value;
      return direction === 'desc' ? -diff : diff;
    });

    // Reorder DOM
    indices.forEach(function (item) {
      container.appendChild(item.element);
    });
  }

  function initSortBar() {
    document.querySelectorAll('.sort-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');

        if (currentSortKey === key) {
          // Toggle direction
          currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSortKey = key;
          currentSortDir = 'desc';
        }

        // Update button states
        document.querySelectorAll('.sort-btn').forEach(function (b) {
          b.classList.remove('active', 'asc', 'desc');
        });
        btn.classList.add('active', currentSortDir);

        sortGallery(currentSortKey, currentSortDir);
      });
    });
  }

  function initViewSwitcher() {
    document.querySelectorAll('.view-btn[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var viewName = btn.getAttribute('data-view');
        switchView(viewName);
      });
    });

    var themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        document.body.classList.toggle('light-theme');
      });
    }
  }

  // --- Init ---
  function boot() {
    buildGallery();
    initLazyLoad();
    initViewSwitcher();
    initSortBar();
    setTimeout(initGallery, 100);
  }

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
