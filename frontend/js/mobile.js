(function () {
  'use strict';

  var media = window.matchMedia('(max-width: 760px)');
  var dock = document.querySelector('[data-mobile-dock]');
  var scrim = document.querySelector('[data-mobile-sheet-scrim]');
  if (!dock) return;

  var buttons = Array.prototype.slice.call(dock.querySelectorAll('[data-mobile-panel]'));

  function originalFor(button) {
    var rail = button.dataset.mobileSide === 'left'
      ? document.getElementById('rail-shortcuts')
      : document.getElementById('rail-tools');
    return rail && rail.querySelector('.item[data-panel="' + button.dataset.mobilePanel + '"]');
  }

  function sync() {
    buttons.forEach(function (button) {
      var original = originalFor(button);
      var active = !!(media.matches && original && original.classList.contains('is-active'));
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function closeOtherPanels(target) {
    buttons.forEach(function (button) {
      var original = originalFor(button);
      if (original && original !== target && original.classList.contains('is-active')) original.click();
    });
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var original = originalFor(button);
      if (!original) return;
      if (!original.classList.contains('is-active')) closeOtherPanels(original);
      original.click();
      requestAnimationFrame(sync);
    });
  });

  if (scrim) {
    scrim.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.rail .item.is-active'), function (active) {
        active.click();
      });
      sync();
    });
  }

  new MutationObserver(sync).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-view']
  });

  function updateViewport() {
    var viewport = window.visualViewport;
    var keyboard = media.matches && viewport && viewport.height < window.innerHeight * 0.78;
    document.body.classList.toggle('is-mobile-keyboard', !!keyboard);
    if (viewport) document.documentElement.style.setProperty('--mobile-viewport-height', viewport.height + 'px');
    sync();
  }

  if (media.addEventListener) media.addEventListener('change', updateViewport);
  else media.addListener(updateViewport);
  window.addEventListener('resize', updateViewport, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', updateViewport, { passive: true });
  }

  updateViewport();
})();
