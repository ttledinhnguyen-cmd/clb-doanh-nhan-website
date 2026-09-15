/**
 * Dựng mọi file logo và biểu tượng của website từ logo gốc của câu lạc bộ.
 *
 * public/logo-full.svg được chuyển nguyên nét từ file "logo CLB KHANH HOA.ai":
 * cánh yến ở trên, chữ "CLB / Doanh nhân / KHÁNH HÒA - SÀI GÒN" ở dưới, chữ
 * xanh và cam. Ngày 15/09/2026 câu lạc bộ yêu cầu mọi chỗ trên web đều hiện
 * đúng logo này, nên script chỉ cắt lề thừa rồi đặt logo lên nền — không tách
 * riêng cánh yến, không xếp lại bố cục, không đổi màu.
 *
 *   node scripts/tao-logo.mjs
 *
 * Sinh ra trong public/:
 *   logo-goc.svg          logo gốc, khung ôm sát nét vẽ (đầu trang, chân trang)
 *   anh-chua-co-anh.svg   khung 3:4 có logo mờ, thay cho ảnh chân dung còn thiếu
 *   favicon.svg, favicon.ico
 *                         biểu tượng trên tab trình duyệt
 *   apple-touch-icon.png, icon-192.png, icon-512.png
 *                         biểu tượng khi thêm web ra màn hình điện thoại
 *   anh-chia-se.png       ảnh 1200x630 hiện khi chia sẻ link lên Zalo, Facebook
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const goc = readFileSync('public/logo-full.svg', 'utf8');
const [, rong, cao] = goc.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
// Phần nét vẽ bên trong thẻ <svg>, dùng lại khi đặt logo vào khung khác.
const net = goc.slice(goc.indexOf('>') + 1, goc.lastIndexOf('</svg>'));

// File gốc chừa lề trên dày mà lề dưới gần như bằng 0, logo đặt vào khung sẽ
// lệch. Đo khung bao thật bằng cách vẽ ra ảnh rồi cắt viền trống, chừa thêm
// nửa đơn vị cho mép nét khử răng cưa.
const TI_LE = 10;
const LE = 0.5;
const { info } = await sharp(Buffer.from(goc.replace('<svg ', `<svg width="${rong * TI_LE}" height="${cao * TI_LE}" `)))
  .png()
  .trim({ threshold: 1 })
  .toBuffer({ resolveWithObject: true });
const f = (n) => +n.toFixed(2);
const k = {
  x: f(-info.trimOffsetLeft / TI_LE - LE),
  y: f(-info.trimOffsetTop / TI_LE - LE),
  w: f(info.width / TI_LE + 2 * LE),
  h: f(info.height / TI_LE + 2 * LE),
};

/** Nét logo co giãn cho rộng `r`, góc trên bên trái đặt tại (x, y). */
const datLogo = (x, y, r) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${+(r / k.w).toFixed(5)}) translate(${-k.x} ${-k.y})">${net}</g>`;

const logoGoc = goc.replace(/viewBox="[^"]+"/, `viewBox="${k.x} ${k.y} ${k.w} ${k.h}"`);
writeFileSync('public/logo-goc.svg', logoGoc);

// Hội viên chưa có ảnh chân dung: khung 3:4 nền xám nhạt, logo mờ ở giữa.
const RONG_MO = 150;
const caoMo = (RONG_MO * k.h) / k.w;
writeFileSync(
  'public/anh-chua-co-anh.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="#F1F5F9"/>` +
    `<g opacity="0.4">${datLogo((300 - RONG_MO) / 2, (400 - caoMo) / 2, RONG_MO)}</g></svg>`,
);

// Biểu tượng tab: nền trắng bo góc để tab trình duyệt nền tối vẫn thấy rõ logo.
const O = 64;
const rongIcon = Math.min(O - 6, ((O - 6) * k.w) / k.h);
const caoIcon = (rongIcon * k.h) / k.w;
const favicon =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${O} ${O}"><rect width="${O}" height="${O}" rx="12" fill="#FFFFFF"/>` +
  `${datLogo((O - rongIcon) / 2, (O - caoIcon) / 2, rongIcon)}</svg>`;
writeFileSync('public/favicon.svg', favicon);

/** Gói nhiều ảnh PNG vào một file .ico (định dạng ICO chứa được nguyên khối PNG). */
function goiIco(cacAnh) {
  const dau = Buffer.alloc(6 + 16 * cacAnh.length);
  dau.writeUInt16LE(1, 2); // loại file: biểu tượng
  dau.writeUInt16LE(cacAnh.length, 4);
  let viTri = dau.length;
  cacAnh.forEach(({ co, du }, i) => {
    const o = 6 + 16 * i;
    dau.writeUInt8(co, o);
    dau.writeUInt8(co, o + 1);
    dau.writeUInt16LE(1, o + 4); // số mặt phẳng màu
    dau.writeUInt16LE(32, o + 6); // số bit mỗi điểm ảnh
    dau.writeUInt32LE(du.length, o + 8);
    dau.writeUInt32LE(viTri, o + 12);
    viTri += du.length;
  });
  return Buffer.concat([dau, ...cacAnh.map((a) => a.du)]);
}
const cacCoIco = await Promise.all(
  [16, 32, 48].map(async (co) => ({
    co,
    du: await sharp(Buffer.from(favicon), { density: 72 * 8 }).resize(co, co).png().toBuffer(),
  })),
);
writeFileSync('public/favicon.ico', goiIco(cacCoIco));

/** Vẽ logo gốc cao tối đa `cao` điểm ảnh (vẽ ở độ phân giải gấp đôi rồi thu nhỏ cho nét mịn). */
const veLogo = (caoLogo) =>
  sharp(Buffer.from(logoGoc), { density: 72 * Math.ceil((caoLogo * 2) / k.h) })
    .resize(caoLogo, caoLogo, { fit: 'inside' })
    .png()
    .toBuffer();

/** Ảnh nền trắng khổ `r` x `c`, logo cao `caoLogo` nằm chính giữa. */
async function ghiAnhNenTrang(duongDan, r, c, caoLogo) {
  await sharp({ create: { width: r, height: c, channels: 3, background: '#ffffff' } })
    .composite([{ input: await veLogo(caoLogo), gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(duongDan);
}

// Biểu tượng màn hình chính: điện thoại tự bo góc hoặc cắt tròn, nên chừa lề 10%.
await ghiAnhNenTrang('public/apple-touch-icon.png', 180, 180, 144);
await ghiAnhNenTrang('public/icon-192.png', 192, 192, 154);
await ghiAnhNenTrang('public/icon-512.png', 512, 512, 410);
await ghiAnhNenTrang('public/anh-chia-se.png', 1200, 630, 440);

console.log(`Khung nét vẽ: ${k.x} ${k.y} ${k.w} ${k.h} (tỉ lệ ${f(k.w / k.h)}:1)`);
console.log(
  'Đã ghi: logo-goc.svg, anh-chua-co-anh.svg, favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, anh-chia-se.png',
);
