(function () {
  'use strict';

  var panel = document.querySelector('[data-model-panel]');
  var form = document.querySelector('[data-model-form]');
  var trigger = document.querySelector('[data-model-trigger]');
  var label = document.querySelector('[data-model-label]');
  var effort = document.querySelector('[data-model-effort]');
  var menu = document.querySelector('[data-model-menu]');
  var menuList = document.querySelector('[data-model-menu-list]');
  if (!panel || !form || !trigger || !label || !effort || !menu || !menuList) return;

  var providerInput = form.querySelector('[data-model-provider]');
  var baseInput = form.querySelector('[data-model-base-url]');
  var modelInput = form.querySelector('[data-model-name]');
  var keyInput = form.querySelector('[data-model-key]');
  var statusNode = panel.querySelector('[data-model-status]');
  var note = panel.querySelector('[data-model-note]');
  var saveButton = form.querySelector('[data-model-save]');
  var options = document.querySelector('#model-name-options');
  var presetButtons = Array.prototype.slice.call(form.querySelectorAll('[data-model-preset]'));
  var queryApi = new URLSearchParams(location.search).get('api');
  var API = queryApi ? queryApi.replace(/\/+$/, '') : '/api/v1';
  var HISTORY_KEY = 'intellibot.modelHistory';
  var busy = false;
  var loaded = false;
  var loadError = '';
  statusNode.removeAttribute('data-i18n');
  var LEGACY_MODELS = {
    'deepseek-chat': 'deepseek-flash',
    'deepseek-reasoner': 'deepseek-v4-pro',
  };

  var PRESETS = {
    deepseek: {
      label: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      models: ['deepseek-flash', 'deepseek-v4-pro'],
    },
    openai: {
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
    },
    custom: {
      label: 'OpenAI Compatible',
      baseUrl: '',
      models: [],
    },
  };

  var current = {
    provider: 'deepseek',
    base_url: PRESETS.deepseek.baseUrl,
    model: 'deepseek-flash',
    configured: false,
    key_hint: '',
  };

  function t(key, fallback) {
    return typeof window.t === 'function' ? window.t(key) : fallback;
  }

  function providerName(provider) {
    return (PRESETS[provider] && PRESETS[provider].label) || provider || 'AI';
  }

  function normalizeModel(provider, model) {
    return provider === 'deepseek' && LEGACY_MODELS[model] ? LEGACY_MODELS[model] : model;
  }

  function modelLabel(model) {
    if (model === 'deepseek-flash') return 'DeepSeek Flash';
    if (model === 'deepseek-v4-pro') return 'DeepSeek V4 Pro';
    return model;
  }

  function readHistory() {
    try {
      var value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_error) {
      return {};
    }
  }

  function rememberModel(provider, model) {
    if (!provider || !model) return;
    var history = readHistory();
    var list = Array.isArray(history[provider]) ? history[provider] : [];
    if (!list.includes(model)) list.unshift(model);
    history[provider] = list.slice(0, 8);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (_error) {}
  }

  function modelsFor(provider) {
    var preset = PRESETS[provider] || PRESETS.custom;
    var history = readHistory()[provider];
    var values = preset.models.slice();
    if (Array.isArray(history)) {
      history.forEach(function (model) {
        model = normalizeModel(provider, model);
        if (typeof model === 'string' && !values.includes(model)) values.push(model);
      });
    }
    if (current.provider === provider && current.model && !values.includes(current.model)) {
      values.unshift(current.model);
    }
    return values;
  }

  function setStatus(kind, text) {
    statusNode.className = 'model-view__status ' + (kind ? 'is-' + kind : '');
    statusNode.textContent = text;
  }

  function setNote(text, error) {
    note.textContent = text || t('model.key.local', 'API Key 只保存在本机，不会写入浏览器。');
    note.classList.toggle('is-error', !!error);
  }

  function renderDatalist(provider) {
    options.replaceChildren();
    modelsFor(provider).forEach(function (model) {
      var option = document.createElement('option');
      option.value = model;
      options.appendChild(option);
    });
  }

  function paintPreset(provider, baseUrl, model) {
    presetButtons.forEach(function (button) {
      var on = button.dataset.provider === provider &&
        button.dataset.baseUrl === baseUrl &&
        button.dataset.prefillModel === model;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderMenu() {
    menuList.replaceChildren();
    var models = modelsFor(current.provider);
    if (!models.length) models = [current.model || ''].filter(Boolean);
    models.forEach(function (model) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'model-menu__item';
      item.dataset.modelChoice = model;
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(model === current.model));
      if (model === current.model) item.classList.add('is-on');

      var name = document.createElement('span');
      name.className = 'model-menu__name';
      name.textContent = modelLabel(model);

      var check = document.createElement('span');
      check.className = 'model-menu__check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';

      item.setAttribute('aria-label', model);
      item.append(name, check);
      menuList.appendChild(item);
    });
  }

  function paint(config) {
    loaded = true;
    loadError = '';
    current = {
      provider: config.provider || 'custom',
      base_url: config.base_url || '',
      model: normalizeModel(config.provider || 'custom', config.model || ''),
      configured: !!config.configured,
      key_hint: config.key_hint || '',
    };
    providerInput.value = PRESETS[current.provider] ? current.provider : 'custom';
    baseInput.value = current.base_url;
    modelInput.value = current.model;
    keyInput.value = '';
    keyInput.placeholder = current.configured
      ? (current.key_hint || '••••••••') + ' · ' + t('model.key.optional', 'Leave blank to keep')
      : 'sk-…';
    renderDatalist(current.provider);
    renderMenu();
    label.textContent = modelLabel(current.model) || t('model.choose', '选择模型');
    effort.hidden = current.configured;
    effort.removeAttribute('data-i18n');
    effort.textContent = t('model.status.unconfigured', '未配置');
    trigger.title = providerName(current.provider) + ' · ' + current.model +
      (current.configured ? '' : ' · ' + t('model.status.unconfigured', '未配置'));
    trigger.classList.toggle('is-ready', current.configured);
    trigger.setAttribute('aria-label', trigger.title);
    paintPreset(current.provider, current.base_url, current.model);
    setStatus(
      current.configured ? 'ready' : 'idle',
      current.configured ? t('model.status.ready', '已连接') : t('model.status.unconfigured', '未配置')
    );
    document.dispatchEvent(new CustomEvent('ai-model-change', { detail: current }));
  }

  async function request(method, body) {
    var response = await fetch(API + '/ai/config', {
      method: method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    var payload = null;
    try { payload = await response.json(); } catch (_error) {}
    if (!response.ok || (payload && payload.error)) {
      throw new Error(payload && payload.error && payload.error.message
        ? payload.error.message
        : '模型配置请求失败');
    }
    return payload && payload.data ? payload.data : payload;
  }

  async function load() {
    setStatus('loading', t('model.status.loading', '正在读取'));
    try {
      paint(await request('GET'));
      setNote('');
    } catch (error) {
      loadError = error.message;
      label.textContent = t('model.status.offline', '服务未启动');
      trigger.title = error.message;
      setStatus('error', t('model.status.offline', '服务未启动'));
      setNote(error.message, true);
    }
  }

  async function save(patch, successText) {
    if (busy) return false;
    busy = true;
    trigger.disabled = true;
    trigger.setAttribute('aria-busy', 'true');
    label.textContent = t('model.status.saving', '正在应用');
    saveButton.disabled = true;
    setStatus('loading', t('model.status.saving', '正在应用'));
    try {
      var data = await request('PUT', patch);
      paint(data);
      rememberModel(data.provider, data.model);
      setNote(successText || t('model.saved', '模型配置已同步到对话'));
      return true;
    } catch (error) {
      paint(current);
      effort.hidden = false;
      effort.textContent = t('model.status.error', '保存失败');
      trigger.title = error.message;
      setStatus('error', t('model.status.error', '保存失败'));
      setNote(error.message, true);
      // Keep the menu open so a failed switch is visible next to the composer.
      openMenu();
      return false;
    } finally {
      busy = false;
      trigger.disabled = false;
      trigger.removeAttribute('aria-busy');
      saveButton.disabled = false;
    }
  }

  function closeMenu() {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    renderMenu();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  }

  providerInput.addEventListener('change', function () {
    var provider = providerInput.value;
    var preset = PRESETS[provider] || PRESETS.custom;
    if (preset.baseUrl) baseInput.value = preset.baseUrl;
    if (preset.models.length) modelInput.value = preset.models[0];
    renderDatalist(provider);
  });

  presetButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      providerInput.value = button.dataset.provider || 'custom';
      baseInput.value = button.dataset.baseUrl || '';
      modelInput.value = button.dataset.prefillModel || '';
      renderDatalist(providerInput.value);
      paintPreset(providerInput.value, baseInput.value, modelInput.value);
      setStatus('idle', t('model.status.preset', '待保存'));
      setNote(t('model.preset.filled', '已填入预设，补全 API Key 后保存即可。'));
      if (!baseInput.value) baseInput.focus();
      else if (!modelInput.value) modelInput.focus();
      else keyInput.focus();
    });
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var provider = providerInput.value;
    var baseUrl = baseInput.value.trim();
    var model = modelInput.value.trim();
    if (!baseUrl || !model) {
      setStatus('error', t('model.status.error', '保存失败'));
      setNote(t('model.required', 'API 地址和模型名称不能为空。'), true);
      return;
    }
    var patch = { provider: provider, base_url: baseUrl, model: model };
    if (keyInput.value.trim()) patch.api_key = keyInput.value.trim();
    if (await save(patch)) keyInput.value = '';
  });

  trigger.addEventListener('click', function () {
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  menu.addEventListener('click', async function (event) {
    var choice = event.target.closest('[data-model-choice]');
    if (choice) {
      var model = choice.dataset.modelChoice;
      closeMenu();
      if (model === current.model && current.configured) return;
      await save({
        provider: current.provider,
        base_url: current.base_url,
        model: model,
      }, t('model.switched', '已切换模型'));
      return;
    }
    if (event.target.closest('[data-model-manage]')) {
      closeMenu();
      var button = document.querySelector('.rail--left .item[data-panel="Model"]');
      if (button) button.click();
    }
  });

  document.addEventListener('pointerdown', function (event) {
    if (menu.hidden || event.target.closest('.composer__model, [data-model-menu]')) return;
    closeMenu();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu();
      trigger.focus();
    }
  });
  document.addEventListener('langchange', function () {
    if (loaded) paint(current);
    else if (loadError) {
      label.textContent = t('model.status.offline', '服务未启动');
      setStatus('error', t('model.status.offline', '服务未启动'));
      setNote(loadError, true);
      return;
    }
    setNote('');
  });

  window.intellibotModels = {
    refresh: load,
    get current() { return Object.assign({}, current); },
    setModel: function (model) {
      return save({ provider: current.provider, base_url: current.base_url, model: model });
    },
  };

  load();
})();
