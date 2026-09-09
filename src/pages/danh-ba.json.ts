import type { APIRoute } from 'astro';
import { layHoiVien, tenDayDu } from '../lib/hoi-vien';

/**
 * Danh bạ rút gọn dạng JSON.
 *
 * Trang /cap-nhat dùng file này để hiện tên người trong ô chọn của ban thư ký,
 * và để gợi ý ngành nghề đã có sẵn — thay vì phải gọi GitHub 20 lần.
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
      })),
    ),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
};
