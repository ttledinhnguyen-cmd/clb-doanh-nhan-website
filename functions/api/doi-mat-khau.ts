/**
 * Cloudflare Pages Function — đổi mật khẩu của chính mình.
 *
 *   POST { khoaCu, khoaMoi }  → { ok: true }
 *
 * Phải đưa đúng mật khẩu hiện tại (dạng khoá, xem src/lib/mat-khau.ts). Đổi xong
 * thì mọi thiết bị khác đang đăng nhập tài khoản này bị đăng xuất; thiết bị đang
 * đổi vẫn giữ phiên.
 */
import { json } from '../../src/lib/kho-github';
import {
  type EnvTaiKhoan,
  MAU_MA,
  BAO_BI_CHAN,
  bamKhoa,
  biChan,
  ghiLanDangNhap,
  ghiNhatKy,
  giongNhau,
  ipCua,
  ngauNhienHex,
  yeuCauDangNhap,
} from '../../src/lib/tai-khoan';

export const onRequestPost: PagesFunction<EnvTaiKhoan> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env);
  if (phien instanceof Response) return phien;

  const body = (await request.json().catch(() => ({}))) as { khoaCu?: unknown; khoaMoi?: unknown };
  const khoaCu = String(body.khoaCu ?? '');
  const khoaMoi = String(body.khoaMoi ?? '');
  if (!MAU_MA.test(khoaCu) || !MAU_MA.test(khoaMoi)) return json({ loi: 'Dữ liệu gửi lên không hợp lệ.' }, 400);

  const ip = ipCua(request);
  if (await biChan(env, ip, phien.tenDangNhap)) return json({ loi: BAO_BI_CHAN }, 429, { 'retry-after': '900' });

  const db = env.DB!;
  const tk = await db
    .prepare('SELECT muoi, bam_mat_khau FROM tai_khoan WHERE id = ?')
    .bind(phien.taiKhoanId)
    .first<{ muoi: string; bam_mat_khau: string }>();
  if (!tk || !giongNhau(await bamKhoa(tk.muoi, khoaCu), tk.bam_mat_khau)) {
    await ghiLanDangNhap(env, phien.tenDangNhap, ip, false);
    return json({ loi: 'Mật khẩu hiện tại không đúng.' }, 400);
  }
  if (khoaMoi === khoaCu) return json({ loi: 'Mật khẩu mới phải khác mật khẩu hiện tại.' }, 400);

  const muoi = ngauNhienHex(16);
  await db.batch([
    db
      .prepare('UPDATE tai_khoan SET muoi = ?, bam_mat_khau = ?, doi_mat_khau_luc = ? WHERE id = ?')
      .bind(muoi, await bamKhoa(muoi, khoaMoi), new Date().toISOString(), phien.taiKhoanId),
    db
      .prepare('DELETE FROM phien_dang_nhap WHERE tai_khoan_id = ? AND ma_bam != ?')
      .bind(phien.taiKhoanId, phien.maBam),
    db.prepare('DELETE FROM ma_kich_hoat WHERE tai_khoan_id = ?').bind(phien.taiKhoanId),
  ]);
  await ghiNhatKy(env, phien.tenDangNhap, `tai-khoan/${phien.tenDangNhap}`, 'doi-mat-khau', false, ip);
  return json({ ok: true });
};
