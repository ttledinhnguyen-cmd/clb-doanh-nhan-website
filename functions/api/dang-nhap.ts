/**
 * Cloudflare Pages Function — đăng nhập bằng tài khoản đã được cấp.
 *
 *   POST { tenDangNhap, khoa }  → đặt cookie phiên, trả thông tin tài khoản
 *
 * `khoa` là mật khẩu đã được trình duyệt kéo giãn (src/lib/mat-khau.ts); máy
 * chủ không bao giờ nhận mật khẩu gốc. Sai quá 10 lần trong 15 phút (theo địa
 * chỉ IP hoặc theo tên đăng nhập) thì tạm chặn.
 */
import { json } from '../../src/lib/kho-github';
import { MAU_TEN_DANG_NHAP, chuanHoaTen } from '../../src/lib/mat-khau';
import {
  type EnvTaiKhoan,
  type VaiTro,
  MAU_MA,
  BAO_BI_CHAN,
  bamKhoa,
  biChan,
  coQuyenBienTap,
  cungNguon,
  ghiLanDangNhap,
  giongNhau,
  ipCua,
  taoPhien,
} from '../../src/lib/tai-khoan';

// Tên đăng nhập không có thật vẫn được băm với muối giả, để thời gian trả lời
// không cho biết tên nào tồn tại.
const MUOI_GIA = '6b682d73672e636f6d2d67696120303030';

export const onRequestPost: PagesFunction<EnvTaiKhoan> = async ({ request, env }) => {
  if (!env.DB) return json({ loi: 'Hệ thống tài khoản chưa được kích hoạt.' }, 503);
  if (!cungNguon(request)) return json({ loi: 'Yêu cầu không hợp lệ.' }, 403);

  const body = (await request.json().catch(() => ({}))) as { tenDangNhap?: unknown; khoa?: unknown };
  const ten = chuanHoaTen(String(body.tenDangNhap ?? '')).slice(0, 60);
  const khoa = String(body.khoa ?? '');
  const ip = ipCua(request);

  if (await biChan(env, ip, ten)) return json({ loi: BAO_BI_CHAN }, 429, { 'retry-after': '900' });

  const tk = MAU_TEN_DANG_NHAP.test(ten)
    ? await env.DB.prepare(
        `SELECT id, ten_dang_nhap, ten_hien_thi, vai_tro, slug_hoi_vien, muoi, bam_mat_khau, hoat_dong
           FROM tai_khoan WHERE ten_dang_nhap = ?`,
      )
        .bind(ten)
        .first<{
          id: number;
          ten_dang_nhap: string;
          ten_hien_thi: string;
          vai_tro: VaiTro;
          slug_hoi_vien: string;
          muoi: string;
          bam_mat_khau: string;
          hoat_dong: number;
        }>()
    : null;

  const coMatKhau = Boolean(tk && tk.muoi && tk.bam_mat_khau);
  const bam = await bamKhoa(coMatKhau ? tk!.muoi : MUOI_GIA, khoa);
  if (!tk || !coMatKhau || !MAU_MA.test(khoa) || !giongNhau(bam, tk.bam_mat_khau)) {
    await ghiLanDangNhap(env, ten, ip, false);
    return json({ loi: 'Tên đăng nhập hoặc mật khẩu không đúng.' }, 401);
  }
  if (tk.hoat_dong !== 1) {
    await ghiLanDangNhap(env, ten, ip, false);
    return json({ loi: 'Tài khoản này đang bị khoá. Anh/chị liên hệ ban thư ký.' }, 403);
  }

  const cookie = await taoPhien(env, tk.id, request);
  await ghiLanDangNhap(env, ten, ip, true);
  return json(
    {
      ok: true,
      taiKhoan: {
        tenDangNhap: tk.ten_dang_nhap,
        tenHienThi: tk.ten_hien_thi,
        vaiTro: tk.vai_tro,
        slugHoiVien: tk.slug_hoi_vien,
        bienTap: coQuyenBienTap(tk.vai_tro),
      },
    },
    200,
    { 'set-cookie': cookie },
  );
};
