/**
 * Cloudflare Pages Function — đăng xuất: huỷ phiên trên máy chủ và xoá cookie.
 *
 *   POST  → { ok: true }
 */
import { json } from '../../src/lib/kho-github';
import { type EnvTaiKhoan, COOKIE_XOA_PHIEN, bamSha256, cungNguon, docMaPhien } from '../../src/lib/tai-khoan';

export const onRequestPost: PagesFunction<EnvTaiKhoan> = async ({ request, env }) => {
  if (!cungNguon(request)) return json({ loi: 'Yêu cầu không hợp lệ.' }, 403);
  const ma = docMaPhien(request);
  if (ma && env.DB) {
    await env.DB.prepare('DELETE FROM phien_dang_nhap WHERE ma_bam = ?').bind(await bamSha256(ma)).run();
  }
  return json({ ok: true }, 200, { 'set-cookie': COOKIE_XOA_PHIEN });
};
