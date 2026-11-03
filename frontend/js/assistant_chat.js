(function () {
  'use strict';

  var composer = document.querySelector('.composer');
  if (!composer) return;
  var panel = composer.querySelector('[data-assistant-chat]');
  var log = composer.querySelector('[data-assistant-log]');
  var input = composer.querySelector('[data-assistant-input]');
  var sendButton = composer.querySelector('[data-assistant-send]');
  var clearButton = composer.querySelector('[data-assistant-clear]');
  var stopButton = composer.querySelector('[data-assistant-stop]');
  var status = composer.querySelector('[data-assistant-status]');
  if (!panel || !log || !input || !sendButton || !clearButton || !stopButton ||
      !status) return;

  var queryApi = new URLSearchParams(location.search).get('api');
  var api = queryApi ? queryApi.replace(/\/+$/, '') : '/api/v1';
  var history = [];
  var pending = false;
  var sequenceToken = 0;

  function scrollBottom() {
    log.scrollTop = log.scrollHeight;
    requestAnimationFrame(function () { log.scrollTop = log.scrollHeight; });
  }

  function message(role, text, modifier) {
    panel.hidden = false;
    var node = document.createElement('div');
    node.className = 'assistant-chat__message assistant-chat__message--' + role;
    if (modifier) node.classList.add('assistant-chat__message--' + modifier);
    node.textContent = text;
    log.appendChild(node);
    scrollBottom();
    return node;
  }

  function note(text) {
    var node = document.createElement('div');
    node.className = 'assistant-chat__note';
    node.textContent = text;
    log.appendChild(node);
    scrollBottom();
  }

  function setPending(value) {
    pending = value;
    input.disabled = value;
    sendButton.disabled = value;
    composer.setAttribute('aria-busy', value ? 'true' : 'false');
    if (!value) input.focus();
  }

  async function requestReply(text, previous) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 35000);
    try {
      var response = await fetch(api + '/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({message: text, history: previous}),
        signal: controller.signal,
      });
      var payload;
      try { payload = await response.json(); }
      catch (_error) { throw new Error('AI 服务返回了无法解析的响应'); }
      if (!response.ok || payload.error) {
        throw new Error(payload.error && payload.error.message ? payload.error.message : '请求失败');
      }
      return payload.data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('DeepSeek 响应超时，请稍后重试');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function stopActions(label) {
    sequenceToken += 1;
    if (window.robot3d && window.robot3d.ready) window.robot3d.stopGesture();
    stopButton.hidden = true;
    status.textContent = label || '待命';
  }

  function wait(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
  }

  async function playActions(actions) {
    if (!Array.isArray(actions) || !actions.length) return;
    var robot = window.robot3d;
    if (!robot || !robot.ready) {
      note('动作未播放：主页机器人尚未加载完成');
      return;
    }
    var token = ++sequenceToken;
    robot.stopGesture();
    stopButton.hidden = false;
    for (var index = 0; index < actions.length; index += 1) {
      if (token !== sequenceToken) return;
      var actionId = actions[index];
      var info = robot.getGestureInfo ? robot.getGestureInfo(actionId) : null;
      if (!info || !robot.playGesture(actionId, {source:'chat'})) {
        note('动作未播放：' + actionId + ' 不在主页白名单中');
        continue;
      }
      status.textContent = '正在执行：' + info.label + '（' + (index + 1) + '/' + actions.length + '）';
      await wait(Math.max(300, info.duration * 1000 + 250));
    }
    if (token === sequenceToken) {
      stopButton.hidden = true;
      status.textContent = '动作完成';
    }
  }

  async function submit() {
    var text = input.value.trim();
    if (!text || pending) return;
    var previous = history.slice(-10);
    message('user', text);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    var thinking = message('ai', '正在思考…', 'pending');
    status.textContent = '正在思考…';
    setPending(true);
    try {
      var data = await requestReply(text, previous);
      thinking.remove();
      message('ai', data.reply);
      var actions = Array.isArray(data.actions)
        ? data.actions.slice(0, 4)
        : (data.action_id ? [data.action_id] : []);
      var actionRecord = data.stop
        ? ' [动作记录：已停止]'
        : (actions.length ? ' [动作记录：' + actions.join(', ') + ']' : '');
      var historyReply = data.reply.slice(0, 500 - actionRecord.length) + actionRecord;
      history = history.concat([
        {role: 'user', content: text},
        {role: 'assistant', content: historyReply},
      ]).slice(-10);
      if (data.stop) {
        stopActions('已按指令停止');
      } else {
        if (actions.length) playActions(actions);
        else status.textContent = '待命';
      }
    } catch (error) {
      thinking.textContent = error.message || '对话失败，请稍后重试';
      thinking.classList.remove('assistant-chat__message--pending');
      thinking.classList.add('assistant-chat__message--error');
      status.textContent = '请求失败';
    } finally {
      setPending(false);
    }
  }

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  });
  sendButton.addEventListener('click', submit);
  stopButton.addEventListener('click', function () { stopActions('已手动停止'); });
  clearButton.addEventListener('click', function () {
    history = [];
    log.replaceChildren();
    panel.hidden = true;
    status.textContent = '待命';
    input.focus();
  });
  window.addEventListener('robot-manual-motion', function () {
    sequenceToken += 1; stopButton.hidden = true; status.textContent = '已切换为手动动作';
  });
  window.intellibotChat = {
    submit: submit,
    stopActions: stopActions,
    get history() { return history.slice(); },
  };
})();
