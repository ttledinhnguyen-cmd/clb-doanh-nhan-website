import { getCollection, type CollectionEntry } from 'astro:content';
import bangAnh from '../data/anh-hoi-vien.json';

export type HoiVien = CollectionEntry<'hoiVien'>;

export const NHOM_BAN_DIEU_HANH = [
  { ma: 'chu-tich', ten: 'Chủ tịch' },
  { ma: 'pho-chu-tich-thuong-truc', ten: 'Phó Chủ tịch Thường trực' },
  { ma: 'pho-chu-tich', ten: 'Phó Chủ tịch' },
  { ma: 'pho-chu-tich-danh-du', ten: 'Phó Chủ tịch Danh dự' },
  { ma: 'uy-vien', ten: 'Uỷ viên Ban Chấp hành' },
  { ma: 'uy-vien-du-khuyet', ten: 'Uỷ viên dự khuyết Ban Chấp hành' },
] as const;

const theoThuTu = (a: HoiVien, b: HoiVien) =>
  a.data.thuTu - b.data.thuTu || a.data.hoTen.localeCompare(b.data.hoTen, 'vi');

/** Toàn bộ hội viên, đã sắp xếp. */
export async function layHoiVien(): Promise<HoiVien[]> {
  return (await getCollection('hoiVien')).sort(theoThuTu);
}

/** Chỉ những người giữ chức vụ trong Ban điều hành. */
export async function layBanDieuHanh(): Promise<HoiVien[]> {
  return (await layHoiVien()).filter((m) => m.data.capBac !== '');
}

/** Gom Ban điều hành theo cấp bậc, bỏ nhóm rỗng. */
export async function layBanDieuHanhTheoNhom() {
  const ds = await layBanDieuHanh();
  return NHOM_BAN_DIEU_HANH.map((nhom) => ({
    ...nhom,
    thanhVien: ds.filter((m) => m.data.capBac === nhom.ma),
  })).filter((nhom) => nhom.thanhVien.length > 0);
}

/** Danh sách ngành nghề kèm số lượng, dùng cho bộ lọc. */
export function gomNganhNghe(ds: HoiVien[]) {
  const dem = new Map<string, number>();
  for (const m of ds) {
    const n = m.data.nganhNghe?.trim();
    if (n) dem.set(n, (dem.get(n) ?? 0) + 1);
  }
  return [...dem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))
    .map(([ten, soLuong]) => ({ ten, soLuong }));
}

/** Bỏ dấu tiếng Việt để tìm kiếm không cần gõ dấu. */
export function boDau(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export const tenDayDu = (m: HoiVien) =>
  [m.data.xungHo, m.data.hoTen].filter(Boolean).join(' ');

/**
 * Đường dẫn ảnh chân dung của một hội viên.
 *
 * Ưu tiên ảnh tải lên qua /cap-nhat (trường `anh`, tên file đã có sẵn dấu thời
 * gian). Nếu chưa có thì tra bảng ảnh do scripts/build-assets.mjs sinh ra —
 * tên file mang mã băm nội dung nên ảnh đổi thì đường dẫn đổi theo, trình duyệt
 * không bao giờ hiển thị nhầm ảnh cũ trong bộ nhớ đệm.
 */
export function anhChanDung(m: HoiVien, nho = false) {
  if (m.data.anh) return m.data.anh;
  const muc = bangAnh[m.id as keyof typeof bangAnh];
  if (muc) return nho ? muc.nho : muc.lon;
  return '/logo-mark.svg'; // hội viên mới thêm mà chưa có ảnh
}

/** Có bản ảnh nhỏ riêng để dùng srcset hay không. */
export const coAnhNhieuCo = (m: HoiVien) => !m.data.anh && Boolean(bangAnh[m.id as keyof typeof bangAnh]);
