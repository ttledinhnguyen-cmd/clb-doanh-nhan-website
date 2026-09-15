/**
 * Tài khoản đăng nhập — phần chạy trên máy chủ (Cloudflare Pages Functions).
 *
 * Hội viên, ban thư ký và quản trị viên đăng nhập bằng tài khoản do quản trị
 * viên cấp (bảng ở schema/tai-khoan.sql). Đăng nhập xong, trình duyệt giữ một
 * cookie phiên HttpOnly; mọi API ghi nội dung đều đi qua yeuCauDangNhap().
 *
 *   admin     sửa toàn bộ nội dung và quản lý tài khoản
 *   thu-ky    sửa toàn bộ nội dung
 *   hoi-vien  chỉ sửa hồ sơ hội viên gắn với tài khoản
 */
import { json } from './kho-github';

export type VaiTro = 'admin' | 'thu-ky' | 'hoi-vien';
export const VAI_TRO: readonly string[] = ['admin', 'thu-ky', 'hoi-vien'];

export interface EnvTaiKhoan {
  DB?: D1Database;
}

export type Phien = {
  maBam: string;
  taiKhoanId: number;
  tenDangNhap: string;
  tenHienThi: string;
  vaiTro: VaiTro;
  slugHoiVien: string;
};

const NGAY = 86_400_000;
export const TEN_COOKIE = '__Host-phien';
/** Không dùng quá 7 ngày thì phiên hết hạn; dùng liên tục cũng chỉ giữ tối đa 30 ngày. */
const THOI_HAN_NGHI = 7 * NGAY;
const THOI_HAN_TOI_DA = 30 * NGAY;
/** Link đặt mật khẩu do quản trị viên tạo dùng được trong 3 ngày. */
export const THOI_HAN_LINK = 3 * NGAY;
const LAN_SAI_TOI_DA = 10;
const CUA_SO_CHAN = 15 * 60_000;
/** Mỗi tài khoản giữ tối đa chừng này phiên (điện thoại, máy tính…), cũ nhất bị bỏ trước. */
const SO_PHIEN_TOI_DA = 10;

/** Khoá mật khẩu (trình duyệt gửi lên), mã phiên và mã link đều là 32 byte dạng base64url. */
export const MAU_MA = /^[A-Za-z0-9_-]{43}$/;

const iso = (t: number) => new Date(t).toISOString();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export const ngauNhienHex = (soByte: number) => hex(crypto.getRandomValues(new Uint8Array(soByte)));

export function ngauNhienMa() {
  let s = '';
  for (const b of crypto.getRandomValues(new Uint8Array(32))) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const bamSha256 = async (s: string) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));

/** HMAC-SHA256 của khoá mật khẩu với muối riêng của tài khoản. */
export async function bamKhoa(muoiHex: string, khoa: string) {
  const muoi = Uint8Array.from(muoiHex.match(/../g) ?? [], (h) => parseInt(h, 16));
  const k = await crypto.subtle.importKey('raw', muoi, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(khoa))));
}

/** So hai chuỗi mà thời gian so không lộ vị trí ký tự khác nhau. */
export function giongNhau(a: string, b: string) {
  if (a.length !== b.length) return false;
  let khac = 0;
  for (let i = 0; i < a.length; i++) khac |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return khac === 0;
}

export const cookiePhien = (ma: string) =>
  `${TEN_COOKIE}=${ma}; Path=/; Max-Age=${THOI_HAN_TOI_DA / 1000}; HttpOnly; Secure; SameSite=Lax`;
export const COOKIE_XOA_PHIEN = `${TEN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function docMaPhien(request: Request) {
  for (const phan of (request.headers.get('cookie') ?? '').split(';')) {
    const i = phan.indexOf('=');
    if (i > 0 && phan.slice(0, i).trim() === TEN_COOKIE) {
      const ma = phan.slice(i + 1).trim();
      return MAU_MA.test(ma) ? ma : '';
    }
  }
  return '';
}

/**
 * Yêu cầu ghi (POST, PUT…) phải đến từ chính website này. Cùng với cookie
 * SameSite=Lax, chặn trang lạ lợi dụng phiên đăng nhập để gửi yêu cầu hộ.
 */
export function cungNguon(request: Request) {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  const nguon = request.headers.get('origin');
  if (!nguon) return false;
  try {
    return new URL(nguon).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export const ipCua = (request: Request) => request.headers.get('cf-connecting-ip') ?? '';

export async function docPhien(request: Request, env: EnvTaiKhoan): Promise<Phien | null> {
  const ma = docMaPhien(request);
  if (!ma || !env.DB) return null;
  const maBam = await bamSha256(ma);
  const h = await env.DB.prepare(
    `SELECT p.het_han, p.het_han_cung, t.id, t.ten_dang_nhap, t.ten_hien_thi, t.vai_tro, t.slug_hoi_vien
       FROM phien_dang_nhap p JOIN tai_khoan t ON t.id = p.tai_khoan_id
      WHERE p.ma_bam = ? AND t.hoat_dong = 1 AND t.bam_mat_khau != ''`,
  )
    .bind(maBam)
    .first<{
      het_han: string;
      het_han_cung: string;
      id: number;
      ten_dang_nhap: string;
      ten_hien_thi: string;
      vai_tro: VaiTro;
      slug_hoi_vien: string;
    }>();
  if (!h) return null;

  const bayGio = Date.now();
  const hetHan = Date.parse(h.het_han);
  const hetHanCung = Date.parse(h.het_han_cung);
  if (!(bayGio < hetHan && bayGio < hetHanCung)) {
    await env.DB.prepare('DELETE FROM phien_dang_nhap WHERE ma_bam = ?').bind(maBam).run();
    return null;
  }
  // Còn dùng thì lùi hạn, nhưng mỗi ngày ghi một lần là đủ cho đỡ tốn lượt ghi.
  if (hetHan - bayGio < THOI_HAN_NGHI - NGAY) {
    await env.DB.prepare('UPDATE phien_dang_nhap SET het_han = ? WHERE ma_bam = ?')
      .bind(iso(Math.min(bayGio + THOI_HAN_NGHI, hetHanCung)), maBam)
      .run();
  }
  return {
    maBam,
    taiKhoanId: h.id,
    tenDangNhap: h.ten_dang_nhap,
    tenHienThi: h.ten_hien_thi,
    vaiTro: h.vai_tro,
    slugHoiVien: h.slug_hoi_vien,
  };
}

export const coQuyenBienTap = (vaiTro: VaiTro) => vaiTro === 'admin' || vaiTro === 'thu-ky';

/**
 * Cổng kiểm tra của mọi API cần đăng nhập. Trả phiên nếu được đi tiếp, hoặc
 * Response báo lỗi để trả thẳng cho trình duyệt.
 *
 *   'dang-nhap'  chỉ cần đăng nhập
 *   'bien-tap'   quản trị viên hoặc ban thư ký
 *   'admin'      chỉ quản trị viên
 */
export async function yeuCauDangNhap(
  request: Request,
  env: EnvTaiKhoan,
  quyen: 'dang-nhap' | 'bien-tap' | 'admin' = 'dang-nhap',
): Promise<Phien | Response> {
  if (!env.DB) return json({ loi: 'Hệ thống tài khoản chưa được kích hoạt.' }, 503);
  if (!cungNguon(request)) return json({ loi: 'Yêu cầu không hợp lệ.' }, 403);
  const phien = await docPhien(request, env);
  if (!phien) {
    return json({ loi: 'Phiên đăng nhập đã hết hạn. Anh/chị đăng nhập lại giúp.', canDangNhap: true }, 401);
  }
  if (quyen === 'bien-tap' && !coQuyenBienTap(phien.vaiTro)) {
    return json({ loi: 'Tài khoản này không có quyền thực hiện thao tác đó.' }, 403);
  }
  if (quyen === 'admin' && phien.vaiTro !== 'admin') {
    return json({ loi: 'Chỉ tài khoản quản trị mới làm được việc này.' }, 403);
  }
  return phien;
}

/**
 * Đã sai quá 10 lần trong 15 phút thì tạm chặn: tính theo địa chỉ IP, và theo
 * tên đăng nhập nếu có (kẻ dò mật khẩu đổi IP liên tục vẫn bị chặn theo tên).
 */
export async function biChan(env: EnvTaiKhoan, ip: string, ten = '') {
  const h = await env
    .DB!.prepare(
      `SELECT COALESCE(SUM(ip = ?1), 0) AS theo_ip,
              COALESCE(SUM(?2 != '' AND ten_dang_nhap = ?2), 0) AS theo_ten
         FROM lan_dang_nhap
        WHERE thanh_cong = 0 AND luc > ?3 AND (ip = ?1 OR ten_dang_nhap = ?2)`,
    )
    .bind(ip, ten, iso(Date.now() - CUA_SO_CHAN))
    .first<{ theo_ip: number; theo_ten: number }>();
  return (h?.theo_ip ?? 0) >= LAN_SAI_TOI_DA || (h?.theo_ten ?? 0) >= LAN_SAI_TOI_DA;
}

export const BAO_BI_CHAN = 'Nhập sai quá nhiều lần. Anh/chị chờ 15 phút rồi thử lại.';

export async function ghiLanDangNhap(env: EnvTaiKhoan, ten: string, ip: string, thanhCong: boolean) {
  await env
    .DB!.prepare('INSERT INTO lan_dang_nhap (ten_dang_nhap, ip, thanh_cong, luc) VALUES (?, ?, ?, ?)')
    .bind(ten.slice(0, 60), ip, thanhCong ? 1 : 0, iso(Date.now()))
    .run();
}

/** Mở phiên mới cho tài khoản. Trả chuỗi Set-Cookie. */
export async function taoPhien(env: EnvTaiKhoan, taiKhoanId: number, request: Request) {
  const ma = ngauNhienMa();
  const bayGio = Date.now();
  const db = env.DB!;
  const maCu = docMaPhien(request);
  await db.batch([
    // Phiên cũ trên chính trình duyệt này (nếu có) bỏ luôn, không để mã cũ còn dùng được.
    db.prepare('DELETE FROM phien_dang_nhap WHERE ma_bam = ?').bind(maCu ? await bamSha256(maCu) : ''),
    db
      .prepare(
        `INSERT INTO phien_dang_nhap (ma_bam, tai_khoan_id, tao_luc, het_han, het_han_cung, ip, trinh_duyet)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        await bamSha256(ma),
        taiKhoanId,
        iso(bayGio),
        iso(bayGio + THOI_HAN_NGHI),
        iso(bayGio + THOI_HAN_TOI_DA),
        ipCua(request),
        (request.headers.get('user-agent') ?? '').slice(0, 200),
      ),
    db
      .prepare(
        `DELETE FROM phien_dang_nhap WHERE tai_khoan_id = ?1 AND ma_bam NOT IN
           (SELECT ma_bam FROM phien_dang_nhap WHERE tai_khoan_id = ?1 ORDER BY tao_luc DESC LIMIT ?2)`,
      )
      .bind(taiKhoanId, SO_PHIEN_TOI_DA),
    db.prepare('UPDATE tai_khoan SET dang_nhap_lan_cuoi = ? WHERE id = ?').bind(iso(bayGio), taiKhoanId),
    // Dọn dẹp: phiên đã hết hạn, lượt đăng nhập cũ hơn 90 ngày.
    db.prepare('DELETE FROM phien_dang_nhap WHERE het_han < ?').bind(iso(bayGio)),
    db.prepare('DELETE FROM lan_dang_nhap WHERE luc < ?').bind(iso(bayGio - 90 * NGAY)),
  ]);
  return cookiePhien(ma);
}

/**
 * Tạo link dùng một lần để người dùng tự đặt mật khẩu. Link cũ của tài khoản
 * (nếu có) mất tác dụng. Mã nằm sau dấu # nên không bao giờ bị gửi lên máy chủ
 * hay ghi vào nhật ký truy cập khi mở trang; trang /kich-hoat tự đọc rồi gửi.
 */
export async function taoLinkDatMatKhau(env: EnvTaiKhoan, taiKhoanId: number, taoBoi: string, goc: string) {
  const ma = ngauNhienMa();
  const bayGio = Date.now();
  const hetHan = iso(bayGio + THOI_HAN_LINK);
  await env.DB!.batch([
    env.DB!.prepare('DELETE FROM ma_kich_hoat WHERE tai_khoan_id = ?').bind(taiKhoanId),
    env
      .DB!.prepare('INSERT INTO ma_kich_hoat (ma_bam, tai_khoan_id, het_han, tao_luc, tao_boi) VALUES (?, ?, ?, ?, ?)')
      .bind(await bamSha256(ma), taiKhoanId, hetHan, iso(bayGio), taoBoi),
  ]);
  return { link: `${goc}/kich-hoat#${ma}`, hetHan };
}

/** Ghi nhật ký ai đã làm gì. Lỗi ở đây không làm hỏng việc đã lưu. */
export async function ghiNhatKy(
  env: EnvTaiKhoan,
  taiKhoan: string,
  doiTuong: string,
  noiDung: string,
  coAnh: boolean,
  ip: string,
) {
  try {
    await env
      .DB!.prepare(
        'INSERT INTO nhat_ky_thao_tac (tai_khoan, doi_tuong, noi_dung, co_anh, ip, luc) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(taiKhoan, doiTuong.slice(0, 200), noiDung.slice(0, 500), coAnh ? 1 : 0, ip, iso(Date.now()))
      .run();
  } catch (e) {
    console.error('Ghi nhật ký thất bại:', e);
  }
}

/** Hậu tố lời nhắn commit, để lịch sử kho GitHub cũng biết ai đã sửa. */
export const boi = (p: Phien) => ` — bởi ${p.tenDangNhap}`;
