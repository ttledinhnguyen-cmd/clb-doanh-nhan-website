/**
 * Phát mã cập nhật hồ sơ cho hội viên.
 *
 * Mỗi hội viên nhận một đường dẫn bí mật riêng, gửi qua Zalo. Mở link là sửa
 * được hồ sơ của mình, không cần tài khoản hay mật khẩu.
 *
 * Cơ sở dữ liệu chỉ lưu BẢN BĂM của mã, nên nếu làm mất file link thì không
 * lấy lại được — phải phát mã mới cho người đó.
 *
 *   node scripts/tao-ma-cap-nhat.mjs                     # phát lại cho tất cả
 *   node scripts/tao-ma-cap-nhat.mjs nguyen-hai-nam      # phát lại cho một người
 *   node scripts/tao-ma-cap-nhat.mjs --thu-ky "Chị Lan"  # cấp thêm một mã quyền thư ký
 *
 * Mã quyền thư ký sửa được hồ sơ mọi hội viên. Nên cấp cho mỗi người một mã
 * riêng thay vì dùng chung, để nhật ký biết ai đã sửa gì.
 *
 * Sau khi chạy, làm tiếp 2 việc mà script in ra:
 *   1. Nạp file SQL vào D1
 *   2. Mở file link, gửi từng dòng cho đúng người
 */
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const TEN_MIEN = 'https://clb-doanh-nhan-khanh-hoa.pages.dev';
const THU_MUC = 'src/content/hoi-vien';
const RA = 'rieng-tu';

const thamSo = process.argv.slice(2);
const viTriThuKy = thamSo.indexOf('--thu-ky');
const themThuKy = viTriThuKy >= 0 ? thamSo[viTriThuKy + 1] : null;
const tatCa = thamSo.includes('--tat-ca');
const chiDinh = thamSo.filter(
  (t, i) => !t.startsWith('--') && i !== viTriThuKy + 1,
);

if (viTriThuKy >= 0 && !themThuKy) {
  console.error('Thiếu tên người nhận. Ví dụ:  npm run ma -- --thu-ky "Chị Lan"');
  process.exit(1);
}

/** Bỏ dấu và ký tự lạ để làm mã định danh trong cơ sở dữ liệu. */
const lamSlug = (s) =>
  '__tk-' +
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

const bam = (s) => createHash('sha256').update(s).digest('hex');
const taoMa = () => randomBytes(32).toString('base64url');

const docTen = (slug) => {
  const raw = readFileSync(path.join(THU_MUC, `${slug}.md`), 'utf8');
  const ten = raw.match(/^hoTen:\s*"?([^"\n]*)"?\s*$/m)?.[1]?.trim() ?? slug;
  const xungHo = raw.match(/^xungHo:\s*"?([^"\n]*)"?\s*$/m)?.[1]?.trim() ?? '';
  return [xungHo, ten].filter(Boolean).join(' ');
};

const tatCaSlug = readdirSync(THU_MUC)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => f.replace(/\.md$/, ''))
  .sort();

let danhSach = tatCaSlug;
if (chiDinh.length) {
  const sai = chiDinh.filter((s) => !tatCaSlug.includes(s));
  if (sai.length) {
    console.error(`Không có hội viên: ${sai.join(', ')}`);
    process.exit(1);
  }
  danhSach = chiDinh;
} else if (!tatCa && !themThuKy) {
  console.log('Sẽ phát LẠI mã cho TẤT CẢ hội viên.');
  console.log('Mọi đường dẫn cũ hết tác dụng, phải gửi lại link mới cho từng người.');
  console.log('Muốn cấp lại cho một người thì thêm mã hội viên vào cuối lệnh.\n');
}

// Chỉ cấp thêm một mã quyền thư ký, không đụng tới mã của ai khác.
const muc = themThuKy
  ? [
      {
        slug: lamSlug(themThuKy),
        vaiTro: 'thu-ky',
        ten: `QUYỀN THƯ KÝ — ${themThuKy} (sửa được hồ sơ mọi hội viên)`,
      },
    ]
  : [
      { slug: '__thu-ky', vaiTro: 'thu-ky', ten: 'BAN THƯ KÝ (sửa được hồ sơ mọi hội viên)' },
      ...danhSach.map((slug) => ({ slug, vaiTro: 'hoi-vien', ten: docTen(slug) })),
    ];

const luc = new Date().toISOString();
const sql = [
  '-- Mã cập nhật hồ sơ. Nạp bằng:',
  '--   npx wrangler d1 execute clb-doanh-nhan --remote -y --file rieng-tu/ma-cap-nhat.sql',
  '',
];
const link = [
  'MÃ CẬP NHẬT HỒ SƠ — CLB DOANH NHÂN KHÁNH HÒA – SÀI GÒN',
  `Phát ngày ${new Date().toLocaleString('vi-VN')}`,
  '',
  'GIỮ KÍN FILE NÀY. Mỗi đường dẫn là chìa khoá riêng của một người,',
  'ai có link đều sửa được hồ sơ đó. Gửi riêng qua Zalo cho đúng người,',
  'đừng đăng vào nhóm chung.',
  '',
  'Lỡ lộ link của ai thì chạy lại lệnh này kèm mã hội viên của họ,',
  'link cũ sẽ hết tác dụng ngay.',
  '',
  '='.repeat(70),
  '',
];

for (const m of muc) {
  const ma = taoMa();
  sql.push(
    `INSERT INTO ma_cap_nhat (slug, ma_bam, vai_tro, tao_luc) VALUES ` +
      `('${m.slug}', '${bam(ma)}', '${m.vaiTro}', '${luc}') ` +
      `ON CONFLICT(slug) DO UPDATE SET ma_bam = excluded.ma_bam, ` +
      `vai_tro = excluded.vai_tro, tao_luc = excluded.tao_luc, so_lan_dung = 0;`,
  );
  link.push(m.ten, `${TEN_MIEN}/cap-nhat?ma=${ma}`, '');
}

if (!existsSync(RA)) {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(RA, { recursive: true });
}

// Chỉ lần phát cho TOÀN BỘ mới được ghi đè file gốc. Lần cấp lẻ phải ghi ra
// file riêng, vì cơ sở dữ liệu chỉ giữ bản băm — ghi đè là mất sạch link cũ,
// không cách nào lấy lại ngoài phát lại mã cho tất cả mọi người.
const capLe = Boolean(themThuKy || chiDinh.length);
const hau = capLe
  ? '-bo-sung-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  : '';
const tenSql = `ma-cap-nhat${hau}.sql`;
const tenLink = `duong-dan-hoi-vien${hau}.txt`;

writeFileSync(path.join(RA, tenSql), sql.join('\n') + '\n');
writeFileSync(path.join(RA, tenLink), link.join('\n'));

console.log(
  themThuKy
    ? `Đã cấp thêm 1 mã quyền thư ký cho ${themThuKy}. Mã của người khác giữ nguyên.`
    : `Đã phát mã cho ${muc.length} người (gồm 1 mã ban thư ký).`,
);
console.log('');
console.log('Bước tiếp theo:');
console.log('');
console.log('  1. Nạp mã vào cơ sở dữ liệu:');
console.log(`     npx wrangler d1 execute clb-doanh-nhan --remote -y --file rieng-tu/${tenSql}`);
console.log('');
console.log('  2. Mở file này rồi gửi từng đường dẫn cho đúng người qua Zalo:');
console.log(`     ${path.resolve(RA, tenLink)}`);
console.log('');
console.log('Thư mục rieng-tu/ đã được loại khỏi Git nên không bị đẩy lên kho.');
