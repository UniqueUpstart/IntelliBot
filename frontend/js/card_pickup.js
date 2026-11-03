/* 把左栏的卡片拖到机器人身上。
   指针按下满 5px 才算拖（不到就还是点击，交给 rails.js 播动作）；
   拖起来时把卡片克隆一份挂到 body 上做影子，原卡从栏里收起来（visibility: hidden，
   位置照旧占着，不放一张半透明的底在那里）。
   拖动期间屏上是下载图标，机器人的头跟着指针转。
   松手落在机器人身上 → 卡片改成浮在摊开的掌心上方（不透明、轻微上下浮动），
   机器人开始「接住 → 思考 2s → 屏上打勾」，勾出来（robot-card 的 release）
   后卡片淡出缩小消失，再由机器人自己播卡上的动作；落在别处 → 影子飞回原位。

   命中判定与右手屏幕坐标都由 robot3d 提供，这里只管 DOM 那一半。 */
(function () {
  var THRESHOLD = 5;      /* 超过这个位移才算拖，否则按点击处理 */
  var PICKED_SCALE = 0.82;/* 托在手上时按卡片的原比例缩一点点，屏上不至于盖住半张脸 */
  var PALM_X = 0.08;      /* 手在卡片中心偏右一点，整张卡略往左让开面罩 */
  var PALM_LIFT = 22;     /* 卡片底边离手心的像素距离：掌心面本身约 9px，再留一道缝 */
  var FLOAT_AMP = 2.6;    /* 悬浮的上下浮动幅度（px） */

  var pending = null;     /* 按下但还没到阈值的候选 */
  var state = null;       /* 正在拖的影子 */
  var raf = 0;
  var lastT = 0;
  var suppressClick = false;
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 帧率无关的逼近系数：每秒衰减 rate，折算到这一帧的 dt 上。
     高刷屏与软渲染掉帧时，跟手与淡出的时长都还是同一条曲线 */
  function approach(dt, perSecond) {
    return 1 - Math.pow(perSecond, dt);
  }

  function hitAt(x, y) {
    var api = window.robot3d;
    if (!api || typeof api.hitTest !== 'function') return false;
    try { return api.hitTest(x, y) === true; } catch (e) { return false; }
  }

  /* 接住之后卡面归场景里那块真卡画，内容得从 DOM 带过去：
     编号、两行字、底色、墨色、字体。影子（克隆件）带着 is-lit，
     此刻的 computed 值就是 hover 态那一套，深浅两套主题都取得到真颜色 ——
     浅色下填充在 ::before 上，深色下则是卡面自己的 background，
     所以底色的取法要看 ::before 有没有在显形 */
  function readCard(node) {
    if (!node) return null;
    var cs = getComputedStyle(node);
    var before = getComputedStyle(node, '::before');
    var id = node.querySelector('.sc__id');
    var brief = node.querySelector('.sc__brief');
    var time = node.querySelector('.sc__time');
    var go = node.querySelector('.sc__go');
    var lit = parseFloat(before.opacity) > 0.5;
    var goCs = go ? getComputedStyle(go) : null;
    return {
      id: id ? id.textContent.trim() : '',
      brief: brief ? brief.textContent.trim() : '',
      time: time ? time.textContent.trim() : '',
      color: (lit ? before.backgroundColor : cs.backgroundColor) || '#6e9182',
      ink: id ? getComputedStyle(id).color : '#fafafa',
      timeInk: time ? getComputedStyle(time).color : '#fafafa',
      btnBg: goCs ? goCs.backgroundColor : '#fafafa',
      btnInk: goCs ? goCs.color : '#6e9182',
      font: cs.fontFamily,
      weight: cs.fontWeight,
    };
  }

  function paint(ts) {
    if (!state) return;
    var dt = lastT ? Math.min(0.05, (ts - lastT) / 1000) : 1 / 60;
    lastT = ts;

    var node = state.node;

    if (state.mode === 'drag') {
      /* 影子就当长在指针上，不做跟随插值，拖起来才是 1:1 */
      state.x = state.tx;
      state.y = state.ty;
      node.classList.toggle('is-over', hitAt(state.x, state.y));
    } else {
      var k = approach(dt, 0.00002);
      state.x += (state.tx - state.x) * k;
      state.y += (state.ty - state.y) * k;
    }

    state.scale += (state.tscale - state.scale) * approach(dt, 0.002);

    if (state.mode === 'hand') {
      var api = window.robot3d;
      var hand = api && typeof api.handScreen === 'function' ? api.handScreen() : null;
      if (hand) {
        /* 掌心朝上摊平，卡片浮在掌面正上方：底边留一道缝，
           再叠一点极慢的上下浮动，读起来是被托着悬在那儿 */
        var hw = state.w * state.tscale;
        var hh = state.h * state.tscale;
        state.tx = hand.x - hw * PALM_X;
        state.ty = hand.y - hh / 2 - PALM_LIFT + Math.sin(performance.now() / 520) * FLOAT_AMP;
      }
      node.style.opacity = 1;
      /* 影子滑到掌心就够了：3D 那张卡已经在掌上亮起来，这张收掉。
         原卡先不复现，等仪式走完 release 再放回栏里 */
      if (state.handT0 && ts - state.handT0 > 150) {
        node.style.opacity = 0;
        state.mode = 'held';
        raf = 0;
        return;
      }
    }

    if (state.mode === 'return') {
      /* 回去的路上不再压暗：原卡是收起来的，这里要一路不透明地落回去，
         贴到原位的那一帧再把原卡放出来，两层才接得上 */
      node.style.opacity = 1;
      if (Math.abs(state.tx - state.x) < 1.5 && Math.abs(state.ty - state.y) < 1.5) { stop(); return; }
    }

    node.style.transform = 'translate3d(' + state.x + 'px,' + state.y + 'px,0)'
      + ' translate(-50%,-50%) scale(' + state.scale + ')';
    raf = requestAnimationFrame(paint);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (state && state.node && state.node.parentNode) state.node.parentNode.removeChild(state.node);
    if (state && state.card) state.card.classList.remove('is-dragging');
    state = null;
    document.body.classList.remove('is-card-drag');
    /* 原卡是收起来的（.is-dragging），到这一帧才算「放回去」；下载图标与头部跟随也一并收掉 */
    var api = window.robot3d;
    if (api && typeof api.endCardDrag === 'function') api.endCardDrag();
  }

  function begin(card, x, y) {
    var rect = card.getBoundingClientRect();
    var cs = getComputedStyle(card);
    var node = card.cloneNode(true);

    node.classList.remove('is-pinned', 'is-on', 'is-confirm-unpin');
    node.removeAttribute('data-pin-key');
    /* is-lit 就是 hover 那一整套（填充层、文字反白、右下圆钮）。
       影子挂在 body 下、又 pointer-events:none，指针压不到它身上，
       原卡这会儿是 hidden 也不接悬停 —— 不手动点亮，卡从栏里拎出来就熄了 */
    node.classList.add('card-ghost', 'is-lit');
    node.style.width = rect.width + 'px';
    node.style.height = rect.height + 'px';
    /* 组的系列色来自祖先 .sc-group，影子挂到 body 下会丢，手动搬一份过来 */
    node.style.setProperty('--sc', cs.getPropertyValue('--sc').trim() || '#91d2c3');
    var pin = node.querySelector('.sc__pin');
    if (pin) pin.remove();

    document.body.appendChild(node);
    card.classList.add('is-dragging');
    document.body.classList.add('is-card-drag');
    node.style.opacity = 1;

    /* 拖起来就把屏上换成下载图标，头开始跟指针 */
    var api = window.robot3d;
    if (api && typeof api.beginCardDrag === 'function') api.beginCardDrag();

    state = {
      card: card,
      node: node,
      w: rect.width,
      h: rect.height,
      x: x,
      y: y,
      tx: x,
      ty: y,
      scale: 1.04,
      tscale: 1.04,
      opacity: 1,
      mode: 'drag',
      origin: {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2},
    };
    lastT = 0;
    node.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,-50%) scale(1.04)';
    raf = requestAnimationFrame(paint);
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (!e.target.closest) return;
    var card = e.target.closest('.sc');
    if (!card || state) return;
    if (e.target.closest('.sc__pin')) return;      /* 图钉那枚只负责钉，不参与拖 */
    pending = {card: card, x: e.clientX, y: e.clientY, id: e.pointerId};
  });

  document.addEventListener('pointermove', function (e) {
    if (pending && e.pointerId === pending.id) {
      var dx = e.clientX - pending.x;
      var dy = e.clientY - pending.y;
      if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
      var card = pending.card;
      pending = null;
      /* 这一下之后浏览器还会补一次 click，别让它把动作提前播了 */
      suppressClick = true;
      begin(card, e.clientX, e.clientY);
      return;
    }
    if (state && state.mode === 'drag') {
      state.tx = e.clientX;
      state.ty = e.clientY;
    }
  });

  function release(e) {
    if (pending) { pending = null; return; }
    if (!state || state.mode !== 'drag') return;

    var card = state.card;
    var over = hitAt(e.clientX, e.clientY);
    var api = window.robot3d;
    var picked = over && api && typeof api.pickUpCard === 'function'
      ? api.pickUpCard(card.dataset.motion || '', readCard(state.node))
      : false;

    /* 松手就收掉下载图标：接住了要马上换成思考脸，没接住也别拖着这张图飞回去 */
    if (api && typeof api.endCardDrag === 'function') api.endCardDrag();

    if (picked) {
      /* 先让影子滑到掌心（3D 卡那边晚 120ms 才亮），到点把影子收掉换真卡。
         原卡仍收在栏里，等仪式走完 reward 的 release 再放回来 */
      state.mode = 'hand';
      state.tscale = PICKED_SCALE;
      state.handT0 = performance.now();
      state.node.classList.add('is-picked');
      state.node.classList.remove('is-over');
      state.node.style.opacity = 1;
      document.body.classList.remove('is-card-drag');
      return;
    }

    state.mode = 'return';
    state.tscale = 1;
    state.tx = state.origin.x;
    state.ty = state.origin.y;
    /* 飞回去这一路不再亮着：落回原位时由真卡的 :hover 接手 */
    state.node.classList.remove('is-over', 'is-lit');
    document.body.classList.remove('is-card-drag');
  }

  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', function () {
    if (pending) pending = null;
    if (state) {
      state.mode = 'return';
      state.tx = state.origin.x;
      state.ty = state.origin.y;
      state.node.classList.remove('is-over', 'is-lit');
      var api = window.robot3d;
      if (api && typeof api.endCardDrag === 'function') api.endCardDrag();
    }
  });

  /* 拖过之后的补发 click 在这里吃掉，指针没动的点击照常放行 */
  document.addEventListener('click', function (e) {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  /* 归位那一拍：卡回到栏里时轻轻涨一下再落定（幅度与曲线写在
     cards.css 的 card-back-pop 里，这里只管挂类与摘类）。
     先摘再挂是为了同一张卡连着被拿两次也能从第 0 帧起动画 ——
     浏览器对「类已经在身上」不会重新播；中间读一次 offsetWidth 强制重排，
     否则摘和挂落在同一帧里会被合并掉 */
  function popBack(card) {
    if (!card || REDUCED) return;
    card.classList.remove('is-back');
    void card.offsetWidth;
    card.classList.add('is-back');
    card.addEventListener('animationend', function end(ev) {
      if (ev.target !== card || ev.animationName !== 'card-back-pop') return;
      card.removeEventListener('animationend', end);
      card.classList.remove('is-back');
    });
  }

  /* 打勾之后释放：手里的 3D 卡自己淡出（robot3d 那边管），
     这一侧只负责把手里的影子收干净、把栏里那张原卡放回来 */
  window.addEventListener('robot-card', function (e) {
    if (!state || !e.detail) return;
    if (e.detail.phase === 'release') {
      state.node.classList.remove('is-picked', 'is-over');
      var back = state.card;
      stop();
      /* stop() 里刚把 is-dragging 摘掉、原卡重新露出来，紧跟着弹这一下 */
      popBack(back);
    }
  });
})();
