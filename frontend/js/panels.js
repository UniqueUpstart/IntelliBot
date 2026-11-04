/* 面板开合：复刻 STRCAT 轮播面板呼出 / 收回的那两条通道 ——
   ① 形变（squash & stretch）：整块面板的 scaleX / scaleY 交给一条弹性曲线；
   ② 内容：只做透明度变化，位置始终由布局固定。
   形变这一路照 歌单菜单（lockMenuBox）的做法拆成两轴：
   那边是一条补间同时驱动 { scaleX: MENU_SQUEEZE(0.3), scaleY: MENU_SQUASH_Y(0.75) } → { 1, 1 }，
   横向从窄撑满、纵向从扁撑开，两轴共用一条 elastic 曲线，所以拉伸的形变是「斜着」发生的。
   与 STRCAT 唯一的差别在起点：那边面板是从 0.65 的缩略态、再压到 0.25 才撑开的，
   这里一出现就是原大小（scale = 1），所以形变不做「先压窄再撑开」，
   改成从 1 撑出去再弹回来 —— 两轴各留一个峰值参数，同值就是等比过冲，
   拉开差值则偏向某一侧胀（当前 PEAK_X = PEAK_Y = 1.02，等比）。
   曲线沿用 STRCAT 的原值：形变 elastic.out(1.1, 0.8)（OPEN_SQUASH_EASE 同周期），
   内容淡入使用 panelOut = cubic-bezier(.22, 1, .36, 1)。
   尺寸（栏宽 80 → 601、账号高 48 → 270）仍由 CSS 的 0.3s 过渡负责，
   脚本只写 scale 与内容通道，不和宽度、磁吸、按压反馈抢 transform。 */
(function () {
  if (!window.gsap) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* CSS 里的 cubic-bezier(x1,y1,x2,y2)：先按参数采一张 x→y 的表，再线性插值查值。
     查表不对结果做额外裁剪。 */
  function cubicEase(x1, y1, x2, y2) {
    var N = 160, xs = [], ys = [], i, t;
    var bez = function (a, b, u) {
      var v = 1 - u;
      return 3 * a * u * v * v + 3 * b * u * u * v + u * u * u;
    };
    for (i = 0; i <= N; i++) {
      t = i / N;
      xs.push(bez(x1, x2, t));
      ys.push(bez(y1, y2, t));
    }
    return function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      var lo = 0, hi = N, mid;
      while (lo < hi) {
        mid = (lo + hi) >> 1;
        if (xs[mid] < p) lo = mid + 1; else hi = mid;
      }
      var k = Math.max(1, lo), span = (xs[k] - xs[k - 1]) || 1;
      return ys[k - 1] + (ys[k] - ys[k - 1]) * ((p - xs[k - 1]) / span);
    };
  }
  /* 内容进入的曲线：STRCAT 的 panelOut 原本 y1 取 1.18，会越过终点约 2.9px 再回来。
     但这里面板宽度只有 0.3s、内容通道 0.4s —— 外框先停住，内容还在横向过冲，
     那一瞬看起来就是「内部错位一下又弹回」。y1 收到 1.0 后只逼近不过越，
     前段那股冲劲还在，收尾不再相对面板滑一下 */
  var PANEL_OUT = cubicEase(0.22, 1, 0.36, 1);

  /* 形变拆两轴：两轴同值即等比过冲（STRCAT 歌单菜单是 x 0.3 / y 0.75 从挤压态撑开，
     这里起点为 1，方向反过来 —— 先胀开再收）。想让胀开偏横向就把两值拉开 */
  var PEAK_X   = 1.02;    // 横向拉伸极值：1 → 1.02 → 1
  var PEAK_Y   = 1.02;    // 纵向拉伸极值：与 x 同值，等比胀开
  var UP_DUR   = 0.25;    // 撑到两轴极值
  var BACK_DUR = 0.75;    // 弹性收回 1，STRCAT 的 OPEN_SQUASH_DUR 是同量级（0.9）
  var OPEN_DUR = 0.4;     // 内容进入（STRCAT 的 OPEN_DUR）
  var SH_BASE  = '16px';  // 投影柔光半径常态（栏体 / 账号 / 齿轮；模型胶囊的常态是 0）
  var SH_MAX   = '32px';  // 撑开时的柔光半径：翻一倍，浮起感靠这一下
  var SH_A_BASE = 0.1;    // 投影透明度常态（同上；模型面板那支取 0）
  var SH_A_MAX  = 0.2;    // 撑开时的透明度：常态 +0.1，阴影同时变宽变实
  var COMPACT  = window.matchMedia('(max-width: 640px)');
  /* 模型面板那一枚不跟全站这套走：它从输入条里长出来，旁边就是正在输入的
     文字，形变过冲一大，面板里的字会跟着 scale 一起抖 —— 字体在非整数缩放
     上每帧重采样，边缘先发毛再回正，读起来就是「抖」。这枚只留 1.008 的
     过冲、收回也压短，形变幅度小到字看着是稳稳挪过去的 */
  var MODEL_POP = { up: 0.18, back: 0.42, peak: 1.008, compact: 1.004 };
  /* 弹出后的指针冷却：CSS 的 width / height / border-radius 过渡是 --dur（.34s），
     这段时间里整块面板退出命中测试（规则在 base.css 的 .is-entering），
     等形状长定了再把指针交回来。模型面板的过渡压到 .24s（--model-dur），
     冷却同步收到 260ms —— 太晚会显得点开之后一会儿才「醒」 */
  var ENTER_LOCK = 360;
  var MODEL_LOCK = 260;

  /* 小屏的栏体贴底满宽（100vw - 24），幅度减半，两轴同步收窄 */
  function peakX(isModel) {
    if (isModel) return COMPACT.matches ? MODEL_POP.compact : MODEL_POP.peak;
    return COMPACT.matches ? 1.01 : PEAK_X;
  }
  function peakY(isModel) {
    if (isModel) return COMPACT.matches ? MODEL_POP.compact : MODEL_POP.peak;
    return COMPACT.matches ? 1.01 : PEAK_Y;
  }

  /* 只在栏体上补内容通道：账号面板的名字与菜单本来就有 CSS 位移 / 淡入，
     再叠一层会打架 */
  function contentOf(node) {
    return node.classList.contains('rail') ? node.querySelector('.rail__panel') : null;
  }
  /* 投影挂在表面层上（栏体的 .rail__surface / 账号的 .user__surface），
     不是被 scale 的那层，所以阴影跟着形变走、但模糊半径的补间不会和 scale 抢属性。
     视角条没有独立底片了 —— 它现在是顶栏托盘 .group 里的一格，
     投影与底片都由托盘给，所以这里对它取不到表面，只补形变那一路 */
  function surfaceOf(node) {
    return node.querySelector('.rail__surface, .user__surface, .chat-dock__surface, .composer__model-surface');
  }

  /* 模型胶囊点开后，那行「当前模型」要从胶囊里长成面板底行：trigger 的宽度是
     瞬切到面板宽的（auto 到定值没法过渡），可字得跟着面板左缘一起过去。
     所以按 FLIP 补一段 —— 新位置由布局直接给出，旧位置从外层那一格推：
     胶囊态字从内边距 12 起排、纵向居中于 32 高的胶囊，「高」贴右内边距 12。
     位移写进 transform，label 的 hover 位移走的是 translate 属性，两个属性
     各自独立、不会互相覆盖。曲线取面板宽高同一条 --ease / --dur，字的左缘
     就始终贴着面板内边距 16，看上去是面板把字带过去的，不是字先跳一下。
     收回同一个函数：旧位置改从底板量（左缘 + 16、底边 - 24），文字先停在
     展开时的位置，再随收缩滑回胶囊里 */
  var MODEL_DUR = 0.24;                            /* 与 css 的 --model-dur 一致 */
  var MODEL_EASE = cubicEase(0.22, 0.61, 0.36, 1);  /* 与 --ease 同一条曲线 */

  function glide(node, opening) {
    if (!node.classList.contains('composer__model')) return;
    var pieces = node.querySelectorAll('.composer__model-label, .composer__model-effort');
    if (!pieces.length) return;
    var surf = node.querySelector('.composer__model-surface');
    var box = node.getBoundingClientRect();
    var sr = surf ? surf.getBoundingClientRect() : box;
    Array.prototype.forEach.call(pieces, function (el) {
      if (el.hidden || !el.offsetWidth) return;
      gsap.killTweensOf(el);
      /* 上一次没走完的那段先撤掉，量到的才是布局位置 */
      gsap.set(el, { clearProps: 'transform' });
      var r = el.getBoundingClientRect();
      var isLabel = el.classList.contains('composer__model-label');
      var fromX, fromY;
      if (opening) {
        fromX = isLabel ? box.left + 12 : box.right - 12;
        fromY = box.top + box.height / 2;
      } else {
        fromX = isLabel ? sr.left + 16 : sr.right - 16;
        fromY = sr.bottom - 24;
      }
      var dx = fromX - (isLabel ? r.left : r.right);
      var dy = fromY - (r.top + r.height / 2);
      if (!dx && !dy) return;
      gsap.fromTo(el, { x: dx, y: dy }, {
        x: 0, y: 0, duration: MODEL_DUR, ease: MODEL_EASE, overwrite: true,
        onComplete: function () { gsap.set(el, { clearProps: 'transform' }); }
      });
    });
  }

  function pop(node, on) {
    if (!node) return;
    if (node.__popTl) { node.__popTl.kill(); node.__popTl = null; }
    /* 只收掉形变那两条：栏体的移入移出（--hide-*）是另一条补间，
       由 railMotion 单独接管，连坐杀掉它就会卡在半路 */
    gsap.killTweensOf(node, '--sx,--sy');
    var el = contentOf(node);
    if (el) gsap.killTweensOf(el);
    var surf = surfaceOf(node);
    if (surf) gsap.killTweensOf(surf);
    var tl = gsap.timeline();
    node.__popTl = tl;

    /* 模型面板用自己那组更轻的参数：过冲小、尾巴短，
       旁边的输入框与文字不会被一块缩放带着抖 */
    var isModel = node.classList.contains('composer__model');
    var upDur = isModel ? MODEL_POP.up : UP_DUR;
    var backDur = isModel ? MODEL_POP.back : BACK_DUR;
    /* 弹性曲线：模型面板把第二个参数（周期）调大，振荡次数跟着少 ——
       1.02 → 1 的那几下回摆是文字「抖」的主要来源 */
    var backEase = isModel ? 'elastic.out(1.1, 1.1)' : 'elastic.out(1.1, 0.8)';
    /* 阴影的常态：栏体、账号胶囊、齿轮留着 16/.10 那层柔光；模型胶囊收起时
       一律回 0 —— 它贴在输入条上，那圈柔光会让白胶囊在灰底上浮成另一层。
       展开时只往 32/.20 长，不再落回常态（面板真的浮起来了，阴影就该在） */
    var shBase = isModel ? '0px' : SH_BASE;
    var shABase = isModel ? 0 : SH_A_BASE;

    /* 开合期间挂个标记：卡片的 3D 磁吸在父级还在 scale 回弹时叠加透视，
       缩放与透视两层变换每帧各自重投影，字和描边会抖。这 1.1s 里让卡片
       的磁吸目标保持 0，等 --sx/--sy 彻底回弹到 1 之后才允许吸 */
    node.classList.add('is-popping');
    clearTimeout(node.__popOff);
    node.__popOff = setTimeout(function () {
      node.classList.remove('is-popping');
    }, on ? (upDur + backDur) * 1000 + 80 : 320);

    /* 弹出途中不接受 hover：展开时挂 is-entering，形状长完（--dur）再摘。
       鼠标点开面板时本来就压在原位上，不挡住的话这一下会同时点亮底片、
       把文字推出去，和形变抢注意力；收回时立刻摘掉，则不会有上一次的
       定时器留到下次展开 */
    if (on) {
      node.classList.add('is-entering');
      clearTimeout(node.__enterOff);
      node.__enterOff = setTimeout(function () {
        node.classList.remove('is-entering');
      }, isModel ? MODEL_LOCK : ENTER_LOCK);
    } else {
      clearTimeout(node.__enterOff);
      node.classList.remove('is-entering');
    }

    /* 模型面板底行那一串字：不论开还是收，都从上一处位置滑到新的一处 */
    glide(node, on);

    if (on) {
      /* 形变与内容同时起步，各走各的曲线；内容只淡入，不改变排版位置。 */
      tl.to(node, { '--sx': peakX(isModel), '--sy': peakY(isModel), duration: upDur, ease: 'power2.out' }, 0)
        .to(node, { '--sx': 1, '--sy': 1, duration: backDur, ease: backEase }, upDur);
      /* 阴影同步：柔光 16 → 32、透明度 .10 → .20 与形变同拍撑开，回弹用同一条弹性曲线收回，
         两块一起鼓、一起落，浮起感才是一体的。
         模型面板只走前半程：涨到 32/.20 就停在那里，不再弹回常态 —— 它的常态是 0 */
      if (surf) {
        tl.to(surf, { '--sh': SH_MAX, '--sh-a': SH_A_MAX, duration: upDur, ease: 'power2.out' }, 0);
        if (!isModel) {
          tl.to(surf, { '--sh': SH_BASE, '--sh-a': SH_A_BASE, duration: backDur, ease: backEase }, upDur);
        }
      }
      if (el) {
        tl.fromTo(el, { opacity: 0 }, {
          opacity: 1, duration: OPEN_DUR, ease: PANEL_OUT, immediateRender: true,
        }, 0);
      }
    } else {
      /* 收回：形变先归 1（打断展开时不硬切），内容保持原位淡出。 */
      var backIn = isModel ? 0.16 : 0.2;
      tl.to(node, { '--sx': 1, '--sy': 1, duration: backIn, ease: 'power2.out' }, 0);
      if (surf) tl.to(surf, { '--sh': shBase, '--sh-a': shABase, duration: backIn, ease: 'power2.out' }, 0);
      if (el) tl.to(el, { opacity: 0, duration: 0.25, ease: 'power2.in' }, 0);
    }
  }

  /* ---- 栏体移入 / 移出 ----
     位移与缩量各占一条通道（--hide-d / --hide-s），都由这里用同一条弹性曲线补间：
     出去冲过一点再贴回屏外，回来的过冲让栏体先撞进一点点再落定。
     CSS 里 is-hidden 那组变量只是兜底，补间一旦跑过，内联值就压住它 */
  var HIDE_S    = 0.95;                    /* 移出后的整体缩量 */
  var HIDE_DUR  = 0.6;                     /* 比开合的 .34 慢一点，弹性尾巴才看得见 */
  var HIDE_EASE = 'elastic.out(1.0, 0.8)'; /* 第一个是过冲幅度，第二个是周期：越大振荡越少 */
  var calmMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* 要推多远才刚好整块出屏：按「缩放后的外沿贴住视口边界」算，不留余量。
     用 offsetLeft / offsetWidth 是因为它们是布局值，不受当前 scale 影响，
     展开到 320 也照样准（写死的 --rail-hide 只对应收起态）。
     shrink 是 CSS 里那项中心补偿 (1 - s) × 50% × w，这里要把它抵掉，
     否则位移会多走半宽的一成，栏体退得比屏幕还远 */
  function hideOffset(rail) {
    var l = rail.offsetLeft, w = rail.offsetWidth;
    var shrink = (1 - HIDE_S) * w * 0.5;
    if (rail.classList.contains('rail--right')) {
      /* 右栏原点在右沿，缩放后左沿收进 (1 - s) × w，推到左沿贴住视口右边界 */
      return window.innerWidth - l - w * (1 - HIDE_S) + shrink;
    }
    /* 左栏原点在左沿，缩放后右沿收进 s × w，推到右沿贴住视口左边界 */
    return -(l + w * HIDE_S) - shrink;
  }

  /* 移入移出：位移与缩量各占一条通道，都由这里用同一条弹性曲线补间。
     打断也要接得住 —— 先按当前计算值压实内联，再切 is-hidden，
     否则类里的终值会先跳到位，补间等于从一个已经到位的值起步 */
  window.railMotion = function (rail, hide) {
    var dx = hideOffset(rail);
    var cs = window.getComputedStyle(rail);
    var curS = parseFloat(cs.getPropertyValue('--hide-s'));
    var curD = parseFloat(cs.getPropertyValue('--hide-d'));
    gsap.set(rail, {
      '--hide-s': isNaN(curS) ? 1 : curS,
      '--hide-d': (isNaN(curD) ? 0 : curD) + 'px'
    });
    /* 先把内联值压实再切类：类里的终值不会抢先跳一下 */
    rail.classList.toggle('is-hidden', hide);
    gsap.to(rail, {
      '--hide-s': hide ? HIDE_S : 1,
      '--hide-d': (hide ? dx : 0) + 'px',
      duration: calmMotion.matches ? 0 : HIDE_DUR,
      ease: HIDE_EASE,
      /* auto 只覆盖重叠的属性：开合那条 --sx/--sy 的弹性补间不能被连坐杀掉 */
      overwrite: 'auto'
    });
  };

  /* .chat-dock 是聊天页右上角那枚齿轮：收起是正圆、点开长成面板；
     .composer__model 是输入条右侧的模型胶囊，点开同样从胶囊长成面板。
     两枚都走这条胀开曲线，所以一并收进来 —— 原点各自由 css 的
     transform-origin 定（齿轮是右上、模型胶囊是右下，面板都朝远离角的方向长） */
  var nodes = Array.prototype.slice.call(
    document.querySelectorAll('.rail, .user, .viewdock, .chat-dock, .composer__model'));
  nodes.forEach(function (n) { n.__open = n.classList.contains('is-open'); });

  new MutationObserver(function (records) {
    records.forEach(function (r) {
      var node = r.target;
      if (node.__open === undefined) return;
      var on = node.classList.contains('is-open');
      if (on === node.__open) return;          // 只是 is-hidden 之类在变，不动画
      node.__open = on;
      pop(node, on);
    });
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
})();
