-- Bảng lưu hồ sơ đăng ký hội viên gửi từ trang /dang-ky
-- Tạo bằng:  npx wrangler d1 execute clb-doanh-nhan --remote --file schema/dang-ky.sql

CREATE TABLE IF NOT EXISTS dang_ky_hoi_vien (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ho_ten            TEXT NOT NULL,
  dien_thoai        TEXT NOT NULL,
  email             TEXT NOT NULL,
  lien_he_khanh_hoa TEXT NOT NULL,
  doanh_nghiep      TEXT NOT NULL,
  chuc_danh         TEXT NOT NULL,
  nganh_nghe        TEXT NOT NULL,
  dia_chi           TEXT,
  website           TEXT,
  gioi_thieu        TEXT,
  nguoi_gioi_thieu  TEXT,
  mong_muon         TEXT,
  dong_y_cong_khai  INTEGER NOT NULL DEFAULT 0,
  ip                TEXT,
  tao_luc           TEXT NOT NULL,
  trang_thai        TEXT NOT NULL DEFAULT 'moi'  -- moi | dang-xet | da-ket-nap | tu-choi
);

CREATE INDEX IF NOT EXISTS idx_dang_ky_tao_luc ON dang_ky_hoi_vien (tao_luc DESC);
CREATE INDEX IF NOT EXISTS idx_dang_ky_trang_thai ON dang_ky_hoi_vien (trang_thai);
