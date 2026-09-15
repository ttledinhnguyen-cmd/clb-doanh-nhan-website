/**
 * Tạo tài khoản, hoặc cấp lại link đặt mật khẩu, bằng dòng lệnh.
 *
 * Việc hằng ngày (tạo tài khoản cho hội viên, ban thư ký; khoá; đặt lại mật
 * khẩu) làm ở trang /tai-khoan bằng tài khoản quản trị. Script này dùng khi chưa
 * có tài khoản quản trị nào, hoặc khi quản trị viên không vào được nữa.
 *
 * Script không đặt mật khẩu hộ ai. Nó tạo link dùng một lần để người nhận tự
 * đặt mật khẩu; cơ sở dữ liệu chỉ giữ bản băm của link. Link được ghi vào thư
 * mục rieng-tu/ (đã loại khỏi Git) và KHÔNG in ra màn hình.
 *
 *   npm run tai-khoan -- admin "Quản trị viên" --vai-tro admin --nap
 *   npm run tai-khoan -- admin --dat-lai --nap          # quản trị viên quên mật khẩu
 *   npm run tai-khoan -- thuky "Ban thư ký" --vai-tro thu-ky --nap
 *   npm run tai-khoan -- nguyen-hai-nam "Anh Nam" --vai-tro hoi-vien --hoi-vien nguyen-hai-nam --nap
 *
 *   --nap          nạp luôn vào D1 bằng wrangler (không có thì chỉ in lệnh nạp)
 *   --local        đi kèm --nap: nạp vào D1 chạy thử trên máy (npm run thu-functions)
 *   --han-ngay N   link hết hạn sau N ngày, mặc định 7
 *   --goc URL      địa chỉ website ghi trong link, mặc định https://kh-sg.com
 *   --ra THU_MUC   nơi ghi file, mặc định rieng-tu
 */
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const VAI_TRO = {
  admin: 'quản trị — toàn quyền, kể cả quản lý tài khoản',
  'thu-ky': 'ban thư ký — sửa toàn bộ nội dung',
  'hoi-vien': 'hội viên — chỉ sửa hồ sơ của mình',
};
const MAU_TEN = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const MAU_SLUG = /^[a-z0-9-]{2,80}$/;
const CO_GIA_TRI = ['--vai-tro', '--hoi-vien', '--han-ngay', '--goc', '--ra'];

const thamSo = process.argv.slice(2);
const co = (ten) => thamSo.includes(ten);
const giaTri = (ten, macDinh = '') => {
  const i = thamSo.indexOf(ten);
  return i >= 0 ? (thamSo[i + 1] ?? '') : macDinh;
};
const viTri = thamSo.filter((t, i) => !t.startsWith('--') && !CO_GIA_TRI.includes(thamSo[i - 1]));
const dung = (msg) => {
  console.error(msg);
  process.exit(1);
};

const ten = (viTri[0] ?? '').normalize('NFC').trim().toLowerCase();
const tenHienThi = (viTri[1] ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 80);
const datLai = co('--dat-lai');
const vaiTro = giaTri('--vai-tro');
const slug = giaTri('--hoi-vien');
const hanNgay = Number(giaTri('--han-ngay', '7'));
const goc = giaTri('--goc', 'https://kh-sg.com').replace(/\/+$/, '');
const thuMucRa = giaTri('--ra', 'rieng-tu');
const noiNap = co('--local') ? '--local' : '--remote';

const VI_DU = 'Ví dụ:  npm run tai-khoan -- admin "Quản trị viên" --vai-tro admin --nap';
if (!MAU_TEN.test(ten)) {
  dung(`Tên đăng nhập dài 3–40 ký tự: chữ thường không dấu, số, dấu chấm, gạch ngang, gạch dưới.\n${VI_DU}`);
}
if (!datLai) {
  if (!tenHienThi) dung(`Thiếu tên hiển thị.\n${VI_DU}`);
  if (!(vaiTro in VAI_TRO)) dung('Thiếu hoặc sai --vai-tro (admin | thu-ky | hoi-vien).');
  if (vaiTro === 'hoi-vien' && !MAU_SLUG.test(slug)) {
    dung('Tài khoản hội viên cần --hoi-vien <mã hội viên>, trùng tên file trong src/content/hoi-vien.');
  }
}
if (!Number.isInteger(hanNgay) || hanNgay < 1 || hanNgay > 30) dung('--han-ngay phải là số ngày từ 1 đến 30.');
if (!/^https?:\/\/[^\s/]+$/.test(goc)) dung('--goc không hợp lệ, ví dụ https://kh-sg.com');

const ma = randomBytes(32).toString('base64url');
const maBam = createHash('sha256').update(ma).digest('hex');
const bayGio = new Date();
const hetHan = new Date(bayGio.getTime() + hanNgay * 86_400_000);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const idTaiKhoan = `(SELECT id FROM tai_khoan WHERE ten_dang_nhap = ${q(ten)})`;

const sql = datLai
  ? [
      // Mật khẩu cũ mất tác dụng ngay, mọi thiết bị đang đăng nhập bị đăng xuất.
      `UPDATE tai_khoan SET muoi = '', bam_mat_khau = '', hoat_dong = 1 WHERE ten_dang_nhap = ${q(ten)};`,
      `DELETE FROM phien_dang_nhap WHERE tai_khoan_id = ${idTaiKhoan};`,
    ]
  : [
      `INSERT INTO tai_khoan (ten_dang_nhap, ten_hien_thi, vai_tro, slug_hoi_vien, tao_luc, tao_boi) VALUES ` +
        `(${q(ten)}, ${q(tenHienThi)}, ${q(vaiTro)}, ${q(slug)}, ${q(bayGio.toISOString())}, 'dong-lenh');`,
    ];
sql.push(
  `DELETE FROM ma_kich_hoat WHERE tai_khoan_id = ${idTaiKhoan};`,
  `INSERT INTO ma_kich_hoat (ma_bam, tai_khoan_id, het_han, tao_luc, tao_boi) ` +
    `SELECT ${q(maBam)}, id, ${q(hetHan.toISOString())}, ${q(bayGio.toISOString())}, 'dong-lenh' ` +
    `FROM tai_khoan WHERE ten_dang_nhap = ${q(ten)};`,
  `INSERT INTO nhat_ky_thao_tac (tai_khoan, doi_tuong, noi_dung, co_anh, ip, luc) VALUES ('dong-lenh', ` +
    `${q(`tai-khoan/${ten}`)}, ${q(datLai ? 'dat-lai-mat-khau' : `tao-moi (${vaiTro})`)}, 0, '', ${q(bayGio.toISOString())});`,
);

mkdirSync(thuMucRa, { recursive: true });
const tepSql = path.join(thuMucRa, `tai-khoan-${ten}.sql`);
const tepLink = path.join(thuMucRa, `link-dat-mat-khau-${ten}.txt`);
writeFileSync(tepSql, ['-- Chỉ chứa bản băm của link, không chứa link.', ...sql, ''].join('\n'));
writeFileSync(
  tepLink,
  [
    'LINK ĐẶT MẬT KHẨU — CLB DOANH NHÂN KHÁNH HÒA – SÀI GÒN',
    '',
    `Tài khoản:    ${ten}${datLai ? '' : ` (${tenHienThi}; ${VAI_TRO[vaiTro]})`}`,
    `Hết hạn lúc:  ${hetHan.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    '',
    'GIỮ KÍN LINK NÀY. Ai mở link trước sẽ đặt được mật khẩu cho tài khoản.',
    'Link chỉ dùng được một lần. Gửi riêng cho đúng người, đừng đăng vào nhóm chung.',
    '',
    `${goc}/kich-hoat#${ma}`,
    '',
    'Mở link, chọn mật khẩu (ít nhất 10 ký tự), web tự đăng nhập luôn.',
    `Những lần sau đăng nhập ở ${goc}/dang-nhap`,
    '',
  ].join('\n'),
);

const lenhNap = `npx wrangler d1 execute clb-doanh-nhan ${noiNap} -y --file "${tepSql}"`;
if (co('--nap')) {
  try {
    execSync(lenhNap, { stdio: ['ignore', 'ignore', 'inherit'] });
    // UPDATE hay INSERT … SELECT gõ sai tên đăng nhập thì không báo lỗi, nên kiểm lại.
    const ra = execSync(
      `npx wrangler d1 execute clb-doanh-nhan ${noiNap} --json --command "SELECT COUNT(*) AS n FROM ma_kich_hoat WHERE ma_bam = '${maBam}'"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    );
    if (JSON.parse(ra)[0]?.results?.[0]?.n !== 1) {
      dung(`Nạp chưa thành công: không thấy link trong cơ sở dữ liệu. Tài khoản "${ten}" có tồn tại không?`);
    }
  } catch (e) {
    dung(`Nạp vào cơ sở dữ liệu thất bại: ${e.message.split('\n')[0]}`);
  }
  console.log(`Đã ${datLai ? 'cấp lại link đặt mật khẩu cho' : 'tạo'} tài khoản ${ten} trong cơ sở dữ liệu.`);
} else {
  console.log(`Đã chuẩn bị ${datLai ? 'link đặt lại mật khẩu cho' : ''} tài khoản ${ten}. Nạp vào cơ sở dữ liệu bằng:`);
  console.log(`  ${lenhNap}`);
}
console.log(`Link đặt mật khẩu (hết hạn sau ${hanNgay} ngày) nằm trong file, không in ra đây:`);
console.log(`  ${path.resolve(tepLink)}`);
