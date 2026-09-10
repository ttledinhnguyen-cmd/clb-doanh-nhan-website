/**
 * Cloudflare Pages Function — hội viên tự cập nhật hồ sơ của mình.
 *
 * Người dùng KHÔNG cần tài khoản GitHub. Họ mở đường dẫn riêng có mã bí mật,
 * sửa thông tin, bấm lưu; hàm này kiểm tra mã rồi thay mặt họ ghi vào kho
 * GitHub bằng khoá bot. Cloudflare thấy commit mới thì tự dựng lại website.
 *
 *   POST  { ma }                     → lấy hồ sơ để hiện lên form
 *   PUT   { ma, slug, layHoSo }      → thư ký xem hồ sơ người khác
 *   PUT   { ma, slug, duLieu, anh? } → lưu thay đổi
 */
import {
  type EnvKho,
  json,
  kiemTraMa,
  thieuCauHinh,
  docFile,
  ghiFile,
  lietKeThuMuc,
  sangBase64,
  ghiNhatKy,
} from '../../src/lib/kho-github';
import { docFrontmatter, vietFrontmatter } from '../../src/lib/frontmatter';

const THU_MUC = 'src/content/hoi-vien';

/** Những trường hội viên được phép tự sửa. Ngoài danh sách này thì bỏ qua. */
const TRUONG_CHO_SUA = {
  hoTen: 'chuoi',
  xungHo: 'chuoi',
  chucDanh: 'chuoi',
  doanhNghiep: 'chuoi',
  nganhNghe: 'chuoi',
  namThanhLap: 'so',
  quyMo: 'chuoi',
  dienThoai: 'chuoi',
  email: 'chuoi',
  website: 'chuoi',
  diaChi: 'chuoi',
  facebook: 'chuoi',
  zalo: 'chuoi',
  sanPham: 'danhSach',
  khachHang: 'danhSach',
  uuDaiHoiVien: 'vanBan',
  gioiThieu: 'vanBan', // phần thân file markdown
} as const;

/**
 * Chức vụ trong CLB, cấp bậc và thứ tự hiển thị do câu lạc bộ quyết định nên
 * cố ý không nằm trong bảng trên — hội viên không tự đổi được dù có sửa gói dữ
 * liệu gửi lên.
 */

const GIOI_HAN = { chuoi: 300, vanBan: 4000, danhSach: 20, anhByte: 3_000_000 };

const docHoSo = async (env: EnvKho, slug: string) => {
  const f = await docFile(env, `${THU_MUC}/${slug}.md`);
  if (!f) return null;
  const { fm, than } = docFrontmatter(f.noiDung);
  return { hoSo: { slug, ...fm, gioiThieu: than.trim() }, sha: f.sha, raw: f.noiDung };
};

// ─── POST: mở phiên, lấy hồ sơ ──────────────────────────────────────────────

export const onRequestPost: PagesFunction<EnvKho> = async ({ request, env }) => {
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống cập nhật hồ sơ chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as { ma?: string };
  const phien = await kiemTraMa(env, body.ma);
  if (!phien) return json({ loi: 'Đường dẫn không đúng hoặc đã hết hiệu lực.' }, 401);

  if (phien.vai_tro === 'thu-ky') {
    // Thư ký chọn được bất kỳ hội viên nào nên cần danh sách để hiển thị.
    const ds = await lietKeThuMuc(env, THU_MUC);
    const slugs = ds
      .filter((x) => x.name.endsWith('.md') && !x.name.startsWith('_'))
      .map((x) => x.name.replace(/\.md$/, ''))
      .sort();
    return json({ vaiTro: 'thu-ky', danhSach: slugs, hoSo: null });
  }

  const kq = await docHoSo(env, phien.slug);
  if (!kq) return json({ loi: 'Không tìm thấy hồ sơ.' }, 404);
  return json({ vaiTro: 'hoi-vien', danhSach: [phien.slug], hoSo: kq.hoSo });
};

// ─── PUT: xem hoặc lưu hồ sơ ────────────────────────────────────────────────

export const onRequestPut: PagesFunction<EnvKho> = async ({ request, env }) => {
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống cập nhật hồ sơ chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as {
    ma?: string;
    slug?: string;
    duLieu?: Record<string, unknown>;
    anh?: string;
    layHoSo?: boolean;
  };

  const phien = await kiemTraMa(env, body.ma);
  if (!phien) return json({ loi: 'Đường dẫn không đúng hoặc đã hết hiệu lực.' }, 401);

  const slug = phien.vai_tro === 'thu-ky' ? String(body.slug ?? '') : phien.slug;
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ loi: 'Mã hội viên không hợp lệ.' }, 400);

  const kq = await docHoSo(env, slug);
  if (!kq) return json({ loi: 'Không tìm thấy hồ sơ.' }, 404);

  if (body.layHoSo) return json({ hoSo: kq.hoSo });

  const { fm, than } = docFrontmatter(kq.raw);
  const daDoi: string[] = [];
  let thanMoi = than;

  for (const [khoa, kieu] of Object.entries(TRUONG_CHO_SUA)) {
    if (!(khoa in (body.duLieu ?? {}))) continue;
    const gt = body.duLieu![khoa];

    if (kieu === 'danhSach') {
      const ds = (Array.isArray(gt) ? gt : [])
        .map((x) => String(x).trim().slice(0, GIOI_HAN.chuoi))
        .filter(Boolean)
        .slice(0, GIOI_HAN.danhSach);
      if (JSON.stringify(fm[khoa] ?? []) !== JSON.stringify(ds)) {
        fm[khoa] = ds;
        daDoi.push(khoa);
      }
    } else if (kieu === 'so') {
      const n = gt === '' || gt === null ? null : Number(gt);
      const hopLe = n === null || (Number.isInteger(n) && n > 1800 && n < 2200) ? n : null;
      if (fm[khoa] !== hopLe) {
        fm[khoa] = hopLe;
        daDoi.push(khoa);
      }
    } else {
      const max = kieu === 'vanBan' ? GIOI_HAN.vanBan : GIOI_HAN.chuoi;
      const s = String(gt ?? '').trim().slice(0, max);
      if (khoa === 'gioiThieu') {
        if (than.trim() !== s) {
          thanMoi = s ? s + '\n' : '';
          daDoi.push('gioiThieu');
        }
      } else if (fm[khoa] !== s) {
        fm[khoa] = s;
        daDoi.push(khoa);
      }
    }
  }

  // Ảnh chân dung: trình duyệt đã nén sẵn thành WebP rồi gửi dạng data URL.
  let coAnh = false;
  if (typeof body.anh === 'string' && body.anh.startsWith('data:image/webp;base64,')) {
    const b64 = body.anh.slice('data:image/webp;base64,'.length).replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return json({ loi: 'Ảnh gửi lên không hợp lệ.' }, 400);
    if (b64.length * 0.75 > GIOI_HAN.anhByte) return json({ loi: 'Ảnh quá lớn.' }, 413);

    const tenAnh = `${slug}-${Date.now()}.webp`;
    await ghiFile(env, `public/images/tai-len/${tenAnh}`, b64, null, `Ảnh chân dung mới của ${slug}`);
    fm.anh = `/images/tai-len/${tenAnh}`;
    daDoi.push('anh');
    coAnh = true;
  }

  if (daDoi.length === 0) return json({ ok: true, khongDoi: true });

  await ghiFile(
    env,
    `${THU_MUC}/${slug}.md`,
    sangBase64(vietFrontmatter(fm, thanMoi)),
    kq.sha,
    `Cập nhật hồ sơ ${fm.hoTen || slug} (${daDoi.join(', ')})`,
  );

  await ghiNhatKy(
    env,
    phien.slug,
    slug,
    daDoi.join(','),
    coAnh,
    request.headers.get('cf-connecting-ip') ?? '',
  );

  return json({ ok: true, daDoi });
};
