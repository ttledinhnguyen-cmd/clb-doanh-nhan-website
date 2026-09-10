import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Bậc trong Ban điều hành. Hội viên thường để trống. */
export const CAP_BAC = [
  'chu-tich',
  'pho-chu-tich-thuong-truc',
  'pho-chu-tich',
  'pho-chu-tich-danh-du',
  'uy-vien',
  'uy-vien-du-khuyet',
] as const;

export const DANH_MUC_TIN = {
  'cong-tac-xa-hoi': 'Công tác xã hội',
  'phat-trien-thanh-vien': 'Phát triển thành viên',
  'van-hoa-the-thao': 'Văn hoá – Thể thao',
  'su-kien': 'Sự kiện CLB',
} as const;

const hoiVien = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/hoi-vien' }),
  schema: z.object({
    hoTen: z.string(),
    xungHo: z.string().default(''),

    // Ảnh chân dung. Để trống thì dùng ảnh do scripts/build-assets.mjs sinh ra
    // tại /images/hoi-vien/<mã hội viên>.webp. Ảnh thư ký tải lên qua trang
    // quản trị sẽ nằm ở đây và được ưu tiên.
    anh: z.string().default(''),
    anhGoc: z.string().default(''),

    // Chức vụ trong CLB – chỉ Ban điều hành mới có.
    chucVuClb: z.string().default(''),
    capBac: z.enum(CAP_BAC).or(z.literal('')).default(''),
    thuTu: z.number().default(9999),

    // Doanh nghiệp
    chucDanh: z.string().default(''),
    doanhNghiep: z.string().default(''),
    nganhNghe: z.string().default('Đang cập nhật'),
    namThanhLap: z.number().nullable().default(null),
    quyMo: z.string().default(''),
    logoDoanhNghiep: z.string().default(''),

    // Liên hệ – hiển thị công khai đầy đủ theo yêu cầu của CLB.
    dienThoai: z.string().default(''),
    email: z.string().default(''),
    website: z.string().default(''),
    diaChi: z.string().default(''),
    facebook: z.string().default(''),
    zalo: z.string().default(''),

    namGiaNhap: z.number().nullable().default(null),
    sanPham: z.array(z.string()).default([]),
    khachHang: z.array(z.string()).default([]),
    uuDaiHoiVien: z.string().default(''),
    anhDoanhNghiep: z.array(z.string()).default([]),
    noiBat: z.boolean().default(false),
  }),
});

/** Các trang nội dung mà ban thư ký tự sửa được qua /cap-nhat. */
const trang = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/trang' }),
  schema: z.object({
    tieuDe: z.string(),
    nhan: z.string().default(''),
    moTa: z.string().default(''),
    /** Lấy album trong thư viện ảnh thuộc danh mục này để hiện dưới trang. */
    danhMucAlbum: z.string().default(''),
    /** Chuyên mục tin tức hiện ở cuối trang. */
    danhMucTin: z.string().default(''),
    thuTu: z.number().default(99),
  }),
});

const tinTuc = defineCollection({
  // File bắt đầu bằng dấu _ được bỏ qua — dùng cho bài mẫu, bản nháp.
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/tin-tuc' }),
  schema: z.object({
    tieuDe: z.string(),
    moTa: z.string().default(''),
    ngay: z.coerce.date(),
    danhMuc: z.enum(Object.keys(DANH_MUC_TIN) as [string, ...string[]]),
    anhBia: z.string().default(''),
    album: z.string().default(''),
    noiBat: z.boolean().default(false),
  }),
});

export const collections = { hoiVien, tinTuc, trang };
