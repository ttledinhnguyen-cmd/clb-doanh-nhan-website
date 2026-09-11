import type { APIRoute } from 'astro';
import { layHoiVien, tenDayDu, anhChanDung } from '../lib/hoi-vien';

/**
 * Danh bạ rút gọn dạng JSON.
 *
 * Trang /cap-nhat dùng file này để hiện tên người trong ô chọn của ban thư ký,
 * để gợi ý ngành nghề đã có sẵn, và để biết ảnh chân dung hiện hành của từng
 * người — thay vì phải gọi GitHub 20 lần.
 *
 * Trường `anh` bắt buộc phải lấy qua anhChanDung() chứ không được tự ghép tên
 * file: tên file ảnh mang mã băm nội dung nên đoán bừa sẽ ra ảnh cũ.
 */
export const GET: APIRoute = async () => {
  const ds = await layHoiVien();
  return new Response(
    JSON.stringify(
      ds.map((m) => ({
        slug: m.id,
        ten: tenDayDu(m),
        doanhNghiep: m.data.doanhNghiep,
        nganhNghe: m.data.nganhNghe,
        anh: anhChanDung(m),
      })),
    ),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
};
