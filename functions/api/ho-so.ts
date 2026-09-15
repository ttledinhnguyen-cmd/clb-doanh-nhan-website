/**
 * Cloudflare Pages Function — hồ sơ hội viên.
 *
 * Người dùng KHÔNG cần tài khoản GitHub. Họ đăng nhập tài khoản của website,
 * sửa thông tin, bấm lưu; hàm này kiểm tra phiên rồi thay mặt họ ghi vào kho
 * GitHub bằng khoá bot. Cloudflare thấy commit mới thì tự dựng lại website.
 *
 * Tài khoản quản trị và ban thư ký sửa được mọi hồ sơ; tài khoản hội viên chỉ
 * sửa được hồ sơ gắn với tài khoản đó.
 *
 *   POST  {}                                    → mở phiên, lấy hồ sơ
 *   PUT   { slug, layHoSo }                     → thư ký xem hồ sơ người khác
 *   PUT   { slug, duLieu, anh?, anhMoi? }       → lưu thay đổi
 *   PUT   { moi: true, duLieu, anh?, anhMoi? }  → thư ký thêm hội viên mới
 *   PUT   { slug, xoa: true }                   → thư ký xoá hội viên
 *
 * Ảnh sản phẩm được tải lên trước qua /api/anh, mỗi ảnh một lượt; `anhMoi` chỉ
 * mang mã blob. Mọi thứ của một lần bấm Lưu vào đúng một commit.
 */
import {
  type EnvKho,
  type ThayDoiFile,
  json,
  thieuCauHinh,
  docFile,
  lietKeThuMuc,
  ghiMotCommit,
  LoiXungDot,
  lamSlug,
  taoBlob,
  tachAnh,
  chotBoAnh,
} from '../../src/lib/kho-github';
import { boi, coQuyenBienTap, ghiNhatKy, ipCua, yeuCauDangNhap } from '../../src/lib/tai-khoan';
import { type BanGhi, docFrontmatter, vietFrontmatter } from '../../src/lib/frontmatter';

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
 * Chức vụ trong CLB, cấp bậc và thứ tự hiển thị là việc của câu lạc bộ, chỉ ban
 * thư ký đổi được. Hội viên thường không đổi được dù có sửa gói dữ liệu gửi lên,
 * vì các trường này chỉ được gộp vào khi tài khoản là quản trị hoặc ban thư ký.
 */
const TRUONG_THU_KY = {
  chucVuClb: 'chuoi',
  capBac: 'capBac',
  thuTu: 'soThuTu',
} as const;

const CAP_BAC = [
  '',
  'chu-tich',
  'pho-chu-tich-thuong-truc',
  'pho-chu-tich',
  'pho-chu-tich-danh-du',
  'uy-vien',
  'uy-vien-du-khuyet',
];

const GIOI_HAN = { chuoi: 300, vanBan: 4000, danhSach: 20, anhSanPham: 12, chuThich: 120 };

/** Hồ sơ trống cho hội viên mới: đủ trường, cùng thứ tự với các file có sẵn. */
const hoSoTrong = (): BanGhi => ({
  hoTen: '',
  xungHo: '',
  anh: '',
  chucVuClb: '',
  capBac: '',
  thuTu: 9999,
  chucDanh: '',
  doanhNghiep: '',
  nganhNghe: 'Đang cập nhật',
  namThanhLap: null,
  quyMo: '',
  dienThoai: '',
  email: '',
  website: '',
  diaChi: '',
  facebook: '',
  zalo: '',
  namGiaNhap: null,
  sanPham: [],
  khachHang: [],
  uuDaiHoiVien: '',
  anhDoanhNghiep: [],
  chuThichAnh: [],
  noiBat: false,
});

type YeuCau = {
  slug?: string;
  duLieu?: Record<string, unknown>;
  anh?: string;
  anhMoi?: unknown;
  layHoSo?: boolean;
  moi?: boolean;
  xoa?: boolean;
};

const docHoSo = async (env: EnvKho, slug: string) => {
  const f = await docFile(env, `${THU_MUC}/${slug}.md`);
  if (!f) return null;
  const { fm, than } = docFrontmatter(f.noiDung);
  return { hoSo: { slug, ...fm, gioiThieu: than.trim() }, sha: f.sha, raw: f.noiDung };
};

/** Gộp dữ liệu gửi lên vào frontmatter. Trả các trường đã đổi và thân bài mới. */
function apDung(fm: BanGhi, than: string, duLieu: Record<string, unknown>, laThuKy: boolean) {
  const daDoi: string[] = [];
  let thanMoi = than;
  const choSua: Record<string, string> = laThuKy
    ? { ...TRUONG_CHO_SUA, ...TRUONG_THU_KY }
    : { ...TRUONG_CHO_SUA };

  for (const [khoa, kieu] of Object.entries(choSua)) {
    if (!(khoa in duLieu)) continue;
    const gt = duLieu[khoa];

    if (kieu === 'danhSach') {
      const ds = (Array.isArray(gt) ? gt : [])
        .map((x) => String(x).trim().slice(0, GIOI_HAN.chuoi))
        .filter(Boolean)
        .slice(0, GIOI_HAN.danhSach);
      if (JSON.stringify(fm[khoa] ?? []) !== JSON.stringify(ds)) {
        fm[khoa] = ds;
        daDoi.push(khoa);
      }
    } else if (kieu === 'capBac') {
      const v = String(gt ?? '');
      if (CAP_BAC.includes(v) && fm[khoa] !== v) {
        fm[khoa] = v;
        daDoi.push(khoa);
      }
    } else if (kieu === 'soThuTu') {
      const n = Number(gt);
      const hopLe = Number.isInteger(n) && n >= 0 && n <= 99999 ? n : 9999;
      if (fm[khoa] !== hopLe) {
        fm[khoa] = hopLe;
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
  return { daDoi, thanMoi };
}

/**
 * Ảnh chân dung (gửi kèm dạng data URL) và bộ ảnh sản phẩm (đã tải lên trước).
 * Thêm các file cần ghi vào `thayDoi`. Trả Response nếu ảnh gửi lên hỏng.
 */
async function xuLyAnh(
  env: EnvKho,
  slug: string,
  fm: BanGhi,
  body: YeuCau,
  daDoi: string[],
  thayDoi: ThayDoiFile[],
): Promise<Response | null> {
  if (typeof body.anh === 'string') {
    const a = tachAnh(body.anh);
    if ('loi' in a) return json({ loi: `Ảnh chân dung: ${a.loi}` }, 400);
    const tenAnh = `${slug}-${Date.now()}.${a.duoi}`;
    thayDoi.push({ duongDan: `public/images/tai-len/${tenAnh}`, blob: await taoBlob(env, a.b64) });
    fm.anh = `/images/tai-len/${tenAnh}`;
    daDoi.push('anh');
  }

  if (body.duLieu && Array.isArray(body.duLieu.anhDoanhNghiep)) {
    const kq = chotBoAnh(
      fm.anhDoanhNghiep,
      body.duLieu.anhDoanhNghiep,
      body.anhMoi,
      GIOI_HAN.anhSanPham,
      GIOI_HAN.chuThich,
    );
    if (JSON.stringify(fm.anhDoanhNghiep ?? []) !== JSON.stringify(kq.ds)) {
      fm.anhDoanhNghiep = kq.ds;
      daDoi.push('anhDoanhNghiep');
    }
    if (JSON.stringify(fm.chuThichAnh ?? []) !== JSON.stringify(kq.chuThich)) {
      fm.chuThichAnh = kq.chuThich;
      daDoi.push('chuThichAnh');
    }
    thayDoi.push(...kq.thayDoi);
  }
  return null;
}

const khongGanHoSo = () =>
  json({ loi: 'Tài khoản này chưa được gắn với hồ sơ hội viên nào. Anh/chị liên hệ ban thư ký.' }, 403);

// ─── POST: mở phiên, lấy hồ sơ ──────────────────────────────────────────────

export const onRequestPost: PagesFunction<EnvKho> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env);
  if (phien instanceof Response) return phien;
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống cập nhật hồ sơ chưa được kích hoạt.' }, 503);

  if (coQuyenBienTap(phien.vaiTro)) {
    // Thư ký chọn được bất kỳ hội viên nào nên cần danh sách để hiển thị.
    const ds = await lietKeThuMuc(env, THU_MUC);
    const slugs = ds
      .filter((x) => x.name.endsWith('.md') && !x.name.startsWith('_'))
      .map((x) => x.name.replace(/\.md$/, ''))
      .sort();
    return json({ bienTap: true, danhSach: slugs, hoSo: null });
  }

  if (!phien.slugHoiVien) return khongGanHoSo();
  const kq = await docHoSo(env, phien.slugHoiVien);
  if (!kq) return json({ loi: 'Không tìm thấy hồ sơ.' }, 404);
  return json({ bienTap: false, danhSach: [phien.slugHoiVien], hoSo: kq.hoSo });
};

// ─── PUT: xem, lưu, thêm, xoá ───────────────────────────────────────────────

export const onRequestPut: PagesFunction<EnvKho> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env);
  if (phien instanceof Response) return phien;
  const laThuKy = coQuyenBienTap(phien.vaiTro);
  if (!laThuKy && !phien.slugHoiVien) return khongGanHoSo();
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống cập nhật hồ sơ chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as YeuCau;
  const ip = ipCua(request);
  const khongCoQuyen = () => json({ loi: 'Tài khoản này không có quyền thực hiện thao tác đó.' }, 403);

  try {
    // ── Thêm hội viên mới ─────────────────────────────────────────────────
    if (body.moi) {
      if (!laThuKy) return khongCoQuyen();
      const hoTen = String(body.duLieu?.hoTen ?? '').trim();
      if (!hoTen) return json({ loi: 'Hội viên mới phải có họ và tên.' }, 400);

      let slug = lamSlug(hoTen);
      if (slug.length < 2) slug = `hoi-vien-${Date.now()}`;
      // Trùng tên người đã có thì thêm số phía sau, không bao giờ ghi đè hồ sơ cũ.
      const dangCo = new Set(
        (await lietKeThuMuc(env, THU_MUC)).map((x) => x.name.replace(/\.md$/, '')),
      );
      if (dangCo.has(slug)) {
        let n = 2;
        while (dangCo.has(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }

      const fm = hoSoTrong();
      const { thanMoi } = apDung(fm, '', body.duLieu ?? {}, true);
      if (!String(fm.nganhNghe ?? '').trim()) fm.nganhNghe = 'Đang cập nhật';

      const thayDoi: ThayDoiFile[] = [];
      const loiAnh = await xuLyAnh(env, slug, fm, body, [], thayDoi);
      if (loiAnh) return loiAnh;

      // shaCu = null: chắc chắn file chưa tồn tại lúc ghi.
      thayDoi.push({ duongDan: `${THU_MUC}/${slug}.md`, noiDung: vietFrontmatter(fm, thanMoi), shaCu: null });
      await ghiMotCommit(env, thayDoi, `Thêm hội viên ${hoTen}${boi(phien)}`);
      await ghiNhatKy(env, phien.tenDangNhap, slug, 'tao-moi', Boolean(fm.anh), ip);
      return json({ ok: true, slug });
    }

    const slug = laThuKy ? String(body.slug ?? '') : phien.slugHoiVien;
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ loi: 'Mã hội viên không hợp lệ.' }, 400);

    const kq = await docHoSo(env, slug);
    if (!kq) return json({ loi: 'Không tìm thấy hồ sơ.' }, 404);

    if (body.layHoSo) return json({ hoSo: kq.hoSo });

    // ── Xoá hội viên ──────────────────────────────────────────────────────
    if (body.xoa) {
      if (!laThuKy) return khongCoQuyen();
      await ghiMotCommit(
        env,
        [{ duongDan: `${THU_MUC}/${slug}.md`, xoa: true }],
        `Xoá hội viên ${String((kq.hoSo as Record<string, unknown>).hoTen ?? '') || slug}${boi(phien)}`,
      );
      // Tài khoản hội viên gắn với hồ sơ vừa xoá bị khoá luôn. Không đụng tới tài khoản quản trị, ban thư ký.
      try {
        await env.DB!.batch([
          env
            .DB!.prepare(
              "DELETE FROM phien_dang_nhap WHERE tai_khoan_id IN (SELECT id FROM tai_khoan WHERE slug_hoi_vien = ? AND vai_tro = 'hoi-vien')",
            )
            .bind(slug),
          env.DB!.prepare("UPDATE tai_khoan SET hoat_dong = 0 WHERE slug_hoi_vien = ? AND vai_tro = 'hoi-vien'").bind(slug),
        ]);
      } catch (e) {
        console.error('Khoá tài khoản của hội viên đã xoá thất bại:', e);
      }
      await ghiNhatKy(env, phien.tenDangNhap, slug, 'xoa', false, ip);
      return json({ ok: true, daXoa: true });
    }

    // ── Lưu thay đổi ──────────────────────────────────────────────────────
    const { fm, than } = docFrontmatter(kq.raw);
    const { daDoi, thanMoi } = apDung(fm, than, body.duLieu ?? {}, laThuKy);

    const thayDoi: ThayDoiFile[] = [];
    const loiAnh = await xuLyAnh(env, slug, fm, body, daDoi, thayDoi);
    if (loiAnh) return loiAnh;

    if (daDoi.length === 0) return json({ ok: true, khongDoi: true });

    thayDoi.push({ duongDan: `${THU_MUC}/${slug}.md`, noiDung: vietFrontmatter(fm, thanMoi), shaCu: kq.sha });
    await ghiMotCommit(env, thayDoi, `Cập nhật hồ sơ ${fm.hoTen || slug} (${daDoi.join(', ')})${boi(phien)}`);
    await ghiNhatKy(
      env,
      phien.tenDangNhap,
      slug,
      daDoi.join(','),
      daDoi.includes('anh') || daDoi.includes('anhDoanhNghiep'),
      ip,
    );
    return json({ ok: true, daDoi });
  } catch (e) {
    if (e instanceof LoiXungDot) return json({ loi: e.message }, 409);
    console.error('Lưu hồ sơ lỗi:', e);
    return json({ loi: 'Máy chủ gặp lỗi khi lưu. Anh/chị thử lại sau ít phút.' }, 500);
  }
};
