/**
 * Cloudflare Pages Function — quản lý tài khoản. Chỉ tài khoản quản trị dùng được.
 *
 *   GET                                                    → tài khoản, lượt đăng nhập, nhật ký gần đây
 *   POST { tenDangNhap, tenHienThi, vaiTro, slugHoiVien }  → tạo tài khoản, trả link đặt mật khẩu
 *   PUT  { id, hanhDong: 'dat-lai' }                        → huỷ mật khẩu cũ, trả link đặt mật khẩu mới
 *   PUT  { id, hanhDong: 'khoa' | 'mo-khoa' | 'xoa' }
 *   PUT  { id, hanhDong: 'sua', tenHienThi, vaiTro, slugHoiVien }
 *
 * Không ai tự khoá, tự xoá hay tự bỏ quyền quản trị của chính mình, và luôn phải
 * còn ít nhất một quản trị viên dùng được — tránh cảnh cả câu lạc bộ bị khoá
 * ngoài trang quản lý.
 */
import { json } from '../../src/lib/kho-github';
import { MAU_TEN_DANG_NHAP, chuanHoaTen } from '../../src/lib/mat-khau';
import { type EnvTaiKhoan, VAI_TRO, ghiNhatKy, ipCua, taoLinkDatMatKhau, yeuCauDangNhap } from '../../src/lib/tai-khoan';

const MAU_SLUG = /^[a-z0-9-]{2,80}$/;

/** Tên hiển thị, vai trò, hồ sơ gắn kèm — dùng chung cho tạo mới và sửa. */
function docThongTin(body: Record<string, unknown>) {
  const tenHienThi = String(body.tenHienThi ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 80);
  const vaiTro = String(body.vaiTro ?? '');
  const slug = String(body.slugHoiVien ?? '').trim();
  if (!tenHienThi) return { loi: 'Cần nhập tên hiển thị.' };
  if (!VAI_TRO.includes(vaiTro)) return { loi: 'Vai trò không hợp lệ.' };
  if (vaiTro === 'hoi-vien' && !MAU_SLUG.test(slug)) {
    return { loi: 'Tài khoản hội viên phải gắn với một hồ sơ hội viên.' };
  }
  return { tenHienThi, vaiTro, slugHoiVien: MAU_SLUG.test(slug) ? slug : '' };
}

export const onRequestGet: PagesFunction<EnvTaiKhoan> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env, 'admin');
  if (phien instanceof Response) return phien;

  const db = env.DB!;
  const [ds, lan, nhatKy] = await db.batch([
    db
      .prepare(
        `SELECT t.id, t.ten_dang_nhap, t.ten_hien_thi, t.vai_tro, t.slug_hoi_vien, t.hoat_dong,
                t.tao_luc, t.tao_boi, t.dang_nhap_lan_cuoi, t.bam_mat_khau != '' AS da_dat_mat_khau,
                (SELECT MAX(k.het_han) FROM ma_kich_hoat k WHERE k.tai_khoan_id = t.id AND k.het_han > ?1) AS link_het_han,
                (SELECT COUNT(*) FROM phien_dang_nhap p WHERE p.tai_khoan_id = t.id AND p.het_han > ?1) AS so_phien
           FROM tai_khoan t
          ORDER BY CASE t.vai_tro WHEN 'admin' THEN 0 WHEN 'thu-ky' THEN 1 ELSE 2 END, t.ten_hien_thi`,
      )
      .bind(new Date().toISOString()),
    db.prepare('SELECT ten_dang_nhap, ip, thanh_cong, luc FROM lan_dang_nhap ORDER BY id DESC LIMIT 30'),
    db.prepare('SELECT tai_khoan, doi_tuong, noi_dung, luc FROM nhat_ky_thao_tac ORDER BY id DESC LIMIT 30'),
  ]);
  return json({
    ok: true,
    idCuaToi: phien.taiKhoanId,
    taiKhoan: ds.results,
    lanDangNhap: lan.results,
    nhatKy: nhatKy.results,
  });
};

export const onRequestPost: PagesFunction<EnvTaiKhoan> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env, 'admin');
  if (phien instanceof Response) return phien;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ten = chuanHoaTen(String(body.tenDangNhap ?? ''));
  if (!MAU_TEN_DANG_NHAP.test(ten)) {
    return json(
      { loi: 'Tên đăng nhập dài 3–40 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.' },
      400,
    );
  }
  const tt = docThongTin(body);
  if ('loi' in tt) return json({ loi: tt.loi }, 400);

  let id: number;
  try {
    const r = await env
      .DB!.prepare(
        `INSERT INTO tai_khoan (ten_dang_nhap, ten_hien_thi, vai_tro, slug_hoi_vien, tao_luc, tao_boi)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(ten, tt.tenHienThi, tt.vaiTro, tt.slugHoiVien, new Date().toISOString(), phien.tenDangNhap)
      .first<{ id: number }>();
    id = r!.id;
  } catch (e) {
    if (String(e).includes('UNIQUE')) return json({ loi: 'Tên đăng nhập này đã có người dùng.' }, 409);
    throw e;
  }

  const { link, hetHan } = await taoLinkDatMatKhau(env, id, phien.tenDangNhap, new URL(request.url).origin);
  await ghiNhatKy(env, phien.tenDangNhap, `tai-khoan/${ten}`, `tao-moi (${tt.vaiTro})`, false, ipCua(request));
  return json({ ok: true, id, tenDangNhap: ten, link, hetHan });
};

export const onRequestPut: PagesFunction<EnvTaiKhoan> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env, 'admin');
  if (phien instanceof Response) return phien;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return json({ loi: 'Tài khoản không hợp lệ.' }, 400);

  const db = env.DB!;
  const tk = await db
    .prepare('SELECT id, ten_dang_nhap, vai_tro FROM tai_khoan WHERE id = ?')
    .bind(id)
    .first<{ id: number; ten_dang_nhap: string; vai_tro: string }>();
  if (!tk) return json({ loi: 'Không tìm thấy tài khoản.' }, 404);

  const laMinh = tk.id === phien.taiKhoanId;
  const ghi = (noiDung: string) =>
    ghiNhatKy(env, phien.tenDangNhap, `tai-khoan/${tk.ten_dang_nhap}`, noiDung, false, ipCua(request));
  /** Còn quản trị viên nào khác đang hoạt động và đã đặt mật khẩu không. */
  const conQuanTriKhac = async () =>
    ((
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM tai_khoan WHERE vai_tro = 'admin' AND hoat_dong = 1 AND bam_mat_khau != '' AND id != ?",
        )
        .bind(id)
        .first<{ n: number }>()
    )?.n ?? 0) > 0;
  const BAO_CON_QUAN_TRI = 'Phải còn ít nhất một tài khoản quản trị khác đang dùng được.';

  switch (body.hanhDong) {
    case 'dat-lai': {
      if (laMinh) return json({ loi: 'Đổi mật khẩu của chính mình thì dùng mục Đổi mật khẩu.' }, 400);
      await db.batch([
        db.prepare("UPDATE tai_khoan SET muoi = '', bam_mat_khau = '' WHERE id = ?").bind(id),
        db.prepare('DELETE FROM phien_dang_nhap WHERE tai_khoan_id = ?').bind(id),
      ]);
      const { link, hetHan } = await taoLinkDatMatKhau(env, id, phien.tenDangNhap, new URL(request.url).origin);
      await ghi('dat-lai-mat-khau');
      return json({ ok: true, tenDangNhap: tk.ten_dang_nhap, link, hetHan });
    }

    case 'khoa': {
      if (laMinh) return json({ loi: 'Không tự khoá tài khoản của chính mình được.' }, 400);
      if (tk.vai_tro === 'admin' && !(await conQuanTriKhac())) return json({ loi: BAO_CON_QUAN_TRI }, 400);
      await db.batch([
        db.prepare('UPDATE tai_khoan SET hoat_dong = 0 WHERE id = ?').bind(id),
        db.prepare('DELETE FROM phien_dang_nhap WHERE tai_khoan_id = ?').bind(id),
        db.prepare('DELETE FROM ma_kich_hoat WHERE tai_khoan_id = ?').bind(id),
      ]);
      await ghi('khoa');
      return json({ ok: true });
    }

    case 'mo-khoa':
      await db.prepare('UPDATE tai_khoan SET hoat_dong = 1 WHERE id = ?').bind(id).run();
      await ghi('mo-khoa');
      return json({ ok: true });

    case 'sua': {
      const tt = docThongTin(body);
      if ('loi' in tt) return json({ loi: tt.loi }, 400);
      if (tk.vai_tro === 'admin' && tt.vaiTro !== 'admin') {
        if (laMinh) return json({ loi: 'Không tự bỏ quyền quản trị của chính mình được.' }, 400);
        if (!(await conQuanTriKhac())) return json({ loi: BAO_CON_QUAN_TRI }, 400);
      }
      await db
        .prepare('UPDATE tai_khoan SET ten_hien_thi = ?, vai_tro = ?, slug_hoi_vien = ? WHERE id = ?')
        .bind(tt.tenHienThi, tt.vaiTro, tt.slugHoiVien, id)
        .run();
      await ghi(`sua (${tt.vaiTro})`);
      return json({ ok: true });
    }

    case 'xoa': {
      if (laMinh) return json({ loi: 'Không tự xoá tài khoản của chính mình được.' }, 400);
      if (tk.vai_tro === 'admin' && !(await conQuanTriKhac())) return json({ loi: BAO_CON_QUAN_TRI }, 400);
      await db.batch([
        db.prepare('DELETE FROM phien_dang_nhap WHERE tai_khoan_id = ?').bind(id),
        db.prepare('DELETE FROM ma_kich_hoat WHERE tai_khoan_id = ?').bind(id),
        db.prepare('DELETE FROM tai_khoan WHERE id = ?').bind(id),
      ]);
      await ghi('xoa');
      return json({ ok: true });
    }

    default:
      return json({ loi: 'Thao tác không hợp lệ.' }, 400);
  }
};
