/**
 * Cloudflare Pages Function — đặt mật khẩu bằng link dùng một lần.
 *
 * Quản trị viên tạo tài khoản mới, hoặc đặt lại mật khẩu cho ai đó, sẽ nhận một
 * link /kich-hoat#<mã> để gửi riêng cho người dùng. Người dùng mở link rồi tự
 * chọn mật khẩu, nên quản trị viên không bao giờ biết mật khẩu của người khác.
 *
 *   POST { ma }        → link còn dùng được không, của tài khoản nào
 *   POST { ma, khoa }  → đặt mật khẩu, huỷ link, đăng nhập luôn
 *
 * Mã link dài 256 bit nên không đoán được; vẫn chặn IP thử sai quá 10 lần trong
 * 15 phút cho chắc.
 */
import { json } from '../../src/lib/kho-github';
import {
  type EnvTaiKhoan,
  type VaiTro,
  MAU_MA,
  BAO_BI_CHAN,
  bamKhoa,
  bamSha256,
  biChan,
  coQuyenBienTap,
  cungNguon,
  ghiLanDangNhap,
  ghiNhatKy,
  ipCua,
  ngauNhienHex,
  taoPhien,
} from '../../src/lib/tai-khoan';

/** Lượt thử link sai ghi vào bảng lượt đăng nhập dưới tên này; tên thật không có dấu #. */
const TEN_LUOT_LINK = '#link-dat-mat-khau';
const BAO_LINK_HONG =
  'Link không đúng, đã được dùng hoặc đã hết hạn. Anh/chị liên hệ ban thư ký để nhận link mới.';

export const onRequestPost: PagesFunction<EnvTaiKhoan> = async ({ request, env }) => {
  if (!env.DB) return json({ loi: 'Hệ thống tài khoản chưa được kích hoạt.' }, 503);
  if (!cungNguon(request)) return json({ loi: 'Yêu cầu không hợp lệ.' }, 403);

  const body = (await request.json().catch(() => ({}))) as { ma?: unknown; khoa?: unknown };
  const ma = String(body.ma ?? '');
  const ip = ipCua(request);
  // Chỉ chặn theo IP. Chặn theo một tên chung thì kẻ phá rối làm hỏng link của mọi người.
  if (await biChan(env, ip)) return json({ loi: BAO_BI_CHAN }, 429, { 'retry-after': '900' });

  const db = env.DB;
  const maBam = MAU_MA.test(ma) ? await bamSha256(ma) : '';
  const bayGio = new Date().toISOString();
  const tk = maBam
    ? await db
        .prepare(
          `SELECT t.id, t.ten_dang_nhap, t.ten_hien_thi, t.vai_tro, t.slug_hoi_vien
             FROM ma_kich_hoat k JOIN tai_khoan t ON t.id = k.tai_khoan_id
            WHERE k.ma_bam = ? AND k.het_han > ? AND t.hoat_dong = 1`,
        )
        .bind(maBam, bayGio)
        .first<{ id: number; ten_dang_nhap: string; ten_hien_thi: string; vai_tro: VaiTro; slug_hoi_vien: string }>()
    : null;
  if (!tk) {
    await ghiLanDangNhap(env, TEN_LUOT_LINK, ip, false);
    return json({ loi: BAO_LINK_HONG }, 400);
  }

  if (body.khoa === undefined) {
    return json({ ok: true, tenDangNhap: tk.ten_dang_nhap, tenHienThi: tk.ten_hien_thi });
  }
  const khoa = String(body.khoa);
  if (!MAU_MA.test(khoa)) return json({ loi: 'Dữ liệu gửi lên không hợp lệ.' }, 400);

  // Huỷ link trước rồi mới đặt mật khẩu: hai nơi cùng dùng một link thì chỉ một nơi thành công.
  const daHuy = await db
    .prepare('DELETE FROM ma_kich_hoat WHERE ma_bam = ? RETURNING tai_khoan_id')
    .bind(maBam)
    .first<{ tai_khoan_id: number }>();
  if (!daHuy) return json({ loi: BAO_LINK_HONG }, 400);

  const muoi = ngauNhienHex(16);
  await db.batch([
    db
      .prepare('UPDATE tai_khoan SET muoi = ?, bam_mat_khau = ?, doi_mat_khau_luc = ? WHERE id = ?')
      .bind(muoi, await bamKhoa(muoi, khoa), bayGio, tk.id),
    db.prepare('DELETE FROM ma_kich_hoat WHERE tai_khoan_id = ?').bind(tk.id),
    db.prepare('DELETE FROM phien_dang_nhap WHERE tai_khoan_id = ?').bind(tk.id),
  ]);

  const cookie = await taoPhien(env, tk.id, request);
  await ghiLanDangNhap(env, tk.ten_dang_nhap, ip, true);
  await ghiNhatKy(env, tk.ten_dang_nhap, `tai-khoan/${tk.ten_dang_nhap}`, 'dat-mat-khau-bang-link', false, ip);
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
