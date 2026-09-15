import type { APIRoute } from 'astro';
import site from '../data/site.json';

/**
 * Khai báo cho điện thoại Android: khi "Thêm vào màn hình chính", biểu tượng là
 * logo gốc của CLB (icon-192.png, icon-512.png do scripts/tao-logo.mjs sinh ra).
 * `display: browser` giữ nguyên cách mở như một trang web bình thường.
 */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: site.ten,
      short_name: 'CLB DN KH-SG',
      start_url: '/',
      display: 'browser',
      background_color: '#ffffff',
      theme_color: '#00558f',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
