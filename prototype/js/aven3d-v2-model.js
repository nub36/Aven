/**
 * aven3d-v2-model.js — viewer кандидата Female Aven 3D V2.
 *
 * Назначение: отдельная страница проверки кандидата (НЕ главная).
 *   - GLB: assets/3d/female-aven-v2.glb (Blender glTF, Y-up, morph targets ARKit+visemes)
 *   - Кнопки ракурсов: Спереди/Слева/Справа/Сзади (плавная интерполяция камеры)
 *   - OrbitControls: свободное вращение + zoom (колесо/пинч)
 *   - Тест лицевой анимации: morphTargetInfluences (ARKit) + gaze-вращение
 *     глазных КОСТЕЙ (eye.L / eye.R) — проверка рига, не только морфов
 *   - Техблок из assets/3d/female-aven-v2.stats.json
 *
 * Ориентация: Blender-экспорт export_yup=True => в glTF модель стоит вертикально
 * (Y-up) и смотрит в +Z, камера по умолчанию видит лицо. Доп. коррекция не нужна.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/controls/OrbitControls.js';

const GLB_URL = 'assets/3d/female-aven-v2.glb';
const STATS_URL = 'assets/3d/female-aven-v2.stats.json';

// Центр головы модели (метры, glTF Y-up; сборка Blender: z≈1.44 => Y≈1.44)
const TARGET = new THREE.Vector3(0, 1.42, 0);
const DIST = 1.05;

const stage = document.getElementById('stage');
const fallback = document.getElementById('fallback');
const viewState = document.getElementById('viewState');
const exprState = document.getElementById('exprState');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch (e) {
  fallback.hidden = false;
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);
fallback.hidden = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc4c7ce);

// --- Studio lighting: key / fill / rim + мягкий ambient -------------------
scene.add(new THREE.HemisphereLight(0xdfe2e8, 0x8a8d96, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(-1.0, 1.9, 1.9);
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8ecf4, 0.8);
fill.position.set(1.4, 0.6, 1.2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.1);
rim.position.set(0.4, 1.7, -2.2);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.35;
controls.maxDistance = 4.0;
controls.target.copy(TARGET);
controls.autoRotateSpeed = 2.2;

// --- Ракурсы (азимут в градусах вокруг модели, высота камеры) -------------
// Спереди = камера в +Z (лицо модели смотрит в +Z); слева владельца = +X glTF?
// glTF: Blender -Y (перед) -> +Z; Blender +X (лево субъекта) -> +X.
// Кнопка «Слева» показывает ЛЕВУЮ сторону субъекта => камера в +X.
const VIEWS = {
  front: { az: 0, el: 4, label: 'спереди' },
  left: { az: 90, el: 4, label: 'слева' },
  right: { az: -90, el: 4, label: 'справа' },
  back: { az: 180, el: 4, label: 'сзади' },
};

let camAnim = null;
function setView(name) {
  const v = VIEWS[name];
  if (!v) return;
  const az = THREE.MathUtils.degToRad(v.az);
  const el = THREE.MathUtils.degToRad(v.el);
  const dst = new THREE.Vector3(
    TARGET.x + DIST * Math.cos(el) * Math.sin(az),
    TARGET.y + DIST * Math.sin(el),
    TARGET.z + DIST * Math.cos(el) * Math.cos(az));
  camAnim = { from: camera.position.clone(), to: dst, t: 0 };
  viewState.textContent = 'Ракурс: ' + v.label;
  document.querySelectorAll('.v2-viewbar [data-view]').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === name));
}
document.querySelectorAll('.v2-viewbar [data-view]').forEach((b) =>
  b.addEventListener('click', () => setView(b.dataset.view)));
document.getElementById('autorotate').addEventListener('change', (e) => {
  controls.autoRotate = e.target.checked;
});

// --- Загрузка модели --------------------------------------------------------
let morphMeshes = [];      // меши с morphTargetInfluences
let morphIndex = {};       // name -> [{mesh, index}]
let eyeBones = { L: null, R: null };

const gltfLoader = new GLTFLoader();
gltfLoader.load(GLB_URL, (gltf) => {
  const model = gltf.scene;
  model.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      if (o.morphTargetInfluences && o.morphTargetInfluences.length) {
        const names = o.morphTargetDictionary || {};
        for (const [name, idx] of Object.entries(names)) {
          (morphIndex[name] = morphIndex[name] || []).push({ mesh: o, index: idx });
        }
        morphMeshes.push(o);
      }
    }
  });
  // Глазные кости: ищем Object3D с именами из рига MPFB (eye.L / eye.R)
  const findBone = (names) => {
    for (const n of names) {
      const b = model.getObjectByName(n);
      if (b) return b;
    }
    return null;
  };
  eyeBones.L = findBone(['eye.L', 'eye_L', 'eyelid.L']);
  eyeBones.R = findBone(['eye.R', 'eye_R', 'eyelid.R']);
  scene.add(model);
  setView('front');
  document.getElementById('viewState').textContent = 'Ракурс: спереди';
  loadStats(gltf);
  reportCaps();
}, (ev) => {
  if (ev.total) {
    const st = document.getElementById('modelStats');
    if (st) st.textContent = 'Загрузка GLB: ' + Math.round(ev.loaded / ev.total * 100) + '%';
  }
}, (err) => {
  console.error('GLB load failed', err);
  fallback.hidden = false;
  const st = document.getElementById('modelStats');
  if (st) st.textContent = 'Ошибка загрузки GLB: ' + GLB_URL;
});

// --- Морфы: установка значения по словарю ----------------------------------
function setMorph(name, value) {
  const list = morphIndex[name];
  if (!list) return false;
  for (const { mesh, index } of list) mesh.morphTargetInfluences[index] = value;
  return true;
}
function resetMorphs() {
  for (const m of morphMeshes) m.morphTargetInfluences.fill(0);
}
function hasMorph(...names) { return names.some((n) => !!morphIndex[n]); }

// --- Выражения (ARKit-комбинации, значения как в рендерах QC) -------------
const EXPRS = {
  blink: { label: 'blink', map: { eyeBlinkLeft: 1, eyeBlinkRight: 1 } },
  jaw: { label: 'jawOpen', map: { jawOpen: 1, mouthClose: 0.3 } },
  smile: { label: 'smile', map: { mouthSmileLeft: 0.9, mouthSmileRight: 0.9, mouthShrugUpper: 0.2 } },
  frown: { label: 'frown', map: { mouthFrownLeft: 0.8, mouthFrownRight: 0.8, browDownLeft: 0.4, browDownRight: 0.4 } },
  brow: { label: 'brows up', map: { browInnerUp: 0.8, browOuterUpLeft: 0.6, browOuterUpRight: 0.6 } },
  browdown: { label: 'brows down', map: { browDownLeft: 0.7, browDownRight: 0.7, browInnerUp: 0.15 } },
  squint: { label: 'squint', map: { eyeSquintLeft: 0.7, eyeSquintRight: 0.7 } },
  wide: { label: 'wide', map: { eyeWideLeft: 0.8, eyeWideRight: 0.8 } },
};
const VISEMES = ['viseme_sil', 'viseme_A', 'viseme_E', 'viseme_I', 'viseme_O',
  'viseme_U', 'viseme_MB', 'viseme_FV'];

let activeExprBtn = null;
document.querySelectorAll('[data-expr]').forEach((b) => b.addEventListener('click', () => {
  const e = EXPRS[b.dataset.expr];
  if (!e) return;
  const wasActive = activeExprBtn === b;
  document.querySelectorAll('[data-expr],[data-viseme]').forEach((x) => x.classList.remove('active'));
  resetMorphs();
  if (!wasActive) {
    for (const [n, v] of Object.entries(e.map)) setMorph(n, v);
    b.classList.add('active');
    activeExprBtn = b;
    exprState.textContent = 'Выражение: ' + e.label;
  } else {
    activeExprBtn = null;
    exprState.textContent = 'Выражение: нейтральное';
  }
}));
document.querySelectorAll('[data-viseme]').forEach((b) => b.addEventListener('click', () => {
  const name = b.dataset.viseme; // viseme_sil (REST) в GLB отсутствует: rest = все нули
  const wasActive = b.classList.contains('active');
  document.querySelectorAll('[data-expr],[data-viseme]').forEach((x) => x.classList.remove('active'));
  resetMorphs();
  if (!wasActive && (name === 'viseme_sil' || setMorph(name, 1))) {
    b.classList.add('active');
    activeExprBtn = b;
    exprState.textContent = 'Viseme: ' + name.replace('viseme_', '');
  } else {
    activeExprBtn = null;
    exprState.textContent = 'Выражение: нейтральное';
  }
}));

// --- Gaze: вращение глазных костей (проверка рига) --------------------------
// eye.L / eye.R — кости с головой в центре глазного яблока; локальная ось
// кости направлена к хвосту, поэтому вращаем вокруг мировых осей через
// quaternion от родителя. Пределы ±25°.
// Углы в МИРОВЫХ осях glTF: модель смотрит в +Z, +X = лево субъекта, +Y = вверх.
// yaw>0 (вокруг +Y) => взгляд влево субъекта; pitch>0 (вокруг +X) => взгляд вниз.
const GAZE = {
  left: { yaw: 25, pitch: 0, key: 'left' },
  right: { yaw: -25, pitch: 0, key: 'right' },
  up: { yaw: 0, pitch: -18, key: 'up' },
  down: { yaw: 0, pitch: 14, key: 'down' },
  center: { yaw: 0, pitch: 0, key: 'center' },
};
const baseQuat = { L: null, R: null };
document.querySelectorAll('[data-gaze]').forEach((b) => b.addEventListener('click', () => {
  const g = GAZE[b.dataset.gaze];
  if (!g) return;
  document.querySelectorAll('[data-gaze]').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  applyGaze(g);
  exprState.textContent = 'Взгляд: ' + b.textContent.trim();
}));
function applyGaze(g) {
  if (eyeBones.L || eyeBones.R) {
    // Мировая дельта вращения: q = R_x(pitch) * R_y(yaw); переносим её в
    // локальное пространство родителя кости: q_local = Qp⁻¹ · q · Qp
    const qWorld = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(THREE.MathUtils.degToRad(g.pitch),
        THREE.MathUtils.degToRad(g.yaw), 0, 'YXZ'));
    const tmp = new THREE.Quaternion();
    for (const side of ['L', 'R']) {
      const bone = eyeBones[side];
      if (!bone) continue;
      if (!baseQuat[side]) baseQuat[side] = bone.quaternion.clone();
      bone.parent.getWorldQuaternion(tmp);
      const qLocal = tmp.clone().invert().multiply(qWorld).multiply(tmp);
      bone.quaternion.copy(baseQuat[side]).premultiply(qLocal);
      bone.updateMatrixWorld(true);
    }
  } else {
    // фолбэк: морфы взгляда (eyeLookUp/Down/In/Out)
    resetLookMorphs();
    const m = {
      left: ['eyeLookOutLeft', 'eyeLookInRight'],
      right: ['eyeLookInLeft', 'eyeLookOutRight'],
      up: ['eyeLookUpLeft', 'eyeLookUpRight'],
      down: ['eyeLookDownLeft', 'eyeLookDownRight'],
      center: [],
    }[g.key] || [];
    for (const n of m) setMorph(n, 1);
  }
}
function resetLookMorphs() {
  for (const n of ['eyeLookUpLeft', 'eyeLookUpRight', 'eyeLookDownLeft', 'eyeLookDownRight',
    'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight']) setMorph(n, 0);
}

document.getElementById('resetAll').addEventListener('click', () => {
  resetMorphs();
  applyGaze(GAZE.center);
  document.querySelectorAll('[data-expr],[data-viseme],[data-gaze]').forEach((x) => x.classList.remove('active'));
  activeExprBtn = null;
  exprState.textContent = 'Выражение: нейтральное';
});

// --- Техблок ----------------------------------------------------------------
async function loadStats(gltf) {
  const st = document.getElementById('modelStats');
  const tbl = document.getElementById('techTable');
  let s = null;
  try {
    s = await (await fetch(STATS_URL)).json();
  } catch (e) {
    if (st) st.textContent = 'stats.json недоступен: ' + e.message;
    return;
  }
  if (!tbl) return;
  // Треугольники/вершины пересчитываем из ЗАГРУЖЕННОЙ сцены (истина рантайма)
  let tris = 0, verts = 0, morphCount = 0;
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.geometry) {
      verts += o.geometry.attributes.position.count;
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      if (o.morphTargetInfluences) morphCount = Math.max(morphCount, o.morphTargetInfluences.length);
    }
  });
  const meshCount = 1 + Object.keys(s.proxies || {}).length + (s.hair ? 1 : 0) + (s.clothes ? 1 : 0);
  const rows = [
    ['Формат', 'glTF 2.0 (GLB), Y-up'],
    ['Размер GLB', (s.glb_bytes / 1048576).toFixed(2) + ' МБ (' + s.glb_bytes.toLocaleString('ru-RU') + ' Б)'],
    ['Меши', String(meshCount) + ' (Body, глаза, зубы, язык, ресницы, волосы, одежда)'],
    ['Вершины', verts.toLocaleString('ru-RU') + ' (GLB ' + ((s.glb_verts || 0).toLocaleString('ru-RU')) + ', исходный меш ' + (s.total_verts || 0).toLocaleString('ru-RU') + ')'],
    ['Треугольники', Math.round(tris).toLocaleString('ru-RU') + ' (GLB ' + ((s.glb_tris || 0).toLocaleString('ru-RU')) + ')'],
    ['Текстуры', (s.textures || []).length + ' × ' + ((s.textures || []).join(', ') || '')],
    ['Кости (skin)', String((s.bones || []).length) + ' (' + (s.bones || []).join(', ') + ')'],
    ['Morph targets', morphCount + ' (Body ' + ((s.morph_targets || []).length) + ' / Eyelashes 10)'],
    ['ARKit-совместимые', String(s.arkit_count) + ' из 52'],
    ['Visemes', (s.visemes || []).length + ' + REST (A E I O U M/B/P F/V)'],
    ['Vertex colors', 'губы / брови / скальп (COLOR_0)'],
    ['Base mesh', s.source],
    ['Лицензии', (s.licenses && s.licenses.base_mesh) || ''],
  ];
  tbl.innerHTML = '';
  for (const [k, v] of rows) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = k;
    const td2 = document.createElement('td'); td2.textContent = String(v);
    tr.append(td1, td2); tbl.append(tr);
  }
  tbl.hidden = false;
  if (st) st.textContent = '';
}

// --- Pills-индикаторы возможностей ------------------------------------------
function reportCaps() {
  const caps = document.getElementById('v2Caps');
  if (!caps) return;
  const pill = (ok, text) => {
    const s = document.createElement('span');
    s.className = 'pill ' + (ok ? 'ok' : 'no');
    s.textContent = text;
    caps.append(s);
  };
  pill(morphMeshes.length > 0, morphMeshes.length > 0 ? 'морфы: ' + Object.keys(morphIndex).length + ' имён' : 'морфы: нет');
  pill(!!eyeBones.L && !!eyeBones.R, 'глазные кости: ' + ((eyeBones.L ? 1 : 0) + (eyeBones.R ? 1 : 0)) + '/2');
  pill(hasMorph('jawOpen', 'viseme_O'), 'ARKit+visemes');
  pill(true, 'GLB loaded');
}

// --- Resize + render loop ----------------------------------------------------
function resize() {
  const w = stage.clientWidth, h = Math.max(stage.clientHeight, 420);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
setView('front');
camera.position.set(0, TARGET.y + 0.08, DIST); // мгновенно, без анимации при старте
camAnim = null;
controls.update();

const clock = new THREE.Clock();
(function loop() {
  requestAnimationFrame(loop);
  const dt = clock.getDelta();
  if (camAnim) {
    camAnim.t += dt * 1.8;
    const k = camAnim.t >= 1 ? 1 : (1 - Math.pow(1 - camAnim.t, 3)); // easeOutCubic
    camera.position.lerpVectors(camAnim.from, camAnim.to, k);
    if (camAnim.t >= 1) camAnim = null;
  }
  controls.update();
  renderer.render(scene, camera);
})();
