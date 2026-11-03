/* 底部 AI 输入胶囊的自适应尺寸：一行装不下先横向长到半页宽，
   再装不下才纵向长到四行，四行以上转成滚动。

   这里的 14 / 20 / 48 与 css/chat.css 里的盒模型一一对应 ——
   上下内边距各 14、行高 20，一行的高度就是 14×2 + 20 = 48，
   四行是 14×2 + 20×4 = 108。CSS 那边改行高或内边距，这两个数要跟着改。

   宽度没有用 CSS 的 ch 或 auto —— 输入框要按「最长那一行」长，
   而 textarea 的 scrollWidth 不会超出自身宽度（会自动折行），
   于是另挂一枚不可见的镜子元素量文字宽度 */
(function () {
  var wrap = document.querySelector('.composer');
  if (!wrap) return;
  var field = wrap.querySelector('.composer__input');
  if (!field) return;

  var PAD_LEFT = 16;
  /* 右边让出的位置：发送钮 36 + 距右 6 + 缝 10 = 52，与
     css/chat.css 里 .composer__input 的 padding-right 同值 */
  var PAD_RIGHT = 52;
  var PAD_Y = 14;
  var LINE = 20;
  var MIN_H = PAD_Y * 2 + LINE;
  var MAX_H = PAD_Y * 2 + LINE * 4;

  var mirror = document.createElement('span');
  mirror.className = 'composer__measure';
  mirror.setAttribute('aria-hidden', 'true');
  wrap.appendChild(mirror);

  /* 默认 1/4 页宽，最多长到 1/2；窄屏那一档两栏已经横过来贴底，
     横向没有余量可长，固定成铺满可用宽度、只长高 */
  function limits() {
    var vw = document.documentElement.clientWidth;
    if (window.matchMedia('(max-width: 640px)').matches) {
      var full = vw - 24;
      return { base: full, max: full };
    }
    return { base: vw * 0.25, max: vw * 0.5 };
  }

  function layout() {
    var lim = limits();

    /* 空值时镜子没有内容，宽度自然落在 base，不会因为 placeholder 长而提前撑开 */
    mirror.textContent = field.value;
    var need = mirror.getBoundingClientRect().width + PAD_LEFT + PAD_RIGHT + 1;
    field.style.width = Math.min(Math.max(need, lim.base), lim.max) + 'px';

    /* 高度先放回 auto 量内容高度，再夹在 1–4 行之间；
       量出来超过四行就把纵向滚动放开，光标在末行时浏览器自己会跟 */
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
    if (target && target.closest && target.closest('.composer__input, .composer__send')) return;
    field.blur();
  }, true);

  field.addEventListener('input', layout);
  window.addEventListener('resize', layout);
  layout();
})();
