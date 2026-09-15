/**
 * Mật khẩu tài khoản — phần chạy trên trình duyệt (và script Node tạo tài khoản).
 *
 * Mật khẩu không bao giờ rời máy người dùng ở dạng gốc. Trình duyệt kéo giãn nó
 * bằng PBKDF2-SHA256 600.000 vòng (mức OWASP khuyến nghị) thành một "khoá" rồi
 * mới gửi khoá đó đi; máy chủ chỉ lưu bản băm có muối của khoá.
 *
 * Làm phần nặng ở trình duyệt vì gói miễn phí của Cloudflare chỉ cho mỗi lượt
 * gọi hàm 10ms xử lý, không đủ để máy chủ tự băm chậm. Kẻ lấy được cơ sở dữ liệu
 * vẫn phải tốn 600.000 vòng cho mỗi lần đoán thử một mật khẩu.
 *
 * Muối gắn với tên đăng nhập, nên tên đăng nhập không cho đổi sau khi tạo.
 */

export const SO_VONG = 600_000;
const TIEN_TO_MUOI = 'kh-sg.com|tai-khoan|';

/** Tên đăng nhập: 3–40 ký tự, chữ thường không dấu, số, dấu chấm, gạch ngang, gạch dưới. */
export const MAU_TEN_DANG_NHAP = /^[a-z0-9][a-z0-9._-]{2,39}$/;

export const chuanHoaTen = (s: string) => s.normalize('NFC').trim().toLowerCase();

/** Kéo giãn mật khẩu thành khoá 256 bit, dạng base64url 43 ký tự. */
export async function taoKhoa(tenDangNhap: string, matKhau: string): Promise<string> {
  const ma = new TextEncoder();
  // Chuẩn hoá NFC: cùng một chữ có dấu, bàn phím iPhone và Windows có thể gõ ra
  // hai chuỗi byte khác nhau.
  const vatLieu = await crypto.subtle.importKey('raw', ma.encode(matKhau.normalize('NFC')), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bit = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: ma.encode(TIEN_TO_MUOI + chuanHoaTen(tenDangNhap)), iterations: SO_VONG },
    vatLieu,
    256,
  );
  let s = '';
  for (const b of new Uint8Array(bit)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Những dãy quá dễ đoán, không được nằm trong mật khẩu. */
const DAY_DE_DOAN = [
  '123456', '234567', '345678', '456789', '987654', '654321',
  '111111', '000000', '666666', '888888', '999999',
  'abcdef', 'qwerty', 'asdfgh', 'password', 'matkhau', 'iloveyou', 'khanhhoa', 'doanhnhan',
];

/** Kiểm tra mật khẩu người dùng tự đặt. Trả câu báo lỗi, hoặc null nếu dùng được. */
export function loiMatKhauMoi(matKhau: string, tenDangNhap: string): string | null {
  const mk = matKhau.normalize('NFC');
  if (mk.length < 10) return 'Mật khẩu cần ít nhất 10 ký tự.';
  if (mk.length > 128) return 'Mật khẩu dài tối đa 128 ký tự.';
  if (new Set(mk).size < 5) return 'Mật khẩu lặp lại quá nhiều ký tự giống nhau.';
  const gon = mk.toLowerCase().replace(/\s+/g, '');
  const ten = chuanHoaTen(tenDangNhap);
  if (ten.length >= 3 && gon.includes(ten)) return 'Mật khẩu không được chứa tên đăng nhập.';
  if (DAY_DE_DOAN.some((d) => gon.includes(d))) {
    return 'Mật khẩu chứa dãy quá dễ đoán (như 123456, matkhau). Anh/chị chọn cách khác.';
  }
  return null;
}
