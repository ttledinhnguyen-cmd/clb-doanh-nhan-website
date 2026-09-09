-- Mã cập nhật hồ sơ dành cho hội viên (trang /cap-nhat).
-- Tạo bằng:  npx wrangler d1 execute clb-doanh-nhan --remote -y --file schema/ma-cap-nhat.sql

-- Chỉ lưu BẢN BĂM của mã, không lưu mã gốc. Kể cả có người đọc được bảng này
-- cũng không suy ngược ra được đường dẫn của hội viên.
CREATE TABLE IF NOT EXISTS ma_cap_nhat (
  slug          TEXT PRIMARY KEY,          -- mã hội viên, trùng tên file .md
  ma_bam        TEXT NOT NULL UNIQUE,      -- SHA-256 của mã, dạng hex
  vai_tro       TEXT NOT NULL DEFAULT 'hoi-vien',  -- hoi-vien | thu-ky
  tao_luc       TEXT NOT NULL,
  dung_lan_cuoi TEXT,
  so_lan_dung   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ma_bam ON ma_cap_nhat (ma_bam);

-- Nhật ký để ban thư ký biết ai đã sửa gì, lúc nào.
CREATE TABLE IF NOT EXISTS nhat_ky_sua_ho_so (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  slug     TEXT NOT NULL,
  truong   TEXT NOT NULL,                  -- các trường đã đổi, cách nhau bởi dấu phẩy
  co_anh   INTEGER NOT NULL DEFAULT 0,
  ip       TEXT,
  luc      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nhat_ky_luc ON nhat_ky_sua_ho_so (luc DESC);
