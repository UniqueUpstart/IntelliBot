/* 右栏指令的自定义卡片：从现成的积木里编一段流程，存下来，点一下就在模型上跑。

   积木只有四类，够拼出 Scratch 最基本的那种叙事：
     动作 —— 复用左右栏已有的动作库，名字与时长都从动作表里读；
     表情 —— 复用 faces.js 的那十六张脸，走 robot3d.setMood；
     等待 x 秒；
     循环 x 次 —— 肚子里还能再放积木，最多两层。
   最上面那块「开始」是帽子，不可删也不参与执行：脚本从它下面那一行起跑。

   编辑器是点调色板追加，不是拖拽：一块块往栈里接，落点永远只有一处，
   不必在 500 宽的编辑页里追一条跟手的虚线。选中哪块，新块就接在它后面；
   选中的是循环，新块进它肚子里 —— 这正是 Scratch 里把积木塞进循环嘴里的那一下。

   执行是一条 async 链：动作等它自己的时长走完（读 getGestureInfo 的 duration），
   等待直接挂定时器，循环把肚子里那一段再跑 n 遍。每次新的触发都会掐掉上一条链
   （token 失效 + 把 sleep 提前唤醒 + stopGesture），所以连点两张卡不会叠在一起。

   存储仍是 primebotx:cards 这一个键：老记录（只有 type / name / brief）照样读得进来，
   补一个 id、blocks 当空数组。账号状态同步那边按整串取，不用改。 */
(function () {
  'use strict';

  var STORE = 'primebotx:cards';
  var MAX_RECORDS = 40;
  var MAX_BLOCKS = 40;
  var MAX_NEST = 2;          /* 循环最多套两层：再往里收，一行积木就只剩标签了 */
  var MAX_REPEAT = 20;
  var MIN_WAIT = 0.1;
  var MAX_WAIT = 30;
  var MAX_OPS = 1200;        /* 循环套循环时兜底：跑这么多步就当它卡住了 */
  var MOTION_FALLBACK = 3.4; /* 读不到时长时按这个估，和右栏那张卡的默认值一致 */

  /* 表情的中英名。faces.js 的 MOODS 只带英文 label，是个模块、拿不到；
     这里按 id 留一份对照，顺序无关，查不到就退回 id */
  var MOODS = [
    ['calm', '平静', 'Calm'],
    ['happy', '开心', 'Happy'],
    ['curious', '好奇', 'Curious'],
    ['wink', '眨眼', 'Wink'],
    ['focus', '专注', 'Focus'],
    ['alert', '警觉', 'Alert'],
    ['think', '思考', 'Think'],
    ['sleep', '睡意', 'Sleep'],
    ['angry', '生气', 'Angry'],
    ['sad', '难过', 'Sad'],
    ['scared', '害怕', 'Scared'],
    ['suspicious', '怀疑', 'Suspicious'],
    ['confused', '困惑', 'Confused'],
    ['proud', '得意', 'Proud'],
    ['shy', '害羞', 'Shy'],
    ['bored', '无聊', 'Bored'],
  ];

  var tpl = document.getElementById('sc-card');
  var edit = document.querySelector('[data-edit-only]');
  if (!tpl || !edit) return;

  var stack = edit.querySelector('[data-prog-stack]');
  var progMeta = edit.querySelector('[data-prog-meta]');
  var nameIn = edit.querySelector('[data-edit-name]');
  var briefIn = edit.querySelector('[data-edit-brief]');
  var promptIn = edit.querySelector('[data-edit-prompt]');
  var submit = edit.querySelector('[data-edit-add]');
  var reset = edit.querySelector('[data-edit-reset]');
  var typeBtns = Array.prototype.slice.call(edit.querySelectorAll('[data-edit-type]'));
  var submitLabel = submit ? submit.querySelector('.edit__label') : null;
  /* 这枚标签的字由 render 说了算（编到一半要变成「保存」），
     交回 i18n 之后切语言会被整段刷回 Add，先摘掉那个钩子 */
  if (submitLabel) submitLabel.removeAttribute('data-i18n');

  /* —— 语言 —— */

  function zh() {
    return (document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0;
  }

  function tr(key, fallback) {
    var value = typeof window.t === 'function' ? window.t(key) : '';
    return value && value !== key ? value : fallback;
  }

  function fmt(seconds) {
    return seconds >= 10 ? String(Math.round(seconds)) : String(Math.round(seconds * 10) / 10);
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /* —— 数据 —— */

  var records = [];
  var seq = 0;

  function newId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function clamp(value, lo, hi) {
    var n = Number(value);
    if (!isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function sanitizeBlocks(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (b) {
      if (!b || typeof b !== 'object') return;
      if (b.k === 'motion' && typeof b.id === 'string' && b.id) {
        out.push({k: 'motion', id: b.id});
      } else if (b.k === 'mood' && typeof b.id === 'string' && b.id) {
        out.push({k: 'mood', id: b.id});
      } else if (b.k === 'wait') {
        out.push({k: 'wait', s: Math.round(clamp(b.s, MIN_WAIT, MAX_WAIT) * 10) / 10});
      } else if (b.k === 'repeat') {
        out.push({
          k: 'repeat',
          n: Math.round(clamp(b.n, 1, MAX_REPEAT)),
          body: sanitizeBlocks(b.body),
        });
      }
    });
    return out.slice(0, MAX_BLOCKS);
  }

  function normalize(raw) {
    var type = raw.type === 'dialog' ? 'dialog' : 'action';
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
      type: type,
      name: String(raw.name).slice(0, 24),
      brief: typeof raw.brief === 'string' ? raw.brief.slice(0, 40) : '',
      prompt: typeof raw.prompt === 'string' ? raw.prompt.slice(0, 240) : '',
      blocks: type === 'action' ? sanitizeBlocks(raw.blocks) : [],
    };
  }

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (e) { raw = []; }
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (r) {
      return r && typeof r === 'object' && (r.type === 'action' || r.type === 'dialog') &&
        typeof r.name === 'string' && r.name.trim();
    }).map(normalize).slice(0, MAX_RECORDS);
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(records)); } catch (e) {}
  }

  function byId(id) {
    for (var i = 0; i < records.length; i += 1) {
      if (records[i].id === id) return records[i];
    }
    return null;
  }

  function cloneBlocks(list) {
    return JSON.parse(JSON.stringify(list)).map(function tag(block) {
      block.uid = 'b' + (++seq);
      if (block.k === 'repeat') block.body.forEach(tag);
      return block;
    });
  }

  function countBlocks(list) {
    return list.reduce(function (n, b) {
      return n + 1 + (b.k === 'repeat' ? countBlocks(b.body) : 0);
    }, 0);
  }

  /* —— 动作与表情的候选 —— */

  var motionCache = null;

  function motionList() {
    var out = [];
    var seen = Object.create(null);
    function push(id, label, dur) {
      if (!id || seen[id]) return;
      seen[id] = 1;
      out.push({id: id, label: label || id, dur: Number(dur) || 0});
    }
    /* 模型就绪后动作表最全（还带时长）；没就绪就先读页面上的卡 ——
       手势页和 Action 组的卡在模块加载时就填好了名字，早于模型 */
    var api = window.robot3d;
    if (api && typeof api.getMotionCatalog === 'function') {
      try {
        api.getMotionCatalog().forEach(function (m) { push(m.id, m.label, m.duration); });
      } catch (e) {}
    }
    document.querySelectorAll(
      '[data-rail-view="shortcuts"] .sc[data-motion], [data-rail-view="shortcuts"] .sc[data-action-motion]'
    ).forEach(function (card) {
      var id = card.dataset.motion || card.dataset.actionMotion;
      var brief = card.querySelector('.sc__brief');
      var time = card.querySelector('.sc__time');
      push(id, brief ? brief.textContent.trim() : id, time ? parseFloat(time.textContent) : 0);
    });
    document.querySelectorAll('[data-rail-grid="gestures"] [data-motion]').forEach(function (card) {
      var label = card.querySelector('.motion__label');
      push(card.dataset.motion, label ? label.textContent.trim() : card.dataset.motion, 0);
    });
    motionCache = out;
    return out;
  }

  function motions() {
    return motionCache || motionList();
  }

  function motionDuration(id) {
    var api = window.robot3d;
    if (api && typeof api.getGestureInfo === 'function') {
      try {
        var info = api.getGestureInfo(id);
        if (info && info.duration) return info.duration;
      } catch (e) {}
    }
    for (var i = 0; i < motions().length; i += 1) {
      if (motions()[i].id === id && motions()[i].dur) return motions()[i].dur;
    }
    return 0;
  }

  function moodLabel(id) {
    var index = zh() ? 1 : 2;
    for (var i = 0; i < MOODS.length; i += 1) {
      if (MOODS[i][0] === id) return MOODS[i][index];
    }
    return id;
  }

  function estimate(list) {
    var total = 0;
    list.forEach(function (b) {
      if (b.k === 'motion') total += (motionDuration(b.id) || MOTION_FALLBACK) + 0.24;
      else if (b.k === 'mood') total += 0.18;
      else if (b.k === 'wait') total += b.s;
      else if (b.k === 'repeat') total += Math.max(1, b.n) * estimate(b.body);
    });
    return total;
  }

  /* —— 卡片 —— */

  function gridOf(type) {
    var group = document.querySelector('[data-rail-view="shortcuts"] .sc-group--' + type);
    return group ? group.querySelector('.sc-grid') : null;
  }

  function cardOf(id) {
    return document.querySelector('[data-rail-view="shortcuts"] .sc[data-program="' + id + '"]');
  }

  function renumber(grid) {
    if (!grid) return;
    Array.prototype.forEach.call(grid.children, function (card, i) {
      var id = card.querySelector('.sc__id');
      if (id) id.textContent = pad2(i + 1);
    });
  }

  function fill(card, rec) {
    if (!card) return;
    card.querySelector('.sc__brief').textContent = rec.name;
    card.querySelector('.sc__intro').textContent = rec.brief || '';
    var time = card.querySelector('.sc__time');
    var n = rec.type === 'action' ? countBlocks(rec.blocks) : 0;
    if (rec.type === 'action') {
      time.hidden = !n;
      time.textContent = n
        ? tr('rail.left.card.program', '{n} 块 · ≈{s}s')
          .replace('{n}', String(n)).replace('{s}', fmt(estimate(rec.blocks)))
        : '';
    } else {
      time.hidden = false;
      time.textContent = tr('rail.left.card.ask', '点一下直接提问');
    }
    card.setAttribute('aria-label', rec.name);
    var editBtn = card.querySelector('[data-sc-tool="edit"]');
    var delBtn = card.querySelector('[data-sc-tool="delete"]');
    if (editBtn) {
      editBtn.setAttribute('aria-label', tr('rail.left.tool.edit', '重编'));
      editBtn.setAttribute('title', tr('rail.left.tool.edit', '重编'));
    }
    if (delBtn && !delBtn.classList.contains('is-armed')) {
      delBtn.setAttribute('aria-label', tr('rail.left.tool.delete', '删除'));
      delBtn.setAttribute('title', tr('rail.left.tool.delete', '删除'));
    }
  }

  function buildCard(rec) {
    var card = tpl.content.firstElementChild.cloneNode(true);
    card.dataset.program = rec.id;
    /* 拖到机器人身上时，接卡仪式要一个动作来演；取流程里的第一个动作。
       没有动作的流程（纯等待 / 纯表情）就空着，仪式照样走 */
    var lead = firstMotion(rec.blocks);
    if (rec.type === 'action' && lead) card.dataset.ritualMotion = lead;

    fill(card, rec);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    card.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('.sc__tool')) return;
      play(rec);
    });
    card.addEventListener('keydown', function (event) {
      if (event.target !== card) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      play(rec);
    });

    var editBtn = card.querySelector('[data-sc-tool="edit"]');
    if (editBtn) {
      editBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        startEdit(rec);
      });
    }
    var delBtn = card.querySelector('[data-sc-tool="delete"]');
    if (delBtn) {
      /* 删一张编了半天的卡不该只值一次误触：第一下只是「上膛」，
         2.4 秒内再点一下才真删，期间钮变成警示色 */
      delBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        if (!delBtn.classList.contains('is-armed')) {
          delBtn.classList.add('is-armed');
          delBtn.setAttribute('aria-label', tr('rail.left.tool.confirm', '再点一次删除'));
          delBtn.setAttribute('title', tr('rail.left.tool.confirm', '再点一次删除'));
          clearTimeout(delBtn.__armTimer);
          delBtn.__armTimer = setTimeout(function () {
            delBtn.classList.remove('is-armed');
            fill(card, rec);
          }, 2400);
          return;
        }
        clearTimeout(delBtn.__armTimer);
        removeRecord(rec, card);
      });
    }
    return card;
  }

  function firstMotion(list) {
    var found = '';
    (list || []).some(function (b) {
      if (b.k === 'motion') { found = b.id; return true; }
      if (b.k === 'repeat') { found = firstMotion(b.body); return !!found; }
      return false;
    });
    return found;
  }

  function removeRecord(rec, card) {
    records = records.filter(function (r) { return r.id !== rec.id; });
    save();
    var grid = card.parentElement;
    card.remove();
    renumber(grid);
    if (window.magnetRescan) window.magnetRescan();
    if (editingId() === rec.id) resetForm();
  }

  function reveal(card) {
    var rail = document.getElementById('rail-tools');
    if (!rail || !card) return;
    var item = rail.querySelector('.item[data-panel="Shortcuts"]');
    var body = rail.querySelector('[data-panel-body]');
    if (!item || !body) return;
    if (!rail.classList.contains('is-open') || body.dataset.view !== 'shortcuts') item.click();
    requestAnimationFrame(function () {
      if (card.scrollIntoView) card.scrollIntoView({block: 'nearest'});
    });
  }

  /* —— 执行 —— */

  var current = null;   /* 正在跑的那条链 {cancelled, wake, card} */

  function sleep(ms, ctx) {
    if (ctx.cancelled) return Promise.resolve();
    return new Promise(function (resolve) {
      var timer = setTimeout(done, Math.max(0, ms));
      function done() {
        clearTimeout(timer);
        if (ctx.wake === done) ctx.wake = null;
        resolve();
      }
      ctx.wake = done;
    });
  }

  function runBlock(block, ctx) {
    var api = window.robot3d;
    if (!api) return Promise.resolve();
    if (block.k === 'motion') {
      var ms = (motionDuration(block.id) || MOTION_FALLBACK) * 1000 + 240;
      try { api.playGesture(block.id); } catch (e) {}
      return sleep(ms, ctx);
    }
    if (block.k === 'mood') {
      if (typeof api.setMood === 'function') api.setMood(block.id);
      return sleep(180, ctx);
    }
    if (block.k === 'wait') return sleep(block.s * 1000, ctx);
    if (block.k === 'repeat') {
      var times = Math.max(1, Math.min(MAX_REPEAT, block.n | 0));
      var round = 0;
      function once() {
        if (ctx.cancelled || round >= times) return Promise.resolve();
        round += 1;
        return runList(block.body, ctx).then(once);
      }
      return once();
    }
    return Promise.resolve();
  }

  function runList(list, ctx) {
    return list.reduce(function (chain, block) {
      return chain.then(function () {
        if (ctx.cancelled) return null;
        ctx.ops += 1;
        if (ctx.ops > MAX_OPS) { ctx.cancelled = true; return null; }
        return runBlock(block, ctx);
      });
    }, Promise.resolve());
  }

  function whenRobot() {
    var api = window.robot3d;
    if (api && api.ready) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        window.removeEventListener('robot-ready', onReady);
        resolve(ok);
      }
      function onReady() { finish(true); }
      window.addEventListener('robot-ready', onReady);
      /* 模型 6.4MB，理论上一两秒就位；十几秒还没就位就别挂着了 */
      setTimeout(function () { finish(!!(window.robot3d && window.robot3d.ready)); }, 12000);
    });
  }

  function stopRun() {
    if (!current) return;
    var ctx = current;
    current = null;
    ctx.cancelled = true;
    if (ctx.wake) ctx.wake();
    if (ctx.card) ctx.card.classList.remove('is-on');
    var api = window.robot3d;
    if (api && typeof api.stopGesture === 'function') {
      try { api.stopGesture(); } catch (e) {}
    }
  }

  function play(rec, options) {
    if (rec.type === 'dialog') { ask(rec); return; }
    if (!rec.blocks || !rec.blocks.length) return;
    stopRun();

    var ctx = {cancelled: false, wake: null, ops: 0, card: cardOf(rec.id)};
    current = ctx;
    if (ctx.card) ctx.card.classList.add('is-on');

    /* 任何一块抛错都不该把卡片钉在点亮状态：链尾统一清场 */
    whenRobot().then(function (ready) {
      if (!ready || ctx.cancelled) return null;
      /* 从机器人手里接住的那张卡：仪式本身已经把它第一个动作演完了，
         这里跳过开头那个动作，别紧接着再摆一遍 */
      var list = options && options.skipLead && rec.blocks[0].k === 'motion'
        ? rec.blocks.slice(1)
        : rec.blocks;
      return runList(list, ctx);
    }).catch(function () {
      ctx.cancelled = true;
    }).then(function () {
      if (current === ctx) current = null;
      if (ctx.card) ctx.card.classList.remove('is-on');
    });
  }

  function ask(rec) {
    var text = (rec.prompt || rec.name || '').trim();
    var chat = window.primebotxChat;
    if (text && chat && typeof chat.send === 'function') chat.send(text);
    var card = cardOf(rec.id);
    if (!card) return;
    card.classList.add('is-on');
    clearTimeout(card.__askTimer);
    card.__askTimer = setTimeout(function () { card.classList.remove('is-on'); }, 900);
  }

  /* —— 编辑器 —— */

  var draft = newDraft();

  function newDraft() {
    return {kind: 'action', blocks: [], sel: null, prompt: '', editing: null};
  }

  function editingId() { return draft.editing; }

  function makeBlock(kind) {
    if (kind === 'motion') {
      var list = motions();
      return {k: 'motion', id: list.length ? list[0].id : 'dance'};
    }
    if (kind === 'mood') return {k: 'mood', id: 'happy'};
    if (kind === 'wait') return {k: 'wait', s: 1};
    return {k: 'repeat', n: 2, body: []};
  }

  /* 找一块积木、它所在的数组、以及它在数组里的位置与嵌套深度 */
  function find(list, uid, depth) {
    for (var i = 0; i < list.length; i += 1) {
      var block = list[i];
      if (block.uid === uid) return {block: block, list: list, index: i, depth: depth};
      if (block.k === 'repeat') {
        var hit = find(block.body, uid, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  }

  /* 新块落在哪：没选中就接在根列表末尾；选中普通块就接在它后面；
     选中循环就进它肚子里 —— 循环已经套了两层则不再往里塞 */
  function target() {
    if (draft.sel) {
      var hit = find(draft.blocks, draft.sel, 0);
      if (hit) {
        if (hit.block.k === 'repeat' && hit.depth < MAX_NEST) {
          return {list: hit.block.body, index: hit.block.body.length, depth: hit.depth + 1};
        }
        return {list: hit.list, index: hit.index + 1, depth: hit.depth};
      }
    }
    return {list: draft.blocks, index: draft.blocks.length, depth: 0};
  }

  function addBlock(kind) {
    if (countBlocks(draft.blocks) >= MAX_BLOCKS) {
      warn(tr('rail.left.prog.full', '最多 40 块，删掉一块再加'));
      return;
    }
    var spot = target();
    /* 循环只认两层：再往里塞，一行积木就只剩标签，缩进也快贴到栏边了。
       普通积木不受这条管，第三层放个等待或表情仍然读得清 */
    if (kind === 'repeat' && spot.depth >= MAX_NEST) {
      warn(tr('rail.left.prog.deep', '循环最多套两层'));
      return;
    }
    var block = makeBlock(kind);
    block.uid = 'b' + (++seq);
    spot.list.splice(spot.index, 0, block);
    draft.sel = block.uid;
    render();
    var node = stack.querySelector('[data-uid="' + block.uid + '"]');
    if (node && node.scrollIntoView) {
      requestAnimationFrame(function () { node.scrollIntoView({block: 'nearest'}); });
    }
  }

  function removeBlock(uid) {
    var hit = find(draft.blocks, uid, 0);
    if (!hit) return;
    hit.list.splice(hit.index, 1);
    if (draft.sel === uid) draft.sel = null;
    render();
  }

  function warn(text) {
    if (!progMeta) return;
    progMeta.textContent = text;
    progMeta.classList.add('is-warn');
    clearTimeout(progMeta.__warnTimer);
    progMeta.__warnTimer = setTimeout(function () {
      progMeta.classList.remove('is-warn');
      renderMeta();
    }, 2200);
  }

  function caret() {
    var line = document.createElement('div');
    line.className = 'prog__caret';
    line.setAttribute('aria-hidden', 'true');
    return line;
  }

  function blockTag(kind) {
    if (kind === 'motion') return tr('rail.left.block.motion', '动作');
    if (kind === 'mood') return tr('rail.left.block.mood', '表情');
    if (kind === 'wait') return tr('rail.left.block.wait', '等待');
    return tr('rail.left.block.repeat', '循环');
  }

  function optionsFor(kind) {
    if (kind === 'mood') {
      var index = zh() ? 1 : 2;
      return MOODS.map(function (m) { return {id: m[0], label: m[index]}; });
    }
    return motions().map(function (m) { return {id: m.id, label: m.label}; });
  }

  function renderBlock(block, depth) {
    var wrap = document.createElement('div');
    wrap.className = 'prog__node';

    var row = document.createElement('div');
    row.className = 'prog__b';
    row.dataset.kind = block.k;
    row.dataset.uid = block.uid;
    row.setAttribute('role', 'listitem');
    row.setAttribute('tabindex', '0');
    if (draft.sel === block.uid) {
      row.classList.add('is-sel');
      row.setAttribute('aria-current', 'true');
    }
    row.setAttribute('aria-label', blockTag(block.k));

    var tag = document.createElement('span');
    tag.className = 'prog__tag';
    tag.textContent = blockTag(block.k);
    row.appendChild(tag);

    if (block.k === 'motion' || block.k === 'mood') {
      var pick = document.createElement('select');
      pick.className = 'prog__pick';
      pick.setAttribute('aria-label', blockTag(block.k));
      var options = optionsFor(block.k);
      var known = false;
      options.forEach(function (option) {
        var node = document.createElement('option');
        node.value = option.id;
        node.textContent = option.label;
        if (option.id === block.id) known = true;
        pick.appendChild(node);
      });
      /* 动作表里暂时没有这一项（旧卡、或模型还没就绪）也得让它看得见，
         否则下拉框会静默跳到第一项，一存就把原值改掉了 */
      if (!known) {
        var fallback = document.createElement('option');
        fallback.value = block.id;
        fallback.textContent = block.k === 'mood' ? moodLabel(block.id) : block.id;
        pick.insertBefore(fallback, pick.firstChild);
      }
      pick.value = block.id;
      row.appendChild(pick);
      /* 动作后面跟一枚时长：调顺序、挑循环体的时候，「哪个动作拖得长」
         比名字更有用。表情不占时间，就不给这枚数 */
      if (block.k === 'motion') {
        var dur = document.createElement('span');
        dur.className = 'prog__dur';
        dur.textContent = fmt(motionDuration(block.id) || MOTION_FALLBACK) + 's';
        pick.addEventListener('change', function () {
          block.id = pick.value;
          dur.textContent = fmt(motionDuration(block.id) || MOTION_FALLBACK) + 's';
          renderMeta();
        });
        row.appendChild(dur);
      } else {
        pick.addEventListener('change', function () {
          block.id = pick.value;
          renderMeta();
        });
      }
    } else {
      var num = document.createElement('input');
      num.className = 'prog__num';
      num.type = 'number';
      num.inputMode = 'decimal';
      if (block.k === 'wait') {
        num.min = String(MIN_WAIT);
        num.max = String(MAX_WAIT);
        num.step = '0.1';
        num.value = String(block.s);
      } else {
        num.min = '1';
        num.max = String(MAX_REPEAT);
        num.step = '1';
        num.value = String(block.n);
      }
      num.setAttribute('aria-label', blockTag(block.k));
      /* 输入过程中不重画整棵栈（会丢焦点），只把值收进对象、更新下面那行统计；
         失焦时再把越界的值夹回去 */
      num.addEventListener('input', function () {
        if (block.k === 'wait') block.s = clamp(num.value, MIN_WAIT, MAX_WAIT);
        else block.n = Math.round(clamp(num.value, 1, MAX_REPEAT));
        renderMeta();
      });
      num.addEventListener('blur', function () {
        num.value = String(block.k === 'wait' ? block.s : block.n);
      });
      row.appendChild(num);

      var unit = document.createElement('span');
      unit.className = 'prog__unit';
      unit.textContent = block.k === 'wait'
        ? tr('rail.left.unit.sec', '秒')
        : tr('rail.left.unit.times', '次');
      row.appendChild(unit);
    }

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'prog__del';
    del.setAttribute('aria-label', tr('rail.left.block.remove', '删除这块'));
    del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M6 6l12 12M18 6 6 18"/></svg>';
    del.addEventListener('click', function (event) {
      event.stopPropagation();
      removeBlock(block.uid);
    });
    row.appendChild(del);

    /* 点块身（不是里面的控件）= 选中它，下一块就从这儿接着长 */
    row.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('select, input, button')) return;
      draft.sel = block.uid;
      render();
    });
    row.addEventListener('focus', function () {
      if (draft.sel === block.uid) return;
      draft.sel = block.uid;
      /* 只挪高亮、不重画：重画会把焦点从这一行上摘掉，键盘就没法接着走 */
      Array.prototype.forEach.call(stack.querySelectorAll('.prog__b.is-sel'), function (node) {
        node.classList.remove('is-sel');
        node.removeAttribute('aria-current');
      });
      row.classList.add('is-sel');
      row.setAttribute('aria-current', 'true');
    });

    wrap.appendChild(row);

    if (block.k === 'repeat') {
      var body = document.createElement('div');
      body.className = 'prog__body';
      wrap.appendChild(body);
      renderList(block.body, body, depth + 1, draft.sel === block.uid);
      if (!block.body.length && draft.sel !== block.uid) {
        var empty = document.createElement('span');
        empty.className = 'prog__void';
        empty.textContent = tr('rail.left.prog.void', '空循环');
        body.appendChild(empty);
      }
    }
    return wrap;
  }

  function renderList(list, host, depth, caretAtEnd) {
    list.forEach(function (block) {
      host.appendChild(renderBlock(block, depth));
      if (draft.sel === block.uid && block.k !== 'repeat') host.appendChild(caret());
    });
    if (caretAtEnd) host.appendChild(caret());
  }

  function renderMeta() {
    if (!progMeta) return;
    progMeta.classList.remove('is-warn');
    /* 重编一张卡时得让人知道现在改的是哪张：提交钮已经变成「保存」，
       这一行再补一句「编辑中」，两处一起说清 */
    var prefix = draft.editing ? tr('rail.left.prog.editing', '编辑中 · ') : '';
    var n = countBlocks(draft.blocks);
    if (!n) {
      progMeta.textContent = prefix + tr('rail.left.prog.hint',
        '点下面的按钮加积木；选中一块，新块接在它后面，选中循环则放进它里面');
      return;
    }
    progMeta.textContent = prefix + tr('rail.left.prog.meta', '{n} 块 · 预计 {s}s')
      .replace('{n}', String(n)).replace('{s}', fmt(estimate(draft.blocks)));
  }

  function render() {
    if (!stack) return;
    edit.dataset.editKind = draft.kind;
    stack.textContent = '';

    var hat = document.createElement('div');
    hat.className = 'prog__hat';
    hat.textContent = tr('rail.left.block.start', '开始');
    stack.appendChild(hat);

    var root = document.createElement('div');
    root.className = 'prog__list';
    root.setAttribute('role', 'list');
    stack.appendChild(root);
    renderList(draft.blocks, root, 0, !draft.sel);

    if (!draft.blocks.length) {
      var empty = document.createElement('p');
      empty.className = 'prog__empty';
      empty.textContent = tr('rail.left.prog.empty', '还没有积木');
      root.appendChild(empty);
    } else {
      /* 选中循环时落点只会在它肚子里转 —— 想往外接一块，得有个明说的出口。
         这一行就是「回到最外层末尾」：点它等于把落点交回根列表末尾 */
      var tail = document.createElement('button');
      tail.type = 'button';
      tail.className = 'prog__tail';
      if (!draft.sel) tail.classList.add('is-on');
      tail.textContent = tr('rail.left.prog.tail', '追加到末尾');
      tail.addEventListener('click', function () {
        if (!draft.sel) return;
        draft.sel = null;
        render();
      });
      stack.appendChild(tail);
    }

    renderMeta();
    if (submitLabel) {
      submitLabel.textContent = draft.editing
        ? tr('rail.left.save', '保存')
        : tr('rail.left.add', 'Add');
    }
  }

  function setKind(kind) {
    draft.kind = kind === 'dialog' ? 'dialog' : 'action';
    typeBtns.forEach(function (btn) {
      var on = btn.dataset.editType === draft.kind;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    edit.dataset.editKind = draft.kind;
    renderMeta();
  }

  function resetForm(focus) {
    draft = newDraft();
    if (nameIn) nameIn.value = '';
    if (briefIn) briefIn.value = '';
    if (promptIn) promptIn.value = '';
    setKind('action');
    render();
    if (focus && nameIn) nameIn.focus();
  }

  function startEdit(rec) {
    stopRun();
    draft = {
      kind: rec.type,
      blocks: rec.type === 'action' ? cloneBlocks(rec.blocks) : [],
      sel: null,
      prompt: rec.prompt || '',
      editing: rec.id,
    };
    if (nameIn) nameIn.value = rec.name;
    if (briefIn) briefIn.value = rec.brief || '';
    if (promptIn) promptIn.value = rec.prompt || '';
    setKind(draft.kind);
    render();
    showEdit();
    var rail = document.getElementById('rail-tools');
    var body = rail && rail.querySelector('[data-panel-body]');
    if (body) body.scrollTop = 0;
  }

  function showEdit() {
    var rail = document.getElementById('rail-tools');
    if (!rail) return;
    var body = rail.querySelector('[data-panel-body]');
    var item = rail.querySelector('.item[data-panel="Edit"]');
    if (!item) return;
    if (!rail.classList.contains('is-open') || (body && body.dataset.view !== 'edit')) item.click();
  }

  function refreshCard(rec) {
    var card = cardOf(rec.id);
    var grid = gridOf(rec.type);
    if (!card || !grid) return;
    var old = card.parentElement;
    var fresh = buildCard(rec);
    card.replaceWith(fresh);
    if (fresh.parentElement !== grid) grid.appendChild(fresh);
    renumber(grid);
    if (old && old !== grid) renumber(old);
    if (window.magnetRescan) window.magnetRescan();
  }

  function commit() {
    if (!nameIn || !briefIn) return;
    var name = nameIn.value.trim();
    if (!name) { nameIn.focus(); return; }
    var brief = briefIn.value.trim();
    var prompt = promptIn ? promptIn.value.trim() : '';

    if (draft.kind === 'action' && !draft.blocks.length) {
      warn(tr('rail.left.prog.need', '至少加一块积木'));
      return;
    }
    if (draft.kind === 'dialog' && !prompt) {
      warn(tr('rail.left.prog.needAsk', '写一句要问的话'));
      if (promptIn) promptIn.focus();
      return;
    }

    var rec = draft.editing ? byId(draft.editing) : null;
    if (rec) {
      rec.name = name;
      rec.brief = brief;
      rec.type = draft.kind;
      rec.blocks = draft.kind === 'action' ? sanitizeBlocks(draft.blocks) : [];
      rec.prompt = draft.kind === 'dialog' ? prompt : '';
      save();
      refreshCard(rec);
      reveal(cardOf(rec.id));
      resetForm(true);
      return;
    }

    if (records.length >= MAX_RECORDS) {
      warn(tr('rail.left.card.full', '最多 40 张卡，先删一张'));
      return;
    }

    rec = {
      id: newId(),
      type: draft.kind,
      name: name,
      brief: brief,
      prompt: draft.kind === 'dialog' ? prompt : '',
      blocks: draft.kind === 'action' ? sanitizeBlocks(draft.blocks) : [],
    };
    var grid = gridOf(rec.type);
    if (!grid) return;
    records.push(rec);
    save();
    var card = buildCard(rec);
    grid.appendChild(card);
    renumber(grid);
    if (window.magnetRescan) window.magnetRescan();
    reveal(card);
    resetForm(true);
  }

  /* —— 绑定 —— */

  typeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setKind(btn.dataset.editType);
      render();
    });
  });

  edit.querySelectorAll('[data-prog-add]').forEach(function (btn) {
    btn.addEventListener('click', function () { addBlock(btn.dataset.progAdd); });
  });

  if (submit) submit.addEventListener('click', commit);
  if (reset) reset.addEventListener('click', function () { resetForm(true); });

  /* 输入框里回车即提交；积木里的数字框回车只失焦，不误发 */
  edit.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.target.tagName !== 'INPUT') return;
    if (event.target.classList.contains('prog__num')) {
      event.preventDefault();
      event.target.blur();
      return;
    }
    event.preventDefault();
    commit();
  });

  document.addEventListener('langchange', function () {
    records.forEach(function (rec) { fill(cardOf(rec.id), rec); });
    render();
  });

  /* 模型就绪后动作表才最全（带真实时长）：重新拉一次候选，
     编辑器开着就重画一次下拉，卡片上那行预计时长也一起刷新 */
  window.addEventListener('robot-ready', function () {
    motionList();
    records.forEach(function (rec) { fill(cardOf(rec.id), rec); });
    if (railView() === 'edit') render();
  });

  function railView() {
    var rail = document.getElementById('rail-tools');
    var body = rail && rail.querySelector('[data-panel-body]');
    return body ? body.dataset.view : '';
  }

  /* 拖到机器人身上、接卡仪式走完：card_pickup 把卡片的 id 传出来。
     对话卡发那句话，动作卡整段流程从头跑（开头那个动作跳过，仪式刚演过） */
  window.addEventListener('primebotx-program-card', function (event) {
    var id = event.detail && event.detail.id;
    var rec = id ? byId(id) : null;
    if (rec) play(rec, {skipLead: true});
  });

  /* Esc 先停下正在跑的流程：右栏那一下会连带把面板收起，两件事不冲突 */
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') stopRun();
  });

  /* 点开 Edit 页时再拉一次动作候选：模型可能刚就绪、缓存还是空的 */
  document.addEventListener('click', function (event) {
    var item = event.target.closest && event.target.closest('.item[data-panel="Edit"]');
    if (!item) return;
    motionList();
    render();
  }, true);

  /* 首屏把存下来的卡片补回 DOM。magnet.js 在这之后才加载，
     它自己会把这些卡收进列表；后面新增的卡用它暴露的 rescan 补收 */
  records = load();
  records.forEach(function (rec) {
    var grid = gridOf(rec.type);
    if (grid) grid.appendChild(buildCard(rec));
  });
  renumber(gridOf('action'));
  renumber(gridOf('dialog'));

  render();
})();
