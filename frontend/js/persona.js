/* AI 角色预设：内置角色负责快速开始，自定义角色与当前选择保存在浏览器本地。
   角色设定只影响表达方式；动作白名单和 JSON 输出约束仍由本地 AI 服务控制。 */
(function () {
  'use strict';

  var panel = document.querySelector('[data-persona-view]');
  if (!panel) return;

  var list = panel.querySelector('[data-persona-list]');
  var form = panel.querySelector('[data-persona-form]');
  var status = panel.querySelector('[data-persona-status]');
  var newButton = panel.querySelector('[data-persona-new]');
  var nameInput = form.querySelector('[data-persona-name]');
  var styleInput = form.querySelector('[data-persona-style]');
  var colorInput = form.querySelector('[data-persona-color]');
  var initialsInput = form.querySelector('[data-persona-initials]');
  var promptInput = form.querySelector('[data-persona-prompt]');
  var note = panel.querySelector('[data-persona-note]');
  var deleteButton = form.querySelector('[data-persona-delete]');
  var previewAvatar = panel.querySelector('[data-persona-preview-avatar]');
  var previewName = panel.querySelector('[data-persona-preview-name]');
  var previewStyle = panel.querySelector('[data-persona-preview-style]');
  var previewDot = panel.querySelector('[data-persona-preview-dot]');
  var PREFS_KEY = 'intellibot:personas';
  var ACTIVE_KEY = 'intellibot:persona';

  var DEFAULTS = [
    {
      id: 'builtin:companion',
      name: 'IntelliBot',
      nameZh: 'IntelliBot',
      style: 'Warm and thoughtful',
      styleZh: '温柔知性',
      color: '#91d2c3',
      initials: 'IB',
      prompt: '你是一位温柔知性的陪伴者。先理解用户的情绪和处境，再给出清晰、可执行的建议。语气自然亲切，不评判用户，也不使用居高临下的表达；普通问候保持简洁，需要解释时再逐步展开。'
    },
    {
      id: 'builtin:mentor',
      name: 'Study Partner',
      nameZh: '学习搭档',
      style: 'Patient and structured',
      styleZh: '耐心清晰',
      color: '#6d8fc9',
      initials: '学',
      prompt: '你是一位耐心的学习搭档。先判断用户卡在哪一步，再用生活化类比和分步骤讲解帮助理解。避免一次堆太多信息，每轮优先解决一个小问题，并在结尾给出一个可马上练习或思考的小步骤。'
    },
    {
      id: 'builtin:creative',
      name: 'Idea Director',
      nameZh: '灵感导演',
      style: 'Curious and imaginative',
      styleZh: '好奇心与想象力',
      color: '#c86482',
      initials: '想',
      prompt: '你是一位富有想象力的创意搭档。回答时先抓住用户真正想表达的核心，再从不同角度提供新鲜但可落地的想法。可以大胆联想，但要明确区分灵感、假设和事实，并主动指出下一步最容易验证的方向。'
    },
    {
      id: 'builtin:advisor',
      name: 'Calm Advisor',
      nameZh: '冷静顾问',
      style: 'Concise and evidence-led',
      styleZh: '简洁理性',
      color: '#6e9182',
      initials: '析',
      prompt: '你是一位冷静、务实的顾问。优先给出结论，再说明关键依据、风险和取舍。信息不足时明确指出假设，不为了显得确定而编造事实。语言简洁，但不要冷淡，重要建议要能直接执行。'
    }
  ];

  function lang() {
    return typeof window.getLang === 'function' && window.getLang() === 'zh' ? 'zh' : 'en';
  }

  function displayName(persona) {
    return lang() === 'zh' ? (persona.nameZh || persona.name) : (persona.name || persona.nameZh);
  }

  function displayStyle(persona) {
    return lang() === 'zh' ? (persona.styleZh || persona.style) : (persona.style || persona.styleZh);
  }

  function readCustom() {
    try {
      var value = JSON.parse(localStorage.getItem(PREFS_KEY) || '[]');
      if (!Array.isArray(value)) return [];
      return value.filter(function (item) {
        return item && typeof item.id === 'string' && item.id.indexOf('custom:') === 0 &&
          typeof item.name === 'string' && typeof item.prompt === 'string';
      }).slice(0, 24);
    } catch (_error) {
      return [];
    }
  }

  function saveCustom() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(custom)); } catch (_error) {}
  }

  function readActiveId() {
    try { return localStorage.getItem(ACTIVE_KEY) || DEFAULTS[0].id; }
    catch (_error) { return DEFAULTS[0].id; }
  }

  function saveActiveId(id) {
    try { localStorage.setItem(ACTIVE_KEY, id); } catch (_error) {}
  }

  function all() { return DEFAULTS.concat(custom); }

  function byId(id) {
    return all().find(function (item) { return item.id === id; }) || null;
  }

  var custom = readCustom();
  var selectedId = readActiveId();
  if (!byId(selectedId)) selectedId = DEFAULTS[0].id;
  var editing = byId(selectedId);
  var editingCustom = !!(editing && editing.id.indexOf('custom:') === 0);

  function setNote(text, error) {
    note.textContent = text;
    note.classList.toggle('is-error', !!error);
  }

  function paintPreview(persona) {
    var color = persona.color || '#91d2c3';
    var initials = (persona.initials || displayName(persona).slice(0, 2) || 'AI').slice(0, 3);
    previewAvatar.textContent = initials;
    previewName.textContent = displayName(persona) || 'AI';
    previewStyle.textContent = displayStyle(persona) || '';
    previewAvatar.style.background = color;
    previewDot.style.background = color;
  }

  function fillForm(persona) {
    editing = persona;
    editingCustom = persona.id.indexOf('custom:') === 0;
    nameInput.value = persona.name || '';
    styleInput.value = persona.style || '';
    colorInput.value = /^#[0-9a-f]{6}$/i.test(persona.color || '') ? persona.color : '#91d2c3';
    initialsInput.value = (persona.initials || '').slice(0, 3);
    promptInput.value = persona.prompt || '';
    deleteButton.hidden = !editingCustom || !byId(persona.id);
    paintPreview(persona);
    status.textContent = editingCustom
      ? (typeof t === 'function' ? t('persona.custom') : '自定义角色')
      : (typeof t === 'function' ? t('persona.builtin') : '内置预设');
  }

  function paintList() {
    list.replaceChildren();
    all().forEach(function (persona) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'persona-card';
      button.dataset.personaId = persona.id;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(persona.id === selectedId));
      button.style.setProperty('--persona-color', persona.color || '#91d2c3');
      button.classList.toggle('is-on', persona.id === selectedId);
      button.classList.toggle('is-custom', persona.id.indexOf('custom:') === 0);

      var avatar = document.createElement('span');
      avatar.className = 'persona-card__avatar';
      avatar.textContent = (persona.initials || displayName(persona).slice(0, 2) || 'AI').slice(0, 3);
      var copy = document.createElement('span');
      copy.className = 'persona-card__copy';
      var name = document.createElement('strong');
      name.textContent = displayName(persona);
      var style = document.createElement('span');
      style.textContent = displayStyle(persona);
      copy.append(name, style);
      button.append(avatar, copy);
      button.addEventListener('click', function () {
        select(persona.id);
      });
      list.appendChild(button);
    });
  }

  function paintActive() {
    var active = byId(selectedId) || DEFAULTS[0];
    document.querySelectorAll('[data-chat-persona]').forEach(function (node) {
      node.textContent = displayName(active);
      node.style.setProperty('--persona-color', active.color || '#91d2c3');
    });
    fillForm(active);
    paintList();
  }

  function emitChange() {
    var active = byId(selectedId) || DEFAULTS[0];
    document.dispatchEvent(new CustomEvent('persona-change', {
      detail: {
        id: active.id,
        name: displayName(active),
        style: displayStyle(active),
        color: active.color || '#91d2c3',
        prompt: active.prompt || ''
      }
    }));
  }

  function select(id) {
    if (!byId(id)) return;
    selectedId = id;
    saveActiveId(id);
    paintActive();
    setNote(typeof t === 'function' ? t('persona.useNote') : '已切换，下一条消息会使用这个角色。');
    emitChange();
  }

  function previewFromInputs() {
    fillForm({
      id: editing.id,
      name: nameInput.value,
      style: styleInput.value,
      color: colorInput.value,
      initials: initialsInput.value,
      prompt: promptInput.value
    });
    deleteButton.hidden = !editingCustom || !byId(editing.id);
  }

  form.addEventListener('input', function (event) {
    if (event.target === nameInput || event.target === styleInput ||
        event.target === colorInput || event.target === initialsInput ||
        event.target === promptInput) {
      previewFromInputs();
      setNote('');
    }
  });

  newButton.addEventListener('click', function () {
    editingCustom = true;
    fillForm({
      id: 'custom:' + Date.now(),
      name: '',
      style: '',
      color: '#91d2c3',
      initials: '',
      prompt: ''
    });
    deleteButton.hidden = true;
    setNote(typeof t === 'function' ? t('persona.newNote') : '填写角色设定后保存，就会出现在这里的角色列表中。');
    nameInput.focus();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var name = nameInput.value.trim();
    var prompt = promptInput.value.trim();
    if (!name || !prompt) {
      setNote(typeof t === 'function' ? t('persona.required') : '角色名称和角色设定不能为空。', true);
      (!name ? nameInput : promptInput).focus();
      return;
    }

    var id = editing.id;
    if (id.indexOf('custom:') !== 0) id = 'custom:' + Date.now();
    var record = {
      id: id,
      name: name,
      style: styleInput.value.trim() || 'Custom style',
      color: colorInput.value || '#91d2c3',
      initials: (initialsInput.value.trim() || name.slice(0, 2)).slice(0, 3),
      prompt: prompt
    };
    var existing = custom.findIndex(function (item) { return item.id === id; });
    if (existing >= 0) custom[existing] = record;
    else custom.unshift(record);
    custom = custom.slice(0, 24);
    selectedId = id;
    saveCustom();
    saveActiveId(id);
    paintActive();
    setNote(typeof t === 'function' ? t('persona.saved') : '角色已保存在本机，并设为当前角色。');
    emitChange();
  });

  deleteButton.addEventListener('click', function () {
    if (editing.id.indexOf('custom:') !== 0) return;
    var active = editing;
    if (!confirm((typeof t === 'function' ? t('persona.deleteAsk') : '删除这个自定义角色？') + ' ' + displayName(active))) return;
    custom = custom.filter(function (item) { return item.id !== active.id; });
    saveCustom();
    selectedId = DEFAULTS[0].id;
    saveActiveId(selectedId);
    paintActive();
    setNote(typeof t === 'function' ? t('persona.deleted') : '自定义角色已删除。');
    emitChange();
  });

  document.addEventListener('langchange', function () {
    paintActive();
  });

  window.intellibotPersona = {
    get active() {
      var active = byId(selectedId) || DEFAULTS[0];
      return {
        id: active.id,
        name: displayName(active),
        style: displayStyle(active),
        color: active.color || '#91d2c3',
        prompt: active.prompt || ''
      };
    },
    select: select
  };

  paintActive();
  emitChange();
})();
