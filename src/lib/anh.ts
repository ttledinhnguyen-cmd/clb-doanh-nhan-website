import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Bản thu nhỏ của ảnh tải lên qua trang /cap-nhat.
 *
 * Mỗi ảnh sản phẩm, ảnh bài viết được tải lên kèm một bản nhỏ cùng tên thêm đuôi
 * "-nho" (sp-…-ab12cd34.webp và sp-…-ab12cd34-nho.webp). Lưới ảnh dùng bản nhỏ
 * cho trang nhẹ trên điện thoại; bấm vào phóng to mới tải ảnh lớn.
 *
 * Kiểm tra file có thật lúc dựng web chứ không đoán tên: ảnh tải qua /admin
 * (Decap) không có bản nhỏ, khi đó dùng luôn ảnh lớn.
 */
export function anhNho(duongDan: string): string | undefined {
  const m = duongDan.match(/^(\/images\/tai-len\/.+)\.(webp|jpe?g|png)$/i);
  if (!m) return undefined;
  const nho = `${m[1]}-nho.${m[2]}`;
  return existsSync(path.join(process.cwd(), 'public', nho)) ? nho : undefined;
}

/** Ghép danh sách ảnh với chú thích cùng thứ tự, kèm bản thu nhỏ nếu có. */
export const boAnh = (ds: string[], chuThich: string[] = []) =>
  ds.map((lon, i) => ({ lon, nho: anhNho(lon), chuThich: chuThich[i] ?? '' }));
