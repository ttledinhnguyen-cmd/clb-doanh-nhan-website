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
│  ├─ logo-full.svg      Logo đầy đủ (biểu tượng + chữ)
│  └─ logo-mark.svg      Chỉ biểu tượng cánh yến
├─ functions/            Cloudflare Pages Functions
│  ├─ api/dang-ky.ts     Nhận hồ sơ đăng ký hội viên
│  ├─ oauth/index.ts     Đăng nhập GitHub cho /admin (bước 1)
│  └─ callback/index.ts  Đăng nhập GitHub cho /admin (bước 2)
├─ schema/dang-ky.sql    Lệnh tạo bảng D1 lưu hồ sơ đăng ký
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
Phông chữ: **Be Vietnam Pro**, tự host trong site nên không phụ thuộc Google Fonts.

Thang màu đầy đủ khai báo trong `src/styles/global.css` (`--color-brand-*`, `--color-accent-*`).

---

## Thêm & sửa nội dung

Có ba đường, dành cho ba nhóm người khác nhau.

### Cách 1 — `/cap-nhat` (hội viên và ban thư ký, không cần tài khoản)

Mỗi người nhận một đường dẫn bí mật riêng gửi qua Zalo. Mở link là sửa được hồ sơ,
không cần tài khoản hay mật khẩu. Hội viên chỉ sửa được hồ sơ của mình; mã của ban thư ký
sửa được hồ sơ mọi người.

Máy chủ kiểm tra mã rồi thay mặt họ commit vào kho GitHub bằng một khoá bot, nên người dùng
không cần biết GitHub là gì. Chức vụ trong CLB, cấp bậc và thứ tự hiển thị nằm ngoài danh
sách trường cho sửa, hội viên không tự đổi được dù có chỉnh gói dữ liệu gửi lên.

Cách phát và thu hồi đường dẫn: `docs/buoc-cuoi-bat-tinh-nang-cap-nhat.txt`.

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

### Biểu mẫu đăng ký hội viên

Đã chạy. Database D1 `clb-doanh-nhan` tạo ngày 09/09/2026 tại khu vực APAC, khai báo sẵn
trong `wrangler.toml`, bảng theo `schema/dang-ky.sql`. Đã kiểm thử thật: gửi hồ sơ lưu được,
thiếu trường thì báo lỗi, bot điền vào ô bẫy thì bị bỏ qua âm thầm.

#### Email báo hồ sơ mới

Mỗi khi có hồ sơ, hệ thống gửi một email tóm tắt cho ban thư ký, có nút Trả lời trỏ thẳng
tới email người đăng ký. Cần 2 biến môi trường:

```bash
npx wrangler pages secret put RESEND_API_KEY --project-name clb-doanh-nhan-khanh-hoa
npx wrangler pages secret put EMAIL_THU_KY --project-name clb-doanh-nhan-khanh-hoa
```

API key lấy ở [resend.com](https://resend.com) (miễn phí 3.000 email/tháng, 100 email/ngày).
Đặt xong phải deploy lại thì mới có hiệu lực.

**Lưu ý quan trọng về giới hạn của Resend khi chưa có tên miền riêng:** địa chỉ gửi đang dùng
là `onboarding@resend.dev` — địa chỉ dùng thử của Resend, chỉ gửi được **tới đúng email đã
dùng để đăng ký tài khoản Resend**. Nghĩa là phải đăng ký Resend bằng chính hòm thư mà ban thư
ký muốn nhận thông báo. Khi CLB có tên miền riêng, xác minh tên miền đó trên Resend rồi sửa
dòng `from:` trong `functions/api/dang-ky.ts` thành `no-reply@<tên-miền-clb>` là gửi được tới
bất kỳ địa chỉ nào.

Không đặt 2 biến này thì hồ sơ vẫn lưu bình thường, chỉ là không ai được báo.

Xem hồ sơ đã nhận:

```bash
npx wrangler d1 execute clb-doanh-nhan --remote -y --command "SELECT id, tao_luc, ho_ten, dien_thoai, doanh_nghiep, trang_thai FROM dang_ky_hoi_vien ORDER BY id DESC LIMIT 20"
```

Đánh dấu hồ sơ đã xử lý (`moi` → `dang-xet` → `da-ket-nap` hoặc `tu-choi`):

```bash
npx wrangler d1 execute clb-doanh-nhan --remote -y --command "UPDATE dang_ky_hoi_vien SET trang_thai='da-ket-nap' WHERE id=1"
```

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
| Hội viên tự cập nhật `/cap-nhat` | ✅ đang chạy — hội viên sửa hồ sơ, thư ký sửa thêm nội dung 4 trang hoạt động |
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
