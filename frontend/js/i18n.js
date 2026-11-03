/* IntelliBot 国际化引擎：纯原生 JS，无依赖。
 * 用法：HTML 元素加 data-i18n="key"，JS 里调用 t('key')。
 * 新增语言只需在 I18N 里加一组字典，页面文字自动跟随。 */

const I18N = {
  en: {
    "nav.camera": "Camera",
    "nav.modal": "Modal",
    "nav.view": "Adjust View",
    "nav.preference": "Preference",
    "nav.advance": "Advance",
    "nav.settings": "Settings",
    "nav.privacy": "Privacy",
    "nav.contact": "Contact",

    "rail.left.pinned": "Pinned",
    "rail.left.action": "Action",
    "rail.left.dialog": "Dialog",
    "rail.left.tendance": "Tendance",
    "rail.left.model": "Models",
    "rail.left.skin": "Skins",
    "rail.left.edit": "Edit",
    "rail.left.empty": "No saved cards",
    "rail.left.empty.hint": "Click the pin button on action / dialogue / care cards to add",
    "rail.left.type": "Type",
    "rail.left.name": "Name",
    "rail.left.intro": "Intro",
    "rail.left.name.ph": "Enter…",
    "rail.left.intro.ph": "Enter…",
    "rail.left.reset": "Reset",
    "rail.left.add": "Add",
    "rail.left.group.action": "Action",
    "rail.left.group.dialog": "Dialog",
    "rail.left.group.tendance": "Tendance",
    "rail.left.brief": "Brief Intro",
    "rail.left.duration": "Expected Duration(s)",
    "rail.left.card.chacha": "cha-cha",
    "rail.left.card.chacha.brief": "Cha-cha basic step",
    "rail.left.card.dance": "Dance",
    "rail.left.card.dance.brief": "Sway on the beat",
    "rail.left.skin.hint": "Choose a robot look or import your own model.",
    "rail.left.skin.q1": "Original",
    "rail.left.skin.figure": "Figure",
    "rail.left.skin.import": "Import",
    "rail.left.skin.delete": "Delete current import",
    "model.provider": "Provider",
    "model.provider.custom": "Custom / OpenAI compatible",
    "model.baseUrl": "API URL",
    "model.model": "Model",
    "model.apiKey": "API Key",
    "model.key.local": "The API key is stored only on this device, never in the browser.",
    "model.key.optional": "Leave blank to keep",
    "model.save": "Save and apply",
    "model.switch": "Switch model",
    "model.manage": "Manage API and models",
    "model.choose": "Choose model",
    "model.status.loading": "Loading",
    "model.status.ready": "Connected",
    "model.status.unconfigured": "Not configured",
    "model.status.offline": "Service offline",
    "model.status.saving": "Applying",
    "model.status.error": "Error",
    "model.required": "API URL and model name are required.",
    "model.saved": "Model settings synced to chat.",
    "model.switched": "Model switched.",
    "model.desc.deepseekFlash": "Fast and cost-efficient for daily chat and motion understanding",
    "model.desc.deepseekV4Pro": "Stronger overall ability for complex instructions and longer conversations",
    "model.desc.custom": "Custom model",

    "rail.right.chat": "Chat",
    "rail.right.log": "Log",
    "rail.right.message": "Message",
    "rail.right.reset": "Reset",

    "chat.placeholder": "Ask IntelliBot…",
    "chat.ask": "Ask IntelliBot",
    "chat.send": "Send",
    "chat.openHistory": "Open full chat history",
    "chat.example.intro": "Introduce yourself",
    "chat.example.motion": "Wave to me, then perform a street dance",
    "chat.welcome": "Hi, I'm IntelliBot. It's great to meet you! Want to see what I can do?",
    "chat.thinking": "Thinking…",
    "chat.status.ready": "Ready",
    "chat.status.failed": "Request failed",
    "chat.stop": "Stop motion",
    "chat.clear": "Clear",

    "dock.motions": "Motions",
    "dock.emotions": "Emotions",

    "hud.ready": "Ready",

    "modal.preference.title": "Preference",
    "modal.preference.available": "3 available",
    "modal.advance.title": "Advance",
    "modal.advance.sub": "MuJoCo simulation",
    "modal.privacy.title": "Privacy",
    "modal.privacy.sub": "Privacy Policy",

    "sim.connect_btn": "Connect Sim",
    "sim.connected": "Connected",
    "sim.disconnect": "Disconnect",
    "sim.empty": "Please connect to simulation first",
    "sim.speed": "Speed",
    "sim.tab.arm": "Arm",
    "sim.tab.waist": "Waist",
    "sim.tab.leg": "Leg",
    "sim.tab.link": "Link",
    "sim.row.posture": "Posture",
    "sim.row.gesture": "Gesture",
    "sim.row.gait": "Gait",
    "sim.mode.dynamic": "Dynamic Mode",
    "sim.mode.kinematic": "Kinematic Mode",
    "sim.reset_pose": "Reset Pose",
    "sim.reset_cam": "Reset View",
    "sim.turn_left": "Turn Left",
    "sim.turn_right": "Turn Right",
    "sim.stop": "Stop",
    "sim.save_frame": "Save Frame",
    "sim.hint": "Start sim/mujoco_bridge.py first, then click Connect Sim.",

    "sim.stat.t": "Time",
    "sim.stat.mode": "Mode",
    "sim.stat.step": "Steps",
    "sim.stat.contacts": "Contacts",
    "sim.stat.speed": "Speed",
    "sim.stat.gesture": "Gesture",
    "sim.stat.gait": "Gait",
    "sim.stat.body": "Height",
    "sim.stat.cam": "Camera",
    "sim.stat.latency": "Latency",

    "settings.title": "Settings",
    "settings.appearance": "Appearance",
    "settings.mode": "Mode",
    "settings.mode.day": "Day",
    "settings.mode.night": "Night",
    "settings.background": "Background",
    "settings.bg.plain": "Plain",
    "settings.bg.magnet": "Magnet",
    "settings.bg.wave": "Wave",
    "settings.language": "Language",
    "settings.lang.en": "English",
    "settings.lang.zh": "简体中文",
    "settings.robot": "Robot",
    "settings.robot.body": "Body",
    "settings.robot.head": "Head",
    "settings.defaultView": "Default view",
    "settings.defaultView.front": "Front",
    "settings.defaultView.current": "Use current",
  },

  zh: {
    "nav.camera": "相机",
    "nav.modal": "模态",
    "nav.view": "视角调整",
    "nav.preference": "偏好",
    "nav.advance": "高级",
    "nav.settings": "设置",
    "nav.privacy": "隐私",
    "nav.contact": "联系",

    "rail.left.pinned": "已标记",
    "rail.left.action": "动作",
    "rail.left.dialog": "对话",
    "rail.left.tendance": "趋势",
    "rail.left.model": "模型",
    "rail.left.skin": "换皮",
    "rail.left.edit": "编辑",
    "rail.left.empty": "暂无已标记卡片",
    "rail.left.empty.hint": "请点击 动作 / 对话 / 趋势类卡片左下角的标记按钮以添加",
    "rail.left.type": "类型",
    "rail.left.name": "名称",
    "rail.left.intro": "简介",
    "rail.left.name.ph": "请输入…",
    "rail.left.intro.ph": "请输入…",
    "rail.left.reset": "重置",
    "rail.left.add": "添加",
    "rail.left.group.action": "动作",
    "rail.left.group.dialog": "对话",
    "rail.left.group.tendance": "趋势",
    "rail.left.brief": "简介",
    "rail.left.duration": "预计时长(秒)",
    "rail.left.card.chacha": "cha-cha",
    "rail.left.card.chacha.brief": "恰恰基本步",
    "rail.left.card.dance": "舞动",
    "rail.left.card.dance.brief": "随节拍摆动",
    "rail.left.skin.hint": "选择一个机器人外观，或导入自己的模型。",
    "rail.left.skin.q1": "原模型",
    "rail.left.skin.figure": "示意人形",
    "rail.left.skin.import": "导入",
    "rail.left.skin.delete": "删除当前导入",
    "model.provider": "服务商",
    "model.provider.custom": "自定义 / OpenAI 兼容",
    "model.baseUrl": "API 地址",
    "model.model": "模型",
    "model.apiKey": "API Key",
    "model.key.local": "API Key 只保存在本机，不会写入浏览器。",
    "model.key.optional": "留空保持不变",
    "model.save": "保存并应用",
    "model.switch": "切换模型",
    "model.manage": "管理 API 与模型",
    "model.choose": "选择模型",
    "model.status.loading": "正在读取",
    "model.status.ready": "已连接",
    "model.status.unconfigured": "未配置",
    "model.status.offline": "服务未启动",
    "model.status.saving": "正在应用",
    "model.status.error": "错误",
    "model.required": "API 地址和模型名称不能为空。",
    "model.saved": "模型配置已同步到对话。",
    "model.switched": "已切换模型。",
    "model.desc.deepseekFlash": "响应快、成本较低，适合日常对话和机器人动作理解",
    "model.desc.deepseekV4Pro": "综合能力更强，适合复杂指令和较长对话",
    "model.desc.custom": "自定义模型",

    "rail.right.chat": "聊天",
    "rail.right.log": "日志",
    "rail.right.message": "消息",
    "rail.right.reset": "重置",

    "chat.placeholder": "问问 IntelliBot…",
    "chat.ask": "向 IntelliBot 提问",
    "chat.send": "发送",
    "chat.openHistory": "打开完整聊天记录",
    "chat.example.intro": "介绍一下你自己",
    "chat.example.motion": "向我挥手，然后跳一支街舞",
    "chat.welcome": "你好，我是 IntelliBot，很高兴见到你！想看看我能做什么吗？",
    "chat.thinking": "正在思考…",
    "chat.status.ready": "待命",
    "chat.status.failed": "请求失败",
    "chat.stop": "停止动作",
    "chat.clear": "清空",

    "dock.motions": "动作",
    "dock.emotions": "表情",

    "hud.ready": "就绪",

    "modal.preference.title": "偏好",
    "modal.preference.available": "3 台可用",
    "modal.advance.title": "高级",
    "modal.advance.sub": "MuJoCo 仿真",
    "modal.privacy.title": "隐私",
    "modal.privacy.sub": "隐私政策",

    "sim.connect_btn": "连接仿真",
    "sim.connected": "已连接",
    "sim.disconnect": "断连",
    "sim.empty": "请先连接仿真",
    "sim.speed": "速度",
    "sim.tab.arm": "手臂",
    "sim.tab.waist": "腰",
    "sim.tab.leg": "腿",
    "sim.tab.link": "联动",
    "sim.row.posture": "姿态",
    "sim.row.gesture": "动作",
    "sim.row.gait": "步态",
    "sim.mode.dynamic": "动力学模式",
    "sim.mode.kinematic": "运动学模式",
    "sim.reset_pose": "重置姿态",
    "sim.reset_cam": "重置视角",
    "sim.turn_left": "左转",
    "sim.turn_right": "右转",
    "sim.stop": "停止",
    "sim.save_frame": "保存当前帧",
    "sim.hint": "先启动 sim/mujoco_bridge.py，再点连接仿真。",

    "sim.stat.t": "运行",
    "sim.stat.mode": "模式",
    "sim.stat.step": "步数",
    "sim.stat.contacts": "触点",
    "sim.stat.speed": "速度",
    "sim.stat.gesture": "动作",
    "sim.stat.gait": "步态",
    "sim.stat.body": "机身",
    "sim.stat.cam": "视角",
    "sim.stat.latency": "延迟",

    "settings.title": "设置",
    "settings.appearance": "外观",
    "settings.mode": "模式",
    "settings.mode.day": "浅色",
    "settings.mode.night": "深色",
    "settings.background": "背景",
    "settings.bg.plain": "纯色",
    "settings.bg.magnet": "磁吸",
    "settings.bg.wave": "波浪",
    "settings.language": "语言",
    "settings.lang.en": "English",
    "settings.lang.zh": "简体中文",
    "settings.robot": "机器人",
    "settings.robot.body": "上半身",
    "settings.robot.head": "头部",
    "settings.defaultView": "默认视角",
    "settings.defaultView.front": "正面",
    "settings.defaultView.current": "使用当前视角",
  },
};

const I18N_KEY = "intellibot.lang";

function getLang() {
  try {
    const v = localStorage.getItem(I18N_KEY);
    if (v === "zh" || v === "en") return v;
  } catch (e) {}
  return "en";
}

function t(key) {
  const lang = getLang();
  if (I18N[lang] && I18N[lang][key] !== undefined) return I18N[lang][key];
  if (I18N.en && I18N.en[key] !== undefined) return I18N.en[key];
  return key;
}

function applyLang(lang) {
  try { localStorage.setItem(I18N_KEY, lang); } catch (e) {}
  document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", t(key));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    el.setAttribute("aria-label", t(key));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    el.setAttribute("title", t(key));
  });
  document.querySelectorAll("[data-lang]").forEach((b) => {
    const on = b.getAttribute("data-lang") === lang;
    b.classList.toggle("is-sel", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });
  document.dispatchEvent(new CustomEvent("langchange", { detail: { lang } }));
}

document.addEventListener("DOMContentLoaded", () => {
  applyLang(getLang());

  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-lang");
      document.querySelectorAll("[data-lang]").forEach((b) => b.classList.remove("is-sel"));
      btn.classList.add("is-sel");
      applyLang(lang);
    });
  });
});
