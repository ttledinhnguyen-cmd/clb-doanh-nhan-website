// Tách riêng khỏi hoi-vien.ts (không phụ thuộc astro:content) để test chạy được bằng node.

export const NHOM_BAN_DIEU_HANH = [
  { ma: 'chu-tich', ten: 'Chủ tịch' },
  { ma: 'pho-chu-tich-thuong-truc', ten: 'Phó Chủ tịch Thường trực' },
  { ma: 'pho-chu-tich', ten: 'Phó Chủ tịch' },
  { ma: 'pho-chu-tich-danh-du', ten: 'Phó Chủ tịch Danh dự' },
  { ma: 'uy-vien', ten: 'Uỷ viên Ban Chấp hành' },
  { ma: 'uy-vien-du-khuyet', ten: 'Uỷ viên dự khuyết Ban Chấp hành' },
] as const;

type CoThuTu = { data: { capBac: string; thuTu: number; hoTen: string } };

/** Vị trí của chức vụ; hội viên không có chức vụ xếp sau cùng. */
const hangChucVu = (capBac: string) => {
  const i = NHOM_BAN_DIEU_HANH.findIndex((n) => n.ma === capBac);
  return i === -1 ? NHOM_BAN_DIEU_HANH.length : i;
};

/**
 * Chức vụ trước (Chủ tịch → Phó Chủ tịch → Ban Chấp hành → hội viên), rồi số thứ
 * tự, rồi tên. Số thứ tự chỉ xếp người trong cùng chức vụ, nên nhập nhầm cũng
 * không thể đẩy một uỷ viên lên trên Chủ tịch.
 */
export const soSanhHoiVien = (a: CoThuTu, b: CoThuTu) =>
  hangChucVu(a.data.capBac) - hangChucVu(b.data.capBac) ||
  a.data.thuTu - b.data.thuTu ||
  a.data.hoTen.localeCompare(b.data.hoTen, 'vi');
