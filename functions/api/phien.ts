/**
 * Cloudflare Pages Function — tài khoản đang đăng nhập trên trình duyệt này.
 *
 *   GET  → { ok, taiKhoan: { tenDangNhap, tenHienThi, vaiTro, slugHoiVien, bienTap } }
 *          hoặc 401 nếu chưa đăng nhập, phiên đã hết hạn
 */
import { json } from '../../src/lib/kho-github';
import { type EnvTaiKhoan, coQuyenBienTap, yeuCauDangNhap } from '../../src/lib/tai-khoan';

export const onRequestGet: PagesFunction<EnvTaiKhoan> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env);
  if (phien instanceof Response) return phien;
  return json({
    ok: true,
    taiKhoan: {
      tenDangNhap: phien.tenDangNhap,
      tenHienThi: phien.tenHienThi,
      vaiTro: phien.vaiTro,
      slugHoiVien: phien.slugHoiVien,
      bienTap: coQuyenBienTap(phien.vaiTro),
    },
  });
};
