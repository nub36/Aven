/* Aven — Visual Prototype. Состояние прототипа (JS memory + localStorage). Не production. */
window.AvenState = (function () {
  const KEY = 'aven-proto-v1';

  function deepMerge(base, patch) {
    if (patch === undefined || patch === null) return base;
    if (Array.isArray(base) || Array.isArray(patch) || typeof base !== 'object' || typeof patch !== 'object') return patch;
    const out = Object.assign({}, base);
    for (const k of Object.keys(patch)) out[k] = deepMerge(base[k], patch[k]);
    return out;
  }

  let state = AvenDemo.demoState();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = deepMerge(state, JSON.parse(raw));
  } catch (e) { /* демо: игнорируем */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* демо */ }
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* демо */ }
    state = AvenDemo.demoState();
  }

  let uid = 100;
  function id(prefix) { uid += 1; return prefix + uid + '_' + Date.now().toString(36); }

  return { s() { return state; }, save, reset, id };
})();
