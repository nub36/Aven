/* Aven Android — генерация иконок лаунчера из существующего брендинга Aven
 * (та же метка, что и favicon сайта: скруглённый квадрат #5A5FD8 + белая «A»).
 * Female Aven/3D не трогаем — новых персонажных ассетов не создаём.
 *
 * Запуск (локально, НЕ нужен для сборки APK — PNG уже закоммичены):
 *   npm i sharp@0.33 (временно) && node android/tools/gen-icons.mjs
 *
 * Пишет PNG в android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/
 *   ic_launcher.png (48/72/96/144/192), ic_launcher_round.png,
 *   ic_launcher_foreground.png (432px для adaptive icon, мастер-канва 108dp).
 * Правила: без внешних шрифтов (system_fonts: дефолтный sans-bold рендерится sharp/librsvg).
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const RES = process.env.AVEN_RES || path.resolve(new URL('../app/src/main/res', import.meta.url).pathname);
const BG = '#5A5FD8';
const FG = '#FFFFFF';

function svgSquare(size, radius, letterScale = 0.58) {
  const t = Math.round(size * letterScale);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>` +
    `<text x="50%" y="54%" font-size="${t}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="${FG}" font-family="DejaVu Sans, Arial, sans-serif">A</text>` +
    `</svg>`);
}
function svgRound(size, letterScale = 0.56) {
  const t = Math.round(size * letterScale);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${BG}"/>` +
    `<text x="50%" y="54%" font-size="${t}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="${FG}" font-family="DejaVu Sans, Arial, sans-serif">A</text>` +
    `</svg>`);
}
/* Adaptive icon foreground: полная канва 108dp, «A» в безопасной зоне ~66dp, фон прозрачный */
function svgForeground(size) {
  const t = Math.round(size * 0.42);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<text x="50%" y="56%" font-size="${t}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="${FG}" font-family="DejaVu Sans, Arial, sans-serif">A</text>` +
    `</svg>`);
}

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
let written = 0;
for (const [d, px] of Object.entries(DENSITIES)) {
  const dir = path.join(RES, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  await sharp(svgSquare(px, Math.round(px * 0.24))).png().toFile(path.join(dir, 'ic_launcher.png'));
  await sharp(svgRound(px)).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  const fg = Math.round(px * 4); // 108dp × density/48 → 432px на xxhdpi=144 — масштаб не критичен: вектор
  await sharp(svgForeground(432)).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
  written += 3;
  void fg;
}
console.log(`icons written: ${written} → ${RES}`);
