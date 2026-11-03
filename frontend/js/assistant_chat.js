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
  var settingsButton = document.querySelector('[data-chat-settings]');
  var historyMenu = document.querySelector('[data-chat-history-menu]');
  var exportButton = document.querySelector('[data-chat-export]');
  var clearButton = document.querySelector('[data-chat-clear]');
  var stopButton = findInPanel('[data-assistant-stop]');
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

  var queryApi = new URLSearchParams(location.search).get('api');
  var api = queryApi ? queryApi.replace(/\/+$/, '') : '/api/v1';
  var history = [];
  var records = [];
  var pending = false;
  var sequenceToken = 0;
  var STAGE_LIMIT = 60;   /* 舞台每侧最多留 60 条，更早的看左栏完整对话流 */
  var STARTED_KEY = 'intellibot.chat.started';
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

  function stageStream(role) {
    return stage && stage.querySelector('[data-stage-stream="' + role + '"]');
  }

  function decorateBubble(node, role, recordId) {
    if (!node || !node.dataset) return;
    var salt = role === 'user' ? 1 : 0;
    var variant = (Number(recordId || 0) + salt) % 4;
    node.dataset.bubbleVariant = String(variant);
    node.dataset.author = role === 'user' ? tr('chat.you', '你') : 'IntelliBot';
  }

  /* 贴底判定：离底不到一行就当还停在最新。新消息只在贴底时才把记录流
     带下去；已经往上翻过去看旧对话的人，不会被新消息硬拽回底部 */
  function atStageBottom(stream) {
    return stream.scrollHeight - stream.scrollTop - stream.clientHeight < 32;
  }

  function stageToBottom(stream) {
    requestAnimationFrame(function () { stream.scrollTop = stream.scrollHeight; });
  }

  /* 只有真的滚出内容时才给顶上那截渐隐：一条消息的板子不该是半透明的 */
  function stageSync(stream) {
    stream.classList.toggle('is-overflow', stream.scrollHeight > stream.clientHeight + 4);
  }

  /* 舞台两侧各是一条记录流，按角色分开：这一侧已有的气泡按 recordId 复用，
     新的追加到末尾（流自己向上滚，最新一条总在底边）。
     同一条记录会走两遍 —— 先「正在思考…」再回填正文，所以复用优先于新建 */
  function showStage(role, text, recordId) {
    var stream = stageStream(role);
    if (!stream) return;
    var key = String(recordId || '');
    var node = key ? stream.querySelector('[data-record-id="' + key + '"]') : null;
    var follow = !node || atStageBottom(stream);
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
      /* 只留最近 STAGE_LIMIT 条：更早的还在左栏完整对话流里，舞台这块板不必无限长 */
      while (stream.children.length > STAGE_LIMIT) stream.firstElementChild.remove();
    }
    var textNode = node.querySelector('[data-stage-text]');
    if (textNode) textNode.textContent = text;
    else node.textContent = text;
    node.dataset.recordId = key;
    if (follow) stageToBottom(stream);
    stageSync(stream);
  }

  function hideStage() {
    if (!stage) return;
    stage.querySelectorAll('[data-stage-stream]').forEach(function (stream) {
      stream.replaceChildren();
    });
  }

  /* 待机时的自言自语：往舞台上追一条就够，不做定时清理——
     记录留在两侧的滚动流里，由用户自己翻看 */
  function showIdleReaction(kind) {
    if (pending) return;
    var key = kind === 'look' ? 'idle.look.prompt' : 'idle.settle.prompt';
    var fallback = kind === 'look'
      ? '我在看看周围。你想让我做点什么？'
      : '站久了，活动一下。要不要看个动作？';
    showStage('assistant', tr(key, fallback));
  }

  function addRecord(role, text, modifier) {
    var record = {id: records.length + 1, role: role, content: text};
    records.push(record);
    var node = document.createElement('div');
    node.className = 'assistant-chat__message assistant-chat__message--' + role;
    if (modifier) node.classList.add('assistant-chat__message--' + modifier);
    decorateBubble(node, role, record.id);
    node.dataset.recordId = String(record.id);
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

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var flyTimer = 0;

  /* 收尾：摘掉 is-flying，再按当前输入框重新判一次实心/空心 */
  function endFly() {
    if (flyTimer) { clearTimeout(flyTimer); flyTimer = 0; }
    if (!sendIcon || !sendIcon.classList.contains('is-flying')) return;
    sendIcon.classList.remove('is-flying');
    paintSend();
  }

  function flySendIcon() {
    /* 关掉动效的人不发这一帧：CSS 那边 animation:none 之后
       animationend 不会触发，is-flying 会一直挂着，按钮就再也不会换态了 */
    if (!sendIcon || reduceMotion.matches) return;
    /* 连按时把动画重头放一遍：先摘类、强制一次回流再挂上，
       不然类名没变，浏览器不会重启同一条 animation */
    sendIcon.classList.remove('is-flying');
    void sendIcon.offsetWidth;
    sendIcon.classList.add('is-flying');
    /* animationend 是主路径，这条 700 的定时器只是兜底（动画 .62s）：
       标签页被挂起时动画会被取消、不派发 end，少了这一手按钮会永远停在实心态 */
    clearTimeout(flyTimer);
    flyTimer = setTimeout(endFly, 700);
  }

  if (sendIcon) sendIcon.addEventListener('animationend', endFly);

  function setPending(value) {
    pending = value;
    input.disabled = value;
    sendButton.disabled = value || !input.value.trim();
    composer.setAttribute('aria-busy', value ? 'true' : 'false');
    if (!value) input.focus();
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

  function setHistoryMenu(open) {
    historyMenu.hidden = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
  }

  function syncHistoryActions() {
    var empty = records.length === 0;
    if (exportButton) exportButton.disabled = empty;
    clearButton.disabled = empty;
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
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(input.value); }
  });
  sendButton.addEventListener('click', function () { send(input.value); });
  stopButton.addEventListener('click', function () { stopActions(); });
  settingsButton.addEventListener('click', toggleHistoryMenu);
  clearButton.addEventListener('click', clear);
  if (exportButton) exportButton.addEventListener('click', exportHistory);
  if (suggestions) suggestions.addEventListener('click', function (event) {
    var button = event.target.closest('[data-chat-example]');
    if (button) send(button.dataset.chatPrompt || button.textContent.trim());
  });
  if (stage) stage.addEventListener('click', function (event) {
    var bubble = event.target.closest('[data-stage-message]');
    if (bubble) openChat(bubble.dataset.recordId);
  });
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
      if (!stage) return;
      stage.querySelectorAll('[data-stage-stream]').forEach(stageSync);
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
