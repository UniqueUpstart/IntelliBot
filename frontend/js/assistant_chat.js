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
  var voiceButton = composer.querySelector('[data-assistant-voice]');
  var speechToggle = composer.querySelector('[data-assistant-speech-toggle]');
  var speechStop = findInPanel('[data-assistant-speech-stop]') ||
    document.querySelector('[data-assistant-speech-stop]');
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
  var restoring = false;
  var pending = false;
  var sequenceToken = 0;
  var STAGE_LIMIT = 60;   /* 舞台每侧最多留 60 条，更早的看左栏完整对话流 */
  var STARTED_KEY = 'intellibot.chat.started';
  var welcomeShown = false;
  var welcomeMotionPlayed = false;
  var SPEECH_KEY = 'intellibot.chat.speech.enabled';
  var SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var recognition = null;
  var listening = false;
  var voiceStarting = false;
  var voiceBaseText = '';
  var activeUtterance = null;
  var activeAudio = null;
  var activeAudioUrl = '';
  var speechRequestToken = 0;
  var speechAbort = null;
  var browserSpeechSupported = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  var speechSupported = !!window.Audio || browserSpeechSupported;
  var speechEnabled = true;
  try {
    if (localStorage.getItem(SPEECH_KEY) === '0') speechEnabled = false;
  } catch (_error) {}

  function stateDirty() {
    if (!restoring && window.dispatchEvent && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('intellibot-state-dirty'));
    }
  }

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

  /* 贴底判定：离底不到一行就当还停在最新。新消息只在贴底时才把记录流
     带下去；已经往上翻过去看旧对话的人，不会被新消息硬拽回底部 */
  function atStageBottom(stream) {
    return stream.scrollHeight - stream.scrollTop - stream.clientHeight < 32;
  }

  function stageToBottom(stream) {
    requestAnimationFrame(function () { stream.scrollTop = stream.scrollHeight; });
  }

  /* 列的矩形快照，syncStagePerspective 每次重算时覆盖；滚轮热区判得勤，
     没有它就变成每个 wheel 事件拉一次布局 */
  var stageRect = null;


  /* 相机跟着视口走，不写死：镜头架在屏幕中轴与视口中线上，距离取视口高度的
     1.25 倍（窄屏 0.95 倍，画面更小、透视更近），再换算成相对这一列的百分比
     交给 CSS。列的尺寸一变（断点、旋屏、软键盘）重算一次就够 ——
     气泡自身的位置不用重算，透视原点钉在列上，滚动与增删会让投影自己变化 */
  function syncStagePerspective() {
    var flow = stageStream();
    if (!flow) return;
    var box = flow.getBoundingClientRect();
    if (!box.width || !box.height) return;
    /* 顺手存一份矩形：滚轮每次都要判热区，而列的位置只在尺寸变化时才动，
       不必每个 wheel 事件都去问一次布局 */
    stageRect = { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
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
      syncBubbleTilt(node);
      if (bubbleWatcher) bubbleWatcher.observe(node);
      /* 只留最近 STAGE_LIMIT 条：更早的还在左栏完整对话流里，舞台这块不必无限长 */
      while (stream.children.length > STAGE_LIMIT) {
        var oldest = stream.firstElementChild;
        if (bubbleWatcher) bubbleWatcher.unobserve(oldest);
        oldest.remove();
      }
    }
    var textNode = node.querySelector('[data-stage-text]');
    if (textNode) textNode.textContent = text;
    else node.textContent = text;
    node.dataset.recordId = key;
    if (follow) stageToBottom(stream);
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

  function addRecord(role, text, modifier, saved) {
    var record = {
      id: records.length + 1,
      role: role,
      content: text,
      time: saved && Number.isFinite(saved.time) ? saved.time : Date.now(),
    };
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
    stateDirty();
    return {node: node, record: record};
  }

  function updateRecord(entry, text, modifier) {
    entry.record.content = text;
    entry.node.textContent = text;
    entry.node.classList.remove('assistant-chat__message--pending', 'assistant-chat__message--error');
    if (modifier) entry.node.classList.add('assistant-chat__message--' + modifier);
    showStage('assistant', text, entry.record.id);
    scrollBottom();
    stateDirty();
  }

  function note(text) {
    var node = document.createElement('div');
    node.className = 'assistant-chat__note';
    node.textContent = text;
    log.appendChild(node);
    scrollBottom();
  }

  function speechLanguage() {
    var lang = document.documentElement.lang || navigator.language || 'en';
    return lang.toLowerCase().indexOf('zh') === 0 ? 'zh-CN' : 'en';
  }

  function updateVoiceButton() {
    if (!voiceButton) return;
    var active = listening || voiceStarting;
    var key = active ? 'chat.voice.stop' : 'chat.voice.start';
    var fallback = active ? '停止语音输入' : '开始语音输入';
    voiceButton.classList.toggle('is-listening', active);
    voiceButton.setAttribute('aria-pressed', String(active));
    voiceButton.setAttribute('data-i18n-aria', key);
    voiceButton.setAttribute('aria-label', tr(key, fallback));
    voiceButton.disabled = pending;
  }

  function refreshSpeechControls() {
    if (voiceButton) voiceButton.hidden = !SpeechRecognitionCtor;
    if (speechToggle) {
      speechToggle.hidden = !speechSupported;
      speechToggle.classList.toggle('is-muted', !speechEnabled);
      speechToggle.setAttribute('aria-pressed', String(speechEnabled));
      var key = speechEnabled ? 'chat.speech.on' : 'chat.speech.off';
      var fallback = speechEnabled ? '关闭自动朗读' : '开启自动朗读';
      speechToggle.setAttribute('data-i18n-aria', key);
      speechToggle.setAttribute('aria-label', tr(key, fallback));
    }
    if (speechStop && !speechSupported) speechStop.hidden = true;
    updateVoiceButton();
  }

  function stopSpeaking() {
    speechRequestToken += 1;
    if (speechAbort) {
      try { speechAbort.abort(); } catch (_error) {}
      speechAbort = null;
    }
    if (activeAudio) {
      try { activeAudio.pause(); } catch (_error) {}
      activeAudio = null;
    }
    if (activeAudioUrl) {
      try { URL.revokeObjectURL(activeAudioUrl); } catch (_error) {}
      activeAudioUrl = '';
    }
    activeUtterance = null;
    if (browserSpeechSupported) {
      try { window.speechSynthesis.cancel(); } catch (_error) {}
    }
    if (speechStop) speechStop.hidden = true;
  }

  function chooseSpeechVoice(language) {
    if (!browserSpeechSupported || typeof window.speechSynthesis.getVoices !== 'function') return null;
    var voices = [];
    try { voices = window.speechSynthesis.getVoices() || []; } catch (_error) {}
    var target = language.toLowerCase();
    var prefix = target.split('-')[0];
    var fallback = null;
    for (var i = 0; i < voices.length; i += 1) {
      var code = String(voices[i].lang || '').replace('_', '-').toLowerCase();
      if (code === target) return voices[i];
      if (!fallback && code.indexOf(prefix) === 0) fallback = voices[i];
    }
    return fallback;
  }

  function hideSpeechStop(token) {
    if (token !== speechRequestToken || activeAudio || activeUtterance) return;
    if (speechStop) speechStop.hidden = true;
  }

  function speakWithBrowser(text, token) {
    if (!browserSpeechSupported || token !== speechRequestToken || !speechEnabled) return false;
    if (activeUtterance) return true;
    var language = speechLanguage();
    var utterance = new window.SpeechSynthesisUtterance(text);
    var voice = chooseSpeechVoice(language);
    utterance.lang = language;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;
    activeUtterance = utterance;
    if (speechStop) speechStop.hidden = false;
    function finish() {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      hideSpeechStop(token);
    }
    utterance.onend = finish;
    utterance.onerror = finish;
    try {
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (_error) {
      finish();
      return false;
    }
  }

  function speakReply(text) {
    text = String(text || '').trim();
    if (!speechSupported || !speechEnabled || !text) return false;
    stopSpeaking();
    var token = speechRequestToken;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 20000);
    speechAbort = controller;
    if (speechStop) speechStop.hidden = false;
    var voice = speechLanguage() === 'zh-CN' ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AriaNeural';
    var headers = {'Content-Type': 'application/json'};
    var authToken = sessionStorage.getItem('intellibot.auth.token');
    if (authToken) headers.Authorization = 'Bearer ' + authToken;
    fetch(api + '/ai/speech', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({text: text, voice: voice}),
      signal: controller.signal,
    }).then(function (response) {
      if (!response.ok) throw new Error('natural speech unavailable');
      return response.blob();
    }).then(function (blob) {
      if (!blob.size) throw new Error('empty speech');
      if (token !== speechRequestToken || !speechEnabled) return;
      activeAudioUrl = URL.createObjectURL(blob);
      activeAudio = new Audio(activeAudioUrl);
      activeAudio.onended = function () {
        if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = '';
        activeAudio = null;
        hideSpeechStop(token);
      };
      activeAudio.onerror = function () {
        if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = '';
        activeAudio = null;
        if (!speakWithBrowser(text, token)) hideSpeechStop(token);
      };
      return activeAudio.play().catch(function () {
        if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = '';
        activeAudio = null;
        if (!speakWithBrowser(text, token)) hideSpeechStop(token);
      });
    }).catch(function () {
      if (token === speechRequestToken && speechEnabled && !speakWithBrowser(text, token)) {
        hideSpeechStop(token);
      }
    }).finally(function () {
      clearTimeout(timer);
      if (speechAbort === controller) speechAbort = null;
    });
    return true;
  }

  function setVoiceListening(value) {
    listening = value;
    if (input) input.readOnly = value;
    updateVoiceButton();
    paintSend();
  }

  function applyVoiceTranscript(finalText, interimText) {
    var spoken = String(finalText || '').trim();
    var interim = String(interimText || '').trim();
    if (interim) spoken = spoken ? spoken + ' ' + interim : interim;
    if (!spoken) return;
    var joined = voiceBaseText && spoken ? voiceBaseText + ' ' + spoken : spoken;
    var limit = input.maxLength > 0 ? input.maxLength : 500;
    input.value = joined.slice(0, limit);
    input.dispatchEvent(new Event('input'));
    input.focus();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (_error) {}
  }

  if (SpeechRecognitionCtor) {
    try {
      recognition = new SpeechRecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onstart = function () {
        voiceStarting = false;
        voiceBaseText = input.value.trimEnd();
        setVoiceListening(true);
      };
      recognition.onresult = function (event) {
        var finalText = '';
        var interimText = '';
        for (var i = 0; i < event.results.length; i += 1) {
          var result = event.results[i];
          var transcript = result[0] && result[0].transcript ? result[0].transcript : '';
          if (result.isFinal) finalText += transcript;
          else interimText += transcript;
        }
        applyVoiceTranscript(finalText, interimText);
      };
      recognition.onerror = function (event) {
        voiceStarting = false;
        if (event.error === 'aborted') {
          setVoiceListening(false);
          return;
        }
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed' ||
            event.error === 'audio-capture') {
          note(tr('chat.voice.denied', '麦克风权限被拒绝，请在浏览器中允许麦克风后重试。'));
        } else if (event.error === 'no-speech') {
          note(tr('chat.voice.noSpeech', '没有识别到语音，请重试。'));
        } else {
          note(tr('chat.voice.error', '语音识别失败，请重试。'));
        }
        setVoiceListening(false);
      };
      recognition.onend = function () {
        voiceStarting = false;
        setVoiceListening(false);
      };
    } catch (_error) {
      SpeechRecognitionCtor = null;
      recognition = null;
    }
  }

  function startVoiceInput() {
    if (!recognition || pending) return false;
    if (listening || voiceStarting) {
      stopVoiceInput();
      return true;
    }
    stopSpeaking();
    recognition.lang = speechLanguage();
    voiceStarting = true;
    updateVoiceButton();
    paintSend();
    try {
      recognition.start();
      return true;
    } catch (_error) {
      voiceStarting = false;
      updateVoiceButton();
      paintSend();
      note(tr('chat.voice.error', '语音识别失败，请重试。'));
      return false;
    }
  }

  function stopVoiceInput() {
    if (!recognition || (!listening && !voiceStarting)) return;
    voiceStarting = false;
    try { recognition.stop(); } catch (_error) {}
    setVoiceListening(false);
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
    if (!pending) sendButton.disabled = listening || !hasText;
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
    if (value) stopVoiceInput();
    input.disabled = value;
    sendButton.disabled = value || listening || !input.value.trim();
    if (voiceButton) voiceButton.disabled = value;
    composer.setAttribute('aria-busy', value ? 'true' : 'false');
    if (!value) input.focus();
  }

  async function requestReply(text, previous) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 35000);
    try {
      var headers = {'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID()};
      var token = window.intellibotAuth ? window.intellibotAuth.token : '';
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
        try { localStorage.removeItem('intellibot.auth.token'); } catch (_error) {}
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
    stopSpeaking();
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
    stopVoiceInput();
    stopSpeaking();
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
      speakReply(data.reply);
      var commands = commandsFromResponse(data);
      var commandRecord = commands.map(function (command) {
        return command.type + ':' + (command.id || command.preset || '');
      }).join(', ');
      var actionRecord = data.stop ? ' [动作记录：已停止]' : (commands.length ? ' [动作记录：' + commandRecord + ']' : '');
      history = history.concat([
        {role: 'user', content: text},
        {role: 'assistant', content: data.reply.slice(0, 500 - actionRecord.length) + actionRecord},
      ]).slice(-10);
      stateDirty();
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
    if (historyDock) historyDock.classList.toggle('is-open', open);
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
    stopVoiceInput();
    stopSpeaking();
    history = [];
    records = [];
    log.replaceChildren();
    hideStage();
    try { sessionStorage.removeItem(STARTED_KEY); } catch (_error) {}
    if (suggestions) suggestions.hidden = false;
    setHistoryMenu(false);
    syncHistoryActions();
    stateDirty();
    input.focus();
  }

  function exportState() {
    return {
      history: history.slice(-10).map(function (item) {
        return {role: item.role, content: String(item.content || '').slice(0, 500)};
      }),
      records: records.slice(-50).map(function (item) {
        return {
          role: item.role,
          content: String(item.content || '').slice(0, 1000),
          time: item.time,
        };
      }),
    };
  }

  function restoreState(state) {
    if (!state || !Array.isArray(state.records) || !Array.isArray(state.history)) return false;
    restoring = true;
    history = state.history.filter(function (item) {
      return item && (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string';
    }).slice(-10).map(function (item) {
      return {role: item.role, content: item.content.slice(0, 500)};
    });
    records = [];
    log.replaceChildren();
    hideStage();
    state.records.filter(function (item) {
      return item && (item.role === 'user' || item.role === 'ai') &&
        typeof item.content === 'string';
    }).slice(-50).forEach(function (item) {
      addRecord(item.role, item.content.slice(0, 1000), '', {time: Number(item.time) || Date.now()});
    });
    restoring = false;
    welcomeShown = records.length > 0;
    if (records.length) setStarted();
    paintSuggestions();
    syncHistoryActions();
    scrollBottom();
    return true;
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
  if (voiceButton) {
    voiceButton.addEventListener('click', function () { startVoiceInput(); });
  }
  if (speechToggle) {
    speechToggle.addEventListener('click', function () {
      if (!speechSupported) return;
      speechEnabled = !speechEnabled;
      try { localStorage.setItem(SPEECH_KEY, speechEnabled ? '1' : '0'); } catch (_error) {}
      if (!speechEnabled) stopSpeaking();
      refreshSpeechControls();
    });
  }
  if (speechStop) speechStop.addEventListener('click', stopSpeaking);
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
  /* 那一列自己不接指针（中间那条竖带给三维场景留着拖视角），滚轮从
     document 上接管。接管范围分三段：左边一条、右边一条，中间那条留给
     机器人 —— 指针落在中缝里就原样交回去，滚轮只干一件事，
     不会又缩放模型又把聊天记录拖着走。
     中缝宽按列宽取 16%，上限 300（半宽 150），窄屏跟着缩 */
  var GAP_RATIO = 0.16;
  var GAP_HALF_MAX = 150;
  /* 一帧里可能来好几个 wheel，攒成一个数再一次写 scrollTop：
     每次写都会引发一轮滚动与合成，合并掉就少掉好几帧的抖动 */
  var wheelStep = 0;
  var wheelFrame = 0;
  function flushStageWheel(flow) {
    wheelFrame = 0;
    var step = wheelStep;
    wheelStep = 0;
    if (!step) return;
    var max = flow.scrollHeight - flow.clientHeight;
    var next = Math.max(0, Math.min(max, flow.scrollTop + step));
    if (next === flow.scrollTop) return;
    flow.scrollTop = next;
  }
  /* 指针是否落在列矩形之外。滚轮热区、现量与快照两处判定共用这一条 */
  function outsideStage(box, x, y) {
    return y < box.top || y > box.bottom || x < box.left || x > box.right;
  }
  if (stage) document.addEventListener('wheel', function (event) {
    /* 弹窗和左右栏都有自己的滚动容器。它们会覆盖舞台聊天列，但坐标仍可能
       落在背后的列矩形内；先按实际事件目标排除，避免把滚轮送到不可见的聊天列。 */
    if (event.target.closest('.modal, .rail')) return;
    var flow = stageStream();
    if (!flow || flow.scrollHeight <= flow.clientHeight + 4) return;
    /* 栏一打开舞台就整块 visibility:hidden（见 css 那条 body:has(.rail.is-open)），
       它这时候不该再接滚轮。以前只按矩形判，左右栏和聊天列在窄一点的屏上横向重叠，
       指针明明落在栏里的列表上，滚轮却被这层接走并 preventDefault，
       表现就是栏偶尔滑不动 —— 判断依据换成「舞台上不上场」，不是几何 */
    if (document.querySelector('.rail.is-open, .modal[aria-hidden="false"]')) return;
    /* 弹窗和输入区自己滚自己的，别抢 */
    var target = event.target;
    if (target && target.closest && target.closest('.modal, .composer, .model-menu')) return;
    var box = stageRect || flow.getBoundingClientRect();
    /* 竖直方向上压着列的范围才算热区：列上方是顶栏与机器人，下方是输入区，
       指针落在那些地方时不该把整页的滚轮吃掉 */
    if (outsideStage(box, event.clientX, event.clientY)) {
      /* 快照是上次重算时量的，面板或顶栏伸缩后会偏。落在边界外就现量一次再判，
         边界内的事件仍旧走快照，不为此每个事件都拉一次布局 */
      var live = flow.getBoundingClientRect();
      box = { left: live.left, right: live.right, top: live.top, bottom: live.bottom, width: live.width };
      stageRect = box;
      if (outsideStage(box, event.clientX, event.clientY)) return;
    }
    var gap = Math.min(GAP_HALF_MAX, box.width * GAP_RATIO);
    if (Math.abs(event.clientX - (box.left + box.right) / 2) < gap) return;
    /* 已经贴顶还往上推、或者贴底还往下推，这一下本来就滚不动了：
       再 preventDefault 只会让整页也一动不动，读起来就是「卡住」。
       所以到界就放手，把事件原样交还给外层 */
    var delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    if (!delta) return;
    var max = flow.scrollHeight - flow.clientHeight;
    if ((delta < 0 && flow.scrollTop <= 1) || (delta > 0 && flow.scrollTop >= max - 1)) return;
    wheelStep += delta;
    event.preventDefault();
    if (!wheelFrame) {
      wheelFrame = window.requestAnimationFrame(function () { flushStageWheel(flow); });
    }
  }, { passive: false });

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
  document.addEventListener('langchange', function () {
    stopVoiceInput();
    stopSpeaking();
    refreshSpeechControls();
  });
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
  refreshSpeechControls();

  window.intellibotChat = {
    send: send,
    submit: function () { return send(input.value); },
    clear: clear,
    stopActions: stopActions,
    startVoiceInput: startVoiceInput,
    stopVoiceInput: stopVoiceInput,
    stopSpeaking: stopSpeaking,
    getHistory: function () { return history.slice(); },
    exportState: exportState,
    restoreState: restoreState,
    get history() { return history.slice(); },
    get speechEnabled() { return speechEnabled; },
    get listening() { return listening; },
  };
})();
