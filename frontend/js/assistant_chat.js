(function () {
  'use strict';

  var composer = document.querySelector('.composer');
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
  var clearButton = findInPanel('[data-assistant-clear]');
  var stopButton = findInPanel('[data-assistant-stop]');
  var status = findInPanel('[data-assistant-status]');
  var suggestions = findInPanel('[data-chat-suggestions]');
  var historyButton = composer.querySelector('[data-chat-history]');
  var stage = document.querySelector('[data-stage-chat]');
  if (!log || !input || !sendButton || !clearButton || !stopButton || !status) return;

  var queryApi = new URLSearchParams(location.search).get('api');
  var api = queryApi ? queryApi.replace(/\/+$/, '') : '/api/v1';
  var history = [];
  var records = [];
  var pending = false;
  var sequenceToken = 0;
  var bubbleTimer = 0;
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

  function stageBubble(role) {
    return stage && stage.querySelector('[data-stage-message="' + role + '"]');
  }

  function showStage(role, text, recordId) {
    var node = stageBubble(role);
    if (!node) return;
    node.textContent = text;
    node.dataset.recordId = String(recordId || '');
    node.hidden = false;
    node.classList.remove('is-leaving');
  }

  function hideStage() {
    clearTimeout(bubbleTimer);
    if (!stage) return;
    stage.querySelectorAll('[data-stage-message]').forEach(function (node) {
      node.classList.add('is-leaving');
      setTimeout(function () { node.hidden = true; node.classList.remove('is-leaving'); }, 220);
    });
  }

  function scheduleStageHide() {
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideStage, 8000);
  }

  function addRecord(role, text, modifier) {
    var record = {id: records.length + 1, role: role, content: text};
    records.push(record);
    var node = document.createElement('div');
    node.className = 'assistant-chat__message assistant-chat__message--' + role;
    if (modifier) node.classList.add('assistant-chat__message--' + modifier);
    node.dataset.recordId = String(record.id);
    node.textContent = text;
    log.appendChild(node);
    scrollBottom();
    showStage(role === 'ai' ? 'assistant' : role, text, record.id);
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
    suggestions.hidden = started;
  }

  function paintSend() {
    var hasText = input.value.trim().length > 0;
    sendButton.classList.toggle('is-filled', hasText);
    if (!pending) sendButton.disabled = !hasText;
  }

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
        stopActions('请先登录');
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

  function stopActions(label) {
    sequenceToken += 1;
    if (window.robot3d && window.robot3d.ready) window.robot3d.stopGesture();
    stopButton.hidden = true;
    status.textContent = label || tr('chat.status.ready', '待命');
  }

  function wait(milliseconds) { return new Promise(function (resolve) { setTimeout(resolve, milliseconds); }); }

  async function playActions(actions) {
    if (!Array.isArray(actions) || !actions.length) return;
    var robot = window.robot3d;
    if (!robot || !robot.ready) { note('动作未播放：主页机器人尚未加载完成'); return; }
    var token = ++sequenceToken;
    robot.stopGesture();
    stopButton.hidden = false;
    for (var index = 0; index < actions.length; index += 1) {
      if (token !== sequenceToken) return;
      var actionId = actions[index];
      var info = robot.getGestureInfo ? robot.getGestureInfo(actionId) : null;
      if (!info || !robot.playGesture(actionId, {source: 'chat'})) {
        note('动作未播放：' + actionId + ' 不在主页白名单中');
        continue;
      }
      status.textContent = '正在执行：' + info.label + '（' + (index + 1) + '/' + actions.length + '）';
      await wait(Math.max(300, info.duration * 1000 + 250));
    }
    if (token === sequenceToken) { stopButton.hidden = true; status.textContent = '动作完成'; }
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || pending) return false;
    setStarted();
    clearTimeout(bubbleTimer);
    var previous = history.slice(-10);
    addRecord('user', text);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    var thinking = addRecord('ai', tr('chat.thinking', '正在思考…'), 'pending');
    status.textContent = tr('chat.thinking', '正在思考…');
    setPending(true);
    try {
      var data = await requestReply(text, previous);
      updateRecord(thinking, data.reply);
      var actions = Array.isArray(data.actions) ? data.actions.slice(0, 4) : (data.action_id ? [data.action_id] : []);
      var actionRecord = data.stop ? ' [动作记录：已停止]' : (actions.length ? ' [动作记录：' + actions.join(', ') + ']' : '');
      history = history.concat([
        {role: 'user', content: text},
        {role: 'assistant', content: data.reply.slice(0, 500 - actionRecord.length) + actionRecord},
      ]).slice(-10);
      if (data.stop) stopActions('已按指令停止');
      else if (actions.length) playActions(actions);
      else status.textContent = tr('chat.status.ready', '待命');
      scheduleStageHide();
      return true;
    } catch (error) {
      updateRecord(thinking, error.message || '对话失败，请稍后重试', 'error');
      status.textContent = tr('chat.status.failed', '请求失败');
      scheduleStageHide();
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

  function clear() {
    history = [];
    records = [];
    log.replaceChildren();
    hideStage();
    status.textContent = tr('chat.status.ready', '待命');
    input.focus();
  }

  function welcome(playMotion) {
    if (!welcomeShown) {
      welcomeShown = true;
      addRecord('ai', tr('chat.welcome', '你好，我是 IntelliBot，很高兴见到你！想看看我能做什么吗？'));
      scheduleStageHide();
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
  stopButton.addEventListener('click', function () { stopActions('已手动停止'); });
  clearButton.addEventListener('click', clear);
  if (suggestions) suggestions.addEventListener('click', function (event) {
    var button = event.target.closest('[data-chat-example]');
    if (button) send(button.textContent.trim());
  });
  if (stage) stage.addEventListener('click', function (event) {
    var bubble = event.target.closest('[data-stage-message]');
    if (bubble) openChat(bubble.dataset.recordId);
  });
  if (historyButton) historyButton.addEventListener('click', function () { openChat(); });
  if (window.addEventListener) {
    window.addEventListener('robot-manual-motion', function () {
      sequenceToken += 1; stopButton.hidden = true; status.textContent = '已切换为手动动作';
    });
    window.addEventListener('robot-ready', function () { welcome(true); }, {once: true});
    setTimeout(function () { welcome(false); }, 5000);
  }
  paintSuggestions();
  paintSend();

  window.intellibotChat = {
    send: send,
    submit: function () { return send(input.value); },
    clear: clear,
    stopActions: stopActions,
    getHistory: function () { return history.slice(); },
    get history() { return history.slice(); },
  };
})();
