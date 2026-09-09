/**
 * Chuẩn hoá toàn bộ ảnh gốc của CLB thành ảnh WebP tối ưu cho web.
 *
 *   node scripts/build-assets.mjs
 *
 * Ảnh gốc nằm ngoài repo (thư mục tư liệu của CLB) nên script này chỉ cần chạy
 * lại khi có ảnh mới. Kết quả ghi vào public/images/ và src/data/thu-vien.json.
 */
import sharp from 'sharp';
import { mkdir, readdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(ROOT, '../CLB/CLB');
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

const kep = (v, min, max) => Math.max(min, Math.min(max, v));

/** Cắt ảnh chân dung về khung dọc 3:4, bám theo tiêu điểm đã khai báo. */
async function chanDung(src, outBase) {
  const slug = path.basename(outBase);
  const tieuDiem = TIEU_DIEM[slug] ?? {};
  const { width, height } = await sharp(src, { failOn: 'none' }).rotate().metadata();

  const mode = tieuDiem.mode ?? (width / height < 0.4 ? 'blur-pad' : 'crop');
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

  for (const [suffix, w] of [['', 900], ['-sm', 450]]) {
    const h = Math.round(w / TY_LE);
    let pipeline;

    if (mode === 'blur-pad') {
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

    await pipeline.webp({ quality: 82, effort: 5 }).toFile(`${outBase}${suffix}.webp`);
  }
  return mode === 'crop' ? `crop x=${((vung.left + vung.width / 2) / width).toFixed(2)}` : mode;
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

async function chayChanDung() {
  const dir = path.join(OUT, 'hoi-vien');
  await mkdir(dir, { recursive: true });
  const thieu = [];

  for (const nguoi of await docHoSoHoiVien()) {
    if (!nguoi.anhGoc) { thieu.push(`${nguoi.slug} (chưa khai báo ảnh)`); continue; }
    const src = path.join(SRC, 'BAN ĐIỀU HÀNH', nguoi.anhGoc);
    if (!(await exists(src))) { thieu.push(`${nguoi.slug} → ${nguoi.anhGoc}`); continue; }
    const mode = await chanDung(src, path.join(dir, nguoi.slug));
    console.log(`  ✓ ${nguoi.slug.padEnd(24)} ${mode}`);
  }
  if (thieu.length) console.warn('  ! thiếu ảnh gốc:\n    - ' + thieu.join('\n    - '));
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
