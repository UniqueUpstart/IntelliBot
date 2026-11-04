/* Codex 式输入卡片：宽度由外层固定，文本区只随内容在 1–6 行之间长高。
   输入区与底部工具条分开排，模型选择和发送键固定在右下角。 */
(function () {
  var wrap = document.querySelector('.composer');
  if (!wrap) return;

  /* ---- 栏体展开时向下让位 ----
     和左右栏体共用一套退场语言：位移走 --exit-d、缩量走 --exit-s，
     同一条弹性曲线 elastic.out(1.0, 0.8)、同样 0.6s、同样缩到 .95。
     区别只在方向 —— 栏体朝左右屏外甩，输入框贴在底边，就朝下屏外落。
     位移量按「底边距 + 自身高度 + 余量」现算：小屏那一档把 bottom 抬到
     76 去避开横躺的两栏，写死 100% 会剩半截留在屏里 */
  var OUT_S = 0.95;
  var OUT_DUR = 0.6;
  var OUT_EASE = 'elastic.out(1.0, 0.8)';
  var calmMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function outOffset() {
    var bottom = parseFloat(window.getComputedStyle(wrap).bottom);
    if (isNaN(bottom)) bottom = 16;
    var suggestions = wrap.querySelector('.composer__starters:not([hidden])');
    var suggestionsOffset = suggestions ? suggestions.offsetHeight + 12 : 0;
    return bottom + wrap.offsetHeight + suggestionsOffset + 12;
  }

  /* 打断也要接得住：先按当前计算值压实内联，再挂 is-out，
     否则类里的终值会抢先跳到位，补间等于从终点起步 */
  window.composerMotion = function (hide) {
    if (!window.gsap || !wrap.isConnected) {
      wrap.classList.toggle('is-out', hide);
      return;
    }
    var cs = window.getComputedStyle(wrap);
    var curS = parseFloat(cs.getPropertyValue('--exit-s'));
    var curD = parseFloat(cs.getPropertyValue('--exit-d'));
    gsap.set(wrap, {
      '--exit-s': isNaN(curS) ? 1 : curS,
      '--exit-d': (isNaN(curD) ? 0 : curD) + 'px'
    });
    wrap.classList.toggle('is-out', hide);
    /* 回来时先把元素放回可见，再让曲线把它顶上来；
       出去时等落定再收 visibility，免得屏幕里半截就先消失 */
    if (!hide) wrap.style.visibility = '';
    gsap.to(wrap, {
      '--exit-s': hide ? OUT_S : 1,
      '--exit-d': (hide ? outOffset() : 0) + 'px',
      duration: calmMotion.matches ? 0 : OUT_DUR,
      ease: OUT_EASE,
      overwrite: 'auto',
      onComplete: function () {
        if (!hide || !wrap.classList.contains('is-out')) return;
        wrap.style.visibility = 'hidden';
      }
    });
  };

  /* 触发条件是「任意栏体展开」，与 CSS 里原来 body:has(.rail.is-open) 一致。
     只看 .rail 的 class 变化：输入框自己挂 is-out 也会进这个观察器，
     但那一趟 anyRailOpen() 结果没变，直接略过 */
  function anyRailOpen() {
    return !!document.querySelector('.rail.is-open');
  }
  var railOpen = anyRailOpen();
  if (railOpen) {
    wrap.classList.add('is-out');
    wrap.style.visibility = 'hidden';
  }
  new MutationObserver(function () {
    var on = anyRailOpen();
    if (on === railOpen) return;
    railOpen = on;
    window.composerMotion(on);
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });

  var field = wrap.querySelector('.composer__input');
  if (!field) return;

  var MIN_H = 54;
  var MAX_H = 150;

  function layout() {
    /* 高度先放回 auto 量内容高度，再夹在 1–6 行之间；
       量出来超过六行就把纵向滚动放开，光标在末行时浏览器自己会跟 */
    field.style.height = 'auto';
    var content = field.scrollHeight;
    field.style.height = Math.min(Math.max(content, MIN_H), MAX_H) + 'px';
    field.style.overflowY = content > MAX_H + 1 ? 'auto' : 'hidden';
  }

  /* 点这一格以外的任何地方，都把这枚输入框的选中态收掉。
     不能指望浏览器自己收：模型画布那边在 pointerdown 上 preventDefault
     （要拖关节、也不希望一拖就选中页面文字），而默认行为一旦被拦，
     焦点就不会从 textarea 转走，那道主题色内描边会一直挂着，
     看上去像还在等着输入。所以自己在捕获阶段先收 —— 早于画布那层的
     pointerdown，也早于按钮自己的按下动画。
     落点仍在输入框或发送钮上就放过：那两处是「还在这格上操作」，
     选中态该留着，发完一条接着打下一条也不用再点一次框。
     其它会把焦点带走的元素（胶囊、栏体、弹窗）本来就由浏览器接管，
     这里补的那次 blur 只是把顺序提到前面，不会有第二遍 */
  document.addEventListener('pointerdown', function (event) {
    if (document.activeElement !== field) return;
    var target = event.target;
    if (target && target.closest && target.closest('.composer')) return;
    field.blur();
  }, true);

  field.addEventListener('input', layout);
  window.addEventListener('resize', layout);
  layout();
})();
