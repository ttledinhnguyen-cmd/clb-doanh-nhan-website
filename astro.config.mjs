// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Đổi `site` thành tên miền thật khi CLB mua domain.
export default defineConfig({
  site: 'https://clbdoanhnhankhanhhoa.pages.dev',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
});
