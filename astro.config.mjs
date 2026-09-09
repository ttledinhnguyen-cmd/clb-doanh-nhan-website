// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Đổi `site` thành tên miền thật khi CLB mua domain.
export default defineConfig({
  site: 'https://clbdoanhnhankhanhhoa.pages.dev',
  trailingSlash: 'ignore',
  output: 'static',
  integrations: [
    // Trang /cap-nhat là trang riêng tư của hội viên, không đưa vào sitemap.
    sitemap({ filter: (url) => !url.includes('/cap-nhat') }),
  ],
  vite: { plugins: [tailwindcss()] },
});
