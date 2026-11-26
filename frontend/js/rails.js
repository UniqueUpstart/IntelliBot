/* 折叠栏交互：点击图标 → 所在栏向锚定侧相反方向展开；
   左右两栏各自独立，可以同时展开（每栏内仍只保留一个选中项）；
   只有移动端两栏都贴底、展开会占满整行，那里才保持互斥 */
(function () {
  const rails = Array.from(document.querySelectorAll('.rail'));
  const narrow = window.matchMedia('(max-width: 640px)');

  function close(rail) {
    rail.classList.remove('is-open');
    rail.querySelectorAll('.item').forEach(function (i) {
      i.classList.remove('is-active');
      i.setAttribute('aria-expanded', 'false');
    });
  }

  function open(rail, item) {
    if (narrow.matches) rails.forEach(function (r) { if (r !== rail) close(r); });
    /* 栏体被推到屏外时先唤回来 —— 点图标就是要用这一栏 */
    if (rail.classList.contains('is-hidden')) {
      if (window.railMotion) window.railMotion(rail, false);
      else rail.classList.remove('is-hidden');
      const t = document.querySelector('.rail__toggle[data-rail="' +
        (rail.classList.contains('rail--right') ? 'right' : 'left') + '"]');
      if (t) t.setAttribute('aria-label', 'Hide panel');
    }
    rail.classList.add('is-open');
    rail.querySelectorAll('.item').forEach(function (i) {
      const on = !!item && i === item;
      i.classList.toggle('is-active', on);
      i.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
    /* 面板内容按选中项切视图：data-view 取按钮 data-panel 的小写，
       CSS 只留对应的那一页（右栏四页：gestures / emotions / shortcuts / edit） */
    const body = rail.querySelector('[data-panel-body]');
    if (body) {
      body.dataset.view = String((item && item.dataset.panel) || '').toLowerCase();
      body.scrollTop = 0;
      /* 同一个视图名再写到栏体上：页标题那一层（.rail__head）是滚动区的兄弟，
         拿不到 body 的 data-view，得靠栏体上的这一份来选显哪一枚标题 */
      rail.dataset.view = body.dataset.view;
    }
  }

  /* 首屏还没点过任何图标，栏体上先补一份初始视图名，标题才能照常显示 */
  rails.forEach(function (rail) {
    const body = rail.querySelector('[data-panel-body]');
    const view = body && body.dataset.view;
    if (view && !rail.dataset.view) rail.dataset.view = view;
  });

  rails.forEach(function (rail) {
    /* 箭头已经搬到栏体外（fixed），用 data-rail 关联回各自的栏 */
    const side = rail.classList.contains('rail--right') ? 'right' : 'left';
    const toggle = document.querySelector('.rail__toggle[data-rail="' + side + '"]');
    if (toggle) {
      toggle.addEventListener('click', function () {
        const hide = !rail.classList.contains('is-hidden');
        close(rail);
        /* 移入移出交给脚本的弹性补间（定义在引入了 GSAP 的那段）；
           还没就绪就退回纯 class 切换，功能不受影响 */
        if (window.railMotion) window.railMotion(rail, hide);
        else rail.classList.toggle('is-hidden', hide);
        toggle.setAttribute('aria-label', hide ? 'Show panel' : 'Hide panel');
      });
    }

    rail.querySelectorAll('.item').forEach(function (item) {
      item.addEventListener('click', function () {
        if (item.classList.contains('is-active')) close(rail);
        else open(rail, item);
      });
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') rails.forEach(close);
  });

  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.rail')) rails.forEach(close);
  });
})();

/* 右栏动作面板：先用空白卡占好四列的位置，手势与表情模块随后往这些节点里
   填内容（缩略图 / 表情屏），只填不换节点 —— 磁吸脚本在加载时把卡收进自己的
   列表，换掉 DOM 就得重扫一遍。
   手势页 10 张（除左栏那三张动作卡之外的其余手势）、表情页 16 张（四行），
   都是一行四张 */
(function () {
  var COUNTS = { gestures: 10, emotions: 16 };
  document.querySelectorAll('[data-rail-grid]').forEach(function (grid) {
    var total = COUNTS[grid.dataset.railGrid] || 8;
    var html = '';
    for (var i = 0; i < total; i++) {
      html += '<div class="rail__card" aria-hidden="true"></div>';
    }
    grid.innerHTML = html;
  });
})();

/* 顶栏胶囊：组内单选，点击即选中；再次点击当前选中项重复触发按压反馈 */
(function () {
  document.querySelectorAll('.group').forEach(function (group) {
    group.querySelectorAll('.pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        group.querySelectorAll('.pill').forEach(function (p) {
          const on = p === pill;
          p.classList.toggle('is-active', on);
          p.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      });
    });
  });
})();



/* 账号胶囊：点击展开为面板，点击外部 / Esc 收起；菜单项组内单选 */
(function () {
  const user = document.getElementById('account');
  if (!user) return;
  const trigger = user.querySelector('.user__trigger');
  const avatar = user.querySelector('.avatar');

  function setOpen(on) {
    user.classList.toggle('is-open', on);
    /* 收面板时把头像选择区一起收掉：它的展开高度挂在面板高度上，
       留着不关，下次点开胶囊会先看到那块选择条 */
    if (!on) user.classList.remove('is-picking');
    /* 收起态头像被 trigger 盖着，不该被 Tab 选中；展开后它才是独立的一站 */
    if (avatar) avatar.tabIndex = on ? 0 : -1;
    trigger.setAttribute('aria-expanded', on ? 'true' : 'false');
  }

  trigger.addEventListener('click', function () {
    setOpen(!user.classList.contains('is-open'));
  });

  user.querySelectorAll('.user__menu .pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      user.querySelectorAll('.user__menu .pill').forEach(function (p) {
        const on = p === pill;
        p.classList.toggle('is-active', on);
        p.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
  });

  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('#account')) setOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
})();

/* 指令卡触发主页动作：卡上带 data-motion 时，点一下就在主页模型上播放同名动作。
   模型是 6.4MB 的 GLB，比这段脚本晚就绪，早到的点击先记下来，等 robot-ready 补播一次。
   播放期间给卡挂 .is-on（配色与悬停同一套），按时长自己收掉；
   时长读 getGestureInfo，读不到就按默认 4 秒兜底 */
(function () {
  var pending = null;

  function play(id) {
    var api = window.robot3d;
    if (!api || typeof api.playGesture !== 'function') {
      pending = id;
      return false;
    }
    var ok = false;
    try { ok = api.playGesture(id) === true; } catch (e) { ok = false; }
    if (!ok) pending = id;
    return ok;
  }

  window.addEventListener('robot-ready', function () {
    if (!pending) return;
    var id = pending;
    pending = null;
    play(id);
  });

  function bind(card) {
    /* 卡有两种写法：普通动作挂在 data-motion，街舞那张用 data-action-motion */
    var id = card.dataset.motion || card.dataset.actionMotion;
    if (!id) return;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    if (!card.getAttribute('aria-label')) card.setAttribute('aria-label', id);

    function activate() {
      if (!play(id)) return;
      card.classList.add('is-on');
      clearTimeout(card.__motionTimer);
      var info = window.robot3d && window.robot3d.getGestureInfo
        ? window.robot3d.getGestureInfo(id)
        : null;
      var ms = info && info.duration ? info.duration * 1000 + 240 : 4240;
      card.__motionTimer = setTimeout(function () { card.classList.remove('is-on'); }, ms);
    }

    card.addEventListener('click', activate);
    /* 卡里还嵌着图钉，键盘回车在按钮上不算触发卡片 */
    card.addEventListener('keydown', function (e) {
      if (e.target !== card) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      activate();
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.sc[data-motion], .sc[data-action-motion]'), bind);
})();
