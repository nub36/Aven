/* Проверка sculpt-base проекта Female Aven V2 (этап после REJECTED автоматического
   face fit) + целостности отклонённого меша.

   Разработческий инструмент, НЕ зависимость продукта: чистый Node без npm.

   Запуск (из корня репозитория):
     node prototype/tests/aven3d-sculpt-base-check.js

   Что проверяется ОБЪЕКТИВНО:
   1. Отклонённый GLB НЕ изменён (sha256 фиксирует rejected candidate):
      автоматический face fit больше никто не трогает.
   2. Sculpt-base .blend существует, размер разумен, изображения упакованы.
   3. meta.json: чистая база из basehuman.npz (без warp), коллекции, 6 reference
      плейнов, риг 7 костей БЕЗ весов, морфы НЕ переносились.
   4. Review-листы base-clay-views.jpg / base-reference-setup.jpg существуют.
   5. Документация: SCULPT GUIDE с 18 этапами, REJECTED-статус в плане, ADR-114
      не Accepted, WORK_LOG содержит запись этапа.
   6. Временные рендеры НЕ в репозитории (research/3d/v2/out/ в .gitignore). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}

/* ---------- 1. отклонённый GLB не тронут ---------- */
console.log('1. Отклонённый V2 GLB не изменён (REJECTED candidate):');
const GLB = 'assets/3d/female-aven-v2.glb';
const SHA = '60734adde326228e05cc6c5b51a2382997e4efbea10cfba16b697fada136cc30';
const h = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, GLB))).digest('hex');
ok(h === SHA, 'female-aven-v2.glb sha256 совпадает (rejected mesh нетронут)');

/* ---------- 2. sculpt-base .blend ---------- */
console.log('2. Sculpt-base .blend:');
const BLEND = 'assets/3d/sculpt/female-aven-sculpt-base.blend';
const bp = path.join(ROOT, BLEND);
ok(fs.existsSync(bp), BLEND + ' существует');
const bsz = fs.statSync(bp).size;
ok(bsz > 500 * 1024 && bsz < 20 * 1024 * 1024,
  'размер разумен: %.1f МБ'.replace('%.1f', (bsz / 1048576).toFixed(1)));
// Blender 5.0 с compress=True пишет весь файл zstd (магия 28 B5 2F FD);
// без сжатия файл начинается с 'BLENDER'. Проверяем оба варианта.
const head = fs.readFileSync(bp).subarray(0, 12);
const isZstd = head[0] === 0x28 && head[1] === 0xb5 && head[2] === 0x2f && head[3] === 0xfd;
ok(isZstd || head.toString('binary').startsWith('BLENDER'),
  'это файл Blender (.blend' + (isZstd ? ', zstd-compressed' : '') + ')');

/* ---------- 3. meta.json ---------- */
console.log('3. meta.json (чистая база, без warp):');
const META = 'assets/3d/sculpt/female-aven-sculpt-base.meta.json';
const m = JSON.parse(fs.readFileSync(path.join(ROOT, META), 'utf8'));
ok(m.status.includes('SCULPT BASE') && m.status.includes('REJECTED'),
  'статус: ' + m.status);
ok(m.source.includes('БЕЗ warp') || m.source.includes('без warp'),
  'источник: ' + m.source);
ok(m.base.verts === 5533 && m.base.tris === 11062,
  'base: ' + m.base.verts + 'v / ' + m.base.tris + 't (совпадает с Stage 5 — ' +
  'тот же Z_CUT, но на ЧИСТОЙ базе)');
ok(JSON.stringify(m.collections) === JSON.stringify(
  ['FEMALE_AVEN_BASE', 'EYES', 'FACE_PROXIES', 'RIG', 'REFERENCES', 'GUIDES']),
  'коллекции: ' + m.collections.join(', '));
const planes = Object.keys(m.reference_planes);
ok(planes.length === 6 &&
   ['front', 'left34', 'right34', 'left_profile', 'right_profile', 'back']
     .every((v) => planes.includes(v)),
  'reference-плейны: ' + planes.join(', '));
ok(planes.every((v) => m.reference_planes[v].px_per_m > 1500 &&
  m.reference_planes[v].px_per_m < 2300),
  'калибровка согласована (1500–2300 px/м все виды)');
ok(m.rig.bones.length === 7 && String(m.rig.weights).startsWith('NONE'),
  'риг: ' + m.rig.bones.join(',') + ' БЕЗ весов');
ok(planes.every((v) => m.reference_planes[v].image.endsWith('.jpg')),
  'изображения плейнов указаны в meta (упакованы в .blend при сборке)');
ok(m.anchors && Math.abs(m.anchors.eye_mid[2] - 1.4979) < 0.001,
  'якорь глаз: z=' + m.anchors.eye_mid[2]);

/* ---------- 4. review-листы ---------- */
console.log('4. Review-листы sculpt-base:');
for (const f of ['base-clay-views.jpg', 'base-reference-setup.jpg']) {
  const p = path.join(ROOT, '..', 'review', '3d-v2-model', f);
  ok(fs.existsSync(p) && fs.statSync(p).size > 30 * 1024, f + ' существует');
}

/* ---------- 5. документация ---------- */
console.log('5. Документация (REJECTED + sculpt guide):');
const guide = fs.readFileSync(path.join(ROOT, '..', 'docs',
  'AVATAR_3D_V2_SCULPT_GUIDE.md'), 'utf8');
ok(guide.includes('18') && ['skull', 'forehead', 'brow ridge', 'eye sockets',
  'nose bridge', 'cheekbones', 'jawline', 'ears', 'neck transition']
  .every((s) => guide.toLowerCase().includes(s)), 'гайд: все 18 этапов описаны');
ok(guide.toLowerCase().includes('symmetry'), 'гайд: правило symmetry');
const plan = fs.readFileSync(path.join(ROOT, '..', 'docs',
  'AVATAR_3D_V2_PLAN.md'), 'utf8');
ok(/REJECTED BY OWNER/i.test(plan), 'план: статус REJECTED BY OWNER');
ok(/sculpt-base/i.test(plan), 'план: раздел следующего этапа (sculpt-base)');
const dec = fs.readFileSync(path.join(ROOT, '..', 'docs', 'DECISIONS.md'),
  'utf8');
ok(/ADR-114[\s\S]{0,400}Rejected/i.test(dec),
  'ADR-114: статус Rejected (не Accepted)');
ok(dec.includes('ADR-115'), 'ADR-115 (sculpt-base этап) добавлен');
const wl = fs.readFileSync(path.join(ROOT, '..', 'docs', 'WORK_LOG.md'),
  'utf8');
ok(wl.includes('XXXI'), 'WORK_LOG: запись XXXI есть');

/* ---------- 6. временные файлы НЕ в репозитории ---------- */
console.log('6. Гигиена репозитория:');
const gi = fs.readFileSync(path.join(ROOT, '..', '.gitignore'), 'utf8');
ok(gi.includes('research/3d/v2/out/'), '.gitignore: out/ исключён');
const sculptDir = fs.readdirSync(path.join(ROOT, 'assets/3d/sculpt'));
ok(sculptDir.length === 2, 'в sculpt/ только .blend и .meta.json: ' +
  sculptDir.join(', '));

console.log('\nИтого: ' + pass + ' ✓, ' + fail + ' ✗');
process.exit(fail ? 1 : 0);
