/**
 * Photography Portfolio — Lightbox, Lazy Loading & EXIF Display
 */
(function () {
  'use strict';

  const overlay = document.querySelector('.lightbox-overlay');
  const lightboxImage = overlay.querySelector('.lightbox-image');
  const counterElement = overlay.querySelector('.lightbox-counter');
  const exifElement = overlay.querySelector('.lightbox-exif');
  const prevButton = overlay.querySelector('.lightbox-prev');
  const nextButton = overlay.querySelector('.lightbox-next');
  const closeButton = overlay.querySelector('.lightbox-close');

  let galleryImages = [];
  let currentIndex = 0;
  var exifCache = {};

  function initGallery() {
    galleryImages = Array.from(document.querySelectorAll('.gallery-item img'));
    galleryImages.forEach(function (image, index) {
      image.parentElement.addEventListener('click', function () {
        openLightbox(index);
      });
      preloadExif(image, index);
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

  function preloadExif(imageElement, index) {
    if (typeof EXIF === 'undefined') return;
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      EXIF.getData(img, function () {
        var make = EXIF.getTag(this, 'Make') || '';
        var model = EXIF.getTag(this, 'Model') || '';
        var focalLength = EXIF.getTag(this, 'FocalLengthIn35mmFilm') || EXIF.getTag(this, 'FocalLength');
        var fNumber = EXIF.getTag(this, 'FNumber');
        var exposureTime = EXIF.getTag(this, 'ExposureTime');
        var iso = EXIF.getTag(this, 'ISOSpeedRatings');

        var deviceName = model || make;
        if (make && model && model.indexOf(make) === -1) {
          deviceName = make + ' ' + model;
        }
        deviceName = deviceName.trim();

        var parts = [];
        if (deviceName) parts.push(deviceName);
        if (focalLength) parts.push(formatFocalLength(focalLength));
        if (fNumber) parts.push(formatAperture(fNumber));
        if (exposureTime) parts.push(formatExposureTime(exposureTime));
        if (iso) parts.push('ISO ' + iso);

        exifCache[index] = parts.length > 0 ? parts.join('  ·  ') : '';
      });
    };
    img.src = imageElement.dataset.full || imageElement.dataset.src || imageElement.src;
  }

  function showExif() {
    var exifText = exifCache[currentIndex];
    if (exifText) {
      exifElement.textContent = exifText;
      exifElement.classList.add('visible');
    } else {
      exifElement.textContent = '';
      exifElement.classList.remove('visible');
    }
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
            image.parentElement.classList.remove('loading');
            observer.unobserve(image);
          }
        });
      }, { rootMargin: '200px' });

      lazyImages.forEach(function (image) {
        observer.observe(image);
      });
    } else {
      // Fallback: load all images immediately
      lazyImages.forEach(function (image) {
        image.src = image.dataset.src;
        image.removeAttribute('data-src');
        image.parentElement.classList.remove('loading');
      });
    }
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    initLazyLoad();
    // Re-init gallery after lazy images have a chance to load
    setTimeout(initGallery, 100);
  });

  // Also init immediately if DOM is already ready
  if (document.readyState !== 'loading') {
    initLazyLoad();
    setTimeout(initGallery, 100);
  }
})();
