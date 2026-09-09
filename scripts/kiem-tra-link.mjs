/**
 * Quét thư mục dist/ tìm link nội bộ hỏng và ảnh thiếu.
 *
 *   npm run build && node scripts/kiem-tra-link.mjs
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DIST = 'dist';

const duyet = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? duyet(p) : [p];
  });

const tonTai = (u) => {
  const sach = decodeURIComponent(u.split('#')[0].split('?')[0]);
  if (!sach.startsWith('/')) return true;
  const p = path.join(DIST, sach);
  return existsSync(p) || existsSync(path.join(p, 'index.html')) || existsSync(p + '.html');
};

const trangHtml = duyet(DIST).filter((f) => f.endsWith('.html'));
const loi = [];

for (const f of trangHtml) {
  const s = readFileSync(f, 'utf8');
  const trang =
    '/' + path.relative(DIST, f).split(path.sep).join('/').replace(/index[.]html$/, '');

  for (const m of s.matchAll(/href="(\/[^"#][^"]*)"/g)) {
    if (!tonTai(m[1])) loi.push(`${trang}  →  link hỏng: ${m[1]}`);
  }
  for (const m of s.matchAll(/(?:src|srcset)="([^"]+)"/g)) {
    for (const phan of m[1].split(',')) {
      const u = phan.trim().split(/\s+/)[0];
      if (u.startsWith('/') && !tonTai(u)) loi.push(`${trang}  →  ảnh thiếu: ${u}`);
    }
  }
}

console.log(`Đã quét ${trangHtml.length} trang HTML.`);
const duyNhat = [...new Set(loi)];
if (duyNhat.length) {
  console.log(`\n${duyNhat.length} vấn đề:\n` + duyNhat.join('\n'));
  process.exit(1);
}
console.log('Không có link hỏng hay ảnh thiếu.');
