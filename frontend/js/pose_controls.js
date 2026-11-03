/* 右栏姿态卡：播放主页模型自带的静态 / 待机片段。
   动作库仍由 homepage_motions.js 填充，这里只负责上方的姿态快捷入口。 */
(function () {
  'use strict';

  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-pose-clip]'));
  var note = document.querySelector('[data-pose-note]');
  if (!cards.length) return;

  function setNote(text, error) {
    if (!note) return;
    note.textContent = text || (typeof t === 'function' ? t('dock.pose.note') : '姿态会直接改变舞台中的机器人。');
    note.classList.toggle('is-error', !!error);
  }

  function select(card) {
    cards.forEach(function (item) {
      var on = item === card;
      item.classList.toggle('is-on', on);
      item.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function apply(card) {
    var robot = window.robot3d;
    var clip = card.dataset.poseClip;
    if (!robot || !robot.ready || typeof robot.playClip !== 'function') {
      setNote(typeof t === 'function' ? t('dock.pose.loading') : '机器人还在加载，稍等一下再试试。', false);
      return;
    }
    try {
      if (typeof robot.stopGesture === 'function') robot.stopGesture();
      robot.playClip(clip, card.dataset.poseLoop === 'true');
      window.dispatchEvent(new CustomEvent('robot-pose-change', {detail: {clip}}));
      select(card);
      setNote((typeof t === 'function' ? t('dock.pose.applied') : '已切换到') + ' · ' + card.textContent.trim());
    } catch (error) {
      setNote(error.message || (typeof t === 'function' ? t('dock.pose.unsupported') : '当前模型不支持这个姿态。'), true);
    }
  }

  cards.forEach(function (card) {
    card.addEventListener('click', function () { apply(card); });
  });

  window.addEventListener('robot-ready', function () {
    var robot = window.robot3d;
    if (!robot || !Array.isArray(robot.clips)) return;
    cards.forEach(function (card) {
      card.disabled = !robot.clips.includes(card.dataset.poseClip);
      if (card.disabled) card.classList.add('is-unavailable');
    });
    setNote('');
  });

  window.addEventListener('robot-manual-motion', function () {
    setNote(typeof t === 'function' ? t('dock.pose.motion') : '机器人正在执行动作，姿态会在动作结束后沿用当前状态。');
  });

  document.addEventListener('langchange', function () { setNote(''); });
})();
