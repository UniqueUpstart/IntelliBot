(function () {
  'use strict';

  var left = document.querySelector('.rail--left');
  var right = document.querySelector('.rail--right');
  if (!left || !right) return;

  var leftItems = left.querySelector('.rail__items');
  var rightItems = right.querySelector('.rail__items');
  var leftBody = left.querySelector('[data-panel-body]');
  var rightBody = right.querySelector('[data-panel-body]');
  var chatButton = right.querySelector('.item[data-panel="Chat"]');
  var skinButton = left.querySelector('.item[data-panel="Skin"]');
  var chatView = right.querySelector('[data-rail-view="chat"]');
  var skinView = left.querySelector('[data-skin-view]');

  if (chatButton && leftItems) {
    chatButton.setAttribute('aria-controls', 'panel-shortcuts');
    leftItems.appendChild(chatButton);
  }
  if (skinButton && rightItems) {
    skinButton.setAttribute('aria-controls', 'panel-tools');
    rightItems.appendChild(skinButton);
  }
  if (chatView && leftBody) leftBody.appendChild(chatView);
  if (skinView && rightBody) rightBody.appendChild(skinView);

  var composer = document.querySelector('.composer');
  if (composer) document.body.appendChild(composer);
})();
