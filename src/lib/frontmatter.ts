/**
 * Đọc và ghi lại phần frontmatter của file hội viên.
 *
 * Frontmatter trong dự án chỉ dùng vài kiểu giá trị đơn giản (chuỗi, số,
 * boolean, null, danh sách chuỗi) nên không cần kéo cả thư viện YAML vào
 * Cloudflare Function. Đổi lại, mọi thay đổi ở đây phải chạy
 * `node scripts/kiem-tra-frontmatter.mjs` để chắc chắn không làm hỏng dữ liệu.
 */

export type BanGhi = Record<string, string | number | boolean | null | string[]>;

export const boNhay = (s: string): string => {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return s;
};

export const nhay = (s: string): string =>
  `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function docFrontmatter(raw: string): { fm: BanGhi; than: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, than: raw };

  const fm: BanGhi = {};
  const dong = m[1].split(/\r?\n/);

  for (let i = 0; i < dong.length; i++) {
    const kv = dong[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const khoa = kv[1];
    const tho = kv[2].trim();

    if (tho === '' || tho === '[]') {
      // Danh sách có thể viết xuống dòng kiểu "  - mục".
      const ds: string[] = [];
      while (i + 1 < dong.length && /^\s*-\s+/.test(dong[i + 1])) {
        ds.push(boNhay(dong[++i].replace(/^\s*-\s+/, '').trim()));
      }
      fm[khoa] = ds;
    } else if (tho === 'null' || tho === '~') fm[khoa] = null;
    else if (tho === 'true') fm[khoa] = true;
    else if (tho === 'false') fm[khoa] = false;
    else if (/^-?\d+(\.\d+)?$/.test(tho)) fm[khoa] = Number(tho);
    else fm[khoa] = boNhay(tho);
  }
  return { fm, than: m[2] ?? '' };
}

export function vietFrontmatter(fm: BanGhi, than: string): string {
  const dong: string[] = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      if (v.length === 0) dong.push(`${k}: []`);
      else {
        dong.push(`${k}:`);
        for (const muc of v) dong.push(`  - ${nhay(String(muc))}`);
      }
    } else if (v === null) dong.push(`${k}: null`);
    else if (typeof v === 'boolean' || typeof v === 'number') dong.push(`${k}: ${v}`);
    else dong.push(`${k}: ${nhay(String(v))}`);
  }
  dong.push('---', '');
  const thanSach = than.replace(/^\r?\n+/, '');
  return dong.join('\n') + (thanSach ? '\n' + thanSach : '');
}
