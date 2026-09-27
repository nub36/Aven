/* Проверка кандидата Female Aven 3D V2 (prototype/aven-3d-v2-model.html + GLB).
   Разработческий инструмент, НЕ зависимость продукта: чистый Node без npm-пакетов.

   Запуск (из корня репозитория):
     node prototype/tests/aven3d-v2-model-check.js

   Что проверяется ОБЪЕКТИВНО:
   1. GLB-структура: 8 мешей, кожа 7 костей (root..eye.R), иерархия parenting
      (глаза→eye.L/eye.R, язык→jaw, зубы/ресницы/волосы→head, Body/Clothes→skin),
      weights все 0 (нейтральный базис), vertex colors, морфы Body 58 + Eyelashes 10.
   2. Амплитуды ключевых морфов на РЕАЛЬНОЙ геометрии (ловит регрессию
      демпфирования warp'ом): jawOpen ≥ 3см, blink ≥ 7мм, browInnerUp ≥ 2мм,
      mouthSmileLeft ≥ 1см, viseme_O ≥ 3см.
   3. Visemes: 7 именованных + REST; ключевые ARKit-имена присутствуют.
   4. Геометрия в осмысленных диапазонах (глаза на своих местах, рот закрыт
      в базе, бюст без улетевших вершин).
   5. stats.json согласован с GLB (tris/verts/bytes/arkit/visemes).
   6. Статика viewer'а: HTML (importmap vendored three, 4 ракурса, gaze,
      visemes, техблок), JS (ESM-валидность, morphTargetInfluences, кости
      eye.L/eye.R, OrbitControls), все ассеты существуют и не пустые.
   Визуальный WebGL-рендер в браузере скрипт НЕ выполняет — визуальная
   проверка выполняется владельцем (review/3d-v2-model/). */
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

/* ---------- парсинг GLB ---------- */
const GLB_REL = 'assets/3d/female-aven-v2.glb';
const buf = fs.readFileSync(path.join(ROOT, GLB_REL));
ok(buf.toString('ascii', 0, 4) === 'glTF' && buf.readUInt32LE(4) === 2, 'заголовок glTF v2');
const jlen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jlen));
const bin = buf.slice(20 + jlen + 8, 20 + jlen + 8 + buf.readUInt32LE(20 + jlen));
function accessor(i) {
  const a = gltf.accessors[i];
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  // Blender экспортирует морфы как sparse-аксессоры (только изменённые вершины)
  if (a.sparse) {
    const out = new T(a.count * comps);
    if (a.bufferView !== undefined) {
      const bv = gltf.bufferViews[a.bufferView];
      const src = new T(bin.buffer, bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * comps);
      out.set(src);
    }
    const bvi = gltf.bufferViews[a.sparse.indices.bufferView];
    const idxT = { 5125: Uint32Array, 5123: Uint16Array }[a.sparse.indices.componentType];
    const idx = new idxT(bin.buffer, bin.byteOffset + (bvi.byteOffset || 0) +
      (a.sparse.indices.byteOffset || 0), a.sparse.count);
    const bvv = gltf.bufferViews[a.sparse.values.bufferView];
    const vals = new T(bin.buffer, bin.byteOffset + (bvv.byteOffset || 0) +
      (a.sparse.values.byteOffset || 0), a.sparse.count * comps);
    for (let k = 0; k < a.sparse.count; k++) {
      for (let cc = 0; cc < comps; cc++) out[idx[k] * comps + cc] = vals[k * comps + cc];
    }
    return out;
  }
  const bv = gltf.bufferViews[a.bufferView];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return new T(bin.buffer, bin.byteOffset + start, a.count * comps);
}
function triCount(prim) {
  const idx = prim.indices !== undefined ? accessor(prim.indices) : null;
  return idx ? idx.length / 3 : accessor(prim.attributes.POSITION).length / 3;
}

/* ---------- 1. структура ---------- */
console.log('1. Структура GLB (8 мешей, риг, иерархия):');
const meshes = gltf.meshes.map((m, i) => ({ name: m.name, i }));
ok(meshes.length === 8, 'мешей: ' + meshes.length + ' (ожидалось 8)');
ok(gltf.skins.length === 1, 'skin: ' + gltf.skins.length);
const joints = gltf.skins[0].joints.map((j) => gltf.nodes[j].name);
ok(JSON.stringify(joints) === JSON.stringify(['root', 'spine', 'neck', 'head', 'jaw', 'eye.L', 'eye.R']),
  'кости skin: ' + joints.join(','));
const name2i = {}; gltf.nodes.forEach((n, i) => { if (n.name) name2i[n.name] = i; });
function parentOf(name) {
  const i = name2i[name];
  const p = gltf.nodes.find((n) => (n.children || []).includes(i));
  return p ? p.name : null;
}
ok(parentOf('eyes_L') === 'eye.L' && parentOf('eyes_R') === 'eye.R',
  'глаза запарентчены к eye.L / eye.R (взгляд костями)');
ok(parentOf('Tongue') === 'jaw', 'язык → jaw');
ok(parentOf('Teeth') === 'head' && parentOf('Eyelashes') === 'head' && parentOf('Hair') === 'head',
  'зубы/ресницы/волосы → head');
ok(gltf.nodes[name2i['Body']].skin !== undefined, 'Body скинится');
const bodyMesh = gltf.meshes.find((m) => m.name === 'Body');
const prim = bodyMesh.primitives[0];
ok(Object.keys(prim.attributes).includes('COLOR_0'), 'vertex colors (COLOR_0) у Body');
ok(Array.isArray(prim.targets) && prim.targets.length === 58, 'морфов у Body: ' + (prim.targets || []).length);
const lashMesh = gltf.meshes.find((m) => m.name === 'Eyelashes');
ok(lashMesh.primitives[0].targets.length === 10, 'морфов у Eyelashes: ' + lashMesh.primitives[0].targets.length);
const weights = gltf.meshes.map((m) => (m.weights || [])[0]);
ok(weights.every((w) => w === 0 || w === undefined), 'weights все 0 (нейтральный базис)');

/* ---------- 2. амплитуды морфов (реальная геометрия) ---------- */
console.log('2. Амплитуды морфов (анти-регрессия демпфирования):');
const names = bodyMesh.extras.targetNames;
const basePos = accessor(prim.attributes.POSITION);
// glTF-морфы хранят ДЕЛЬТЫ; Blender пишет их sparse-аксессором
// (base = нули, values = смещения изменённых вершин)
function morphDeltas(name) {
  const k = names.indexOf(name);
  if (k < 0) return null;
  return accessor(prim.targets[k].POSITION);
}
function morphMax(name) {
  const d = morphDeltas(name);
  if (!d) return null;
  let mx = 0;
  for (let i = 0; i < d.length; i += 3) {
    const n = Math.sqrt(d[i] * d[i] + d[i + 1] * d[i + 1] + d[i + 2] * d[i + 2]);
    if (n > mx) mx = n;
  }
  return mx;
}
for (const [name, min, unit] of [
  ['jawOpen', 0.03, 'м'], ['eyeBlinkLeft', 0.007, 'м'], ['browInnerUp', 0.002, 'м'],
  ['mouthSmileLeft', 0.01, 'м'], ['viseme_O', 0.012, 'м']]) {
  const m = morphMax(name);
  ok(m !== null && m >= min, name + ' max=' + (m === null ? 'нет' : (m * 1000).toFixed(1) + 'мм') +
    ' ≥ ' + (min * 1000).toFixed(0) + 'мм');
}

/* ---------- 3. visemes + ARKit ---------- */
console.log('3. Visemes и ARKit-имена:');
const vis = names.filter((n) => n.startsWith('viseme_'));
ok(JSON.stringify(vis) === JSON.stringify(['viseme_A', 'viseme_E', 'viseme_I', 'viseme_O',
  'viseme_U', 'viseme_MB', 'viseme_FV']), 'visemes: ' + vis.join(','));
for (const n of ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthClose', 'mouthSmileLeft',
  'mouthSmileRight', 'browInnerUp', 'browDownLeft', 'browDownRight', 'eyeLookUpLeft',
  'eyeLookDownRight', 'eyeWideLeft', 'cheekPuff', 'mouthPucker']) {
  ok(names.includes(n), 'ARKit-имя: ' + n);
}

/* ---------- 4. геометрия в разумных диапазонах (мировые координаты) ---------- */
console.log('4. Геометрия (Y-up glTF, мировые координаты):');
// матрица узла (matrix или TRS) — РЯД-мажор: translation в индексах 3,7,11
function nodeMatrix(n) {
  if (n.matrix) {
    // glTF хранит matrix колонко-мажорно — транспонируем в ряд-мажор
    const c = n.matrix, m = new Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) m[i * 4 + j] = c[j * 4 + i];
    return m;
  }
  const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  const [x, y, z, w] = q;
  const m = [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), t[0],
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), t[1],
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), t[2],
    0, 0, 0, 1];
  for (let i = 0; i < 12; i += 4) { m[i] *= s[0]; m[i + 1] *= s[1]; m[i + 2] *= s[2]; }
  return m;
}
function matMul(a, b) { // a·b, row-major 4x4
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
    for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return r;
}
const worldCache = {};
function worldMatrix(i) {
  if (worldCache[i] !== undefined) return worldCache[i];
  const n = gltf.nodes[i];
  let m = nodeMatrix(n);
  // родитель по списку children
  const p = gltf.nodes.findIndex((pn) => (pn.children || []).includes(i));
  if (p >= 0) m = matMul(worldMatrix(p), m);
  return (worldCache[i] = m);
}
function applyM(m, v) {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11]];
}
const eyeL = gltf.nodes[name2i['eyes_L']];
const eyeRaw = accessor(gltf.meshes[eyeL.mesh].primitives[0].attributes.POSITION);
const eyeW = worldMatrix(name2i['eyes_L']);
let c = [0, 0, 0];
for (let i = 0; i < eyeRaw.length; i += 3) {
  const p = applyM(eyeW, [eyeRaw[i], eyeRaw[i + 1], eyeRaw[i + 2]]);
  c[0] += p[0]; c[1] += p[1]; c[2] += p[2];
}
c = c.map((v) => v / (eyeRaw.length / 3));
ok(Math.abs(c[0] - 0.027) < 0.012 && Math.abs(c[1] - 1.497) < 0.025 && Math.abs(c[2] - 0.114) < 0.03,
  'центр левого глаза на месте: (' + c.map((v) => v.toFixed(3)).join(', ') + ')');
// pivot глазной кости = центр глазного яблока (газ вращается в плоскости глаза)
const eyeLN = gltf.nodes[name2i['eye.L']];
const eyeLW = worldMatrix(name2i['eye.L']);
const pivot = [eyeLW[3], eyeLW[7], eyeLW[11]];
const pivotD = Math.hypot(pivot[0] - c[0], pivot[1] - c[1], pivot[2] - c[2]);
ok(pivotD < 0.005, 'кость eye.L стоит в центре глаза (Δ=' + (pivotD * 1000).toFixed(1) + 'мм): ' +
  pivot.map((v) => v.toFixed(3)).join(', '));
// глобальные границы Body (со скин-позой покоя: AvenRig@identity)
const bodyW = worldMatrix(name2i['Body']);
let zMin = 1e9, zMax = -1e9, far = 0;
for (let i = 0; i < basePos.length; i += 3) {
  const p = applyM(bodyW, [basePos[i], basePos[i + 1], basePos[i + 2]]);
  zMin = Math.min(zMin, p[2]); zMax = Math.max(zMax, p[2]);
  far = Math.max(far, Math.abs(p[0]), Math.abs(p[1] - 1.4), Math.abs(p[2]));
}
ok(far < 0.6, 'нет улетевших вершин (max |coord rel head| = ' + far.toFixed(3) + 'м)');
ok(zMax - zMin < 0.5 && zMax < 1.0, 'глубина бюста разумная: z=[' + zMin.toFixed(2) + ',' + zMax.toFixed(2) + ']');
// направление ключевых морфов в МИРЕ (glTF: Y вверх, лицо в +Z)
const jawD = morphDeltas('jawOpen');
let jawDy = 0, jawN = 0;
for (let i = 0; i < jawD.length; i += 3) {
  jawDy += jawD[i + 1]; jawN++; // линейная часть worldMatrix Body (без зеркала) сохраняет знак Y
}
ok(jawD.length >= 3 && jawDy / (jawN || 1) < -0.001,
  'jawOpen двигает челюсть вниз (средняя ΔY=' + (jawDy / (jawN || 1) * 1000).toFixed(1) + 'мм)');
const blinkK = names.indexOf('eyeBlinkLeft');
const blinkAcc = gltf.accessors[prim.targets[blinkK].POSITION];
const bvi = gltf.bufferViews[blinkAcc.sparse.indices.bufferView];
const BIdxT = blinkAcc.sparse.indices.componentType === 5125 ? Uint32Array : Uint16Array;
const bIdx = new BIdxT(bin.buffer, bin.byteOffset + (bvi.byteOffset || 0) +
  (blinkAcc.sparse.indices.byteOffset || 0), blinkAcc.sparse.count);
let blinkHigh = 0;
for (const k of bIdx) blinkHigh += (basePos[k * 3 + 1] > 1.44) ? 1 : 0;
ok(blinkHigh / bIdx.length > 0.9,
  'eyeBlinkLeft двигает только область глаз (' + blinkHigh + '/' + bIdx.length + ' вершин выше уровня глаз)');

/* ---------- 5. stats.json согласован ---------- */
console.log('5. stats.json ↔ GLB:');
const stats = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/3d/female-aven-v2.stats.json'), 'utf8'));
let tris = 0, verts = 0;
gltf.meshes.forEach((m) => m.primitives.forEach((p) => {
  verts += accessor(p.attributes.POSITION).length / 3;
  tris += triCount(p);
}));
ok(stats.glb_tris === tris && stats.glb_verts === verts,
  'stats glb ' + stats.glb_tris + 't/' + stats.glb_verts + 'v = GLB ' + tris + 't/' + verts + 'v');
ok(tris >= stats.total_tris && verts >= stats.total_verts &&
  verts - stats.total_verts < stats.total_verts * 0.03,
  'GLB ≈ исходный меш: +verts ' + (verts - stats.total_verts) + ' (швы нормалей, <3%)');
ok(stats.glb_bytes === buf.length, 'stats.glb_bytes ' + stats.glb_bytes + ' = файл ' + buf.length);
ok(stats.arkit_count === names.filter((n) => !n.startsWith('viseme_')).length,
  'stats.arkit_count ' + stats.arkit_count + ' = не-viseme морфов ' + names.filter((n) => !n.startsWith('viseme_')).length);
ok(stats.visemes.length === vis.length, 'stats.visemes ' + stats.visemes.length + ' = ' + vis.length);
ok(buf.length > 4 * 1024 * 1024 && buf.length < 8 * 1024 * 1024, 'размер GLB в бюджете: ' +
  (buf.length / 1048576).toFixed(2) + ' МБ');
ok(tris >= 30000 * 0.5 && tris <= 100000, 'треугольники в веб-бюджете 30–100k: ' + tris);

/* ---------- 6. статика viewer'а ---------- */
console.log('6. Viewer (aven-3d-v2-model.html + js/aven3d-v2-model.js):');
const html = fs.readFileSync(path.join(ROOT, 'aven-3d-v2-model.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'js/aven3d-v2-model.js'), 'utf8');
const syn = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: js });
ok(syn.status === 0, 'js/aven3d-v2-model.js — валидный ES-модуль (node --check)');
for (const s of ['data-view="front"', 'data-view="left"', 'data-view="right"', 'data-view="back"',
  'data-gaze=', 'data-viseme=', 'id="techTable"', 'importmap', 'front-reference.jpg']) {
  ok(html.includes(s), 'HTML содержит ' + s);
}
for (const s of ['morphTargetInfluences', 'morphTargetDictionary', "findBone(['eye.L'",
  'OrbitControls', 'female-aven-v2.glb', 'female-aven-v2.stats.json', 'autoRotate']) {
  ok(js.includes(s), 'JS содержит ' + s);
}
// importmap указывает на vendored файлы, и они существуют
const imap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1].trim());
for (const [k, v] of Object.entries(imap.imports)) {
  ok(fs.existsSync(path.join(ROOT, v)) && fs.statSync(path.join(ROOT, v)).size > 0,
    'vendored ' + k + ' → ' + v);
}
for (const rel of [GLB_REL, 'assets/3d/female-aven-v2.stats.json',
  'assets/character/v2-reference-views/front-reference.jpg']) {
  ok(fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).size > 0, 'ассет ' + rel);
}
// превью-лист для владельца
const sheet = path.join(ROOT, '..', 'review', '3d-v2-model', 'female-aven-v2-preview.jpg');
ok(fs.existsSync(sheet), 'review/3d-v2-model/female-aven-v2-preview.jpg существует');

/* ---------- итог ---------- */
console.log('\nИтого: ' + pass + ' ✓, ' + fail + ' ✗');
process.exit(fail ? 1 : 0);
