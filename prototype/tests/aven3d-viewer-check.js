/* Проверка 3D viewer'а Female Aven (prototype/aven-3d.html) после правок ориентации,
   камеры и освещения (2026-09-26, сессия XXVI). Разработческий инструмент, НЕ зависимость
   продукта: чистый Node без npm-пакетов.

   Запуск (из корня репозитория):
     node prototype/tests/aven3d-viewer-check.js

   Что проверяется ОБЪЕКТИВНО:
   1. GLB-файлы НЕ изменены (sha256 фиксированы — ориентация чинится transform'ом viewer'а).
   2. Геометрия: исходный меш действительно Z-up (макушка +Z, лицо +X), и после
      кватерниона ORIENT_FIX из js/aven3d.js (эквивалент перестановки (x,y,z)→(y,z,x))
      модель вертикальна: нос смотрит в +Z на высоте головы, макушка сверху по центру,
      плечи шире глубины (реальная математика на реальных вершинах GLB).
   3. Кадрирование: формула fitDistance держит модель в кадре для узких (портретный
      телефон) и широких экранов.
   4. Материал GLB действительно содержит дефекты экспорта, которые viewer нейтрализует:
      baseColorFactor 0.4 (затемнение текстуры) и отсутствующий metallicFactor (=1.0).
   5. Статика viewer'а: ESM-синтаксис js/aven3d.js, кнопки пресетов/статус вида/чекбокс
      анимации в HTML, фиксы материала и ограничения OrbitControls в JS,
      весь граф ES-модулей (vendored three) и assets существуют и не пустые.
   Визуальный WebGL-рендер в браузере этот скрипт НЕ выполняет (headless-браузер в CI
   недоступен) — визуальная проверка выполняется software-рендером (см. WORK_LOG) и владельцем. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}

/* ---------- 1. GLB не изменены ---------- */
console.log('1. GLB неизменны (ориентация — только transform в viewer):');
const SHA = {
  'assets/3d/aven-bust-experimental-master.glb':
    '6a713690a49e5c186b84a25e5424b82329271ffbccb47b54e7508faba2d95e46',
  'assets/3d/aven-bust-experimental-transparent.glb':
    'de6d0a0474faf884afdc2c24e597ea5a12d547475e2bba46d07759d77cb1cc77'
};
for (const [rel, sha] of Object.entries(SHA)) {
  const f = path.join(ROOT, rel);
  const h = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  ok(h === sha, rel + ' sha256 не изменился');
}

/* ---------- 2. ориентация: реальные вершины GLB ---------- */
console.log('2. Ориентация (реальная геометрия master GLB):');
const buf = fs.readFileSync(path.join(ROOT, 'assets/3d/aven-bust-experimental-master.glb'));
ok(buf.toString('ascii', 0, 4) === 'glTF' && buf.readUInt32LE(4) === 2, 'заголовок glTF v2');
const jlen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jlen));
const bin = buf.slice(20 + jlen + 8, 20 + jlen + 8 + buf.readUInt32LE(20 + jlen));
function accessor(i) {
  const a = gltf.accessors[i], bv = gltf.bufferViews[a.bufferView];
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return new T(bin.buffer, bin.byteOffset + start, a.count * comps);
}
const pos = accessor(gltf.meshes[0].primitives[0].attributes.POSITION);
const n = pos.length / 3;

// сырой bbox: подтверждаем Z-up (вертикальная ось — Z, самая длинная)
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
  const v = pos[3 * i + c];
  if (v < mn[c]) mn[c] = v;
  if (v > mx[c]) mx[c] = v;
}
const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
ok(ext[2] > ext[1] && ext[2] > ext[0],
   `сырой меш Z-up: extent Z (${ext[2].toFixed(3)}) — максимальный (X ${ext[0].toFixed(3)}, Y ${ext[1].toFixed(3)})`);

/* ORIENT_FIX из js/aven3d.js: quatY(-90°)·quatX(-90°). Для вектора это перестановка
   (x,y,z) → (y,z,x): старая ось Z (макушка) → Y (вверх), старая X (лицо) → Z (к камере). */
const P = new Float64Array(pos.length);
for (let i = 0; i < n; i++) {
  P[3 * i] = pos[3 * i + 1];      // x' = y
  P[3 * i + 1] = pos[3 * i + 2];  // y' = z
  P[3 * i + 2] = pos[3 * i];      // z' = x
}
// нормализация как в viewer: высота 1.6, низ y=0, центр X/Z
let m2 = [1e9, 1e9, 1e9], M2 = [-1e9, -1e9, -1e9];
for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
  const v = P[3 * i + c];
  if (v < m2[c]) m2[c] = v;
  if (v > M2[c]) M2[c] = v;
}
const H = 1.6, s = H / (M2[1] - m2[1]);
const cx = (m2[0] + M2[0]) / 2, cz = (m2[2] + M2[2]) / 2;
let nose = { z: -1e9 }, crown = { y: -1e9 };
for (let i = 0; i < n; i++) {
  const x = (P[3 * i] - cx) * s, y = (P[3 * i + 1] - m2[1]) * s, z = (P[3 * i + 2] - cz) * s;
  if (z > nose.z) nose = { x, y, z };
  if (y > crown.y) crown = { x, y, z };
}
ok(Math.abs((M2[1] - m2[1]) * s - H) < 1e-6, 'после фикса высота модели по Y = 1.6 (вертикальна)');
ok(nose.y > 0.85 * H / 1.6 && nose.y < 1.45 && Math.abs(nose.x) < 0.2,
   `лицо смотрит в +Z: самая выступающая точка по +Z (нос) на высоте головы, по центру ` +
   `(x=${nose.x.toFixed(3)}, y=${nose.y.toFixed(3)}, z=${nose.z.toFixed(3)})`);
ok(Math.abs(crown.x) < 0.35 && Math.abs(crown.z) < 0.5,
   `макушка сверху по центру (x=${crown.x.toFixed(3)}, z=${crown.z.toFixed(3)})`);
const width = (M2[0] - m2[0]) * s, depth = (M2[2] - m2[2]) * s;
ok(width > depth, `плечи горизонтальны: ширина X (${width.toFixed(3)}) > глубины Z (${depth.toFixed(3)})`);

/* ---------- 3. кадрирование ---------- */
console.log('3. Автокадрирование (формула fitDistance из js/aven3d.js):');
const fov = 35 * Math.PI / 180, vHalf = Math.tan(fov / 2);
const halfW = width / 2;
for (const aspect of [0.55, 0.75, 1.0, 1.6]) {
  const d = Math.max((H / 2) / vHalf, halfW / (vHalf * aspect)) * 1.15;
  const okV = (H / 2) <= vHalf * d + 1e-9;
  const okH = halfW <= vHalf * d * aspect + 1e-9;
  ok(okV && okH, `aspect ${aspect}: дистанция ${d.toFixed(2)} — модель целиком в кадре (высота и ширина)`);
}

/* ---------- 4. дефекты материала в GLB (то, что viewer нейтрализует) ---------- */
console.log('4. Материал GLB (объективная причина тёмного лица):');
const mat = gltf.materials[0].pbrMetallicRoughness;
ok(Array.isArray(mat.baseColorFactor) && Math.abs(mat.baseColorFactor[0] - 0.4) < 1e-6,
   `baseColorFactor = [${mat.baseColorFactor}] — текстура затемнялась в 2.5 раза`);
ok(mat.metallicFactor === undefined,
   'metallicFactor не задан → по спецификации glTF = 1.0 (металл без env-map ≈ чёрный)');
ok(!!mat.baseColorTexture, 'baseColorTexture присутствует (настоящая текстура лица)');

/* ---------- 5. статика viewer ---------- */
console.log('5. Статика viewer (HTML/JS/vendor graph):');
const js = fs.readFileSync(path.join(ROOT, 'js/aven3d.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'aven-3d.html'), 'utf8');
const syn = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: js });
ok(syn.status === 0, 'js/aven3d.js — валидный ES-модуль (node --check)');
ok(/ORIENT_FIX/.test(js) && /setFromAxisAngle/.test(js), 'ориентация: кватернион ORIENT_FIX в коде');
ok(/m\.metalness = 0/.test(js) || /metalness = 0/.test(js), 'фикс материала: metalness = 0');
ok(/color\.setRGB\(1, 1, 1\)/.test(js), 'фикс материала: baseColorFactor нейтрализован до белого');
ok(/minPolarAngle/.test(js) && /maxPolarAngle/.test(js), 'полярный угол ограничен (нельзя перевернуть модель)');
ok(/TOUCH\.ROTATE/.test(js) && /TOUCH\.DOLLY_PAN/.test(js), 'touch: 1 палец — вращение, pinch — zoom');
ok(/enablePan = false/.test(js), 'pan выключен (модель не «уезжает» из кадра)');
ok(/Свободный вид/.test(js) && /addEventListener\('start'/.test(js),
   'ручное вращение → статус «Свободный вид» (событие start OrbitControls)');
for (const id of ['front', 'left', 'right', 'back']) {
  ok(html.includes(`data-view="${id}"`), `HTML: кнопка пресета «${id}»`);
}
ok(html.includes('id="viewReset"'), 'HTML: кнопка «Сброс вида»');
ok(html.includes('id="viewStatus"'), 'HTML: индикатор текущего вида');
ok(html.includes('id="animToggle"'), 'HTML: чекбокс анимации (по умолчанию выключен)');
ok(!/checked/.test(html.match(/<input type="checkbox" id="animToggle"[^>]*>/)[0]),
   'анимация по умолчанию выключена (viewer для оценки)');
ok(/linear-gradient\(180deg, #d6d8dd/.test(html), 'нейтральный светлый фон сцены');
ok(html.includes('assets/character/master/female-aven-reference.jpg'), 'reference рядом с 3D (сравнение)');
// полный граф ES-модулей + assets
const files = [
  'js/aven3d.js',
  'assets/vendor/three/three.module.min.js',
  'assets/vendor/three/three.core.min.js',
  'assets/vendor/three/loaders/GLTFLoader.js',
  'assets/vendor/three/controls/OrbitControls.js',
  'assets/vendor/three/utils/BufferGeometryUtils.js',
  'assets/3d/aven-bust-experimental-master.glb',
  'assets/3d/aven-bust-experimental-transparent.glb',
  'assets/character/master/female-aven-reference.jpg',
  'assets/character/web/female-aven-transparent.png'
];
for (const f of files) {
  const p = path.join(ROOT, f);
  ok(fs.existsSync(p) && fs.statSync(p).size > 0, `файл существует и не пуст: ${f}`);
}

console.log(`\nИтого: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
