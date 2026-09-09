/**
 * Kiểm tra bộ đọc/ghi frontmatter ở src/lib/frontmatter.ts.
 *
 * Đây là phần rủi ro nhất của tính năng hội viên tự sửa hồ sơ: đọc sai hoặc ghi
 * sai là hỏng dữ liệu thật. Chạy lại script này mỗi khi sửa file đó.
 *
 *   node scripts/kiem-tra-frontmatter.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { docFrontmatter, vietFrontmatter } from '../src/lib/frontmatter.ts';

const thuMuc = 'src/content/hoi-vien';
let loi = 0;
let daKiem = 0;

for (const f of readdirSync(thuMuc).filter((x) => x.endsWith('.md'))) {
  const goc = readFileSync(path.join(thuMuc, f), 'utf8');
  const { fm, than } = docFrontmatter(goc);
  const viet1 = vietFrontmatter(fm, than);
  const lai = docFrontmatter(viet1);
  const viet2 = vietFrontmatter(lai.fm, lai.than);

  const khoaGoc = [...goc.matchAll(/^([A-Za-z0-9_]+):/gm)].map((m) => m[1]);
  const thieu = khoaGoc.filter((k) => !(k in fm));

  const van = [];
  if (thieu.length) van.push(`mất trường: ${thieu.join(', ')}`);
  if (viet1 !== viet2) van.push('ghi hai lần ra kết quả khác nhau');
  if (JSON.stringify(fm) !== JSON.stringify(lai.fm)) van.push('đọc lại ra dữ liệu khác');

  daKiem++;
  if (van.length) {
    loi++;
    console.log(`  x ${f}: ${van.join(' | ')}`);
  }
}

console.log(`Đã kiểm ${daKiem} hồ sơ hội viên.`);
if (loi) {
  console.log(`${loi} hồ sơ có vấn đề.`);
  process.exit(1);
}
console.log('Đọc rồi ghi lại đều khớp, không mất trường nào.\n');

const thuNghiem = [
  ['dấu nháy trong giá trị', '---\nhoTen: "Công ty \\"ABC\\""\n---\n'],
  ['dấu gạch chéo ngược', '---\ndiaChi: "A\\B"\n---\n'],
  ['danh sách rỗng', '---\nsanPham: []\n---\n'],
  ['danh sách có mục', '---\nsanPham:\n  - "Vận tải"\n  - "Kho bãi"\n---\n'],
  ['số và null', '---\nnamThanhLap: 2015\nnamGiaNhap: null\n---\n'],
  ['boolean', '---\nnoiBat: true\n---\n'],
  ['thân bài nhiều dòng', '---\nhoTen: "A"\n---\n\nDòng 1\n\nDòng 2\n'],
  ['giá trị rỗng', '---\nemail: ""\nzalo: ""\n---\n'],
  ['tiếng Việt có dấu', '---\nhoTen: "Nguyễn Thị Ánh Nguyệt"\n---\n'],
];

console.log('Các trường hợp dễ sai:');
for (const [ten, mau] of thuNghiem) {
  const { fm, than } = docFrontmatter(mau);
  const lai = docFrontmatter(vietFrontmatter(fm, than));
  const ok =
    JSON.stringify(fm) === JSON.stringify(lai.fm) && than.trim() === lai.than.trim();
  console.log(`  ${ok ? 'OK ' : 'LOI'} ${ten}`);
  if (!ok) {
    console.log(`      truoc: ${JSON.stringify(fm)} | than=${JSON.stringify(than)}`);
    console.log(`      sau  : ${JSON.stringify(lai.fm)} | than=${JSON.stringify(lai.than)}`);
    process.exitCode = 1;
  }
}
