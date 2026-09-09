/**
 * Phát mã cập nhật hồ sơ cho hội viên.
 *
 * Mỗi hội viên nhận một đường dẫn bí mật riêng, gửi qua Zalo. Mở link là sửa
 * được hồ sơ của mình, không cần tài khoản hay mật khẩu.
 *
 * Cơ sở dữ liệu chỉ lưu BẢN BĂM của mã, nên nếu làm mất file link thì không
 * lấy lại được — phải phát mã mới cho người đó.
 *
 *   node scripts/tao-ma-cap-nhat.mjs                  # phát cho ai chưa có mã
 *   node scripts/tao-ma-cap-nhat.mjs --tat-ca         # phát lại cho tất cả
 *   node scripts/tao-ma-cap-nhat.mjs nguyen-hai-nam   # phát lại cho một người
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
const tatCa = thamSo.includes('--tat-ca');
const chiDinh = thamSo.filter((t) => !t.startsWith('--'));

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
} else if (!tatCa) {
  console.log('Chưa có tuỳ chọn nào nên sẽ phát mã cho TẤT CẢ hội viên.');
  console.log('Muốn phát lại cho một người thì thêm mã hội viên vào cuối lệnh.\n');
}

const muc = [
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
writeFileSync(path.join(RA, 'ma-cap-nhat.sql'), sql.join('\n') + '\n');
writeFileSync(path.join(RA, 'duong-dan-hoi-vien.txt'), link.join('\n'));

console.log(`Đã phát mã cho ${muc.length} người (gồm 1 mã ban thư ký).`);
console.log('');
console.log('Bước tiếp theo:');
console.log('');
console.log('  1. Nạp mã vào cơ sở dữ liệu:');
console.log('     npx wrangler d1 execute clb-doanh-nhan --remote -y --file rieng-tu/ma-cap-nhat.sql');
console.log('');
console.log('  2. Mở file này rồi gửi từng đường dẫn cho đúng người qua Zalo:');
console.log(`     ${path.resolve(RA, 'duong-dan-hoi-vien.txt')}`);
console.log('');
console.log('Thư mục rieng-tu/ đã được loại khỏi Git nên không bị đẩy lên kho.');
