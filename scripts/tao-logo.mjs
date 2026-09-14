/**
 * Dựng các bản logo dùng trên website từ logo gốc của câu lạc bộ.
 *
 * public/logo-full.svg được chuyển nguyên nét từ file "logo CLB KHANH HOA.ai":
 * biểu tượng ở trên, chữ "CLB / Doanh nhân / KHÁNH HÒA - SÀI GÒN" ở dưới.
 * Header cần bản nằm ngang, nên script này tách biểu tượng và khối chữ ra rồi
 * xếp cạnh nhau — giữ nguyên nét chữ và màu gốc của logo, không gõ lại bằng
 * font khác.
 *
 *   node scripts/tao-logo.mjs
 *
 * Sinh ra:
 *   public/logo-ngang.svg        bản ngang, màu gốc (header khi nền trắng)
 *   public/logo-ngang-trang.svg  bản ngang, phần xanh đổi sang trắng (nền tối)
 *   public/anh-chia-se.png       ảnh 1200x630 hiện khi chia sẻ link lên Zalo, Facebook
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const XANH = '#00558F';
const goc = readFileSync('public/logo-full.svg', 'utf8');
const [, rong, cao] = goc.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
const bienDoi = goc.match(/<g transform="([^"]+)">/)[1];
const cacPath = [...goc.matchAll(/<path[^>]*\/>/g)].map((m) => m[0]);

// Biểu tượng là 6 nét xanh nằm hẳn phía trên; mọi nét còn lại thuộc khối chữ.
// Phân loại theo toạ độ chứ không theo thứ tự, lỡ file gốc xếp nét khác đi.
const [tx, ty] = bienDoi.match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
const dayCuaNet = (p) => {
  const so = (p.match(/ d="([^"]+)"/)[1].match(/-?\d*\.?\d+/g) ?? []).map(Number);
  let yMax = -Infinity;
  for (let i = 1; i < so.length; i += 2) yMax = Math.max(yMax, ty - so[i]);
  return yMax;
};
const netBieuTuong = cacPath.filter((p) => p.includes(XANH) && dayCuaNet(p) < cao * 0.7);
const netChu = cacPath.filter((p) => !netBieuTuong.includes(p));
if (netBieuTuong.length !== 6) throw new Error(`Tách biểu tượng ra ${netBieuTuong.length} nét, mong đợi 6.`);

/** Đo khung bao thật của một nhóm nét bằng cách vẽ ra ảnh rồi cắt viền trống. */
const TI_LE = 10;
async function doKhung(net) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rong} ${cao}" width="${rong * TI_LE}" height="${cao * TI_LE}"><g transform="${bienDoi}">${net.join('')}</g></svg>`;
  const { info } = await sharp(Buffer.from(svg)).png().trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  return {
    x: -info.trimOffsetLeft / TI_LE,
    y: -info.trimOffsetTop / TI_LE,
    w: info.width / TI_LE,
    h: info.height / TI_LE,
  };
}

const bt = await doKhung(netBieuTuong);
const chu = await doKhung(netChu);

// Biểu tượng cao bằng khối chữ; khoảng hở bằng 18% chiều cao.
const s = chu.h / bt.h;
const btRong = bt.w * s;
const ho = chu.h * 0.18;
const tongRong = btRong + ho + chu.w;
const f = (n) => +n.toFixed(3);

const dungSvg = (mauXanh) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(tongRong)} ${f(chu.h)}" role="img" aria-label="CLB Doanh nhân Khánh Hòa - Sài Gòn">` +
  `<g transform="translate(${f(-bt.x * s)} ${f(-bt.y * s)}) scale(${f(s)})"><g transform="${bienDoi}">${netBieuTuong.join('')}</g></g>` +
  `<g transform="translate(${f(btRong + ho - chu.x)} ${f(-chu.y)})"><g transform="${bienDoi}">${netChu.join('')}</g></g>` +
  `</svg>`.replaceAll(XANH, mauXanh);

const mau = dungSvg(XANH);
const trang = dungSvg(XANH).replaceAll(XANH, '#FFFFFF');
writeFileSync('public/logo-ngang.svg', mau);
writeFileSync('public/logo-ngang-trang.svg', trang);

// Ảnh chia sẻ: nền trắng, logo gốc (bản đứng) ở giữa.
const CAO_LOGO = 440;
const logoDung = await sharp(Buffer.from(goc), { density: 600 }).resize({ height: CAO_LOGO }).png().toBuffer();
const { width: rongLogo } = await sharp(logoDung).metadata();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#ffffff' } })
  .composite([{ input: logoDung, left: Math.round((1200 - rongLogo) / 2), top: Math.round((630 - CAO_LOGO) / 2) }])
  .png({ compressionLevel: 9 })
  .toFile('public/anh-chia-se.png');

console.log(`Biểu tượng ${f(bt.w)}x${f(bt.h)} | khối chữ ${f(chu.w)}x${f(chu.h)}`);
console.log(`logo-ngang.svg: ${f(tongRong)}x${f(chu.h)} (tỉ lệ ${f(tongRong / chu.h)}:1), ${mau.length} byte`);
console.log(`anh-chia-se.png: 1200x630, logo cao ${CAO_LOGO}px`);
