/**
 * China Map Theme — SVG atlas with WGS84 projection
 */
(function () {
  'use strict';

  var MAP_JSON = '/china-map.json';
  var mapLoaded = false;
  var mapData = null;
  var projection = null;

  function parseBounds(data) {
    var b = data.bounds;
    if (!b) return null;
    return [b.west, b.south, b.east, b.north];
  }

  function makeProjection(bounds) {
    return {
      bounds: bounds,
      project: function (lon, lat) {
        var minLon = bounds[0];
        var minLat = bounds[1];
        var maxLon = bounds[2];
        var maxLat = bounds[3];
        return {
          x: (lon - minLon) / (maxLon - minLon) * 1000,
          y: (maxLat - lat) / (maxLat - minLat) * 800
        };
      },
      unproject: function (x, y) {
        var minLon = bounds[0];
        var minLat = bounds[1];
        var maxLon = bounds[2];
        var maxLat = bounds[3];
        return {
          lon: minLon + (x / 1000) * (maxLon - minLon),
          lat: maxLat - (y / 800) * (maxLat - minLat)
        };
      }
    };
  }

  function formatCoord(lon, lat) {
    var lonStr = Math.abs(lon).toFixed(4) + '°' + (lon >= 0 ? 'E' : 'W');
    var latStr = Math.abs(lat).toFixed(4) + '°' + (lat >= 0 ? 'N' : 'S');
    return lonStr + ' · ' + latStr;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderChinaMap(data) {
    var svg = document.getElementById('china-map-svg');
    var panel = document.getElementById('china-map-panel');
    var page = document.querySelector('.china-map-page');
    if (!svg || !data.provinces) return;

    projection = makeProjection(parseBounds(data));
    if (!projection) return;

    svg.setAttribute('viewBox', data.viewBox || '0 0 1000 800');
    svg.setAttribute('aria-label', '中国地图');

    var html = '<g class="china-provinces">';
    data.provinces.forEach(function (prov, i) {
      html += '<path class="china-province" data-name="' + escapeHtml(prov.name) + '"' +
        ' data-lon="' + prov.lon + '" data-lat="' + prov.lat + '"' +
        ' d="' + prov.d + '" style="animation-delay:' + (i * 18) + 'ms"/>';
    });
    html += '</g>';

    html += '<g class="china-map-markers">';
    (data.markers || []).forEach(function (m) {
      var p = projection.project(m.lon, m.lat);
      html += '<g class="china-marker" transform="translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')"' +
        ' data-lon="' + m.lon + '" data-lat="' + m.lat + '">' +
        '<circle class="china-marker-pulse" cx="0" cy="0" r="4"/>' +
        '<circle class="china-marker-dot" cx="0" cy="0" r="3.5"/>' +
        '<text class="china-marker-label" x="0" y="-12" text-anchor="middle">' + escapeHtml(m.name) + '</text>' +
      '</g>';
    });
    html += '</g>';

    svg.innerHTML = html;

    var panelName = panel && panel.querySelector('.china-map-panel-name');
    var panelHint = panel && panel.querySelector('.china-map-panel-hint');
    var panelCoord = panel && panel.querySelector('.china-map-panel-coord');
    var coordReadout = document.getElementById('china-map-coord');

    function showPanel(name, hint, lon, lat) {
      if (!panel || !panelName) return;
      panelName.textContent = name;
      if (panelHint) panelHint.textContent = hint || '';
      if (panelCoord && lon != null && lat != null) {
        panelCoord.textContent = formatCoord(lon, lat);
      }
      panel.classList.add('is-visible');
    }

    function hidePanel() {
      if (!panel) return;
      panel.classList.remove('is-visible');
      svg.querySelectorAll('.china-province.is-active').forEach(function (p) {
        p.classList.remove('is-active');
      });
    }

    function clientToSvg(svgEl, clientX, clientY) {
      var pt = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      var ctm = svgEl.getScreenCTM();
      if (!ctm) return null;
      return pt.matrixTransform(ctm.inverse());
    }

    svg.querySelectorAll('.china-province').forEach(function (path) {
      path.addEventListener('mouseenter', function () {
        svg.querySelectorAll('.china-province.is-active').forEach(function (p) {
          p.classList.remove('is-active');
        });
        path.classList.add('is-active');
        var lon = parseFloat(path.getAttribute('data-lon'), 10);
        var lat = parseFloat(path.getAttribute('data-lat'), 10);
        showPanel(path.getAttribute('data-name'), '省级行政区', lon, lat);
      });
      path.addEventListener('mouseleave', function () {
        path.classList.remove('is-active');
        hidePanel();
      });
    });

    svg.querySelectorAll('.china-marker').forEach(function (g) {
      g.style.pointerEvents = 'all';
      g.style.cursor = 'pointer';
      g.addEventListener('mouseenter', function () {
        var lon = parseFloat(g.getAttribute('data-lon'), 10);
        var lat = parseFloat(g.getAttribute('data-lat'), 10);
        var label = g.querySelector('.china-marker-label');
        showPanel(label ? label.textContent : '', '标记点', lon, lat);
      });
      g.addEventListener('mouseleave', hidePanel);
    });

    svg.addEventListener('mousemove', function (e) {
      var pt = clientToSvg(svg, e.clientX, e.clientY);
      if (!pt) return;
      var geo = projection.unproject(pt.x, pt.y);
      var text = formatCoord(geo.lon, geo.lat);
      if (coordReadout) coordReadout.textContent = text;
    });

    svg.addEventListener('mouseleave', function () {
      if (coordReadout) coordReadout.textContent = '移动鼠标查看经纬度';
    });

    if (page) {
      requestAnimationFrame(function () {
        page.classList.add('is-loaded');
      });
    }
  }

  function loadChinaMap() {
    if (mapLoaded && mapData) {
      renderChinaMap(mapData);
      return;
    }
    fetch(MAP_JSON)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        mapData = data;
        mapLoaded = true;
        renderChinaMap(data);
      });
  }

  window.initChinaMap = loadChinaMap;

  /* ================================================
     Tab Switching & Photo Location View
     ================================================ */

  var locationMap = null;          // Leaflet map instance
  var locationMarkers = [];        // { marker, photo, index }
  var lbCurrent = -1;              // lightbox current index
  var exifData = null;             // cached EXIF data

  function getExifUrl(filename) {
    // Mirror gallery.js logic: thumb vs compressed vs original
    if (USE_LOCAL_IMAGES) {
      var hasThumb = false; // checked below
      try { hasThumb = hasThumb || (new ActiveXObject && true); } catch(e) { hasThumb = false; }
      return BASE_URL + 'compressed/' + filename;
    } else {
      return REMOTE_BASE_URL + 'compressed/' + filename;
    }
  }

  function getThumbUrl(filename) {
    if (USE_LOCAL_IMAGES) {
      return BASE_URL + 'thumbnails/' + filename;
    } else {
      return REMOTE_BASE_URL + 'thumbnails/' + filename;
    }
  }

  function openLocationLightbox(index) {
    lbCurrent = index;
    var entry = locationMarkers[index];
    var img = document.getElementById('china-map-lb-img');
    var caption = document.getElementById('china-map-lb-caption');
    var thumbs = document.getElementById('china-map-lb-thumbs');
    if (!img) return;

    img.src = getExifUrl(entry.photo.file);
    img.alt = entry.photo.file;

    // Build caption
    var ex = entry.exif;
    var dateStr = ex && ex.dateTime ? ex.dateTime.replace('T', ' ').slice(0, 16) : '';
    var locStr = ex && ex.location ? ex.location : '';
    caption.innerHTML = '<strong>' + entry.photo.file + '</strong>' +
      (locStr ? '<br>' + locStr : '') +
      (dateStr ? '<br>' + dateStr : '');

    // Highlight active thumb
    thumbs.querySelectorAll('.lightbox-thumb').forEach(function (t, i) {
      t.classList.toggle('active', i === index);
    });

    document.getElementById('china-map-photo-lightbox').style.display = 'flex';
  }

  function closeLocationLightbox() {
    lbCurrent = -1;
    var lb = document.getElementById('china-map-photo-lightbox');
    if (lb) lb.style.display = 'none';
    var img = document.getElementById('china-map-lb-img');
    if (img) img.src = '';
  }

  function navigateLocation(direction) {
    if (lbCurrent < 0) return;
    var next = lbCurrent + direction;
    if (next < 0) next = locationMarkers.length - 1;
    if (next >= locationMarkers.length) next = 0;
    openLocationLightbox(next);
  }

  function initLocationLightbox() {
    var lb = document.getElementById('china-map-photo-lightbox');
    if (!lb) return;

    lb.addEventListener('click', function (e) {
      if (e.target === lb) closeLocationLightbox();
    });

    document.getElementById('china-map-lb-close').addEventListener('click', closeLocationLightbox);
    document.getElementById('china-map-lb-prev').addEventListener('click', function () { navigateLocation(-1); });
    document.getElementById('china-map-lb-next').addEventListener('click', function () { navigateLocation(1); });

    document.addEventListener('keydown', function (e) {
      if (document.getElementById('china-map-photo-lightbox').style.display === 'none') return;
      if (e.key === 'Escape') closeLocationLightbox();
      if (e.key === 'ArrowLeft') navigateLocation(-1);
      if (e.key === 'ArrowRight') navigateLocation(1);
    });
  }

  function buildLocationThumbs() {
    var thumbs = document.getElementById('china-map-lb-thumbs');
    if (!thumbs) return;
    thumbs.innerHTML = '';
    locationMarkers.forEach(function (entry, i) {
      var img = document.createElement('img');
      img.className = 'lightbox-thumb';
      img.src = getThumbUrl(entry.photo.file);
      img.alt = entry.photo.file;
      img.title = entry.photo.file;
      img.addEventListener('click', (function (idx) {
        return function () { openLocationLightbox(idx); };
      })(i));
      thumbs.appendChild(img);
    });
  }

  function initLocationMapView(exif) {
    var container = document.getElementById('china-map-photo-map');
    if (!container) return;

    // Destroy existing map
    if (locationMap) {
      locationMap.remove();
      locationMap = null;
    }
    locationMarkers = [];

    // If Leaflet not loaded, load it
    if (typeof L === 'undefined') {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      var script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = function () { initLocationMapView(exif); };
      document.head.appendChild(script);
      return;
    }

    // Build photos with GPS from EXIF (mirroring gallery.js logic)
    var photos = [];
    Object.keys(exif).forEach(function (filename) {
      var data = exif[filename];
      if (data.lat != null && data.lon != null) {
        photos.push({
          file: filename,
          lat: data.lat,
          lon: data.lon,
          index: photos.length
        });
      }
    });

    if (photos.length === 0) {
      container.innerHTML = '<p style="color:rgba(255,255,255,0.4);text-align:center;margin-top:60px;font-size:0.85rem">暂无带GPS信息的照片</p>';
      return;
    }

    // Create Leaflet map
    locationMap = L.map('china-map-photo-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([35, 105], 4);

    // Night tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(locationMap);

    // Add markers
    photos.forEach(function (photo, i) {
      var thumbUrl = getThumbUrl(photo.file);
      var fullUrl = getExifUrl(photo.file);

      var marker = L.circleMarker([photo.lat, photo.lon], {
        radius: 8,
        fillColor: 'rgba(251,191,36,0.75)',
        color: 'rgba(251,191,36,0.95)',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.75
      }).addTo(locationMap);

      var popupContent =
        '<div style="text-align:center;min-width:120px">' +
        '<img src="' + thumbUrl + '" style="width:120px;height:90px;object-fit:cover;border-radius:4px;margin-bottom:6px" loading="lazy" />' +
        '<div style="color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:0.04em;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + photo.file + '</div>' +
        '<div style="color:rgba(251,191,36,0.6);font-size:10px;margin-top:2px">' + photo.lat.toFixed(4) + ', ' + photo.lon.toFixed(4) + '</div>' +
        '</div>';

      marker.bindPopup(popupContent, {
        maxWidth: 140,
        className: 'leaflet-popup-china-map'
      });

      var entry = { marker: marker, photo: photo, index: i, exif: exif[photo.file] };
      locationMarkers.push(entry);

      marker.on('click', (function (idx) {
        return function () {
          locationMap.closePopup();
          setTimeout(function () { openLocationLightbox(idx); }, 180);
        };
      })(i));
    });

    buildLocationThumbs();
    initLocationLightbox();

    // Fit bounds
    if (locationMarkers.length > 0) {
      var group = L.featureGroup(locationMarkers.map(function (e) { return e.marker; }));
      locationMap.fitBounds(group.getBounds().pad(0.15));
    }
  }

  function loadAndInitLocationView() {
    if (exifData) {
      initLocationMapView(exifData);
      return;
    }
    fetch('/exif.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        exifData = data;
        initLocationMapView(data);
      })
      .catch(function () {
        var container = document.getElementById('china-map-photo-map');
        if (container) container.innerHTML = '<p style="color:rgba(255,255,255,0.4);text-align:center;margin-top:60px;font-size:0.85rem">EXIF数据加载失败</p>';
      });
  }

  // Tab switching
  function initTabSwitching() {
    var tabs = document.querySelectorAll('.china-map-tab');
    var svgView = document.getElementById('china-map-svg-view');
    var locView = document.getElementById('china-map-location-view');
    if (!tabs.length) return;

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-tab');
        tabs.forEach(function (t) {
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        svgView.classList.toggle('active', target === 'map');
        locView.classList.toggle('active', target === 'location');
        if (target === 'location' && !locationMap) {
          loadAndInitLocationView();
        }
      });
    });

    // 自动切换到位置视图，加载照片红点
    setTimeout(function () {
      var locationTab = document.querySelector('.china-map-tab[data-tab="location"]');
      if (locationTab) locationTab.click();
    }, 600);
  }

  // Hook into loadChinaMap after SVG renders
  var _originalLoad = loadChinaMap;
  function loadChinaMapWithTabs() {
    _originalLoad();
    initTabSwitching();
  }
  window.initChinaMap = loadChinaMapWithTabs;
})();
