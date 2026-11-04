(function () {
  'use strict';

  var composer = document.querySelector('.composer');
  if (composer && composer.parentElement !== document.body) {
    document.body.appendChild(composer);
  }
  var panel = document.querySelector('[data-assistant-chat]') ||
    (composer && composer.querySelector('[data-assistant-chat]'));
  if (!composer || !panel) return;
  function findInPanel(selector) {
    return typeof panel.querySelector === 'function'
      ? panel.querySelector(selector)
      : composer.querySelector(selector);
  }
  var log = findInPanel('[data-assistant-log]');
  var input = composer.querySelector('[data-assistant-input]');
  var sendButton = composer.querySelector('[data-assistant-send]');
  /* 面板底部那条输入：与页面底部的主输入条共用下面的 send()，
     各自保留自己的草稿和按钮态。取不到就只是少一条入口 */
  var dockInput = document.querySelector('[data-chat-dock-input]');
  var dockSend = document.querySelector('[data-chat-dock-send]');
  var settingsButton = document.querySelector('[data-chat-settings]');
  var historyMenu = document.querySelector('[data-chat-history-menu]');
  /* 齿轮所在的那块 dock：开合时给它挂 is-open，panels.js 的 pop 与
     CSS 的宽高过渡都认这个类。取不到（老页面 / 单测里的假 DOM）就只切
     hidden，不影响下面任何一条逻辑 */
  var historyDock = document.querySelector('[data-chat-dock]');
  var exportButton = document.querySelector('[data-chat-export]');
  var clearButton = document.querySelector('[data-chat-clear]');
  /* 停止动作那枚按钮挂在聊天视图的头部动作区，是 [data-assistant-chat] 的
     兄弟节点，findInPanel 抓不到；只按面板找会拿到 null，下面的守卫直接把
     整个脚本退掉，快捷胶囊、发送、清空就全没反应。这里补一层文档兜底 */
  var stopButton = findInPanel('[data-assistant-stop]') ||
    document.querySelector('[data-assistant-stop]');
  var suggestions = document.querySelector('[data-chat-suggestions]');
  var historyButton = composer.querySelector('[data-chat-history]');
  var stage = document.querySelector('[data-stage-chat]');
  if (!log || !input || !sendButton || !settingsButton || !historyMenu ||
      !clearButton || !stopButton) return;

  /* 发送钮里那两枚箭头叠在同一个格子上（见 chat.css 尾部的 composer-send-*），
     is-flying 一挂就是一次「发出去」的动画，收尾在 animationend。
     测试里的假按钮没有 querySelector，所以先问一句有没有 */
  var sendIcon = typeof sendButton.querySelector === 'function'
    ? sendButton.querySelector('.composer__send-icon')
    : null;
  var dockIcon = dockSend && typeof dockSend.querySelector === 'function'
    ? dockSend.querySelector('.composer__send-icon')
    : null;
  /* 最后一次把光标落在哪条输入里：发送完要还回同一处，
     顺带决定是哪一枚发送钮做飞箭头的动作 */
  var dockFocus = false;

  var queryApi = new URLSearchParams(location.search).get('api');
  var api = queryApi ? queryApi.replace(/\/+$/, '') : '/api/v1';
  var history = [];
  var records = [];
  var pending = false;
  var sequenceToken = 0;
  var STARTED_KEY = 'intellibot.chat.started';
  /* 清空的二次确认：与账号面板的退出登录同一条时间常量（auth.js 的
     LOGOUT_HOLD 3s）。这段时间里指针进出都不算信号，只有「再点一次」才执行 */
  var CLEAR_HOLD = 3000;
  var clearArmed = false;
  var clearTimer = 0;
  var welcomeShown = false;
  var welcomeMotionPlayed = false;

  function tr(key, fallback) {
    var value = typeof window.t === 'function' ? window.t(key) : '';
    return value && value !== key ? value : fallback;
  }

  function scrollBottom() {
    log.scrollTop = log.scrollHeight;
    requestAnimationFrame(function () { log.scrollTop = log.scrollHeight; });
  }

  /* 舞台只有一条流：问答按顺序落在同一根时间轴上，靠哪边由角色决定。
     行容器负责对齐与透视，气泡挂在行里（见 css/chat.css 的 .stage-chat__row） */
  function stageStream() {
    return stage && stage.querySelector('[data-stage-stream]');
  }

  function decorateBubble(node, role, recordId) {
    if (!node || !node.dataset) return;
    var salt = role === 'user' ? 1 : 0;
    var variant = (Number(recordId || 0) + salt) % 4;
    node.dataset.bubbleVariant = String(variant);
    node.dataset.author = role === 'user' ? tr('chat.you', '你') : 'IntelliBot';
  }

  /* 舞台不再滚动：一屏只留最近三组（一问一答算一组），更早的一条在
     第 7 条落位时缩小淡出，把占位让出来。离场不写 transform ——
     气泡自己还挂着 rotateY 的倾角，覆盖 transform 会把那一帧拍平；
     这里只改三个 CSS 变量，过渡交给样式表 */
  var STAGE_GROUPS = 3;
  var STAGE_LIMIT = STAGE_GROUPS * 2;
  var STAGE_LEAVE_MS = 440;

  function stageLive(stream) {
    var count = 0;
    for (var i = 0; i < stream.children.length; i += 1) {
      if (!stream.children[i].classList.contains('is-leaving')) count += 1;
    }
    return count;
  }

  function stageOldest(stream) {
    for (var i = 0; i < stream.children.length; i += 1) {
      if (!stream.children[i].classList.contains('is-leaving')) return stream.children[i];
    }
    return null;
  }

  function leaveStage(node) {
    if (!node || node.classList.contains('is-leaving')) return;
    /* 先把上限钉在这条气泡的实际高度上：不写的话 max-height 是 none，
       收高度这一路没有起点，压缩会等到淡出结束才「咔」一下塌掉。
       钉住之后再折到 0，压缩才落在看得见的这一段里 */
    node.style.maxHeight = node.offsetHeight + 'px';
    /* 读一次布局，让这个起点先落进样式表，否则两步会被合成一帧 */
    void node.offsetHeight;
    node.classList.add('is-leaving');
    node.setAttribute('aria-hidden', 'true');
    /* 目标值：缩到 0.82、往上飘 8、完全透明。CSS 里那条 transform 把这三个
       变量叠在 rotateY 后面，所以缩小是绕着气泡自己的倾角发生的 */
    node.style.setProperty('--exit-s', '0.82');
    node.style.setProperty('--exit-y', '-8px');
    node.style.setProperty('--exit-o', '0');
    var removed = false;
    var drop = function () {
      if (removed) return;
      removed = true;
      if (bubbleWatcher) bubbleWatcher.unobserve(node);
      node.remove();
    };
    node.addEventListener('transitionend', function (event) {
      if (event.target === node) drop();
    });
    /* 标签页被挂起时过渡不派发 end：这条只是兜底，别让占位一直留着 */
    setTimeout(drop, STAGE_LEAVE_MS + 120);
  }

  function trimStage(stream) {
    var live = stageLive(stream);
    if (live <= STAGE_LIMIT) return;
    /* 一次退一整组：只多出一条时也带走两条，否则裁掉半组、
       留下一开头就是机器人的半截问答，读起来像丢了问题 */
    var drop = Math.ceil((live - STAGE_LIMIT) / 2) * 2;
    for (var i = 0; i < drop; i += 1) {
      var oldest = stageOldest(stream);
      if (!oldest) return;
      leaveStage(oldest);
    }
  }

  /* 相机跟着视口走，不写死：镜头架在屏幕中轴与视口中线上，距离取视口高度的
     1.25 倍（窄屏 0.95 倍，画面更小、透视更近），再换算成相对这一列的百分比
     交给 CSS。列的尺寸一变（断点、旋屏、软键盘）重算一次就够 ——
     气泡自身的位置不用重算，透视原点钉在列上，滚动与增删会让投影自己变化 */
  function syncStagePerspective() {
    var flow = stageStream();
    if (!flow) return;
    var box = flow.getBoundingClientRect();
    if (!box.width || !box.height) return;
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var narrow = vw <= 900;
    flow.style.setProperty('--stage-ox',
      ((vw / 2 - box.left) / box.width * 100).toFixed(2) + '%');
    flow.style.setProperty('--stage-oy',
      ((vh / 2 - box.top) / box.height * 100).toFixed(2) + '%');
    flow.style.setProperty('--stage-d', Math.round(vh * (narrow ? 0.95 : 1.25)) + 'px');
  }

  /* 倾角按气泡自己的宽度算：内缘退进去的深度是 宽 × sinθ，宽气泡把角度收一点，
     免得长句子的内侧退得太狠；窄屏整体放缓。内容回填把气泡撑宽时由
     ResizeObserver 再调一次，所以这一项也随内容大小实时变。
     上限 18°（窄屏 9°）是观感值：再大读起来就像侧着的字幕，太小又退回平板 */
  function syncBubbleTilt(node) {
    if (!node || !node.offsetWidth) return;
    var user = node.classList.contains('stage-chat__bubble--user');
    var narrow = (window.innerWidth || 0) <= 900;
    var limit = narrow ? 9 : 18;
    var tilt = limit - (node.offsetWidth - 200) / 100 * (narrow ? 0.6 : 1.4);
    tilt = Math.max(narrow ? 5 : 9, Math.min(limit, tilt));
    node.style.setProperty('--tilt', (user ? -tilt : tilt).toFixed(2) + 'deg');
  }

  var bubbleWatcher = window.ResizeObserver ? new window.ResizeObserver(function (entries) {
    for (var i = 0; i < entries.length; i += 1) syncBubbleTilt(entries[i].target);
  }) : null;

  /* 舞台只有一列：已有的气泡按 recordId 复用，新的追加到末尾 —— 时间怎么走，
     气泡就怎么往下排（流自己向上滚，最新一条总在底边），问答因此自然错位。
     同一条记录会走两遍 —— 先「正在思考…」再回填正文，所以复用优先于新建 */
  function showStage(role, text, recordId) {
    var stream = stageStream();
    if (!stream) return;
    var key = String(recordId || '');
    var node = key ? stream.querySelector('[data-record-id="' + key + '"]') : null;
    if (!node) {
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'stage-chat__bubble stage-chat__bubble--' + role;
      node.dataset.stageMessage = role;
      node.setAttribute('aria-label', tr('chat.openHistory', '打开完整聊天记录'));
      var label = node.appendChild(document.createElement('span'));
      label.setAttribute('data-stage-text', '');
      decorateBubble(node, role, recordId);
      stream.appendChild(node);
      syncBubbleTilt(node);
      if (bubbleWatcher) bubbleWatcher.observe(node);
      /* 只留最近三组：超出的那条就地缩小淡出，不再靠滚动翻旧账 */
      trimStage(stream);
    }
    var textNode = node.querySelector('[data-stage-text]');
    if (textNode) textNode.textContent = text;
    else node.textContent = text;
    node.dataset.recordId = key;
  }

  function hideStage() {
    var stream = stageStream();
    if (!stream) return;
    if (bubbleWatcher) {
      for (var i = 0; i < stream.children.length; i += 1) {
        bubbleWatcher.unobserve(stream.children[i]);
      }
    }
    stream.replaceChildren();
  }

  /* 待机时的自言自语：往舞台上追一条就够，不做定时清理——
     记录留在同一列滚动流里，由用户自己翻看。
     同一条刚说过就不再说：换成另一种，两种都刚说过就整轮跳过 */
  function stageLastText(role) {
    var stream = stageStream();
    if (!stream) return '';
    var bubbles = stream.querySelectorAll('[data-stage-message="' + role + '"]');
    var last = bubbles.length ? bubbles[bubbles.length - 1] : null;
    return last ? last.textContent.trim() : '';
  }
  function showIdleReaction(kind) {
    if (pending) return;
    var texts = {
      look: tr('idle.look.prompt', '我在看看周围。你想让我做点什么？'),
      settle: tr('idle.settle.prompt', '站久了，活动一下。要不要看个动作？'),
    };
    if (!texts[kind]) kind = 'look';
    var last = stageLastText('assistant');
    if (last && last === texts[kind]) {
      var other = kind === 'look' ? 'settle' : 'look';
      if (last === texts[other]) return;
      kind = other;
    }
    showStage('assistant', texts[kind]);
  }

  /* 悬停时间戳：年.月.日 时:分，两位补零 */
  function stampTime(ms) {
    var d = new Date(ms);
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function addRecord(role, text, modifier) {
    var record = {id: records.length + 1, role: role, content: text, time: Date.now()};
    records.push(record);
    var node = document.createElement('div');
    node.className = 'assistant-chat__message assistant-chat__message--' + role;
    if (modifier) node.classList.add('assistant-chat__message--' + modifier);
    decorateBubble(node, role, record.id);
    node.dataset.recordId = String(record.id);
    node.dataset.time = stampTime(record.time);
    node.textContent = text;
    log.appendChild(node);
    scrollBottom();
    showStage(role === 'ai' ? 'assistant' : role, text, record.id);
    syncHistoryActions();
    return {node: node, record: record};
  }

  function updateRecord(entry, text, modifier) {
    entry.record.content = text;
    entry.node.textContent = text;
    entry.node.classList.remove('assistant-chat__message--pending', 'assistant-chat__message--error');
    if (modifier) entry.node.classList.add('assistant-chat__message--' + modifier);
    showStage('assistant', text, entry.record.id);
    scrollBottom();
  }

  function note(text) {
    var node = document.createElement('div');
    node.className = 'assistant-chat__note';
    node.textContent = text;
    log.appendChild(node);
    scrollBottom();
  }

  function setStarted() {
    try { sessionStorage.setItem(STARTED_KEY, '1'); } catch (_error) {}
    if (suggestions) suggestions.hidden = true;
  }

  function paintSuggestions() {
    if (!suggestions) return;
    var started = false;
    try { started = sessionStorage.getItem(STARTED_KEY) === '1'; } catch (_error) {}
    suggestions.hidden = started && records.length > 0;
  }

  function paintSend() {
    /* 飞行途中不换态：提交那一刻输入框已经被清空，但按钮还得保持实心，
       等箭头从下方落回来（animationend）再退回空心，否则它是在半路换的衣服 */
    if (sendIcon && sendIcon.classList.contains('is-flying')) return;
    var hasText = input.value.trim().length > 0;
    sendButton.classList.toggle('is-filled', hasText);
    if (!pending) sendButton.disabled = !hasText;
  }

  /* 面板底部那枚发送钮的同一套判定：有字才实心、才可点 */
  function paintDock() {
    if (!dockInput || !dockSend) return;
    if (dockIcon && dockIcon.classList.contains('is-flying')) return;
    var hasText = dockInput.value.trim().length > 0;
    dockSend.classList.toggle('is-filled', hasText);
    if (!pending) dockSend.disabled = !hasText;
  }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var flyTimer = 0;

  /* 收尾：摘掉 is-flying，再按当前输入框重新判一次实心/空心 */
  function endFly() {
    if (flyTimer) { clearTimeout(flyTimer); flyTimer = 0; }
    var alive = false;
    if (sendIcon && sendIcon.classList.contains('is-flying')) {
      sendIcon.classList.remove('is-flying');
      alive = true;
    }
    if (dockIcon && dockIcon.classList.contains('is-flying')) {
      dockIcon.classList.remove('is-flying');
      alive = true;
    }
    if (!alive) return;
    paintSend();
    paintDock();
  }

  function flySendIcon() {
    /* 关掉动效的人不发这一帧：CSS 那边 animation:none 之后
       animationend 不会触发，is-flying 会一直挂着，按钮就再也不会换态了 */
    if (reduceMotion.matches) return;
    /* 只让「刚才在打字的那条」飞：两条输入共用发送逻辑，
       但两枚按钮同时做动作会看成两处都在发 */
    var icon = (dockFocus && dockIcon) ? dockIcon : sendIcon;
    if (!icon) return;
    /* 连按时把动画重头放一遍：先摘类、强制一次回流再挂上，
       不然类名没变，浏览器不会重启同一条 animation */
    icon.classList.remove('is-flying');
    void icon.offsetWidth;
    icon.classList.add('is-flying');
    /* animationend 是主路径，这条 700 的定时器只是兜底（动画 .62s）：
       标签页被挂起时动画会被取消、不派发 end，少了这一手按钮会永远停在实心态 */
    clearTimeout(flyTimer);
    flyTimer = setTimeout(endFly, 700);
  }

  if (sendIcon) sendIcon.addEventListener('animationend', endFly);
  if (dockIcon) dockIcon.addEventListener('animationend', endFly);

  function setPending(value) {
    pending = value;
    input.disabled = value;
    sendButton.disabled = value || !input.value.trim();
    if (dockInput && dockSend) {
      dockInput.disabled = value;
      dockSend.disabled = value || !dockInput.value.trim();
    }
    composer.setAttribute('aria-busy', value ? 'true' : 'false');
    /* 光标还回上一条在打字的那格：从面板里发完一句，
       焦点不该突然跳到底部那条输入上 */
    if (!value) (dockFocus && dockInput ? dockInput : input).focus();
  }

  async function requestReply(text, previous) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 35000);
    try {
      var headers = {'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID()};
      var token = sessionStorage.getItem('intellibot.auth.token');
      if (token) headers.Authorization = 'Bearer ' + token;
      var body = {message: text, history: previous};
      var persona = window.intellibotPersona && window.intellibotPersona.active;
      if (persona && persona.prompt) body.persona = persona.prompt;
      var response = await fetch(api + '/chat', {
        method: 'POST', headers: headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      var payload = await response.json().catch(function () { throw new Error('AI 服务返回了无法解析的响应'); });
      if (response.status === 401) {
        sessionStorage.removeItem('intellibot.auth.token');
        stopActions();
        window.dispatchEvent(new CustomEvent('intellibot-auth-required'));
      }
      if (!response.ok || payload.error) {
        throw new Error(payload.error && payload.error.message ? payload.error.message : '请求失败');
      }
      return payload.data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('模型响应超时，请稍后重试');
      throw error;
    } finally { clearTimeout(timer); }
  }

  /* 状态胶囊已从界面上撤掉，停止动作只剩两件事：作废正在跑的序列、收起停止钮 */
  function stopActions() {
    sequenceToken += 1;
    if (window.robot3d && window.robot3d.ready) window.robot3d.stopGesture();
    stopButton.hidden = true;
  }

  function wait(milliseconds) { return new Promise(function (resolve) { setTimeout(resolve, milliseconds); }); }

  var VIEW_PRESETS = {
    front: {azimuth: 0, elevation: 0},
    left: {azimuth: -90, elevation: 0},
    right: {azimuth: 90, elevation: 0},
    back: {azimuth: 180, elevation: 0},
    up: {azimuth: 0, elevation: 89},
    level: {azimuth: 0, elevation: 0},
    down: {azimuth: 0, elevation: -89},
  };
  var POSE_LOOPS = {idle: true, standby: true, raisehand: false, apose: false};

  function commandsFromResponse(data) {
    if (Array.isArray(data.commands)) return data.commands.slice(0, 6);
    var actions = Array.isArray(data.actions) ? data.actions : (data.action_id ? [data.action_id] : []);
    return actions.slice(0, 4).map(function (id) { return {type: 'motion', id: id}; });
  }

  function applyPoseCommand(robot, poseId) {
    if (!Object.prototype.hasOwnProperty.call(POSE_LOOPS, poseId)) return false;
    if (typeof robot.stopGesture === 'function') robot.stopGesture();
    if (poseId === 'idle' && typeof robot.resetPose === 'function') robot.resetPose();
    if (poseId === 'idle' && typeof robot.setMood === 'function') robot.setMood('calm');
    if (typeof robot.playClip !== 'function' || robot.playClip(poseId, POSE_LOOPS[poseId]) === false) {
      return false;
    }
    window.dispatchEvent(new CustomEvent('robot-pose-change', {detail: {clip: poseId}}));
    return true;
  }

  function executeCommand(command) {
    var robot = window.robot3d;
    if (!command || typeof command.type !== 'string') return {ok: false, label: '无效命令'};
    if (command.type === 'motion') {
      var info = robot && robot.getGestureInfo ? robot.getGestureInfo(command.id) : null;
      if (!info || !robot.playGesture(command.id, {source: 'chat'})) {
        return {ok: false, label: '动作 ' + command.id, duration: 0};
      }
      return {ok: true, label: info.label, duration: info.duration};
    }
    if (command.type === 'pose') {
      return {ok: !!robot && applyPoseCommand(robot, command.id), label: '姿态 ' + command.id, duration: 0};
    }
    if (command.type === 'reset_pose') {
      return {ok: !!robot && applyPoseCommand(robot, 'idle'), label: '复位姿态', duration: 0};
    }
    if (command.type === 'emotion') {
      if (!robot || typeof robot.setMood !== 'function') return {ok: false, label: '表情 ' + command.id};
      robot.setMood(command.id);
      return {ok: true, label: '表情 ' + command.id, duration: 0};
    }
    var viewControl = window.viewControl;
    if (command.type === 'reset_view') {
      if (!viewControl || typeof viewControl.resetView !== 'function') return {ok: false, label: '复位视角'};
      viewControl.resetView();
      return {ok: true, label: '复位视角', duration: 0};
    }
    if (command.type === 'view') {
      var preset = VIEW_PRESETS[command.preset];
      var current = viewControl && viewControl.view;
      if (!preset || !current || typeof viewControl.setView !== 'function') {
        return {ok: false, label: '视角 ' + command.preset};
      }
      var applied = viewControl.setView({
        azimuth: preset.azimuth,
        elevation: preset.elevation,
        distance: current.distance,
      });
      return {ok: applied !== false, label: '视角 ' + command.preset, duration: 0};
    }
    return {ok: false, label: command.type};
  }

  async function playCommands(commands) {
    if (!Array.isArray(commands) || !commands.length) return;
    var robot = window.robot3d;
    var needsRobot = commands.some(function (command) {
      return command && ['motion', 'pose', 'reset_pose', 'emotion'].includes(command.type);
    });
    if (needsRobot && (!robot || !robot.ready)) {
      note('命令未执行：主页机器人尚未加载完成');
      return;
    }
    var token = ++sequenceToken;
    if (robot && typeof robot.stopGesture === 'function') robot.stopGesture();
    stopButton.hidden = !commands.some(function (command) { return command && command.type === 'motion'; });
    for (var index = 0; index < commands.length; index += 1) {
      if (token !== sequenceToken) return;
      var result = executeCommand(commands[index]);
      if (!result.ok) {
        note('命令未执行：' + result.label);
        continue;
      }
      if (commands[index].type === 'motion') {
        await wait(Math.max(300, result.duration * 1000 + 250));
      }
    }
    if (token === sequenceToken) stopButton.hidden = true;
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || pending) return false;
    /* 空框与「正在等回复」都退到上面去了，所以箭头只在真的发出东西时才飞 */
    flySendIcon();
    setStarted();
    var previous = history.slice(-10);
    addRecord('user', text);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    /* 面板那条也清掉：两条输入各自存草稿，发出去的那句同步收起 */
    if (dockInput) { dockInput.value = ''; paintDock(); }
    var thinking = addRecord('ai', tr('chat.thinking', '正在思考…'), 'pending');
    setPending(true);
    try {
      var data = await requestReply(text, previous);
      updateRecord(thinking, data.reply);
      var commands = commandsFromResponse(data);
      var commandRecord = commands.map(function (command) {
        return command.type + ':' + (command.id || command.preset || '');
      }).join(', ');
      var actionRecord = data.stop ? ' [动作记录：已停止]' : (commands.length ? ' [动作记录：' + commandRecord + ']' : '');
      history = history.concat([
        {role: 'user', content: text},
        {role: 'assistant', content: data.reply.slice(0, 500 - actionRecord.length) + actionRecord},
      ]).slice(-10);
      if (data.stop) stopActions();
      else if (commands.length) playCommands(commands);
      return true;
    } catch (error) {
      updateRecord(thinking, error.message || '对话失败，请稍后重试', 'error');
      return false;
    } finally { setPending(false); }
  }

  function openChat(recordId) {
    var tab = document.querySelector('.rail--left .item[data-panel="Chat"]');
    if (tab && tab.getAttribute('aria-expanded') !== 'true') tab.click();
    requestAnimationFrame(function () {
      var target = recordId && log.querySelector('[data-record-id="' + recordId + '"]');
      if (target) target.scrollIntoView({block: 'nearest'});
      else scrollBottom();
    });
  }

  function syncHistoryButton() {
    if (!historyButton) return;
    var tab = document.querySelector('.rail--left .item[data-panel="Chat"]');
    var expanded = !!tab && tab.getAttribute('aria-expanded') === 'true';
    var key = expanded ? 'chat.closeHistory' : 'chat.openHistory';
    var fallback = expanded ? '关闭完整聊天记录' : '打开完整聊天记录';
    historyButton.classList.toggle('is-open', expanded);
    historyButton.setAttribute('aria-expanded', String(expanded));
    historyButton.setAttribute('data-i18n-aria', key);
    historyButton.setAttribute('aria-label', tr(key, fallback));
  }

  function toggleChat() {
    var tab = document.querySelector('.rail--left .item[data-panel="Chat"]');
    if (!tab) return;
    if (tab.getAttribute('aria-expanded') === 'true') tab.click();
    else openChat();
  }

  /* ---------- 清空的确认态 ---------- */

  /* 文案只有两态：平时 chat.clear（清空 / Clear），armed 时 chat.clear.confirm
     （确认 / Confirm）。确认态由 is-arm 这一个类承载，与账号面板的退出登录同款；
     组内单选那套会在点击时抢先挂 is-active，这里一并收回 —— 亮不亮只该由
     确认态决定 */
  function paintClear() {
    var label = clearButton.querySelector('.pill__label');
    clearButton.classList.remove('is-active');
    clearButton.classList.toggle('is-arm', clearArmed);
    clearButton.setAttribute('aria-pressed', String(clearArmed));
    if (!label) return;
    if (clearArmed) {
      /* 摘掉 data-i18n：切语言时别把「确认」顺手覆盖回「清空」 */
      label.removeAttribute('data-i18n');
      label.textContent = tr('chat.clear.confirm', '确认');
    } else {
      label.setAttribute('data-i18n', 'chat.clear');
      label.textContent = tr('chat.clear', '清空');
    }
  }

  function disarmClear() {
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = 0; }
    if (!clearArmed) return;
    clearArmed = false;
    paintClear();
  }

  function armClear() {
    if (clearArmed) return;
    clearArmed = true;
    paintClear();
    /* 固定 3 秒，不因指针移开而提前收回：这一下的确认是「再点一次」，
       停不停在按钮上都不是信号 */
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(disarmClear, CLEAR_HOLD);
  }

  function onClearClick() {
    if (!clearArmed) { armClear(); return; }
    disarmClear();
    clear();
  }

  function setHistoryMenu(open) {
    historyMenu.hidden = !open;
    if (historyDock) historyDock.classList.toggle('is-open', open);
    settingsButton.setAttribute('aria-expanded', String(open));
    /* 菜单一收就退回未确认态：下次点开时不该还是「确认」 */
    if (!open) disarmClear();
  }

  function syncHistoryActions() {
    var empty = records.length === 0;
    if (exportButton) exportButton.disabled = empty;
    clearButton.disabled = empty;
    /* 记录被清空（含别处触发）之后，确认态没有对象了，顺手收回 */
    if (empty) disarmClear();
  }

  function toggleHistoryMenu() {
    setHistoryMenu(historyMenu.hidden);
  }

  function exportHistory() {
    if (!records.length) return;
    var text = records.map(function (record) {
      var author = record.role === 'user' ? tr('chat.you', '你') : 'IntelliBot';
      return author + ': ' + record.content;
    }).join('\n\n');
    var blob = new Blob([text], {type: 'text/markdown;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'intellibot-chat-' + new Date().toISOString().slice(0, 10) + '.md';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    setHistoryMenu(false);
  }

  function clear() {
    history = [];
    records = [];
    log.replaceChildren();
    hideStage();
    try { sessionStorage.removeItem(STARTED_KEY); } catch (_error) {}
    if (suggestions) suggestions.hidden = false;
    setHistoryMenu(false);
    syncHistoryActions();
    input.focus();
  }

  function welcome(playMotion) {
    if (!welcomeShown) {
      welcomeShown = true;
      addRecord('ai', tr('chat.welcome', '你好，我是 IntelliBot，很高兴见到你！想看看我能做什么吗？'));
    }
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (playMotion && !welcomeMotionPlayed && !reduced &&
        window.robot3d && window.robot3d.ready) {
      welcomeMotionPlayed = true;
      window.robot3d.playGesture('wave', {source: 'welcome'});
    }
  }

  input.addEventListener('input', paintSend);
  input.addEventListener('focus', function () { dockFocus = false; });
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(input.value); }
  });
  sendButton.addEventListener('click', function () { dockFocus = false; send(input.value); });
  /* 面板底部那条：回车与点击都走同一个 send()，与主输入条不分叉 */
  if (dockInput && dockSend) {
    dockInput.addEventListener('input', paintDock);
    dockInput.addEventListener('focus', function () { dockFocus = true; });
    dockInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        send(dockInput.value);
      }
    });
    dockSend.addEventListener('click', function () {
      dockFocus = true;
      send(dockInput.value);
    });
  }
  stopButton.addEventListener('click', function () { stopActions(); });
  settingsButton.addEventListener('click', toggleHistoryMenu);
  clearButton.addEventListener('click', onClearClick);
  if (exportButton) exportButton.addEventListener('click', exportHistory);
  if (suggestions) suggestions.addEventListener('click', function (event) {
    var button = event.target.closest('[data-chat-example]');
    if (button) send(button.dataset.chatPrompt || button.textContent.trim());
  });
  if (stage) stage.addEventListener('click', function (event) {
    var bubble = event.target.closest('[data-stage-message]');
    if (bubble) openChat(bubble.dataset.recordId);
  });

  /* 相机参数先摆好，再等字体落位重摆一次 —— 字体换了行高、列的位置也可能挪 */
  if (stage) {
    syncStagePerspective();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(syncStagePerspective);
    }
  }
  if (historyButton) {
    var chatTab = document.querySelector('.rail--left .item[data-panel="Chat"]');
    historyButton.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
    historyButton.addEventListener('click', toggleChat);
    if (chatTab && window.MutationObserver) {
      new MutationObserver(syncHistoryButton).observe(chatTab, {
        attributes: true,
        attributeFilter: ['aria-expanded'],
      });
    }
    document.addEventListener('langchange', syncHistoryButton);
    syncHistoryButton();
  }
  if (window.addEventListener) {
    window.addEventListener('robot-manual-motion', function () {
      sequenceToken += 1; stopButton.hidden = true;
    });
    window.addEventListener('resize', function () {
      syncStagePerspective();
    });
    window.addEventListener('intellibot-idle-reaction', function (event) {
      showIdleReaction(event.detail && event.detail.kind);
    });
    window.addEventListener('robot-ready', function () { welcome(true); }, {once: true});
    setTimeout(function () { welcome(false); }, 5000);
  }
  document.addEventListener('pointerdown', function (event) {
    if (historyMenu.hidden || event.target.closest('.chat-view__actions')) return;
    setHistoryMenu(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !historyMenu.hidden) {
      setHistoryMenu(false);
      settingsButton.focus();
    }
  });
  paintSuggestions();
  paintSend();
  syncHistoryActions();

  window.intellibotChat = {
    send: send,
    submit: function () { return send(input.value); },
    clear: clear,
    stopActions: stopActions,
    getHistory: function () { return history.slice(); },
    get history() { return history.slice(); },
  };
})();
