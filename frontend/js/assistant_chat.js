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
  var sendIcon = sendButton && sendButton.querySelector('.composer__send-icon');
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

  /* 发送钮的两态只看框里有没有字：有字就铺满主题色、箭头反色，
     空着回到主题色描边 + --panel 底片。字是边打边判的，
     所以挂在 input 上，和 js/composer.js 的量尺寸各自独立 */
  function paintSend() {
    /* 飞行途中不换态：提交那一刻输入框已经被清空，但按钮还得保持实心，
       等箭头从下方落回来（animationend）再退回空心，否则它是在半路换的衣服 */
    if (sendIcon && sendIcon.classList.contains('is-flying')) return;
    sendButton.classList.toggle('is-filled', input.value.trim().length > 0);
  }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var flyTimer = 0;

  /* 收尾：摘掉 is-flying，再按当前输入框重新判一次实心/空心 ——
     飞行途中涂的实心就是为了在这里退回空心 */
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
    /* 连按（Enter 敲两下）时把动画重头放一遍：先摘类、强制一次回流再挂上，
       不然类名没变，浏览器不会重启同一条 animation */
    sendIcon.classList.remove('is-flying');
    void sendIcon.offsetWidth;
    sendIcon.classList.add('is-flying');
    /* animationend 是主路径，这条 700 的定时器只是兜底（演示动画 .62s）：
       标签页被挂起、元素被 display:none 掉时动画会被取消、不会派发 end，
       少了这一手按钮就永远停在实心态 */
    clearTimeout(flyTimer);
    flyTimer = setTimeout(endFly, 700);
  }

  if (sendIcon) sendIcon.addEventListener('animationend', endFly);

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
    /* 空框与「正在等回复」都退出去，所以箭头只在真的发出东西时才飞 */
    flySendIcon();
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

  input.addEventListener('input', paintSend);
  paintSend();
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
