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
  var PAD_RIGHT = 72;
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

  field.addEventListener('input', layout);
  window.addEventListener('resize', layout);
  layout();
})();
