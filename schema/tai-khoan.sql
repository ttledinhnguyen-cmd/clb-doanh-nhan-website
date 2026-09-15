-- Tài khoản đăng nhập trang /cap-nhat, thay cho đường dẫn riêng cũ (từ 15/09/2026).
-- Tạo bằng:  npx wrangler d1 execute clb-doanh-nhan --remote -y --file schema/tai-khoan.sql
--
-- Không bảng nào giữ mật khẩu hay mã bí mật ở dạng gốc:
--   - mật khẩu được trình duyệt kéo giãn 600.000 vòng (src/lib/mat-khau.ts), máy
--     chủ chỉ lưu HMAC-SHA256 của khoá đó với muối ngẫu nhiên riêng từng tài khoản;
--   - mã phiên đăng nhập và mã link đặt mật khẩu chỉ lưu SHA-256.

CREATE TABLE IF NOT EXISTS tai_khoan (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ten_dang_nhap       TEXT NOT NULL UNIQUE,     -- không đổi được sau khi tạo (muối gắn theo tên)
  ten_hien_thi        TEXT NOT NULL,
  vai_tro             TEXT NOT NULL CHECK (vai_tro IN ('admin', 'thu-ky', 'hoi-vien')),
  slug_hoi_vien       TEXT NOT NULL DEFAULT '', -- hồ sơ hội viên gắn với tài khoản
  muoi                TEXT NOT NULL DEFAULT '',
  bam_mat_khau        TEXT NOT NULL DEFAULT '', -- rỗng: chưa đặt mật khẩu, chưa đăng nhập được
  hoat_dong           INTEGER NOT NULL DEFAULT 1,
  tao_luc             TEXT NOT NULL,
  tao_boi             TEXT NOT NULL DEFAULT '',
  doi_mat_khau_luc    TEXT NOT NULL DEFAULT '',
  dang_nhap_lan_cuoi  TEXT NOT NULL DEFAULT ''
);

-- Link dùng một lần để người dùng tự đặt mật khẩu (tài khoản mới, hoặc đặt lại).
CREATE TABLE IF NOT EXISTS ma_kich_hoat (
  ma_bam        TEXT PRIMARY KEY,
  tai_khoan_id  INTEGER NOT NULL REFERENCES tai_khoan (id) ON DELETE CASCADE,
  het_han       TEXT NOT NULL,
  tao_luc       TEXT NOT NULL,
  tao_boi       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_kich_hoat_tai_khoan ON ma_kich_hoat (tai_khoan_id);

CREATE TABLE IF NOT EXISTS phien_dang_nhap (
  ma_bam        TEXT PRIMARY KEY,
  tai_khoan_id  INTEGER NOT NULL REFERENCES tai_khoan (id) ON DELETE CASCADE,
  tao_luc       TEXT NOT NULL,
  het_han       TEXT NOT NULL,                  -- lùi dần khi còn dùng (7 ngày không dùng là hết)
  het_han_cung  TEXT NOT NULL,                  -- tối đa 30 ngày kể từ lúc đăng nhập
  ip            TEXT NOT NULL DEFAULT '',
  trinh_duyet   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_phien_tai_khoan ON phien_dang_nhap (tai_khoan_id);

-- Mọi lượt đăng nhập, để chặn dò mật khẩu và để quản trị viên theo dõi.
CREATE TABLE IF NOT EXISTS lan_dang_nhap (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ten_dang_nhap  TEXT NOT NULL,
  ip             TEXT NOT NULL,
  thanh_cong     INTEGER NOT NULL,
  luc            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lan_dang_nhap_ip ON lan_dang_nhap (ip, luc);
CREATE INDEX IF NOT EXISTS idx_lan_dang_nhap_ten ON lan_dang_nhap (ten_dang_nhap, luc);

-- Ai đã sửa gì, lúc nào: hồ sơ, bài viết, trang, thông tin chung, tài khoản.
CREATE TABLE IF NOT EXISTS nhat_ky_thao_tac (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tai_khoan  TEXT NOT NULL,
  doi_tuong  TEXT NOT NULL,
  noi_dung   TEXT NOT NULL,
  co_anh     INTEGER NOT NULL DEFAULT 0,
  ip         TEXT NOT NULL DEFAULT '',
  luc        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nhat_ky_thao_tac_luc ON nhat_ky_thao_tac (luc);
