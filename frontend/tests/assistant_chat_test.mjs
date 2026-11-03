import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';


class ClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  toggle(value, force) {
    const on = force === undefined ? !this.values.has(value) : force;
    if (on) this.values.add(value); else this.values.delete(value);
  }
}


class Node {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.classList = new ClassList();
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.dataset = {};
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.parent = null;
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    this.scrollHeight = this.children.length;
  }

  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
  }

  replaceChildren() { this.children = []; }

  addEventListener(name, callback) { this.listeners[name] = callback; }
  dispatchEvent(event) { if (this.listeners[event.type]) return this.listeners[event.type](event); }
  setAttribute(name, value) { this[name] = value; }
  focus() {}
}


const composer = new Node();
const panel = new Node();
const log = new Node();
const input = new Node();
const sendButton = new Node();
const clearButton = new Node();
const stopButton = new Node();
const status = new Node();
panel.querySelector = selector => ({
  '[data-assistant-log]': log,
  '[data-assistant-clear]': clearButton,
  '[data-assistant-stop]': stopButton,
  '[data-assistant-status]': status,
  '[data-chat-suggestions]': null,
})[selector];
composer.querySelector = selector => ({
  '[data-assistant-chat]': panel,
  '[data-assistant-log]': log,
  '[data-assistant-input]': input,
  '[data-assistant-send]': sendButton,
  '[data-assistant-clear]': clearButton,
  '[data-assistant-stop]': stopButton,
  '[data-assistant-status]': status,
})[selector];

globalThis.document = {
  querySelector: selector => selector === '.composer' ? composer :
    (selector === '[data-assistant-chat]' ? panel : null),
  createElement: () => new Node(),
};
globalThis.location = {search: ''};
globalThis.sessionStorage = {getItem() { return null; }, setItem() {}, removeItem() {}};
globalThis.requestAnimationFrame = callback => callback();
globalThis.Event = class { constructor(type) { this.type = type; } };
globalThis.window = {
  addEventListener() {},
  matchMedia: () => ({matches: false}),
  robot3d: {
    ready: true,
    played: [],
    stopped: 0,
    getGestureInfo(id) {
      return ['salute', 'wave'].includes(id) ? {id, label: id, duration: 0} : null;
    },
    playGesture(id) {
      if (!['salute', 'wave'].includes(id)) return false;
      this.played.push(id);
      return true;
    },
    stopGesture() { this.stopped += 1; },
  },
};

let fetchCalls = 0;
let releaseFetch;
globalThis.fetch = () => {
  fetchCalls += 1;
  return new Promise(resolve => {
    releaseFetch = () => resolve({
      ok: true,
      json: async () => ({
        data: {
          reply: '当然可以。',
          action_id: 'salute',
          actions: ['salute'],
          stop: false,
          model: 'deepseek-flash',
        },
        error: null,
      }),
    });
  });
};

const source = fs.readFileSync(new URL('../js/assistant_chat.js', import.meta.url), 'utf8');
vm.runInThisContext(source, {filename: 'assistant_chat.js'});

input.value = '换行';
input.listeners.keydown({key: 'Enter', shiftKey: true, isComposing: false, preventDefault() {}});
assert.equal(fetchCalls, 0, 'Shift+Enter should not submit');

input.value = '拼音输入中';
input.listeners.keydown({key: 'Enter', shiftKey: false, isComposing: true, preventDefault() {}});
assert.equal(fetchCalls, 0, 'IME composition should not submit');

input.value = '请敬礼';
const first = window.intellibotChat.submit();
input.value = '重复提交';
const duplicate = window.intellibotChat.submit();
assert.equal(fetchCalls, 1, 'pending requests should block duplicate submits');
releaseFetch();
await Promise.all([first, duplicate]);
assert.deepEqual(window.robot3d.played, ['salute']);
assert.equal(window.intellibotChat.history.length, 2);

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({data: {reply: '不执行未知动作。', action_id: 'backflip', model: 'deepseek-flash'}, error: null}),
});
input.value = '后空翻';
await window.intellibotChat.submit();
assert.deepEqual(window.robot3d.played, ['salute']);
assert.equal(log.children.at(-1).textContent, '动作未播放：backflip 不在主页白名单中');

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    data: {reply: '依次执行。', actions: ['wave', 'salute'], stop: false, model: 'deepseek-flash'},
    error: null,
  }),
});
input.value = '先挥手，再敬礼';
await window.intellibotChat.submit();
await new Promise(resolve => setTimeout(resolve, 350));
assert.deepEqual(window.robot3d.played, ['salute', 'wave', 'salute']);

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({data: {reply: '已停止。', actions: [], stop: true, model: 'deepseek-flash'}, error: null}),
});
input.value = '停止动作';
await window.intellibotChat.submit();
assert.equal(status.textContent, '已按指令停止');
assert.ok(window.robot3d.stopped >= 1);

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({data: {reply: '收到。', action_id: null, model: 'deepseek-flash'}, error: null}),
});
for (let index = 0; index < 6; index += 1) {
  input.value = '消息 ' + index;
  await window.intellibotChat.submit();
}
assert.equal(window.intellibotChat.history.length, 10, 'history should retain at most ten messages');

clearButton.dispatchEvent(new Event('click'));
assert.equal(window.intellibotChat.history.length, 0);
assert.equal(log.children.length, 0);

console.log('PASS: chat controls, action sequence, stop command, validation, history limit');
