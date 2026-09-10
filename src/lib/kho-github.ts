/**
 * Phần dùng chung cho các Cloudflare Function ghi nội dung vào kho GitHub.
 *
 * Người dùng cuối (hội viên, ban thư ký) không có tài khoản GitHub. Họ mở đường
 * dẫn riêng có mã bí mật; máy chủ kiểm tra mã rồi thay mặt họ commit bằng một
 * khoá bot mà chỉ máy chủ giữ.
 */

export interface EnvKho {
  DB?: D1Database;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const bam = async (s: string) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const thieuCauHinh = (env: EnvKho) => !env.DB || !env.GITHUB_TOKEN || !env.GITHUB_REPO;

/** Đổi mã bí mật lấy phiên làm việc. Trả null nếu mã sai. */
export async function kiemTraMa(env: EnvKho, ma: unknown) {
  if (typeof ma !== 'string' || ma.length < 20 || ma.length > 100) return null;
  const hang = await env
    .DB!.prepare('SELECT slug, vai_tro FROM ma_cap_nhat WHERE ma_bam = ?')
    .bind(await bam(ma))
    .first<{ slug: string; vai_tro: string }>();
  return hang ?? null;
}

const ghHeaders = (env: EnvKho) => ({
  authorization: `Bearer ${env.GITHUB_TOKEN}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'clb-doanh-nhan-khanh-hoa',
  'x-github-api-version': '2022-11-28',
});

const nhanh = (env: EnvKho) => env.GITHUB_BRANCH || 'main';

export async function docFile(env: EnvKho, duongDan: string) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURI(duongDan)}?ref=${nhanh(env)}`,
    { headers: ghHeaders(env) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub đọc file lỗi ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { content: string; sha: string };
  // atob trả chuỗi byte, phải giải lại UTF-8 cho đúng tiếng Việt.
  const byte = Uint8Array.from(atob(j.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
  return { noiDung: new TextDecoder().decode(byte), sha: j.sha };
}

export async function ghiFile(
  env: EnvKho,
  duongDan: string,
  base64: string,
  sha: string | null,
  loiNhan: string,
) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURI(duongDan)}`,
    {
      method: 'PUT',
      headers: { ...ghHeaders(env), 'content-type': 'application/json' },
      body: JSON.stringify({
        message: loiNhan,
        content: base64,
        branch: nhanh(env),
        ...(sha ? { sha } : {}),
      }),
    },
  );
  if (!res.ok) throw new Error(`GitHub ghi file lỗi ${res.status}: ${await res.text()}`);
}

export async function lietKeThuMuc(env: EnvKho, duongDan: string) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURI(duongDan)}?ref=${nhanh(env)}`,
    { headers: ghHeaders(env) },
  );
  if (!res.ok) return [] as { name: string }[];
  return (await res.json()) as { name: string }[];
}

export const sangBase64 = (s: string) => {
  const byte = new TextEncoder().encode(s);
  let nhiPhan = '';
  for (const b of byte) nhiPhan += String.fromCharCode(b);
  return btoa(nhiPhan);
};

/** Ghi nhật ký để ban thư ký biết ai sửa gì. Lỗi ở đây không làm hỏng việc đã lưu. */
export async function ghiNhatKy(
  env: EnvKho,
  slugPhien: string,
  slugDoiTuong: string,
  truong: string,
  coAnh: boolean,
  ip: string,
) {
  try {
    const luc = new Date().toISOString();
    await env.DB!.batch([
      env.DB!.prepare(
        'INSERT INTO nhat_ky_sua_ho_so (slug, truong, co_anh, ip, luc) VALUES (?, ?, ?, ?, ?)',
      ).bind(slugDoiTuong, truong, coAnh ? 1 : 0, ip, luc),
      env.DB!.prepare(
        'UPDATE ma_cap_nhat SET dung_lan_cuoi = ?, so_lan_dung = so_lan_dung + 1 WHERE slug = ?',
      ).bind(luc, slugPhien),
    ]);
  } catch (e) {
    console.error('Ghi nhật ký thất bại:', e);
  }
}
