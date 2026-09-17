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

/**
 * Một ảnh trong album.
 *
 * Album cũ do scripts/build-assets.mjs sinh ra chỉ lưu tên ảnh; file nằm theo
 * quy ước public/images/hoat-dong/<slug>/<ten>.webp và <ten>-thumb.webp.
 * Album ban thư ký tạo trên web thì ảnh nằm trong images/tai-len/ nên lưu thẳng
 * đường dẫn vào `lon` và `nho`.
 */
export type AnhAlbum = { ten: string; ngang?: boolean; lon?: string; nho?: string };

export type Album = {
  slug: string;
  ten: string;
  danhMuc: string;
  soAnh: number;
  anh: AnhAlbum[];
  /** true khi album do ban thư ký tạo trên web; album cũ không có trường này. */
  tuWeb?: boolean;
};

export const anhAlbumLon = (slug: string, a: AnhAlbum) =>
  a.lon || `/images/hoat-dong/${slug}/${a.ten}.webp`;

export const anhAlbumNho = (slug: string, a: AnhAlbum) =>
  a.nho || `/images/hoat-dong/${slug}/${a.ten}-thumb.webp`;

/**
 * Ép kiểu thư viện ảnh và bỏ album không có ảnh nào.
 *
 * Ép kiểu vì TypeScript suy kiểu thu-vien.json theo đúng nội dung file: hiện
 * chưa mục nào có `lon`, `nho`, `tuWeb` nên nếu không ép thì đọc các trường đó
 * sẽ báo lỗi biên dịch.
 *
 * Lọc vì album 0 ảnh làm sập cả bản build — nhiều chỗ đọc thẳng a.anh[0].
 */
export const locAlbum = (ds: unknown): Album[] =>
  (ds as Album[]).filter((a) => a.anh.length > 0);
