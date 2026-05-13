/**
 * Color Grading — Lightbox Right Sidebar
 * Unified Canvas pixel processing for both Basic & Lightroom tabs
 */
var ColorGrading = (function () {
  'use strict';

  var BASIC_PARAMS = [
    { key: 'brightness',  label: '亮度',  min: 0,   max: 200, def: 100, unit: '%' },
    { key: 'contrast',    label: '对比度', min: 0,   max: 200, def: 100, unit: '%' },
    { key: 'saturate',    label: '饱和度', min: 0,   max: 300, def: 100, unit: '%' },
    { key: 'temperature', label: '色温',   min: -50, max: 50,  def: 0,   unit: '' },
    { key: 'sharpen',     label: '锐化',   min: 0,   max: 100, def: 0,   unit: '' }
  ];

  var HSL_COLORS = [
    { key: 'red',     label: '红',  hue: 0,   css: '#e74c3c' },
    { key: 'orange',  label: '橙',  hue: 30,  css: '#e67e22' },
    { key: 'yellow',  label: '黄',  hue: 60,  css: '#f1c40f' },
    { key: 'green',   label: '绿',  hue: 120, css: '#2ecc71' },
    { key: 'cyan',    label: '青',  hue: 180, css: '#1abc9c' },
    { key: 'blue',    label: '蓝',  hue: 240, css: '#3498db' },
    { key: 'purple',  label: '紫',  hue: 270, css: '#9b59b6' },
    { key: 'magenta', label: '品红', hue: 330, css: '#e91e8a' }
  ];

  /* ---- state ---- */
  var sidebar = null;
  var targetImg = null;
  var lrCanvas = null;
  var origData = null;
  var basic = {};
  var curves = {};
  var curCh = 'rgb';
  var hsl = {};
  var hslMode = 'hue';
  var hslColor = 'red';
  var split = { hi: '#ffffff', lo: '#000000', bal: 0 };
  var dragPt = -1;
  var lrTimer = null;

  function resetBasic() { BASIC_PARAMS.forEach(function (p) { basic[p.key] = p.def; }); }
  function resetCurves() { ['rgb','r','g','b'].forEach(function (c) { curves[c] = [{x:0,y:0},{x:255,y:255}]; }); }
  function resetHsl() { HSL_COLORS.forEach(function (c) { hsl[c.key] = {hue:0,saturation:0,luminance:0}; }); }
  function resetSplit() { split = { hi:'#ffffff', lo:'#000000', bal:0 }; }
  function resetAll() { resetBasic(); resetCurves(); resetHsl(); resetSplit(); }
  resetAll();

  /* ---- Unified Canvas pixel engine ---- */
  function loadToCanvas(src, canvas, cb) {
    var im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = function () {
      var maxW = window.innerWidth > 768 ? 900 : 400;
      var sc = Math.min(1, maxW / im.naturalWidth);
      canvas.width = Math.round(im.naturalWidth * sc);
      canvas.height = Math.round(im.naturalHeight * sc);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
      origData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (cb) cb();
    };
    im.src = src;
  }

  function buildLUT(pts) {
    var lut = new Uint8Array(256);
    var s = pts.slice().sort(function (a, b) { return a.x - b.x; });
    if (s.length < 2) { for (var i = 0; i < 256; i++) lut[i] = i; return lut; }
    for (var x = 0; x < 256; x++) {
      var a = s[0], b = s[s.length - 1];
      for (var j = 0; j < s.length - 1; j++) {
        if (x >= s[j].x && x <= s[j + 1].x) { a = s[j]; b = s[j + 1]; break; }
      }
      var rng = b.x - a.x;
      var t = rng === 0 ? 0 : (x - a.x) / rng;
      lut[x] = Math.max(0, Math.min(255, Math.round(a.y + t * (b.y - a.y))));
    }
    return lut;
  }

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var h, s, l = (mx + mn) / 2;
    if (mx === mn) { h = s = 0; }
    else {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s, l];
  }

  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) { var v = Math.round(l * 255); return [v, v, v]; }
    var hue2rgb = function (p, q, t) {
      if (t < 0) t++; if (t > 1) t--;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [Math.round(hue2rgb(p, q, h + 1/3) * 255), Math.round(hue2rgb(p, q, h) * 255), Math.round(hue2rgb(p, q, h - 1/3) * 255)];
  }

  function colorWeight(pH, tH) {
    var d = Math.abs(pH - tH); if (d > 180) d = 360 - d;
    return d <= 30 ? 1 - d / 30 : 0;
  }

  function hex2rgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : {r:0,g:0,b:0};
  }

  function processPixels(canvas) {
    if (!origData || !canvas) return;
    var ctx = canvas.getContext('2d');
    var img = new ImageData(new Uint8ClampedArray(origData.data), origData.width, origData.height);
    var d = img.data;

    /* --- basic params --- */
    var bright = (basic.brightness || 100) / 100;
    var contr = (basic.contrast || 100) / 100;
    var sat = (basic.saturate || 100) / 100;
    var temp = basic.temperature || 0;
    var sharp = basic.sharpen || 0;

    /* --- LR params --- */
    var lutA = buildLUT(curves.rgb), lutR = buildLUT(curves.r), lutG = buildLUT(curves.g), lutB = buildLUT(curves.b);
    var hiC = hex2rgb(split.hi), loC = hex2rgb(split.lo), bal = split.bal / 100;

    for (var i = 0; i < d.length; i += 4) {
      var r = d[i], g = d[i+1], b = d[i+2];

      /* 1. Brightness */
      r = r * bright; g = g * bright; b = b * bright;

      /* 2. Contrast (around midpoint 128) */
      r = (r - 128) * contr + 128;
      g = (g - 128) * contr + 128;
      b = (b - 128) * contr + 128;

      /* 3. Temperature (warm = +red -blue, cool = -red +blue) */
      if (temp !== 0) {
        r += temp * 1.2;
        b -= temp * 1.2;
      }

      /* 4. Saturation */
      if (sat !== 1) {
        var gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gray + (r - gray) * sat;
        g = gray + (g - gray) * sat;
        b = gray + (b - gray) * sat;
      }

      /* Clamp before LUT */
      r = Math.max(0, Math.min(255, Math.round(r)));
      g = Math.max(0, Math.min(255, Math.round(g)));
      b = Math.max(0, Math.min(255, Math.round(b)));

      /* 5. Curves */
      r = lutR[lutA[r]]; g = lutG[lutA[g]]; b = lutB[lutA[b]];

      /* 6. HSL */
      var h = rgb2hsl(r, g, b), hs = 0, ss = 0, ls = 0;
      HSL_COLORS.forEach(function (c) {
        var w = colorWeight(h[0], c.hue);
        if (w > 0) { var a = hsl[c.key]; hs += a.hue * w; ss += a.saturation * w; ls += a.luminance * w; }
      });
      var rgb2 = hsl2rgb(h[0] + hs, Math.max(0, Math.min(1, h[1] + ss/100)), Math.max(0, Math.min(1, h[2] + ls/100)));
      r = rgb2[0]; g = rgb2[1]; b = rgb2[2];

      /* 7. Split toning */
      var lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      var sp = 0.5 + bal * 0.5, str = 0.15;
      if (lum > sp) {
        var amt = (lum - sp) / (1 - sp) * str;
        r = Math.round(r + (hiC.r - r) * amt); g = Math.round(g + (hiC.g - g) * amt); b = Math.round(b + (hiC.b - b) * amt);
      } else {
        var amt2 = (sp - lum) / sp * str;
        r = Math.round(r + (loC.r - r) * amt2); g = Math.round(g + (loC.g - g) * amt2); b = Math.round(b + (loC.b - b) * amt2);
      }

      d[i] = Math.max(0, Math.min(255, r));
      d[i+1] = Math.max(0, Math.min(255, g));
      d[i+2] = Math.max(0, Math.min(255, b));
    }

    /* 8. Sharpen (3x3 unsharp mask) */
    if (sharp > 0) {
      applySharpen(img, sharp / 100);
    }

    ctx.putImageData(img, 0, 0);
  }

  function applySharpen(imageData, amount) {
    var w = imageData.width, h = imageData.height, d = imageData.data;
    var copy = new Uint8ClampedArray(d);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var idx = (y * w + x) * 4;
        for (var ch = 0; ch < 3; ch++) {
          var center = copy[idx + ch] * 5;
          var neighbors = copy[((y-1)*w+x)*4+ch] + copy[((y+1)*w+x)*4+ch]
                        + copy[(y*w+x-1)*4+ch] + copy[(y*w+x+1)*4+ch];
          var sharpened = center - neighbors;
          d[idx + ch] = Math.max(0, Math.min(255, Math.round(copy[idx + ch] + (sharpened - copy[idx + ch]) * amount)));
        }
      }
    }
  }

  function scheduleProcess() {
    if (lrTimer) clearTimeout(lrTimer);
    lrTimer = setTimeout(function () {
      if (lrCanvas) processPixels(lrCanvas);
    }, 30);
  }

  /* ---- curve drawing ---- */
  function drawCurve(cc) {
    if (!cc) return;
    var ctx = cc.getContext('2d'), w = cc.width, h = cc.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (var i = 1; i < 4; i++) {
      var p = i / 4 * w;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke(); ctx.setLineDash([]);

    var colors = { rgb:'rgba(255,255,255,0.5)', r:'rgba(255,80,80,0.6)', g:'rgba(80,255,80,0.5)', b:'rgba(80,120,255,0.6)' };
    ['rgb','r','g','b'].forEach(function (ch) {
      var pts = curves[ch]; if (pts.length < 2) return;
      var act = ch === curCh;
      ctx.strokeStyle = colors[ch]; ctx.lineWidth = act ? 2.5 : 1; ctx.globalAlpha = act ? 1 : 0.3;
      ctx.beginPath();
      var sorted = pts.slice().sort(function (a,b) { return a.x - b.x; });
      sorted.forEach(function (pt, idx) {
        var px = pt.x / 255 * w, py = h - pt.y / 255 * h;
        idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke(); ctx.globalAlpha = 1;
      if (act) {
        sorted.forEach(function (pt) {
          var px = pt.x / 255 * w, py = h - pt.y / 255 * h;
          ctx.fillStyle = colors[ch]; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        });
      }
    });
  }

  /* ---- UI HTML ---- */
  function buildHTML() {
    var h = '<div class="cg-sidebar-inner">';
    h += '<div class="cg-tabs">';
    h += '<button class="cg-tab active" data-tab="basic">基础</button>';
    h += '<button class="cg-tab" data-tab="lightroom">Lightroom</button>';
    h += '</div>';

    // Basic
    h += '<div class="cg-content active" data-content="basic">';
    BASIC_PARAMS.forEach(function (p) {
      h += '<div class="cg-slider-row">';
      h += '<span class="cg-slider-label">' + p.label + '</span>';
      h += '<input type="range" class="cg-slider" data-key="' + p.key + '" min="' + p.min + '" max="' + p.max + '" value="' + p.def + '">';
      h += '<span class="cg-slider-value" data-vk="' + p.key + '">' + p.def + p.unit + '</span>';
      h += '</div>';
    });
    h += '<div class="cg-footer"><button class="cg-reset" data-reset="basic">重置</button></div>';
    h += '</div>';

    // Lightroom
    h += '<div class="cg-content" data-content="lightroom">';
    // Curves
    h += '<div class="cg-section-title">曲线</div>';
    h += '<div class="cg-curve-channel-tabs">';
    h += '<button class="cg-curve-channel active" data-channel="rgb">RGB</button>';
    h += '<button class="cg-curve-channel" data-channel="r">R</button>';
    h += '<button class="cg-curve-channel" data-channel="g">G</button>';
    h += '<button class="cg-curve-channel" data-channel="b">B</button>';
    h += '</div>';
    h += '<div class="cg-curve-canvas-wrap"><canvas class="cg-curve-canvas" width="280" height="280"></canvas></div>';
    h += '<div class="cg-curve-hint">点击添加控制点 · 拖动调整 · 双击删除</div>';

    // HSL
    h += '<div class="cg-section-title">HSL</div>';
    h += '<div class="cg-hsl-mode-tabs">';
    h += '<button class="cg-hsl-mode active" data-mode="hue">色相</button>';
    h += '<button class="cg-hsl-mode" data-mode="saturation">饱和度</button>';
    h += '<button class="cg-hsl-mode" data-mode="luminance">明度</button>';
    h += '</div>';
    h += '<div class="cg-hsl-colors">';
    HSL_COLORS.forEach(function (c, i) {
      h += '<div class="cg-hsl-color-dot' + (i === 0 ? ' active' : '') + '" data-color="' + c.key + '" style="background:' + c.css + ';" title="' + c.label + '"></div>';
    });
    h += '</div>';
    h += '<div class="cg-slider-row">';
    h += '<span class="cg-slider-label cg-hsl-ml">色相</span>';
    h += '<input type="range" class="cg-slider cg-hsl-sl" min="-180" max="180" value="0">';
    h += '<span class="cg-slider-value cg-hsl-vl">0</span>';
    h += '</div>';

    // Split Toning
    h += '<div class="cg-section-title">分离色调</div>';
    h += '<div class="cg-split-row"><span class="cg-split-name">高光</span><input type="color" class="cg-color-picker" data-split="hi" value="#ffffff"></div>';
    h += '<div class="cg-split-row"><span class="cg-split-name">阴影</span><input type="color" class="cg-color-picker" data-split="lo" value="#000000"></div>';
    h += '<div class="cg-slider-row"><span class="cg-slider-label">平衡</span>';
    h += '<input type="range" class="cg-slider cg-sp-bal" min="-100" max="100" value="0">';
    h += '<span class="cg-slider-value cg-sp-bv">0</span></div>';

    h += '<div class="cg-footer"><button class="cg-reset" data-reset="lr">重置 LR</button></div>';
    h += '</div>';
    h += '</div>';
    return h;
  }

  /* ---- event binding ---- */
  function bind(panel, img, fullSrc) {
    // Tabs (just switch visible content, no canvas init needed)
    panel.querySelectorAll('.cg-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        panel.querySelectorAll('.cg-tab').forEach(function (t) { t.classList.remove('active'); });
        panel.querySelectorAll('.cg-content').forEach(function (c) { c.classList.remove('active'); });
        tab.classList.add('active');
        panel.querySelector('.cg-content[data-content="' + tab.dataset.tab + '"]').classList.add('active');
        if (tab.dataset.tab === 'lightroom') {
          drawCurve(panel.querySelector('.cg-curve-canvas'));
        }
      });
    });

    // Basic sliders — unified canvas rendering
    panel.querySelectorAll('.cg-content[data-content="basic"] .cg-slider').forEach(function (sl) {
      sl.addEventListener('input', function () {
        basic[sl.dataset.key] = parseFloat(sl.value);
        var p = BASIC_PARAMS.find(function (pp) { return pp.key === sl.dataset.key; });
        var ve = panel.querySelector('.cg-slider-value[data-vk="' + sl.dataset.key + '"]');
        if (ve) ve.textContent = sl.value + (p ? p.unit : '');
        scheduleProcess();
      });
    });

    // Reset basic
    panel.querySelector('.cg-reset[data-reset="basic"]').addEventListener('click', function () {
      resetBasic();
      BASIC_PARAMS.forEach(function (p) {
        var s = panel.querySelector('.cg-slider[data-key="' + p.key + '"]');
        var v = panel.querySelector('.cg-slider-value[data-vk="' + p.key + '"]');
        if (s) s.value = p.def; if (v) v.textContent = p.def + p.unit;
      });
      scheduleProcess();
    });

    // Curve channels
    panel.querySelectorAll('.cg-curve-channel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        panel.querySelectorAll('.cg-curve-channel').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        curCh = btn.dataset.channel;
        drawCurve(panel.querySelector('.cg-curve-canvas'));
      });
    });

    // Curve canvas
    var cc = panel.querySelector('.cg-curve-canvas');
    if (cc) bindCurve(cc, panel);

    // HSL modes
    panel.querySelectorAll('.cg-hsl-mode').forEach(function (btn) {
      btn.addEventListener('click', function () {
        panel.querySelectorAll('.cg-hsl-mode').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        hslMode = btn.dataset.mode;
        var ml = panel.querySelector('.cg-hsl-ml');
        if (ml) ml.textContent = {hue:'色相',saturation:'饱和度',luminance:'明度'}[hslMode];
        syncHslSlider(panel);
      });
    });

    // HSL color dots
    panel.querySelectorAll('.cg-hsl-color-dot').forEach(function (dot) {
      dot.addEventListener('click', function () {
        panel.querySelectorAll('.cg-hsl-color-dot').forEach(function (d) { d.classList.remove('active'); });
        dot.classList.add('active');
        hslColor = dot.dataset.color;
        syncHslSlider(panel);
      });
    });

    // HSL slider
    var hslSl = panel.querySelector('.cg-hsl-sl');
    if (hslSl) {
      hslSl.addEventListener('input', function () {
        hsl[hslColor][hslMode] = parseFloat(hslSl.value);
        var vl = panel.querySelector('.cg-hsl-vl');
        if (vl) vl.textContent = hslSl.value;
        scheduleProcess();
      });
    }

    // Split toning
    panel.querySelectorAll('.cg-color-picker').forEach(function (pk) {
      pk.addEventListener('input', function () {
        split[pk.dataset.split] = pk.value;
        scheduleProcess();
      });
    });
    var spBal = panel.querySelector('.cg-sp-bal');
    if (spBal) {
      spBal.addEventListener('input', function () {
        split.bal = parseFloat(spBal.value);
        panel.querySelector('.cg-sp-bv').textContent = spBal.value;
        scheduleProcess();
      });
    }

    // Reset LR
    panel.querySelector('.cg-reset[data-reset="lr"]').addEventListener('click', function () {
      resetCurves(); resetHsl(); resetSplit();
      syncHslSlider(panel);
      drawCurve(panel.querySelector('.cg-curve-canvas'));
      panel.querySelector('.cg-color-picker[data-split="hi"]').value = '#ffffff';
      panel.querySelector('.cg-color-picker[data-split="lo"]').value = '#000000';
      panel.querySelector('.cg-sp-bal').value = 0;
      panel.querySelector('.cg-sp-bv').textContent = '0';
      scheduleProcess();
    });
  }

  function syncHslSlider(panel) {
    var sl = panel.querySelector('.cg-hsl-sl');
    var vl = panel.querySelector('.cg-hsl-vl');
    if (!sl) return;
    var val = hsl[hslColor][hslMode];
    sl.value = val; if (vl) vl.textContent = val;
    sl.min = hslMode === 'hue' ? -180 : -100;
    sl.max = hslMode === 'hue' ? 180 : 100;
  }

  /* ---- curve interaction ---- */
  function bindCurve(cc, panel) {
    function pos(e) {
      var r = cc.getBoundingClientRect();
      return { x: Math.round((e.clientX - r.left) / r.width * 255), y: Math.round((1 - (e.clientY - r.top) / r.height) * 255) };
    }
    function near(p) {
      var pts = curves[curCh];
      for (var i = 0; i < pts.length; i++) {
        var dx = pts[i].x - p.x, dy = pts[i].y - p.y;
        if (Math.sqrt(dx*dx+dy*dy) < 15) return i;
      }
      return -1;
    }
    cc.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var p = pos(e), ni = near(p);
      if (ni >= 0) { dragPt = ni; }
      else {
        curves[curCh].push({ x: Math.max(0,Math.min(255,p.x)), y: Math.max(0,Math.min(255,p.y)) });
        dragPt = curves[curCh].length - 1;
        drawCurve(cc); scheduleProcess();
      }
    });
    cc.addEventListener('mousemove', function (e) {
      if (dragPt < 0) return;
      e.preventDefault();
      var p = pos(e), pts = curves[curCh];
      if (dragPt < pts.length) {
        pts[dragPt].x = Math.max(0,Math.min(255,p.x));
        pts[dragPt].y = Math.max(0,Math.min(255,p.y));
        drawCurve(cc); scheduleProcess();
      }
    });
    cc.addEventListener('mouseup', function () { dragPt = -1; });
    cc.addEventListener('mouseleave', function () { dragPt = -1; });
    cc.addEventListener('dblclick', function (e) {
      e.preventDefault();
      var p = pos(e), ni = near(p);
      if (ni >= 0) {
        var pt = curves[curCh][ni];
        if (!(pt.x === 0 && pt.y === 0) && !(pt.x === 255 && pt.y === 255)) {
          curves[curCh].splice(ni, 1);
          drawCurve(cc); scheduleProcess();
        }
      }
    });
  }

  /* ---- Public API ---- */
  function attach(img, fullSrc) {
    sidebar = document.getElementById('lightbox-cg-sidebar');
    if (!sidebar) return;
    resetAll();
    targetImg = img;
    img.style.filter = '';

    // Create shared canvas that replaces the <img> in lightbox-body
    var canvas = document.createElement('canvas');
    canvas.className = 'cg-shared-canvas';
    canvas.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block;margin:auto;';
    img.parentNode.insertBefore(canvas, img);
    img.style.display = 'none';
    lrCanvas = canvas;

    sidebar.innerHTML = buildHTML();
    bind(sidebar, img, fullSrc);

    // Load image into shared canvas immediately
    loadToCanvas(fullSrc, canvas, function () {
      processPixels(canvas);
    });
  }

  function detach() {
    if (lrCanvas && lrCanvas.parentNode) {
      lrCanvas.parentNode.removeChild(lrCanvas);
    }
    if (targetImg) {
      targetImg.style.display = '';
      targetImg.style.filter = '';
      targetImg = null;
    }
    if (sidebar) { sidebar.innerHTML = ''; }
    origData = null; lrCanvas = null;
  }

  return { attach: attach, detach: detach };
})();
