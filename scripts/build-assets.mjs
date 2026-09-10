/**
 * Chuẩn hoá toàn bộ ảnh gốc của CLB thành ảnh WebP tối ưu cho web.
 *
 *   node scripts/build-assets.mjs
 *
 * Ảnh gốc nằm ngoài repo (thư mục tư liệu của CLB) nên script này chỉ cần chạy
 * lại khi có ảnh mới. Kết quả ghi vào public/images/ và src/data/thu-vien.json.
 */
import sharp from 'sharp';
import { mkdir, readdir, readFile, writeFile, copyFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(ROOT, '../CLB/CLB');
const ANH_GOC = path.join(SRC, 'BAN ĐIỀU HÀNH');
// Ảnh đã tách nền do CLB gửi lại. Có file ở đây thì ưu tiên dùng, vì nền trắng
// nhìn gọn hơn hẳn so với ảnh chụp trước backdrop LED sự kiện.
const ANH_TACH = path.join(SRC, 'BAN ĐIỀU HÀNH - ĐÃ TÁCH NỀN');
const OUT = path.join(ROOT, 'public/images');

/**
 * Ảnh Ban điều hành phần lớn là ảnh toàn thân chụp trên thảm đỏ trước backdrop
 * LED, nên cắt tự động hay bám nhầm vào chữ trên backdrop. Bảng dưới ghi vị trí
 * chủ thể theo tỉ lệ bề ngang ảnh gốc (0 = mép trái, 1 = mép phải) cho những ảnh
 * người không đứng giữa khung. Ảnh không khai báo thì lấy mặc định:
 * ảnh dọc cắt từ mép trên (giữ trọn đầu), ảnh ngang cắt giữa.
 */
const TIEU_DIEM = {
  'nguyen-van-khoa': { x: 0.48 },
  'nguyen-quy-chau': { x: 0.64 },
  'phung-vinh-vui': { x: 0.47 },
  'vo-thanh-quyen': { x: 0.65 },
  // 429×1890 – dải cắt rất hẹp từ ảnh tập thể, không đủ bề ngang để cắt 3:4.
  'kieu-dang-ninh': { mode: 'blur-pad' },
};

const ALBUMS = [
  {
    slug: 'caravan-tro-ve-tuoi-tho-toi-lan-10',
    ten: 'Caravan “Trở về tuổi thơ tôi” lần 10',
    danhMuc: 'su-kien',
    thuMuc: 'HOẠT ĐỘNG CLB/CARAVAN TRỞ VỀ TUỔI THƠ TÔI LẦN 10',
  },
  {
    slug: 'giai-cuu-bi-do-2023',
    ten: 'Giải cứu bí đỏ 2023',
    danhMuc: 'cong-tac-xa-hoi',
    thuMuc: 'HOẠT ĐỘNG CÔNG TÁC XÃ HỘI/GIẢI CỨU BÍ ĐỎ - 2023',
  },
  {
    slug: 'giao-huu-bong-da',
    ten: 'Giao hữu bóng đá',
    danhMuc: 'van-hoa-the-thao',
    thuMuc: 'HOẠT ĐỘNG VĂN HOÁ THỂ THAO/GIAO HỮU BÓNG ĐÁ',
  },
  {
    slug: 'giai-bong-da-cup-phu-dong-group',
    ten: 'Giải bóng đá tranh Cúp Phú Đông Group',
    danhMuc: 'van-hoa-the-thao',
    thuMuc: 'HOẠT ĐỘNG VĂN HOÁ THỂ THAO/GIẢI BÓNG ĐÁ TRANH CÚP PHÚ ĐÔNG GROUP',
  },
  {
    slug: 'giai-pickleball-cup-an-phat',
    ten: 'Giải Pickleball tranh Cúp An Phát',
    danhMuc: 'van-hoa-the-thao',
    thuMuc: 'HOẠT ĐỘNG VĂN HOÁ THỂ THAO/GIẢI PICKLEBALL TRANH CUP AN PHÁT',
  },
  {
    slug: 'giai-pickleball-cup-tan-pham-nguyen',
    ten: 'Giải Pickleball tranh Cúp Tân Phạm Nguyên',
    danhMuc: 'van-hoa-the-thao',
    thuMuc: 'HOẠT ĐỘNG VĂN HOÁ THỂ THAO/GIẢI PICKLEBALL TRANH CUP TÂN PHẠM NGUYÊN',
  },
];

const exists = (p) => access(p).then(() => true, () => false);

const TY_LE = 3 / 4; // khung dọc 3:4

const canhBaoAnhNho = [];
const canhBaoKhungHep = [];

const kep = (v, min, max) => Math.max(min, Math.min(max, v));

/** Cắt ảnh chân dung về khung dọc 3:4, bám theo tiêu điểm đã khai báo. */
async function chanDung(src, outBase, daTachNen = false) {
  const slug = path.basename(outBase);
  const tieuDiem = TIEU_DIEM[slug] ?? {};
  const { width, height } = await sharp(src, { failOn: 'none' }).rotate().metadata();

  // Ảnh đã tách nền: đặt trọn người vào khung 3:4 nền trắng, không cắt xén,
  // vì cắt cover sẽ mất chân hoặc mất đầu tuỳ tỉ lệ ảnh người ta gửi.
  const mode = daTachNen
    ? 'nen-trang'
    : (tieuDiem.mode ?? (width / height < 0.4 ? 'blur-pad' : 'crop'));

  // Khung lớn nhất xuất ra là 1200x1600. Ảnh nguồn nhỏ hơn thì phải phóng to,
  // nhìn sẽ mờ trên màn hình điện thoại đời mới.
  if (width < 1200 || height < 1600) {
    canhBaoAnhNho.push(`${slug}: ${width}x${height} (nên từ 1200x1600 trở lên)`);
  }

  // Chủ thể quá hẹp so với khung dọc 3:4 thì hai bên sẽ thừa nhiều nền trắng.
  if (daTachNen && width / height < 0.55) {
    canhBaoKhungHep.push(`${slug}: tỉ lệ ${(width / height).toFixed(2)} — nên cắt từ ngang hông trở lên`);
  }
  let vung = null;

  if (mode === 'crop') {
    if (width / height > TY_LE) {
      // Ảnh ngang: giữ nguyên chiều cao, cắt bớt hai bên quanh tiêu điểm.
      const cw = Math.round(height * TY_LE);
      vung = { width: cw, height, top: 0, left: kep(Math.round((tieuDiem.x ?? 0.5) * width - cw / 2), 0, width - cw) };
    } else {
      // Ảnh dọc: giữ nguyên bề ngang, cắt bớt phía dưới để không mất đầu.
      const ch = Math.round(width / TY_LE);
      vung = { width, height: ch, left: 0, top: kep(Math.round((tieuDiem.y ?? 0) * height), 0, height - ch) };
    }
  }

  const ketQua = {};
  for (const [suffix, w] of [['', 1200], ['-sm', 600]]) {
    const h = Math.round(w / TY_LE);
    let pipeline;

    if (mode === 'nen-trang') {
      // Ảnh tách nền gửi về có tỉ lệ rất khác nhau: toàn thân thì hẹp và cao,
      // nửa người thì ngang. Nếu chỉ 'contain' vào khung 3:4 thì ảnh toàn thân
      // chỉ chiếm chưa tới một nửa khung, còn lại là lề trắng.
      // Nên: cắt bỏ viền nền thừa, phóng cho chủ thể choán gần hết khung, rồi
      // đặt đứng trên đáy như người đứng trên mặt đất.
      const CHOAN = 0.94; // phần khung mà chủ thể được phép chiếm
      const DAY = 0.02; // chừa một chút dưới chân

      const chuThe = await sharp(src, { failOn: 'none' })
        .rotate()
        .trim({ threshold: 12 })
        .toBuffer()
        .catch(() =>
          // Ảnh không có viền đồng nhất để cắt thì dùng nguyên bản.
          sharp(src, { failOn: 'none' }).rotate().toBuffer(),
        );

      const vua = await sharp(chuThe)
        .resize(Math.round(w * CHOAN), Math.round(h * (CHOAN - DAY)), {
          fit: 'inside',
          withoutEnlargement: false,
        })
        .toBuffer();
      const { width: vw = 0, height: vh = 0 } = await sharp(vua).metadata();

      pipeline = sharp({
        create: { width: w, height: h, channels: 3, background: '#ffffff' },
      }).composite([
        {
          input: vua,
          left: Math.round((w - vw) / 2),
          top: Math.max(0, h - vh - Math.round(h * DAY)),
        },
      ]);
    } else if (mode === 'blur-pad') {
      const nen = await sharp(src)
        .resize(w, h, { fit: 'cover', position: 'attention' })
        .blur(28)
        .modulate({ brightness: 0.82, saturation: 0.5 })
        .toBuffer();
      const chuThe = await sharp(src).resize({ height: h, fit: 'inside' }).toBuffer();
      pipeline = sharp(nen).composite([{ input: chuThe, gravity: 'center' }]);
    } else {
      pipeline = sharp(src, { failOn: 'none' }).rotate().extract(vung).resize(w, h);
    }

    // Gắn mã băm nội dung vào tên file. Nhờ vậy ảnh đổi thì đường dẫn cũng đổi,
    // trình duyệt bắt buộc tải bản mới thay vì dùng bản cũ trong bộ nhớ đệm —
    // và ngược lại, ảnh không đổi thì cache được vĩnh viễn.
    const buf = await pipeline.webp({ quality: 82, effort: 5 }).toBuffer();
    const bam = createHash('sha256').update(buf).digest('hex').slice(0, 8);
    const ten = `${slug}.${bam}${suffix}.webp`;
    await writeFile(path.join(path.dirname(outBase), ten), buf);
    ketQua[suffix === '' ? 'lon' : 'nho'] = `/images/hoi-vien/${ten}`;
  }
  const nhan = mode === 'crop' ? `crop x=${((vung.left + vung.width / 2) / width).toFixed(2)}` : mode;
  return { nhan, ...ketQua };
}

/** Đọc trường `anhGoc` trong frontmatter của từng hồ sơ hội viên. */
async function docHoSoHoiVien() {
  const dir = path.join(ROOT, 'src/content/hoi-vien');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  const ho = [];
  for (const f of files) {
    const raw = await readFile(path.join(dir, f), 'utf-8');
    const m = raw.match(/^anhGoc:\s*"?([^"\n]*)"?\s*$/m);
    ho.push({ slug: f.replace(/\.md$/, ''), anhGoc: m?.[1]?.trim() ?? '' });
  }
  return ho;
}

/**
 * Tìm ảnh của một hội viên, ưu tiên bản đã tách nền do CLB gửi lại.
 *
 * Bản tách nền thường lưu đuôi khác ảnh gốc (.jpg -> .png) nên so khớp theo
 * tên không tính phần đuôi.
 */
async function timAnh(anhGoc) {
  const khongDuoi = anhGoc.replace(/\.[^.]+$/, '');
  if (await exists(ANH_TACH)) {
    for (const f of await readdir(ANH_TACH)) {
      if (f.replace(/\.[^.]+$/, '') === khongDuoi) {
        return { duongDan: path.join(ANH_TACH, f), daTach: true };
      }
    }
  }
  const goc = path.join(ANH_GOC, anhGoc);
  return (await exists(goc)) ? { duongDan: goc, daTach: false } : null;
}

async function chayChanDung() {
  const dir = path.join(OUT, 'hoi-vien');
  await mkdir(dir, { recursive: true });
  const thieu = [];
  const bang = {};
  let soDaTach = 0;

  for (const nguoi of await docHoSoHoiVien()) {
    if (!nguoi.anhGoc) {
      thieu.push(`${nguoi.slug} (chưa khai báo ảnh)`);
      continue;
    }
    const anh = await timAnh(nguoi.anhGoc);
    if (!anh) {
      thieu.push(`${nguoi.slug} -> ${nguoi.anhGoc}`);
      continue;
    }
    if (anh.daTach) soDaTach++;
    const kq = await chanDung(anh.duongDan, path.join(dir, nguoi.slug), anh.daTach);
    bang[nguoi.slug] = { lon: kq.lon, nho: kq.nho };
    console.log(`  v ${nguoi.slug.padEnd(24)} ${anh.daTach ? '[nen trang] ' : ''}${kq.nhan}`);
  }

  // Dọn ảnh của lần chạy trước để thư mục không phình lên theo mỗi lần đổi ảnh.
  const dangDung = new Set(Object.values(bang).flatMap((x) => [x.lon, x.nho].map((u) => path.basename(u))));
  for (const f of await readdir(dir)) {
    if (f.endsWith('.webp') && !dangDung.has(f)) await rm(path.join(dir, f));
  }

  await writeFile(
    path.join(ROOT, 'src/data/anh-hoi-vien.json'),
    JSON.stringify(bang, null, 2) + '\n',
  );

  console.log(`  -> ${soDaTach} anh dung ban da tach nen`);
  if (canhBaoAnhNho.length) {
    console.warn('  ! anh nho hon khung xuat ra, se bi mo:\n    - ' + canhBaoAnhNho.join('\n    - '));
  }
  if (canhBaoKhungHep.length) {
    console.warn('  ! chu the qua hep so voi khung 3:4, hai ben se thua nen trang:\n    - ' + canhBaoKhungHep.join('\n    - '));
  }
  if (thieu.length) console.warn('  ! thieu anh goc:\n    - ' + thieu.join('\n    - '));
}

async function chayThuVien() {
  const manifest = [];

  for (const album of ALBUMS) {
    const srcDir = path.join(SRC, album.thuMuc);
    if (!(await exists(srcDir))) {
      console.warn(`  ! bỏ qua album thiếu thư mục: ${album.slug}`);
      continue;
    }
    const outDir = path.join(OUT, 'hoat-dong', album.slug);
    await mkdir(outDir, { recursive: true });

    const files = (await readdir(srcDir))
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort();

    const anh = [];
    for (const [i, file] of files.entries()) {
      const ten = String(i + 1).padStart(3, '0');
      const image = sharp(path.join(srcDir, file), { failOn: 'none' }).rotate();
      const { width, height } = await image.metadata();

      await image
        .clone()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 5 })
        .toFile(path.join(outDir, `${ten}.webp`));

      await image
        .clone()
        .resize(640, 480, { fit: 'cover', position: 'attention' })
        .webp({ quality: 76, effort: 5 })
        .toFile(path.join(outDir, `${ten}-thumb.webp`));

      anh.push({ ten, ngang: width >= height });
    }

    manifest.push({ ...album, thuMuc: undefined, soAnh: anh.length, anh });
    console.log(`  ✓ ${album.slug.padEnd(38)} ${anh.length} ảnh`);
  }

  await writeFile(
    path.join(ROOT, 'src/data/thu-vien.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

async function chayLogo() {
  const from = path.resolve(ROOT, 'src/assets/logo');
  for (const f of ['logo-full.svg', 'logo-mark.svg']) {
    if (await exists(path.join(from, f))) await copyFile(path.join(from, f), path.join(ROOT, 'public', f));
  }
  // Ảnh xem trước khi chia sẻ link lên Facebook/Zalo.
  const markPath = path.join(ROOT, 'public/logo-mark.svg');
  if (await exists(markPath)) {
    await sharp(markPath, { density: 600 })
      .resize(512, 512, { fit: 'contain', background: '#ffffff' })
      .png()
      .toFile(path.join(ROOT, 'public/apple-touch-icon.png'));
  }
}

console.log('› Logo');
await chayLogo();
console.log('› Ảnh chân dung hội viên');
await chayChanDung();
console.log('› Thư viện ảnh hoạt động');
await chayThuVien();
console.log('Xong.');
