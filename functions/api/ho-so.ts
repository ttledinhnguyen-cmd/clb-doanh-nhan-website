/**
 * Cloudflare Pages Function — hội viên tự cập nhật hồ sơ của mình.
 *
 * Người dùng KHÔNG cần tài khoản GitHub. Họ mở đường dẫn riêng có mã bí mật,
 * sửa thông tin, bấm lưu; hàm này kiểm tra mã rồi thay mặt họ ghi thẳng vào kho
 * GitHub bằng một khoá bot. Cloudflare thấy commit mới thì tự build lại website.
 *
 * Cần cấu hình trong Cloudflare Pages → Settings:
 *   • D1 binding `DB` (bảng theo schema/ma-cap-nhat.sql)
 *   • Biến bí mật GITHUB_TOKEN — fine-grained PAT, quyền Contents: Read and write
 *   • Biến GITHUB_REPO dạng "tai-khoan/ten-kho"
 *
 *   POST  { ma }                     → lấy hồ sơ để hiện lên form
 *   PUT   { ma, slug, duLieu, anh? } → lưu thay đổi
 */

import { docFrontmatter, vietFrontmatter } from '../../src/lib/frontmatter';

interface Env {
  DB?: D1Database;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
}

/** Những trường hội viên được phép tự sửa. Ngoài danh sách này thì bỏ qua. */
const TRUONG_CHO_SUA = {
  hoTen: 'chuoi',
  xungHo: 'chuoi',
  chucDanh: 'chuoi',
  doanhNghiep: 'chuoi',
  nganhNghe: 'chuoi',
  namThanhLap: 'so',
  quyMo: 'chuoi',
  dienThoai: 'chuoi',
  email: 'chuoi',
  website: 'chuoi',
  diaChi: 'chuoi',
  facebook: 'chuoi',
  zalo: 'chuoi',
  sanPham: 'danhSach',
  khachHang: 'danhSach',
  uuDaiHoiVien: 'vanBan',
  gioiThieu: 'vanBan', // phần thân file markdown
} as const;

/**
 * Chức vụ, cấp bậc và thứ tự hiển thị do câu lạc bộ quyết định, không nằm trong
 * danh sách trên nên hội viên không tự sửa được dù có chỉnh gói dữ liệu gửi lên.
 */

const GIOI_HAN = { chuoi: 300, vanBan: 4000, danhSach: 20, anhByte: 3_000_000 };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const bam = async (s: string) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// ─── Nói chuyện với GitHub ──────────────────────────────────────────────────

const ghHeaders = (env: Env) => ({
  authorization: `Bearer ${env.GITHUB_TOKEN}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'clb-doanh-nhan-khanh-hoa',
  'x-github-api-version': '2022-11-28',
});

async function docFile(env: Env, duongDan: string) {
  const nhanh = env.GITHUB_BRANCH || 'main';
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURI(duongDan)}?ref=${nhanh}`,
    { headers: ghHeaders(env) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub đọc file lỗi ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { content: string; sha: string };
  // atob trả chuỗi byte, cần giải lại UTF-8 cho đúng tiếng Việt.
  const byte = Uint8Array.from(atob(j.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
  return { noiDung: new TextDecoder().decode(byte), sha: j.sha };
}

async function ghiFile(env: Env, duongDan: string, base64: string, sha: string | null, loi: string) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURI(duongDan)}`,
    {
      method: 'PUT',
      headers: { ...ghHeaders(env), 'content-type': 'application/json' },
      body: JSON.stringify({
        message: loi,
        content: base64,
        branch: env.GITHUB_BRANCH || 'main',
        ...(sha ? { sha } : {}),
      }),
    },
  );
  if (!res.ok) throw new Error(`GitHub ghi file lỗi ${res.status}: ${await res.text()}`);
}

const sangBase64 = (s: string) => {
  const byte = new TextEncoder().encode(s);
  let nhiPhan = '';
  for (const b of byte) nhiPhan += String.fromCharCode(b);
  return btoa(nhiPhan);
};

// ─── Kiểm tra mã ────────────────────────────────────────────────────────────

async function kiemTraMa(env: Env, ma: unknown) {
  if (typeof ma !== 'string' || ma.length < 20 || ma.length > 100) return null;
  const hang = await env
    .DB!.prepare('SELECT slug, vai_tro FROM ma_cap_nhat WHERE ma_bam = ?')
    .bind(await bam(ma))
    .first<{ slug: string; vai_tro: string }>();
  return hang ?? null;
}

const thieuCauHinh = (env: Env) => !env.DB || !env.GITHUB_TOKEN || !env.GITHUB_REPO;

// ─── POST: lấy hồ sơ ────────────────────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống cập nhật hồ sơ chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as { ma?: string };
  const phien = await kiemTraMa(env, body.ma);
  if (!phien) return json({ loi: 'Đường dẫn không đúng hoặc đã hết hiệu lực.' }, 401);

  const layHoSo = async (slug: string) => {
    const f = await docFile(env, `src/content/hoi-vien/${slug}.md`);
    if (!f) return null;
    const { fm, than } = docFrontmatter(f.noiDung);
    return { slug, ...fm, gioiThieu: than.trim() };
  };

  if (phien.vai_tro === 'thu-ky') {
    // Thư ký chọn được bất kỳ hội viên nào, nên cần danh sách để hiển thị.
    const ds = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/contents/src/content/hoi-vien?ref=${env.GITHUB_BRANCH || 'main'}`,
      { headers: ghHeaders(env) },
    ).then((r) => (r.ok ? (r.json() as Promise<{ name: string }[]>) : []));

    const slugs = ds
      .filter((x) => x.name.endsWith('.md') && !x.name.startsWith('_'))
      .map((x) => x.name.replace(/\.md$/, ''))
      .sort();

    return json({ vaiTro: 'thu-ky', danhSach: slugs, hoSo: null });
  }

  const hoSo = await layHoSo(phien.slug);
  if (!hoSo) return json({ loi: 'Không tìm thấy hồ sơ.' }, 404);
  return json({ vaiTro: 'hoi-vien', danhSach: [phien.slug], hoSo });
};

// ─── PUT: lưu hồ sơ ─────────────────────────────────────────────────────────

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống cập nhật hồ sơ chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as {
    ma?: string;
    slug?: string;
    duLieu?: Record<string, unknown>;
    anh?: string;
    layHoSo?: boolean;
  };

  const phien = await kiemTraMa(env, body.ma);
  if (!phien) return json({ loi: 'Đường dẫn không đúng hoặc đã hết hiệu lực.' }, 401);

  const slug = phien.vai_tro === 'thu-ky' ? String(body.slug ?? '') : phien.slug;
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ loi: 'Mã hội viên không hợp lệ.' }, 400);

  // Thư ký chỉ cần xem hồ sơ của người mình chọn.
  if (body.layHoSo) {
    const f = await docFile(env, `src/content/hoi-vien/${slug}.md`);
    if (!f) return json({ loi: 'Không tìm thấy hồ sơ.' }, 404);
    const { fm, than } = docFrontmatter(f.noiDung);
    return json({ hoSo: { slug, ...fm, gioiThieu: than.trim() } });
  }

  const duongDan = `src/content/hoi-vien/${slug}.md`;
  const file = await docFile(env, duongDan);
  if (!file) return json({ loi: 'Không tìm thấy hồ sơ.' }, 404);

  const { fm, than } = docFrontmatter(file.noiDung);
  const daDoi: string[] = [];
  let thanMoi = than;

  for (const [khoa, kieu] of Object.entries(TRUONG_CHO_SUA)) {
    if (!(khoa in (body.duLieu ?? {}))) continue;
    const gt = body.duLieu![khoa];

    if (kieu === 'danhSach') {
      const ds = (Array.isArray(gt) ? gt : [])
        .map((x) => String(x).trim().slice(0, GIOI_HAN.chuoi))
        .filter(Boolean)
        .slice(0, GIOI_HAN.danhSach);
      if (JSON.stringify(fm[khoa] ?? []) !== JSON.stringify(ds)) {
        fm[khoa] = ds;
        daDoi.push(khoa);
      }
    } else if (kieu === 'so') {
      const n = gt === '' || gt === null ? null : Number(gt);
      const hopLe = n === null || (Number.isInteger(n) && n > 1800 && n < 2200) ? n : null;
      if (fm[khoa] !== hopLe) {
        fm[khoa] = hopLe;
        daDoi.push(khoa);
      }
    } else {
      const max = kieu === 'vanBan' ? GIOI_HAN.vanBan : GIOI_HAN.chuoi;
      const s = String(gt ?? '').trim().slice(0, max);
      if (khoa === 'gioiThieu') {
        if (than.trim() !== s) {
          thanMoi = s ? s + '\n' : '';
          daDoi.push('gioiThieu');
        }
      } else if (fm[khoa] !== s) {
        fm[khoa] = s;
        daDoi.push(khoa);
      }
    }
  }

  // Ảnh chân dung: nhận dạng data URL, trình duyệt đã nén sẵn thành WebP.
  let coAnh = false;
  if (typeof body.anh === 'string' && body.anh.startsWith('data:image/webp;base64,')) {
    const b64 = body.anh.slice('data:image/webp;base64,'.length).replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return json({ loi: 'Ảnh gửi lên không hợp lệ.' }, 400);
    if (b64.length * 0.75 > GIOI_HAN.anhByte) return json({ loi: 'Ảnh quá lớn.' }, 413);

    const tenAnh = `${slug}-${Date.now()}.webp`;
    const duongDanAnh = `public/images/tai-len/${tenAnh}`;
    await ghiFile(env, duongDanAnh, b64, null, `Ảnh chân dung mới của ${slug}`);
    fm.anh = `/images/tai-len/${tenAnh}`;
    daDoi.push('anh');
    coAnh = true;
  }

  if (daDoi.length === 0) return json({ ok: true, khongDoi: true });

  const noiDungMoi = vietFrontmatter(fm, thanMoi);
  await ghiFile(
    env,
    duongDan,
    sangBase64(noiDungMoi),
    file.sha,
    `Cập nhật hồ sơ ${fm.hoTen || slug} (${daDoi.join(', ')})`,
  );

  // Ghi nhật ký. Lỗi ở đây không được làm hỏng việc đã lưu thành công.
  try {
    const luc = new Date().toISOString();
    await env.DB!.batch([
      env.DB!.prepare(
        'INSERT INTO nhat_ky_sua_ho_so (slug, truong, co_anh, ip, luc) VALUES (?, ?, ?, ?, ?)',
      ).bind(slug, daDoi.join(','), coAnh ? 1 : 0, request.headers.get('cf-connecting-ip') ?? '', luc),
      env.DB!.prepare(
        'UPDATE ma_cap_nhat SET dung_lan_cuoi = ?, so_lan_dung = so_lan_dung + 1 WHERE slug = ?',
      ).bind(luc, phien.slug),
    ]);
  } catch (e) {
    console.error('Ghi nhật ký thất bại:', e);
  }

  return json({ ok: true, daDoi });
};
