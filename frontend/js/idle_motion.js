// Shared idle rhythm. No timers or animation clips compete with gesture playback.
const KEY = 'intellibot.idle.enabled';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== '0'; } catch (_) {}
let lastActivity = performance.now(), phase = 0, weight = 0, last = performance.now();
let state = {enabled, active: false, kind: 'rest', offsets: {}};
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function activity() { lastActivity = performance.now(); }
['pointerdown', 'keydown', 'wheel'].forEach(type =>
  document.addEventListener(type, activity, {passive: true, capture: true}));
document.addEventListener('visibilitychange', () => { activity(); weight = 0; state = {...state, active: false, offsets: {}}; });
reduced.addEventListener('change', () => { activity(); weight = 0; state = {...state, active: false, offsets: {}}; });
export function setIdleEnabled(value) {
  enabled = !!value; activity();
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (_) {}
  paint();
}
function paint() {
  document.querySelectorAll('[data-idle-enabled]').forEach(button => {
    const selected = (button.dataset.idleEnabled === 'true') === enabled;
    button.classList.toggle('is-sel', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
export function sampleIdle(now, blocked = false) {
  const dt = Math.min(.08, Math.max(0, (now - last) / 1000)); last = now;
  if (blocked) lastActivity = now;
  const allowed = enabled && !reduced.matches && !document.hidden && !blocked;
  const quiet = (now - lastActivity) / 1000;
  const target = allowed ? smooth((quiet - 2) / 2) : 0;
  // Control changes must never leave an additive offset on an edited pose.
  weight = blocked || !allowed ? 0 : weight + (target - weight) * Math.min(1, dt * 3);
  if (allowed) phase += dt;
  const cycle = Math.max(0, quiet - 9);
  const segment = Math.floor(cycle / 17);
  const local = cycle % 17;
  const envelope = quiet > 9 && local < 6 ? Math.sin(Math.PI * local / 6) ** 2 : 0;
  const look = segment % 2 === 0 ? envelope : 0;
  const stretch = segment % 2 === 1 ? envelope : 0;
  const offsets = {
    waist_roll_joint: weight * (.009 * Math.sin(phase * .65) + .018 * stretch),
    waist_yaw_joint: weight * .045 * look * (segment % 4 < 2 ? 1 : -1),
    left_shoulder_pitch_joint: weight * .012 * Math.sin(phase * 1.35),
    right_shoulder_pitch_joint: weight * .012 * Math.sin(phase * 1.35),
    left_shoulder_roll_joint: weight * .025 * stretch,
    right_shoulder_roll_joint: -weight * .025 * stretch,
  };
  state = {enabled, active: weight > .001, kind: look > .01 ? 'look' : stretch > .01 ? 'settle' : 'breathe', offsets};
  return state;
}
export function idleState() { return state; }
document.querySelectorAll('[data-idle-enabled]').forEach(button =>
  button.addEventListener('click', () => setIdleEnabled(button.dataset.idleEnabled === 'true')));
paint();
window.intellibotIdle = {setEnabled: setIdleEnabled, get state() { return state; }};
