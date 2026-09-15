/**
 * Cloudflare Pages Function — tải MỘT ảnh lên kho, chưa commit.
 *
 * Trang /cap-nhat gửi từng ảnh một (ảnh sản phẩm của hội viên, ảnh trong bài
 * viết), mỗi ảnh kèm bản thu nhỏ. Hàm này chỉ tạo blob rồi trả mã về. Ảnh chỉ
 * thật sự lên website khi người dùng bấm Lưu: hàm hồ sơ hoặc bài viết gom hết
 * vào đúng một commit.
 *
 * Gửi từng ảnh thay vì gom cả chục ảnh vào một lượt, vì gói miễn phí của
 * Cloudflare chỉ cho mỗi lượt gọi hàm 10ms xử lý; một gói vài MB sẽ vượt.
 *
 *   POST { loai: 'san-pham' | 'bai-viet', lon, nho }
 *     → { anh: '/images/tai-len/….webp', blobLon, blobNho }
 */
import { type EnvKho, json, thieuCauHinh, taoBlob, tachAnh } from '../../src/lib/kho-github';
import { coQuyenBienTap, yeuCauDangNhap } from '../../src/lib/tai-khoan';

export const onRequestPost: PagesFunction<EnvKho> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env);
  if (phien instanceof Response) return phien;

  const body = (await request.json().catch(() => ({}))) as {
    loai?: string;
    lon?: string;
    nho?: string;
  };

  if (body.loai !== 'san-pham' && body.loai !== 'bai-viet') {
    return json({ loi: 'Loại ảnh không hợp lệ.' }, 400);
  }
  // Hội viên tải được ảnh sản phẩm cho hồ sơ của mình; ảnh bài viết chỉ quản trị và ban thư ký.
  const bienTap = coQuyenBienTap(phien.vaiTro);
  if ((body.loai === 'bai-viet' && !bienTap) || (!bienTap && !phien.slugHoiVien)) {
    return json({ loi: 'Tài khoản này không có quyền thực hiện thao tác đó.' }, 403);
  }
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);

  const lon = tachAnh(body.lon, 3_000_000);
  if ('loi' in lon) return json({ loi: lon.loi }, 400);
  const nho = tachAnh(body.nho, 600_000);
  if ('loi' in nho) return json({ loi: nho.loi }, 400);
  // Bản nhỏ nằm cạnh bản lớn: cùng tên thêm "-nho", cùng đuôi file.
  if (nho.duoi !== lon.duoi) return json({ loi: 'Ảnh gửi lên không hợp lệ.' }, 400);

  try {
    const ma = crypto.randomUUID().slice(0, 8);
    const ten = `${body.loai === 'san-pham' ? 'sp' : 'bai'}-${Date.now()}-${ma}`;
    const [blobLon, blobNho] = await Promise.all([taoBlob(env, lon.b64), taoBlob(env, nho.b64)]);
    return json({ ok: true, anh: `/images/tai-len/${ten}.${lon.duoi}`, blobLon, blobNho });
  } catch (e) {
    console.error('Tải ảnh lên lỗi:', e);
    return json({ loi: 'Máy chủ chưa nhận được ảnh. Anh/chị thử lại sau ít phút.' }, 500);
  }
};
