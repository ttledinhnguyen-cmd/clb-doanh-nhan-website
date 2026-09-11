// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Địa chỉ gốc của website. Astro lấy giá trị này để dựng link canonical, thẻ
// og:url, og:image và sitemap — sai một ký tự là Zalo/Facebook không lấy được
// ảnh xem trước. KHI CLB TRỎ TÊN MIỀN RIÊNG VÀO thì đổi dòng dưới thành tên
// miền đó (không có dấu / ở cuối) rồi đẩy lại.
export default defineConfig({
  site: 'https://clb-doanh-nhan-khanh-hoa.pages.dev',
  trailingSlash: 'ignore',
  output: 'static',
  integrations: [
    // Trang /cap-nhat là trang riêng tư của hội viên, không đưa vào sitemap.
    sitemap({ filter: (url) => !url.includes('/cap-nhat') }),
  ],
  vite: { plugins: [tailwindcss()] },
});
