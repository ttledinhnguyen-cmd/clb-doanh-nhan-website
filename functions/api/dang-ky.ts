/**
 * Cloudflare Pages Function — tiếp nhận hồ sơ đăng ký hội viên.
 *
 * Cần cấu hình trong Cloudflare Pages → Settings:
 *   • D1 database binding tên `DB` (bảng tạo bằng schema/dang-ky.sql)
 *   • (Tuỳ chọn) biến môi trường EMAIL_THU_KY + RESEND_API_KEY để gửi email báo.
 *
 * Nếu chưa gắn D1, hàm trả lỗi rõ ràng thay vì im lặng đánh mất hồ sơ.
 */

interface Env {
  DB?: D1Database;
  EMAIL_THU_KY?: string;
  RESEND_API_KEY?: string;
}

const BAT_BUOC = [
  'hoTen',
  'dienThoai',
  'email',
  'lienHeKhanhHoa',
  'doanhNghiep',
  'chucDanh',
  'nganhNghe',
] as const;

const GIOI_HAN = 5000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const sach = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, GIOI_HAN) : '');

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ loi: 'Dữ liệu gửi lên không hợp lệ.' }, 400);
  }

  // Bẫy bot: người dùng thật không nhìn thấy nên không bao giờ điền ô này.
  if (sach(body.website2)) return json({ ok: true });

  const thieu = BAT_BUOC.filter((k) => !sach(body[k]));
  if (thieu.length) {
    return json({ loi: 'Vui lòng điền đầy đủ các trường bắt buộc.' }, 400);
  }

  const email = sach(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ loi: 'Địa chỉ email chưa đúng định dạng.' }, 400);
  }
  if (!body.camKet) {
    return json({ loi: 'Vui lòng xác nhận cam kết tuân thủ điều lệ câu lạc bộ.' }, 400);
  }

  const hoSo = {
    hoTen: sach(body.hoTen),
    dienThoai: sach(body.dienThoai),
    email,
    lienHeKhanhHoa: sach(body.lienHeKhanhHoa),
    doanhNghiep: sach(body.doanhNghiep),
    chucDanh: sach(body.chucDanh),
    nganhNghe: sach(body.nganhNghe),
    diaChi: sach(body.diaChi),
    website: sach(body.website),
    gioiThieu: sach(body.gioiThieu),
    nguoiGioiThieu: sach(body.nguoiGioiThieu),
    mongMuon: sach(body.mongMuon),
    dongYCongKhai: body.dongYCongKhai ? 1 : 0,
    ip: request.headers.get('cf-connecting-ip') ?? '',
    taoLuc: new Date().toISOString(),
  };

  if (!env.DB) {
    return json(
      { loi: 'Hệ thống tiếp nhận hồ sơ chưa được kích hoạt (thiếu kết nối cơ sở dữ liệu).' },
      503,
    );
  }

  try {
    await env.DB.prepare(
      `INSERT INTO dang_ky_hoi_vien
         (ho_ten, dien_thoai, email, lien_he_khanh_hoa, doanh_nghiep, chuc_danh, nganh_nghe,
          dia_chi, website, gioi_thieu, nguoi_gioi_thieu, mong_muon, dong_y_cong_khai, ip, tao_luc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        hoSo.hoTen,
        hoSo.dienThoai,
        hoSo.email,
        hoSo.lienHeKhanhHoa,
        hoSo.doanhNghiep,
        hoSo.chucDanh,
        hoSo.nganhNghe,
        hoSo.diaChi,
        hoSo.website,
        hoSo.gioiThieu,
        hoSo.nguoiGioiThieu,
        hoSo.mongMuon,
        hoSo.dongYCongKhai,
        hoSo.ip,
        hoSo.taoLuc,
      )
      .run();
  } catch (e) {
    console.error('Lưu hồ sơ thất bại:', e);
    return json({ loi: 'Không lưu được hồ sơ, vui lòng thử lại sau ít phút.' }, 500);
  }

  // Báo cho ban thư ký. Lỗi gửi mail không được làm hỏng việc đã lưu hồ sơ.
  if (env.RESEND_API_KEY && env.EMAIL_THU_KY) {
    await baoBanThuKy(hoSo, env);
  }

  return json({ ok: true });
};

type HoSo = {
  hoTen: string;
  dienThoai: string;
  email: string;
  lienHeKhanhHoa: string;
  doanhNghiep: string;
  chucDanh: string;
  nganhNghe: string;
  diaChi: string;
  website: string;
  gioiThieu: string;
  nguoiGioiThieu: string;
  mongMuon: string;
  dongYCongKhai: number;
  taoLuc: string;
};

const thoat = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Gửi email tóm tắt hồ sơ cho ban thư ký. Không ném lỗi ra ngoài. */
async function baoBanThuKy(hoSo: HoSo, env: Env) {
  const gio = new Date(hoSo.taoLuc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const tatCaMuc: [string, string][] = [
    ['Họ và tên', hoSo.hoTen],
    ['Điện thoại', hoSo.dienThoai],
    ['Email', hoSo.email],
    ['Liên hệ với Khánh Hòa', hoSo.lienHeKhanhHoa],
    ['Doanh nghiệp', hoSo.doanhNghiep],
    ['Chức danh', hoSo.chucDanh],
    ['Ngành nghề', hoSo.nganhNghe],
    ['Địa chỉ', hoSo.diaChi],
    ['Website', hoSo.website],
    ['Giới thiệu doanh nghiệp', hoSo.gioiThieu],
    ['Người giới thiệu', hoSo.nguoiGioiThieu],
    ['Mong muốn khi tham gia', hoSo.mongMuon],
    ['Đồng ý đăng công khai', hoSo.dongYCongKhai ? 'Có' : 'Không'],
    ['Thời gian gửi', gio],
  ];
  // Bỏ những mục người đăng ký để trống cho email gọn.
  const muc = tatCaMuc.filter(([, v]) => v);

  const text =
    `Có hồ sơ đăng ký hội viên mới.\n\n` +
    muc.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nHồ sơ đã được lưu vào cơ sở dữ liệu của website.`;

  const html =
    `<div style="font:15px/1.6 system-ui,sans-serif;color:#334155;max-width:640px">` +
    `<h2 style="color:#00558f;margin:0 0 4px">Hồ sơ đăng ký hội viên mới</h2>` +
    `<p style="margin:0 0 20px;color:#64748b;font-size:13px">Gửi lúc ${thoat(gio)}</p>` +
    `<table style="border-collapse:collapse;width:100%">` +
    muc
      .map(
        ([k, v]) =>
          `<tr>` +
          `<td style="padding:9px 14px 9px 0;border-bottom:1px solid #e2e8f0;color:#64748b;` +
          `white-space:nowrap;vertical-align:top;font-size:13px">${thoat(k)}</td>` +
          `<td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-weight:600;` +
          `color:#0f172a">${thoat(v)}</td></tr>`,
      )
      .join('') +
    `</table>` +
    `<p style="margin:22px 0 0;color:#64748b;font-size:13px">` +
    `Hồ sơ đã lưu vào cơ sở dữ liệu website. Bấm Trả lời để liên hệ thẳng với người đăng ký.` +
    `</p></div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // onboarding@resend.dev là địa chỉ gửi dùng thử của Resend, chạy ngay
        // không cần xác minh tên miền. Khi CLB có tên miền riêng và đã xác minh
        // trên Resend thì đổi thành dạng no-reply@<tên-miền-clb>.
        from: 'CLB Doanh nhân Khánh Hòa <onboarding@resend.dev>',
        to: [env.EMAIL_THU_KY],
        reply_to: hoSo.email,
        subject: `Hồ sơ hội viên mới: ${hoSo.hoTen} — ${hoSo.doanhNghiep}`,
        text,
        html,
      }),
    });

    // Resend trả mã lỗi 4xx kèm JSON chứ không ném ngoại lệ, nên phải tự kiểm tra.
    if (!res.ok) {
      console.error('Resend từ chối gửi email:', res.status, await res.text());
    }
  } catch (e) {
    console.error('Gửi email báo thất bại:', e);
  }
}
