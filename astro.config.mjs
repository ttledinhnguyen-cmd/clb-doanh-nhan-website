// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Địa chỉ gốc của website. Astro lấy giá trị này để dựng link canonical, thẻ
// og:url, og:image và sitemap — sai một ký tự là Zalo/Facebook không lấy được
// ảnh xem trước. Không có dấu / ở cuối.
//
// Tên miền chính thức từ 11/09/2026. Bản cũ clb-doanh-nhan-khanh-hoa.pages.dev
// vẫn chạy song song nhưng chỉ là địa chỉ dự phòng; mọi link chia sẻ ra ngoài
// đều trỏ về kh-sg.com.
export default defineConfig({
  site: 'https://kh-sg.com',
  trailingSlash: 'ignore',
  output: 'static',
  integrations: [
    // Trang /cap-nhat là trang riêng tư của hội viên, không đưa vào sitemap.
    sitemap({ filter: (url) => !url.includes('/cap-nhat') }),
  ],
  vite: { plugins: [tailwindcss()] },
});
