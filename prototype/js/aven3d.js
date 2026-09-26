/* Aven — 3D viewer PoC: GLB → Three.js → состояния Aven (docs/AVATAR_3D_RESEARCH.md).
 *
 * ОТДЕЛЬНАЯ страница (prototype/aven-3d.html). Главная, PNG-персонаж и Character Off
 * не затрагиваются. Модель — экспериментальная реконструкция (НЕ финальная Female Aven).
 *
 * Что реализовано честно:
 *  - загрузка GLB, автокадрирование, мягкое управление мышью (OrbitControls);
 *  - состояния Aven: idle / listening / thinking / speaking / success / important / waiting / error
 *    (спокойная, не чрезмерная анимация: дыхание, микродвижения головы, наклоны);
 *  - авто-детекция blendshapes (blinkLeft/blinkRight/jawOpen/smile/brows…): если модель
 *    (будущая, художественная) их имеет — включаются моргание, челюсть, улыбка; у текущей
 *    экспериментальной модели их НЕТ, и панель возможностей честно это показывает;
 *  - «уровень 0» lip-sync: амплитуда звука (Web Audio AnalyserNode) → речевая активность
 *    (с jawOpen — губы; без него — микрокивки головы). Phoneme/viseme timings — отдельный
 *    этап (Rhubarb-WASM / MFA, TTS_RESEARCH §14/§19).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/controls/OrbitControls.js';

/* ---------------- честная диагностика для проверки (window.__aven3d) ----------------
 * Объект существует всегда (базовый каркас создаётся ИНЛАЙН-скриптом в aven-3d.html
 * ДО этого модуля — на случай, если сам модуль не выполнится). Здесь он только
 * дополняется по мере реального прохождения этапов, чтобы снаружи (DevTools/тесты)
 * было объективно видно, что именно произошло, а не только факт ошибки/успеха.
 */
function diag(patch) {
  window.__aven3d = Object.assign({}, window.__aven3d, patch);
}
diag({ moduleLoaded: true, rendererCreated: false, glbLoaded: false, meshCount: 0 });

/* ---------------- состояния (параметры + описания для UI) ---------------- */
const STATES = {
  idle:      { label: 'idle',      desc: 'Спокойно: моргание (если есть blendshapes), лёгкое дыхание, микродвижения головы и глаз.',
               sway: 1.0, swaySpeed: 1.0, breath: 1.0, tilt: 0,    nod: 0 },
  listening: { label: 'listening', desc: 'Сфокусированный взгляд, небольшое движение головы (лёгкий наклон вперёд, меньше «блуждания»).',
               sway: 0.5, swaySpeed: 1.4, breath: 0.8, tilt: 0.04, nod: 0 },
  thinking:  { label: 'thinking',  desc: 'Спокойное движение взгляда/головы: чуть медленнее, лёгкий подъём подбородка.',
               sway: 0.8, swaySpeed: 0.6, breath: 0.9, tilt: -0.03, nod: 0 },
  speaking:  { label: 'speaking',  desc: 'Движения губ (jawOpen из амплитуды звука — если есть blendshapes) + небольшая естественная мимика/микрокивки.',
               sway: 0.7, swaySpeed: 1.2, breath: 1.1, tilt: 0,    nod: 1 },
  success:   { label: 'success',   desc: 'Лёгкая улыбка (если есть blendshape) + небольшой кивок, затем возврат в idle.',
               sway: 0.6, swaySpeed: 1.0, breath: 1.0, tilt: 0,    nod: 0, oneShot: 'nod-smile' },
  important: { label: 'important', desc: 'Внимательное серьёзное выражение: почти неподвижно, брови (если есть), дыхание тише.',
               sway: 0.25, swaySpeed: 0.5, breath: 0.6, tilt: 0.02, nod: 0 },
  waiting:   { label: 'waiting',   desc: 'Спокойное ожидание: самые медленные плавные микродвижения.',
               sway: 0.7, swaySpeed: 0.35, breath: 0.8, tilt: 0,    nod: 0 },
  error:     { label: 'error',     desc: 'Сдержанная реакция: один короткий лёгкий поворот головы, затем idle (без «киношных» эмоций).',
               sway: 0.4, swaySpeed: 1.0, breath: 0.9, tilt: 0,    nod: 0, oneShot: 'shake-subtle' }
};

const MODEL_URL = 'assets/3d/aven-bust-experimental-master.glb';
const MODELS = [
  { id: 'master',      label: 'реконструкция по master reference', url: 'assets/3d/aven-bust-experimental-master.glb' },
  { id: 'transparent', label: 'реконструкция по transparent PNG',  url: 'assets/3d/aven-bust-experimental-transparent.glb' }
];
const AUDIO_SAMPLES = [
  { id: 't01', label: 'vd17: приветствие (T1)', url: 'assets/voice-samples/qwen3/vd17-design/t01.mp3' },
  { id: 'x16', label: 'vd17: длинный ответ (X16)', url: 'assets/voice-samples/qwen3/vd17-design/x16.mp3' }
];

/* ---------------- сцена ---------------- */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
diag({ rendererCreated: true });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
camera.position.set(0, 0.95, 3.1);

const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-1.2, 1.6, 1.8); scene.add(key);
const rim = new THREE.DirectionalLight(0x9db4ff, 1.6); rim.position.set(1.6, 1.2, -1.4); scene.add(rim);
const fill = new THREE.HemisphereLight(0xdfe6ff, 0x232838, 1.1); scene.add(fill);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 1.6; controls.maxDistance = 6;
controls.enablePan = false;

function resize() {
  const w = stage.clientWidth, h = Math.max(420, stage.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* ---------------- загрузка модели + авто-детекция возможностей ---------------- */
let model = null, modelRoot = null;
let morphs = {};   // name → { mesh, index }
const caps = { blink: false, jaw: false, smile: false, brows: false };

function loadModel(url) {
  if (modelRoot) { scene.remove(modelRoot); modelRoot = null; }
  morphs = {}; caps.blink = caps.jaw = caps.smile = caps.brows = false;
  document.getElementById('fallback').hidden = true;
  const stats = document.getElementById('modelStats');
  if (stats) stats.textContent = 'Загрузка GLB: ' + url + ' …';
  diag({ url, status: 'loading', meshes: 0, triangles: 0, glbLoaded: false, meshCount: 0 });
  new GLTFLoader().load(url, (gltf) => {
  modelRoot = gltf.scene;
  const box = new THREE.Box3().setFromObject(modelRoot);
  const size = box.getSize(new THREE.Vector3());
  const scale = 1.6 / size.y;
  modelRoot.scale.setScalar(scale);
  modelRoot.position.y = -box.min.y * scale;
  modelRoot.position.x = -(box.min.x + box.max.x) / 2 * scale;
  modelRoot.position.z = -(box.min.z + box.max.z) / 2 * scale;

  let tris = 0, verts = 0;
  modelRoot.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      verts += g.attributes.position.count;
      const dict = o.morphTargetDictionary || {};
      Object.entries(dict).forEach(([name, idx]) => { morphs[name] = { mesh: o, index: idx }; });
    }
  });
  scene.add(modelRoot);

  // ARKit-совместимые имена (если будущая модель их имеет)
  const has = (re) => Object.keys(morphs).some((n) => re.test(n));
  caps.blink = has(/blink|eyeClosed|eye.?close/i);
  caps.jaw = has(/jawOpen|mouthOpen|jaw.?open/i);
  caps.smile = has(/smile|mouthSmile/i);
  caps.brows = has(/brow/i);
  renderCaps();
  document.getElementById('modelStats').textContent =
    `Модель: ${verts.toLocaleString('ru')} вершин · ${Math.round(tris).toLocaleString('ru')} треугольников · ` +
    `morph-таргетов: ${Object.keys(morphs).length}` + (Object.keys(morphs).length ?
    ` (${Object.keys(morphs).slice(0, 6).join(', ')}${Object.keys(morphs).length > 6 ? '…' : ''})` : '');
  console.log('[aven3d] morphs:', Object.keys(morphs));
  // Успешная загрузка: fallback обязан быть выключен (PNG не подменяет 3D).
  const fb = document.getElementById('fallback');
  fb.hidden = true;
  let meshes = 0;
  modelRoot.traverse((o) => { if (o.isMesh) meshes++; });
  diag({ url, status: 'loaded', meshes, meshCount: meshes, triangles: Math.round(tris), vertices: verts,
         morphs: Object.keys(morphs).length, glbLoaded: true, fallbackHidden: fb.hidden });
  console.log('[aven3d] GLB загружен:', url, meshes, 'mesh,', Math.round(tris), 'треугольников');
}, (ev) => {
  if (ev && ev.total) {
    const stats = document.getElementById('modelStats');
    if (stats) stats.textContent = `Загрузка GLB: ${Math.round(ev.loaded / ev.total * 100)}%`;
  }
}, (err) => {
  console.warn('[aven3d] GLB не загрузился:', err);
  diag({ url, status: 'error', error: String(err && (err.message || err)), glbLoaded: false, meshCount: 0 });
  const fb = document.getElementById('fallback');
  fb.hidden = false;
  diag({ fallbackHidden: fb.hidden });
  document.getElementById('fbReason').textContent =
    'Файл ' + new URL(url, location.href).href + ' не загрузился: ' +
    String(err && (err.message || err)) + '.';
});
}

/* переключатель входов реконструкции (master / transparent) */
const modelSel = document.getElementById('modelSel');
if (modelSel) {
  MODELS.forEach((m) => {
    const o = document.createElement('option'); o.value = m.url; o.textContent = m.label; modelSel.appendChild(o);
  });
  modelSel.addEventListener('change', () => loadModel(modelSel.value));
}
loadModel(MODEL_URL);

function renderCaps() {
  const el = document.getElementById('caps');
  const pill = (ok, text) => `<span class="pill ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${text}</span>`;
  el.innerHTML =
    pill(true, 'дыхание') + pill(true, 'микродвижения головы') +
    pill(caps.blink, 'моргание (нужны blendshapes)') +
    pill(caps.jaw, 'губы/челюсть (нужен jawOpen)') +
    pill(caps.smile, 'улыбка (success)') +
    pill(caps.brows, 'брови (important)');
  const why = !caps.blink && !caps.jaw
    ? ' У экспериментальной модели TripoSR нет лицевого rig — моргание и губы недоступны (честно).'
    : '';
  el.insertAdjacentHTML('beforeend', `<span class="pill">${why ? 'лицевой rig: модель без blendshapes' : 'лицевой rig: обнаружен'}</span>`);
}

/* ---------------- звук → амплитуда (уровень 0 lip-sync) ---------------- */
let audioCtx = null, analyser = null, audioEl = null, audioRms = 0;
const audioSel = document.getElementById('audioSel');
AUDIO_SAMPLES.forEach((s) => {
  const o = document.createElement('option'); o.value = s.url; o.textContent = s.label; audioSel.appendChild(o);
});
function ensureAudio() {
  if (audioEl) return;
  audioEl = new Audio(); audioEl.crossOrigin = 'anonymous';
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 512;
  audioCtx.createMediaElementSource(audioEl).connect(analyser);
  analyser.connect(audioCtx.destination);
}
document.getElementById('audioBtn').addEventListener('click', () => {
  ensureAudio();
  audioEl.src = audioSel.value;
  audioCtx.resume();
  audioEl.play().then(() => setState('speaking', true)).catch((e) => console.warn(e));
});
document.getElementById('audioStop').addEventListener('click', () => {
  if (audioEl) audioEl.pause();
  audioRms = 0;
  setState('idle');
});
function readRms() {
  if (!analyser) return 0;
  const d = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(d);
  let s = 0;
  for (let i = 0; i < d.length; i++) { const v = (d[i] - 128) / 128; s += v * v; }
  return Math.sqrt(s / d.length);
}

/* ---------------- конечный автомат состояний ---------------- */
let state = 'idle';
let params = { ...STATES.idle };
let oneShotT = -1;   // время старта one-shot (сек), -1 — не активен
const statebar = document.getElementById('statebar');
Object.keys(STATES).forEach((k) => {
  const b = document.createElement('button');
  b.className = 'btn small'; b.textContent = k; b.dataset.k = k;
  b.addEventListener('click', () => setState(k));
  statebar.appendChild(b);
});
function setState(k, keepAfterAudio) {
  if (!STATES[k]) return;
  state = k;
  if (STATES[k].oneShot) oneShotT = 0;
  document.querySelectorAll('#statebar button').forEach((b) => b.classList.toggle('active', b.dataset.k === k));
  document.getElementById('stateDesc').textContent = STATES[k].desc;
  if (k === 'speaking' && !keepAfterAudio) { /* speaking доступен и без звука — мимика/микрокивки */ }
}
setState('idle');

/* авто-демо */
let demo = false, demoIdx = 0, demoTimer = null;
const DEMO = ['idle', 'listening', 'thinking', 'speaking', 'waiting', 'important', 'success', 'error'];
document.getElementById('demoBtn').addEventListener('click', () => {
  demo = !demo;
  document.getElementById('demoBtn').textContent = demo ? '■ Стоп демо' : '▶ Авто-демо состояний';
  if (demo) {
    demoIdx = 0; setState(DEMO[0]);
    demoTimer = setInterval(() => {
      demoIdx = (demoIdx + 1) % DEMO.length;
      setState(DEMO[demoIdx]);
    }, 3200);
  } else { clearInterval(demoTimer); setState('idle'); }
});

/* моргание (если есть blendshapes) */
let blinkT = 1.5 + Math.random() * 3, blinkPhase = -1;
function updateBlink(dt) {
  if (!caps.blink) return;
  const names = Object.keys(morphs).filter((n) => /blink|eyeClosed/i.test(n));
  if (blinkPhase < 0) {
    blinkT -= dt;
    if (blinkT <= 0) { blinkPhase = 0; blinkT = 1.8 + Math.random() * 3.6; }
    names.forEach((n) => morphs[n].mesh.morphTargetInfluences[morphs[n].index] = 0);
  } else {
    blinkPhase += dt / 0.16;                      // ~160 мс моргание
    const v = blinkPhase >= 2 ? 0 : Math.sin(Math.min(blinkPhase, 1) * Math.PI);
    names.forEach((n) => morphs[n].mesh.morphTargetInfluences[morphs[n].index] = v);
    if (blinkPhase >= 2) blinkPhase = -1;
  }
}

/* ---------------- анимация ---------------- */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // сглаживание параметров к целевому состоянию
  for (const k of ['sway', 'swaySpeed', 'breath', 'tilt']) {
    params[k] += (STATES[state][k] - params[k]) * Math.min(1, dt * 2.5);
  }

  if (modelRoot) {
    // дыхание: лёгкое масштабирование по Y (грудь) — 0.35% амплитуды, период ~4.2 с
    const breath = 1 + 0.0035 * params.breath * Math.sin(t * (2 * Math.PI) / 4.2);
    modelRoot.scale.y = modelRoot.scale.x * breath;

    // микродвижения головы: сумма нескоррелированных синусов (organic sway)
    const sy = Math.sin(t * 0.9 * params.swaySpeed) * 0.6 + Math.sin(t * 0.23 * params.swaySpeed + 1.7) * 0.4;
    const sx = Math.sin(t * 0.7 * params.swaySpeed + 0.6) * 0.5 + Math.sin(t * 0.31 * params.swaySpeed) * 0.5;
    modelRoot.rotation.y = 0.05 * params.sway * sy;
    modelRoot.rotation.x = 0.022 * params.sway * sx + params.tilt;
    modelRoot.rotation.z = 0.012 * params.sway * Math.sin(t * 0.42 * params.swaySpeed + 2.1);

    // речевая активность: амплитуда звука
    audioRms += (readRms() - audioRms) * Math.min(1, dt * 12);
    if (state === 'speaking') {
      const a = Math.min(1, audioRms * 6);
      if (caps.jaw) {
        const names = Object.keys(morphs).filter((n) => /jawOpen|mouthOpen/i.test(n));
        const jitter = 0.75 + 0.25 * Math.sin(t * 11.3);
        names.forEach((n) => { morphs[n].mesh.morphTargetInfluences[morphs[n].index] = a * jitter; });
      }
      // без челюсти — микрокивки + чуть живее дыхание (честная замена, подписано в UI)
      modelRoot.rotation.x += 0.02 * params.nod * a * Math.sin(t * 9.1);
      modelRoot.rotation.y += 0.012 * params.nod * a * Math.sin(t * 6.7 + 1.1);
    }

    // one-shot: success (кивок + улыбка), error (лёгкий поворот)
    if (oneShotT >= 0) {
      oneShotT += dt;
      if (state === 'success') {
        const p = Math.min(1, oneShotT / 1.2);
        const env = Math.sin(p * Math.PI);
        modelRoot.rotation.x += 0.09 * env * (1 - p * 0.3);
        if (caps.smile) {
          Object.keys(morphs).filter((n) => /smile/i.test(n)).forEach((n) => {
            morphs[n].mesh.morphTargetInfluences[morphs[n].index] = env;
          });
        }
        if (p >= 1) { oneShotT = -1; setState('idle'); }
      } else if (state === 'error') {
        const p = Math.min(1, oneShotT / 0.7);
        modelRoot.rotation.y += 0.05 * Math.sin(p * Math.PI * 2) * (1 - p);
        if (p >= 1) { oneShotT = -1; setState('idle'); }
      }
    }

    updateBlink(dt);

    // окончание звука → из speaking в idle
    if (state === 'speaking' && audioEl && audioEl.paused && audioEl.currentTime > 0) setState('idle');
  }

  controls.update();
  renderer.render(scene, camera);
}
resize();
animate();
