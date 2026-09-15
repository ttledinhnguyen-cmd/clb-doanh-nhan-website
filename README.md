# Website CLB Doanh nhân Khánh Hòa – Sài Gòn

Trang web tĩnh dựng bằng [Astro](https://astro.build) + Tailwind CSS, chạy miễn phí trên
Cloudflare Pages.

---

## Chạy trên máy

```bash
npm install
npm run dev        # mở http://localhost:4321
```

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Chạy máy chủ phát triển, tự nạp lại khi sửa file |
| `npm run build` | Build ra thư mục `dist/` |
| `npm run preview` | Xem thử bản đã build |
| `node scripts/build-assets.mjs` | Xử lý lại toàn bộ ảnh gốc thành WebP |
| `node scripts/kiem-tra-link.mjs` | Quét `dist/` tìm link hỏng và ảnh thiếu |

---

## Cấu trúc thư mục

```
website/
├─ src/
│  ├─ content/
│  │  ├─ hoi-vien/       Mỗi hội viên một file .md  → /hoi-vien/<tên-file>
│  │  └─ tin-tuc/        Mỗi bài viết một file .md  → /tin-tuc/<tên-file>
│  ├─ data/
│  │  ├─ site.json       Tên CLB, khẩu hiệu, liên hệ, tiêu chí, thành tựu
│  │  └─ thu-vien.json   Danh mục album ảnh (sinh tự động, đừng sửa tay)
│  ├─ components/        Các khối giao diện dùng lại
│  ├─ layouts/Base.astro Khung chung: thẻ meta, header, footer
│  ├─ pages/             Mỗi file là một trang
│  ├─ lib/hoi-vien.ts    Hàm đọc & sắp xếp danh sách hội viên
│  └─ styles/global.css  Bảng màu, phông chữ, tiện ích CSS
├─ public/
│  ├─ admin/             Trang quản trị nội dung (Decap CMS)
│  ├─ images/            Ảnh đã tối ưu (sinh tự động)
│  ├─ logo-full.svg      Logo gốc chuyển từ file .ai, nguồn của mọi bản logo
│  └─ logo-goc.svg, favicon.*, icon-*.png…  Sinh từ logo gốc bằng scripts/tao-logo.mjs
├─ functions/            Cloudflare Pages Functions
│  ├─ api/              Đăng nhập, tài khoản; ghi nội dung từ trang /cap-nhat (hồ sơ, bài viết, ảnh…)
│  ├─ oauth/index.ts     Đăng nhập GitHub cho /admin (bước 1)
│  └─ callback/index.ts  Đăng nhập GitHub cho /admin (bước 2)
├─ schema/              Lệnh tạo bảng D1 (tài khoản, phiên đăng nhập, nhật ký thao tác)
└─ scripts/              Script xử lý ảnh & kiểm tra
```

---

## Nhận diện thương hiệu

Màu lấy trực tiếp từ file logo gốc `logo CLB KHANH HOA.ai`:

| | Mã màu | CMYK |
| --- | --- | --- |
| Xanh chủ đạo | `#00558F` | 100 / 50 / 0 / 30 |
| Cam nhấn | `#F37021` | 0 / 70 / 100 / 0 |

Logo đã được chuyển từ `.ai` sang SVG vector (nét sắc ở mọi kích thước, nhẹ hơn ảnh).
Mọi chỗ trên web đều dùng **nguyên logo gốc**: cánh yến ở trên, chữ ở dưới, giữ màu xanh và cam.
Câu lạc bộ yêu cầu không dùng riêng cánh yến, không xếp lại thành bản ngang, không đổi màu; trên
nền tối thì đặt logo lên nền trắng. Khi logo thay đổi, thay `public/logo-full.svg` (và bản trong
`src/assets/logo/`) rồi chạy `node scripts/tao-logo.mjs` để sinh lại logo đầu trang, biểu tượng
tab, biểu tượng màn hình chính và ảnh chia sẻ link.
Phông chữ: **Be Vietnam Pro**, tự host trong site nên không phụ thuộc Google Fonts.

Thang màu đầy đủ khai báo trong `src/styles/global.css` (`--color-brand-*`, `--color-accent-*`).

---

## Thêm & sửa nội dung

Có ba đường, dành cho ba nhóm người khác nhau.

### Cách 1 — `/cap-nhat` (hội viên và ban thư ký, đăng nhập bằng tài khoản của website)

Mỗi người có một tài khoản do quản trị viên tạo ở `/tai-khoan`. Tạo xong, quản trị viên gửi
riêng cho người đó một link dùng một lần (`/kich-hoat#…`) để họ tự đặt mật khẩu, rồi đăng
nhập ở `/dang-nhap`. Không có chỗ tự đăng ký.

| Vai trò | Được làm |
| --- | --- |
| `hoi-vien` | Sửa hồ sơ gắn với tài khoản (kể cả ảnh sản phẩm) |
| `thu-ky` | Sửa toàn bộ nội dung: hồ sơ mọi hội viên, bài viết, trang hoạt động, thông tin chung |
| `admin` | Như ban thư ký, thêm quản lý tài khoản, xem lượt đăng nhập và nhật ký thao tác |

Máy chủ kiểm tra phiên đăng nhập rồi thay mặt họ commit vào kho GitHub bằng một khoá bot, nên
người dùng không cần biết GitHub là gì. Chức vụ trong CLB, cấp bậc và thứ tự hiển thị nằm ngoài
danh sách trường hội viên được sửa, không tự đổi được dù có chỉnh gói dữ liệu gửi lên.

Bảo mật (chi tiết trong `src/lib/mat-khau.ts`, `src/lib/tai-khoan.ts`):

- Trình duyệt kéo giãn mật khẩu bằng PBKDF2-SHA256 600.000 vòng rồi mới gửi; máy chủ chỉ lưu
  HMAC-SHA256 của khoá đó với muối ngẫu nhiên, không bao giờ nhận mật khẩu gốc. Làm phần nặng ở
  trình duyệt vì gói miễn phí chỉ cho mỗi lượt gọi hàm 10ms xử lý.
- Phiên đăng nhập: cookie `__Host-phien` HttpOnly, Secure, SameSite=Lax; CSDL chỉ lưu SHA-256
  của mã. Hết hạn sau 7 ngày không dùng, tối đa 30 ngày.
- Mọi yêu cầu ghi phải có `Origin` trùng website. Sai quá 10 lần trong 15 phút (theo IP hoặc
  theo tên đăng nhập) thì tạm chặn.
- Link đặt mật khẩu dùng một lần, hết hạn sau 3 ngày; mã nằm sau dấu `#` nên không bị gửi lên
  máy chủ khi mở trang.
- Đổi mật khẩu, đặt lại mật khẩu, khoá hay xoá tài khoản đều đăng xuất các phiên liên quan.

Tạo tài khoản quản trị đầu tiên, khôi phục khi quản trị viên quên mật khẩu:
`docs/buoc-cuoi-bat-tinh-nang-cap-nhat.txt` (lệnh `npm run tai-khoan`). Đường dẫn riêng kiểu cũ
`/cap-nhat?ma=…` thôi dùng từ 15/09/2026.

Chạy thử các API trên máy: `npm run build` rồi `npm run thu-functions` (wrangler pages dev, D1
cục bộ; tạo bảng cục bộ bằng `npx wrangler d1 execute clb-doanh-nhan --local -y --file schema/tai-khoan.sql`).

### Cách 2 — `/admin` (Decap CMS, cần tài khoản GitHub)

Đầy đủ hơn: thêm bài viết, tạo hội viên mới, sửa thông tin chung của CLB. Nhưng bắt buộc
phải có tài khoản GitHub và được cấp quyền vào kho, nên chỉ hợp với người rành kỹ thuật.

### Cách 3 — Sửa file trực tiếp

Thêm hội viên: tạo file mới trong `src/content/hoi-vien/`, ví dụ `nguyen-van-a.md`.
Xem `_mau-bai-viet.md` trong `src/content/tin-tuc/` để biết cấu trúc một bài viết.

**Ảnh chân dung hội viên** lấy theo thứ tự ưu tiên:
1. Trường `anh` trong frontmatter — dùng cho ảnh tải lên qua `/admin`
2. Nếu `anh` để trống: `/images/hoi-vien/<tên-file>.webp` do `scripts/build-assets.mjs` cắt sẵn

Nghĩa là 20 thành viên Ban điều hành hiện dùng ảnh cắt sẵn, còn hội viên mới thêm qua
trang quản trị thì bắt buộc phải tải ảnh lên.

> File có tên bắt đầu bằng dấu gạch dưới `_` sẽ **không** hiển thị trên web.

---

## Xử lý ảnh

Ảnh gốc nằm ngoài repo, ở `../CLB/CLB/`. Script `scripts/build-assets.mjs` sẽ:

- Cắt ảnh chân dung hội viên về khung dọc 3:4, xuất 2 kích thước WebP
- Nén ảnh hoạt động xuống tối đa 1600px + ảnh thu nhỏ 640px
- Ghi lại danh mục album vào `src/data/thu-vien.json`

Ảnh Ban điều hành phần lớn là ảnh toàn thân chụp trên thảm đỏ trước backdrop LED. Thuật toán
cắt tự động hay bám nhầm vào chữ trên backdrop, nên vị trí chủ thể của những ảnh người không
đứng giữa khung được ghi tay trong bảng `TIEU_DIEM` ở đầu script. Khi thêm ảnh mới mà thấy cắt
lệch, thêm một dòng vào bảng đó với toạ độ ngang theo tỉ lệ (0 = mép trái, 1 = mép phải).

---

## Đưa lên Cloudflare Pages

Web hiện đăng theo cách đẩy thẳng thư mục `dist` lên, không qua GitHub. Mỗi lần cập nhật
nội dung, chạy 2 lệnh này từ thư mục `website`:

```bash
npm run build
```

```bash
npx wrangler pages deploy dist --project-name clb-doanh-nhan-khanh-hoa
```

Cách này đơn giản nhất và đủ dùng khi chỉ một người cập nhật. Nhưng muốn bật trang quản trị
`/admin` cho ban thư ký thì bắt buộc phải có kho GitHub, vì Decap CMS lưu nội dung bằng cách
ghi thẳng vào kho. Khi đó chuyển sang cách nối Git:

1. Đẩy mã nguồn lên một kho GitHub (gốc kho chính là thư mục `website/` này).
2. Cloudflare Dashboard → **Workers & Pages** → chọn dự án → **Settings** → **Build** →
   **Connect to Git**.
3. Cấu hình build: preset **Astro**, build command `npm run build`, output `dist`,
   root directory để trống.

Sau đó mỗi lần lưu bài trong `/admin`, Cloudflare tự build lại, không cần chạy lệnh nữa.

Khi có tên miền riêng, sửa `site:` trong `astro.config.mjs`, `base_url` và `site_url` trong
`public/admin/config.yml`, và dòng `Sitemap:` trong `public/robots.txt` thành tên miền thật.

### Đăng ký hội viên

Từ 15/09/2026 câu lạc bộ nhận hồ sơ bằng phiếu Google Biểu mẫu của ban thư ký. Phiếu có mục
tải ảnh chân dung, CCCD, giấy phép kinh doanh nên Google bắt người điền đăng nhập, và phiếu loại
này không nhúng vào trang được. Trang `/dang-ky` giới thiệu điều kiện, những gì cần chuẩn bị rồi
dẫn sang phiếu.

Link phiếu nằm ở `phieuDangKy` trong `src/data/site.json`; ban thư ký tự đổi ở mục "Thông tin
chung của CLB" trong `/cap-nhat` (máy chủ chỉ nhận link bắt đầu bằng `https://`).

Biểu mẫu tự làm trước đây (`functions/api/dang-ky.ts`, lưu vào bảng D1 `dang_ky_hoi_vien`) đã
gỡ vì không ai xem được hồ sơ gửi về. Lúc gỡ bảng có 0 hồ sơ; bảng vẫn còn trong D1, lệnh tạo ở
`schema/dang-ky.sql`, cần thì lấy lại mã cũ trong lịch sử Git.

### Bật trang quản trị `/admin`

**Đã cấu hình xong và đang chạy.** Kho GitHub, OAuth App và hai khoá bí mật đều đã gắn.
Hướng dẫn sử dụng dành cho ban thư ký nằm ở `docs/huong-dan-cho-thu-ky.txt`.

Muốn thêm người được quyền vào `/admin`: mời họ làm collaborator của kho GitHub
(Settings → Collaborators). Không cần cấp thêm gì trên Cloudflare.

Các bước đã làm, ghi lại phòng khi phải dựng lại từ đầu:

1. Tạo kho GitHub và đẩy mã nguồn lên (kho đã `git init` và commit sẵn):
   ```bash
   git remote add origin https://github.com/<tài-khoản>/<tên-kho>.git
   git push -u origin main
   ```
2. Sửa dòng `repo:` trong `public/admin/config.yml` thành `<tài-khoản>/<tên-kho>`.
3. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
   - Homepage URL: `https://clb-doanh-nhan-khanh-hoa.pages.dev`
   - Authorization callback URL: `https://clb-doanh-nhan-khanh-hoa.pages.dev/callback`

   Rồi Cloudflare Pages → **Settings** → **Variables**, thêm `GITHUB_CLIENT_ID` và
   `GITHUB_CLIENT_SECRET` (đánh dấu Secret), và deploy lại.

Ai được cấp quyền ghi vào kho GitHub thì đăng nhập được `/admin`. Muốn thêm người,
mời họ làm collaborator của kho — không cần cấp thêm gì trên Cloudflare.

**Thư ký làm được gì trong `/admin`:** thêm/sửa hội viên (kể cả tải ảnh chân dung và
ảnh doanh nghiệp bằng chuột), viết bài cho mục Tin tức, và sửa thông tin chung của CLB
(địa chỉ, điện thoại, khẩu hiệu, thành tựu). Mỗi lần bấm lưu, Cloudflare tự build lại
và khoảng 1 phút sau là web cập nhật.

---

## Trạng thái triển khai

| | |
| --- | --- |
| Địa chỉ web | https://clb-doanh-nhan-khanh-hoa.pages.dev |
| Cloudflare Pages | ✅ đang chạy |
| Biểu mẫu đăng ký + D1 | ✅ đang chạy |
| Email báo hồ sơ mới | ⏸ tạm gác, chờ CLB có email chính thức |
| Kho GitHub | `ttledinhnguyen-cmd/clb-doanh-nhan-website` |
| Trang cập nhật `/cap-nhat` | ✅ đang chạy — đăng nhập bằng tài khoản (từ 15/09/2026), quản lý tài khoản ở `/tai-khoan` |
| Trang quản trị `/admin` (Decap) | ✅ chạy — chỉ dùng khi cần, vì cần tài khoản GitHub |
| Chatbot | ⏸ chưa chốt công nghệ |
| Chặn Google lập chỉ mục | 🔒 **đang bật** — nhớ tắt khi ra mắt chính thức |

## Còn phải làm

- [ ] Điền thông tin liên hệ chính thức của CLB vào `src/data/site.json`
- [ ] Bổ sung danh sách hội viên đầy đủ (hiện mới có 20 thành viên Ban điều hành)
- [ ] Thay ảnh chân dung ông Kiều Đăng Ninh — ảnh gốc chỉ 429×1890px, là dải cắt hẹp từ ảnh tập thể
- [ ] Xác nhận lại ảnh của ông Đào Ngọc Thanh và ông Ngô Trung Ngọc (hai ảnh gốc trông rất giống nhau)
- [ ] Bổ sung ngành nghề cho 3 doanh nghiệp đang để "Đang cập nhật"
- [ ] Chốt công nghệ cho chatbot — khung giao diện đã dựng sẵn ở `src/components/TroLySlot.astro`
- [ ] Khi ra mắt chính thức: bỏ chặn lập chỉ mục ở `public/robots.txt` và `public/_headers`
