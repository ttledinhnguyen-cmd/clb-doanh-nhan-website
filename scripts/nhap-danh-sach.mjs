/**
 * Nhập danh sách hội viên từ file Excel của ban thư ký.
 *
 *   node scripts/nhap-danh-sach.mjs [--ghi]
 *
 * Không có --ghi thì chỉ xem trước, không đụng vào file nào.
 *
 * File Excel nằm trong rieng-tu/ (đã gitignore) vì chứa số điện thoại của cả
 * câu lạc bộ. Script đọc nó bằng cách giải nén xlsx rồi đọc XML — không cần
 * thêm thư viện, đổi lại chỉ hiểu được bảng đơn giản: một sheet, chuỗi và số.
 *
 * Script làm hai việc:
 *   1. Thêm `dienThoaiXacThuc` vào hồ sơ đã có — số này KHÔNG hiện trên web,
 *      chỉ dùng để hội viên tự nhận mình khi đăng ký tài khoản. Trường công
 *      khai `dienThoai` giữ nguyên, ai muốn hiện số thì tự bật khi vào sửa.
 *   2. Tạo hồ sơ khung cho người chưa có: đủ trường theo schema, chỉ điền họ
 *      tên và số xác thực, phần còn lại để chính hội viên điền sau.
 *
 * Chạy lại được nhiều lần: hồ sơ đã có chỉ được bổ sung số xác thực còn thiếu,
 * không ghi đè thông tin ai đã nhập.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GOC = fileURLToPath(new URL('..', import.meta.url));
const FILE_EXCEL = join(GOC, 'rieng-tu', 'ds_thanhvien', 'DANH SÁCH THÀNH VIÊN fix - Copy.xlsx');
const THU_MUC_HO_SO = join(GOC, 'src', 'content', 'hoi-vien');

const GHI = process.argv.includes('--ghi');

// ─── Đọc xlsx ───────────────────────────────────────────────────────────────

const goThe = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Trả về các dòng của sheet đầu tiên, dạng { A: 'giá trị', B: … }. */
function docXlsx(duongDan) {
  const tam = mkdtempSync(join(tmpdir(), 'xlsx-'));
  try {
    // Expand-Archive chỉ nhận đuôi .zip, nên chép sang tên khác trước khi mở.
    const zip = join(tam, 'sach.zip');
    copyFileSync(duongDan, zip);
    const ra = join(tam, 'ra');
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${ra.replace(/'/g, "''")}' -Force`,
    ]);

    const chuoi = existsSync(join(ra, 'xl/sharedStrings.xml'))
      ? [...readFileSync(join(ra, 'xl/sharedStrings.xml'), 'utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
          goThe(m[1]),
        )
      : [];

    const sheet = readFileSync(join(ra, 'xl/worksheets/sheet1.xml'), 'utf8');
    const dong = [];
    for (const rm of sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const o = {};
      // Ô rỗng viết gọn thành <c ... /> nên phải nhận cả hai kiểu thẻ.
      for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = (cm[3] ?? '').match(/<v>([\s\S]*?)<\/v>/);
        if (v) o[cm[1]] = / t="s"/.test(cm[2]) ? (chuoi[+v[1]] ?? '') : v[1];
      }
      dong.push(o);
    }
    return dong;
  } finally {
    rmSync(tam, { recursive: true, force: true });
  }
}

// ─── Chuẩn hoá ──────────────────────────────────────────────────────────────

/**
 * Số điện thoại về dạng 0xxxxxxxxx. Bảng của ban thư ký có số dính khoảng
 * trắng, có số rơi mất số 0 đầu, có số ghi +84.
 */
function chuanSoDienThoai(tho) {
  let s = String(tho ?? '').replace(/[^\d+]/g, '');
  if (!s) return { so: '', canXem: false, doan: '' };
  let doan = '';
  if (s.startsWith('+84')) {
    s = '0' + s.slice(3);
    doan = 'đổi +84 thành 0';
  } else if (s.startsWith('84') && s.length === 11) {
    s = '0' + s.slice(2);
    doan = 'đổi 84 thành 0';
  } else if (/^[35789]\d{8}$/.test(s)) {
    // Thiếu số 0 đầu: 9 chữ số bắt đầu bằng 3/5/7/8/9 là đầu số di động Việt Nam.
    s = '0' + s;
    doan = 'thêm số 0 đầu';
  }
  const hopLe = /^0\d{9}$/.test(s);
  return { so: s, canXem: !hopLe, doan };
}

const chuanTen = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Bỏ dấu để so khớp tên — "Trần Ánh Hoa" và "tran anh hoa" là một người. */
const khoaTen = (s) =>
  chuanTen(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

const lamSlug = (s) =>
  khoaTen(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// ─── Frontmatter ────────────────────────────────────────────────────────────

const nhay = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Hồ sơ khung, đúng thứ tự trường mà functions/api/ho-so.ts dùng khi thêm mới. */
function hoSoKhung({ hoTen, xungHo, dienThoaiXacThuc }) {
  const d = [
    ['hoTen', nhay(hoTen)],
    ['xungHo', nhay(xungHo)],
    ['anh', '""'],
    ['chucVuClb', '""'],
    ['capBac', '""'],
    ['thuTu', '9999'],
    ['chucDanh', '""'],
    ['doanhNghiep', '""'],
    ['nganhNghe', nhay('Đang cập nhật')],
    ['namThanhLap', 'null'],
    ['quyMo', '""'],
    ['dienThoai', '""'],
    ['email', '""'],
    ['website', '""'],
    ['diaChi', '""'],
    ['facebook', '""'],
    ['zalo', '""'],
    ['namGiaNhap', 'null'],
    ['sanPham', '[]'],
    ['khachHang', '[]'],
    ['uuDaiHoiVien', '""'],
    ['anhDoanhNghiep', '[]'],
    ['chuThichAnh', '[]'],
    ['noiBat', 'false'],
    ['dienThoaiXacThuc', nhay(dienThoaiXacThuc)],
  ];
  return '---\n' + d.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n';
}

/**
 * Chèn `dienThoaiXacThuc` vào cuối frontmatter của file đã có.
 * Giữ nguyên mọi dòng cũ, kể cả phần thân bài.
 */
function themTruongXacThuc(raw, so) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/);
  if (!m) return null;
  if (/^dienThoaiXacThuc:/m.test(m[1])) return null; // đã có, không đụng
  const xuongDong = raw.includes('\r\n') ? '\r\n' : '\n';
  return `---${xuongDong}${m[1]}${xuongDong}dienThoaiXacThuc: ${nhay(so)}${xuongDong}---${m[2] ?? xuongDong}`;
}

// ─── Chạy ───────────────────────────────────────────────────────────────────

if (!existsSync(FILE_EXCEL)) {
  console.error(`Không thấy file Excel:\n  ${FILE_EXCEL}`);
  process.exit(1);
}

const dong = docXlsx(FILE_EXCEL);

// Bỏ dòng tiêu đề; cột B là họ tên, D là số của nam, E là số của nữ.
const excel = [];
const canXemLai = [];
const daDoan = [];
for (const o of dong.slice(1)) {
  const hoTen = chuanTen(o.B);
  if (!hoTen) continue;
  const { so, canXem, doan } = chuanSoDienThoai(o.D || o.E);
  // Giới tính suy từ việc số nằm ở cột nào — bảng không có cột xưng hô riêng.
  const xungHo = o.D ? 'Ông' : o.E ? 'Bà' : '';
  excel.push({ hoTen, so, xungHo });
  if (!so) canXemLai.push(`${hoTen}: chưa có số điện thoại`);
  else if (canXem) canXemLai.push(`${hoTen}: số "${chuanTen(o.D || o.E)}" không đúng dạng 10 chữ số`);
  else if (doan) daDoan.push(`${hoTen}: "${chuanTen(o.D || o.E)}" → ${so} (${doan})`);
  // Cột C là tên gọi; lệch với chữ cuối của cột B thường là do gõ thiếu họ tên.
  const tenGoi = chuanTen(o.C);
  if (tenGoi && khoaTen(hoTen).split(' ').at(-1) !== khoaTen(tenGoi)) {
    canXemLai.push(`${hoTen}: cột Tên ghi "${tenGoi}" — họ tên có thể bị gõ thiếu`);
  }
}

// Trùng số điện thoại thì không thể dùng số để nhận người, phải báo ngay.
const theoSo = new Map();
for (const e of excel) {
  if (!e.so) continue;
  if (!theoSo.has(e.so)) theoSo.set(e.so, []);
  theoSo.get(e.so).push(e.hoTen);
}
const soTrung = [...theoSo].filter(([, ds]) => ds.length > 1);

// Hồ sơ đang có trên web.
const fileHoSo = readdirSync(THU_MUC_HO_SO).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
const hoSo = fileHoSo.map((f) => {
  const raw = readFileSync(join(THU_MUC_HO_SO, f), 'utf8');
  return {
    file: f,
    raw,
    hoTen: chuanTen((raw.match(/^hoTen:\s*"(.*)"$/m) ?? [, ''])[1]),
    daCoXacThuc: /^dienThoaiXacThuc:/m.test(raw),
  };
});
const hoSoTheoTen = new Map(hoSo.map((h) => [khoaTen(h.hoTen), h]));
const slugDaCo = new Set(fileHoSo.map((f) => f.replace(/\.md$/, '')));

const boSung = []; // hồ sơ có sẵn, thêm số xác thực
const taoMoi = []; // hồ sơ hoàn toàn mới
const khongCoSo = []; // có trong Excel nhưng không có số → không tự đăng ký được

for (const e of excel) {
  const h = hoSoTheoTen.get(khoaTen(e.hoTen));
  if (h) {
    if (!e.so) khongCoSo.push(e.hoTen);
    else if (!h.daCoXacThuc) boSung.push({ h, so: e.so });
    continue;
  }
  let slug = lamSlug(e.hoTen);
  if (slug.length < 2) continue;
  if (slugDaCo.has(slug)) {
    let n = 2;
    while (slugDaCo.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  slugDaCo.add(slug);
  taoMoi.push({ slug, ...e });
  if (!e.so) khongCoSo.push(e.hoTen);
}

const thua = hoSo.filter((h) => !excel.some((e) => khoaTen(e.hoTen) === khoaTen(h.hoTen)));

// ─── Báo cáo ────────────────────────────────────────────────────────────────

console.log(`Excel: ${excel.length} người | Hồ sơ trên web: ${hoSo.length}`);
console.log(`Thêm số xác thực cho hồ sơ có sẵn: ${boSung.length}`);
console.log(`Tạo hồ sơ mới: ${taoMoi.length}`);

if (soTrung.length) {
  console.log('\n[!] Số điện thoại bị trùng — phải sửa, nếu không hai người sẽ nhận nhầm nhau:');
  for (const [so, ds] of soTrung) console.log(`    ${so}: ${ds.join(', ')}`);
}
if (canXemLai.length) {
  console.log('\n[!] Ban thư ký cần xem lại:');
  for (const d of canXemLai) console.log(`    ${d}`);
}
if (daDoan.length) {
  console.log('\n[i] Số đã tự sửa cho đúng dạng — nên báo ban thư ký xác nhận:');
  for (const d of daDoan) console.log(`    ${d}`);
}
if (khongCoSo.length) {
  console.log(`\n[!] ${khongCoSo.length} người không có số hợp lệ → phải cấp link mời riêng:`);
  for (const t of khongCoSo) console.log(`    ${t}`);
}
if (thua.length) {
  console.log('\n[!] Có hồ sơ trên web nhưng không có trong Excel — cần ban thư ký xác nhận:');
  for (const h of thua) console.log(`    ${h.hoTen}  (${h.file})`);
}

if (!GHI) {
  console.log('\nMới chỉ xem trước. Thêm --ghi để thực sự ghi file.');
  process.exit(0);
}

let daGhi = 0;
for (const { h, so } of boSung) {
  const moi = themTruongXacThuc(h.raw, so);
  if (moi) {
    writeFileSync(join(THU_MUC_HO_SO, h.file), moi);
    daGhi++;
  }
}
for (const t of taoMoi) {
  writeFileSync(
    join(THU_MUC_HO_SO, `${t.slug}.md`),
    hoSoKhung({ hoTen: t.hoTen, xungHo: t.xungHo, dienThoaiXacThuc: t.so }),
  );
  daGhi++;
}
console.log(`\nĐã ghi ${daGhi} file trong src/content/hoi-vien/.`);
