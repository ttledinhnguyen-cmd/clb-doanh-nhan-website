import type { APIRoute } from 'astro';
import thuVien from '../data/thu-vien.json';

/** Danh sách album rút gọn, để trang /cap-nhat gắn album vào bài viết. */
export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify(thuVien.map((a) => ({ slug: a.slug, ten: a.ten, soAnh: a.soAnh }))),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
