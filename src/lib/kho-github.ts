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

export async function xoaFile(env: EnvKho, duongDan: string, sha: string, loiNhan: string) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURI(duongDan)}`,
    {
      method: 'DELETE',
      headers: { ...ghHeaders(env), 'content-type': 'application/json' },
      body: JSON.stringify({ message: loiNhan, sha, branch: nhanh(env) }),
    },
  );
  if (!res.ok) throw new Error(`GitHub xoá file lỗi ${res.status}: ${await res.text()}`);
}

/** Bỏ dấu tiếng Việt và ký tự lạ để làm tên file / đường dẫn. */
export function lamSlug(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Chỉ cho mã có vai trò ban thư ký đi tiếp. */
export async function chiThuKy(env: EnvKho, ma: unknown) {
  const phien = await kiemTraMa(env, ma);
  if (!phien) return { loi: json({ loi: 'Đường dẫn không đúng hoặc đã hết hiệu lực.' }, 401) };
  if (phien.vai_tro !== 'thu-ky') {
    return { loi: json({ loi: 'Đường dẫn này không có quyền thực hiện thao tác đó.' }, 403) };
  }
  return { phien };
}

// ─── Ghi nhiều file trong một commit ────────────────────────────────────────

const gocApi = (env: EnvKho) => `https://api.github.com/repos/${env.GITHUB_REPO}`;

async function gh<T>(env: EnvKho, duong: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(gocApi(env) + duong, {
    ...init,
    headers: { ...ghHeaders(env), 'content-type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${init.method ?? 'GET'} ${duong} lỗi ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * Tạo blob cho một file nhị phân (ảnh) mà CHƯA commit. Trả về sha để gắn vào
 * commit sau. Blob không được commit thì GitHub tự dọn, không để lại gì.
 */
export async function taoBlob(env: EnvKho, base64: string) {
  const j = await gh<{ sha: string }>(env, '/git/blobs', {
    method: 'POST',
    body: JSON.stringify({ content: base64, encoding: 'base64' }),
  });
  return j.sha;
}

export type ThayDoiFile =
  /** File chữ (markdown, json). `shaCu` có thì kiểm tra không ai sửa chen vào. */
  | { duongDan: string; noiDung: string; shaCu?: string | null }
  /** File nhị phân đã tạo blob sẵn bằng taoBlob. */
  | { duongDan: string; blob: string }
  | { duongDan: string; xoa: true };

/** Lỗi khi file vừa bị người khác sửa trong lúc mình đang sửa. */
export class LoiXungDot extends Error {}

/**
 * Ghi nhiều file trong MỘT commit.
 *
 * Mỗi commit làm Cloudflare dựng lại website một lần, gói miễn phí cho 500 lần
 * mỗi tháng. Ghi từng file bằng Contents API thì một lần lưu hồ sơ kèm 8 ảnh
 * sản phẩm tốn 9 lần dựng; gom lại thì chỉ tốn 1.
 */
export async function ghiMotCommit(env: EnvKho, thayDoi: ThayDoiFile[], loiNhan: string) {
  const nhanhHienTai = nhanh(env);

  for (let lan = 1; lan <= 3; lan++) {
    const ref = await gh<{ object: { sha: string } }>(env, `/git/ref/heads/${nhanhHienTai}`);
    const commitCha = await gh<{ tree: { sha: string } }>(env, `/git/commits/${ref.object.sha}`);

    // Giữ đúng hành vi của Contents API cũ: file đã bị người khác sửa kể từ lúc
    // mình đọc thì dừng lại, không âm thầm ghi đè công sức của họ.
    for (const t of thayDoi) {
      if (!('noiDung' in t) || t.shaCu === undefined) continue;
      const hienTai = await docFile(env, t.duongDan);
      if ((hienTai?.sha ?? null) !== t.shaCu) {
        throw new LoiXungDot('Nội dung này vừa được người khác lưu. Anh/chị tải lại trang rồi sửa lại giúp.');
      }
    }

    const cay = await gh<{ sha: string }>(env, '/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: commitCha.tree.sha,
        tree: thayDoi.map((t) =>
          'xoa' in t
            ? { path: t.duongDan, mode: '100644', type: 'blob', sha: null }
            : 'blob' in t
              ? { path: t.duongDan, mode: '100644', type: 'blob', sha: t.blob }
              : { path: t.duongDan, mode: '100644', type: 'blob', content: t.noiDung },
        ),
      }),
    });

    const commit = await gh<{ sha: string }>(env, '/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message: loiNhan, tree: cay.sha, parents: [ref.object.sha] }),
    });

    const res = await fetch(`${gocApi(env)}/git/refs/heads/${nhanhHienTai}`, {
      method: 'PATCH',
      headers: { ...ghHeaders(env), 'content-type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    if (res.ok) return commit.sha;

    // 422 nghĩa là nhánh vừa có commit khác chen vào giữa chừng (hai người bấm
    // Lưu cùng lúc). Làm lại trên commit mới nhất.
    if (res.status !== 422 || lan === 3) {
      throw new Error(`GitHub cập nhật nhánh lỗi ${res.status}: ${await res.text()}`);
    }
  }
  throw new Error('Không ghi được sau 3 lần thử.');
}

/**
 * Đọc toàn bộ file .md trong một thư mục bằng MỘT lần gọi.
 *
 * Gói miễn phí của Cloudflare chỉ cho mỗi lượt gọi hàm 50 lượt gọi ra ngoài.
 * Đọc từng file một thì tới bài viết thứ 50 là hỏng; GraphQL lấy hết một lần.
 */
export async function docCaThuMuc(env: EnvKho, duongDan: string) {
  const [owner, name] = String(env.GITHUB_REPO).split('/');
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { ...ghHeaders(env), 'content-type': 'application/json' },
      body: JSON.stringify({
        query:
          'query($owner:String!,$name:String!,$expr:String!){repository(owner:$owner,name:$name){object(expression:$expr){... on Tree{entries{name object{... on Blob{text}}}}}}}',
        variables: { owner, name, expr: `${nhanh(env)}:${duongDan}` },
      }),
    });
    const j = (await res.json()) as {
      data?: { repository?: { object?: { entries?: { name: string; object?: { text?: string | null } }[] } } };
      errors?: unknown;
    };
    if (!res.ok || j.errors) throw new Error(`GraphQL ${res.status} ${JSON.stringify(j.errors ?? '')}`);
    return (j.data?.repository?.object?.entries ?? [])
      .filter((e) => e.name.endsWith('.md') && !e.name.startsWith('_') && typeof e.object?.text === 'string')
      .map((e) => ({ ten: e.name.replace(/\.md$/, ''), noiDung: e.object!.text as string }));
  } catch (e) {
    // Dự phòng: đọc từng file, dừng ở 40 file cho khỏi chạm giới hạn.
    console.error('Đọc thư mục bằng GraphQL thất bại, chuyển sang đọc từng file:', e);
    const ds = (await lietKeThuMuc(env, duongDan))
      .filter((x) => x.name.endsWith('.md') && !x.name.startsWith('_'))
      .slice(0, 40);
    const kq = await Promise.all(
      ds.map(async (x) => ({ ten: x.name.replace(/\.md$/, ''), noiDung: (await docFile(env, `${duongDan}/${x.name}`))?.noiDung ?? '' })),
    );
    return kq.filter((x) => x.noiDung);
  }
}

/**
 * Tách phần base64 của ảnh do trình duyệt nén sẵn gửi lên.
 *
 * Nhận WebP, và JPEG cho Safari: Safari trên iPhone, Mac không nén được WebP —
 * xin WebP thì nó lặng lẽ trả PNG nặng gấp nhiều lần — nên trang /cap-nhat
 * chuyển sang JPEG khi gặp trường hợp đó. Kiểm cả mấy byte đầu file chứ không
 * tin nhãn trong data URL. Trả { b64, duoi }, hoặc { loi } để báo thẳng cho
 * người dùng.
 */
export function tachAnh(
  dataUrl: unknown,
  maxByte = 3_000_000,
): { b64: string; duoi: 'webp' | 'jpg' } | { loi: string } {
  if (typeof dataUrl !== 'string') return { loi: 'Ảnh gửi lên không hợp lệ.' };
  const m = dataUrl.match(/^data:image\/(webp|jpeg);base64,/);
  if (!m) return { loi: 'Ảnh gửi lên không hợp lệ.' };
  const b64 = dataUrl.slice(m[0].length).replace(/\s/g, '');
  if (b64.length < 16 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return { loi: 'Ảnh gửi lên không hợp lệ.' };
  if (b64.length * 0.75 > maxByte) return { loi: 'Ảnh quá lớn.' };

  const dauFile = atob(b64.slice(0, 16));
  if (m[1] === 'webp') {
    // WebP luôn mở đầu bằng "RIFF", 4 byte độ dài, rồi "WEBP".
    if (dauFile.slice(0, 4) !== 'RIFF' || dauFile.slice(8, 12) !== 'WEBP') {
      return { loi: 'File gửi lên không phải ảnh.' };
    }
    return { b64, duoi: 'webp' };
  }
  // JPEG luôn mở đầu bằng ba byte FF D8 FF.
  if (dauFile.charCodeAt(0) !== 0xff || dauFile.charCodeAt(1) !== 0xd8 || dauFile.charCodeAt(2) !== 0xff) {
    return { loi: 'File gửi lên không phải ảnh.' };
  }
  return { b64, duoi: 'jpg' };
}

// ─── Bộ ảnh (ảnh sản phẩm của hội viên, ảnh trong bài viết) ─────────────────

/** Tên file do /api/anh đặt: sp-… cho ảnh sản phẩm, bai-… cho ảnh bài viết. */
const MAU_ANH_TAI_LEN = /^\/images\/tai-len\/(sp|bai)-\d{13}-[0-9a-f]{8}\.(webp|jpg)$/;
const MAU_SHA = /^[0-9a-f]{40,64}$/;

/**
 * Chốt danh sách ảnh cuối cùng của một bộ ảnh.
 *
 * `cuoi` là danh sách người dùng muốn giữ, đúng thứ tự; mỗi mục là đường dẫn
 * ảnh, hoặc { anh, chuThich }. Chỉ nhận ảnh đã có trong bộ cũ, hoặc ảnh vừa
 * tải lên ở /api/anh trong lượt này (kèm mã blob). Đường dẫn lạ bị bỏ qua, nên
 * không ai gửi lên được đường dẫn trỏ ra ngoài hay đè lên file khác.
 */
export function chotBoAnh(cu: unknown, cuoi: unknown, moi: unknown, toiDa: number, maxChuThich = 0) {
  const dsCu = new Set(Array.isArray(cu) ? cu.map(String) : []);
  const dsMoi = new Map<string, { blobLon: string; blobNho: string }>();
  for (const m of Array.isArray(moi) ? moi : []) {
    const x = (m ?? {}) as Record<string, unknown>;
    const anh = String(x.anh ?? '');
    if (MAU_ANH_TAI_LEN.test(anh) && MAU_SHA.test(String(x.blobLon)) && MAU_SHA.test(String(x.blobNho))) {
      dsMoi.set(anh, { blobLon: String(x.blobLon), blobNho: String(x.blobNho) });
    }
  }

  const ds: string[] = [];
  const chuThich: string[] = [];
  const thayDoi: ThayDoiFile[] = [];

  for (const muc of Array.isArray(cuoi) ? cuoi : []) {
    if (ds.length >= toiDa) break;
    const laObj = muc !== null && typeof muc === 'object';
    const anh = String(laObj ? (muc as Record<string, unknown>).anh : muc);
    if (ds.includes(anh)) continue;

    if (dsMoi.has(anh)) {
      const b = dsMoi.get(anh)!;
      thayDoi.push(
        { duongDan: `public${anh}`, blob: b.blobLon },
        { duongDan: `public${anh.replace(/\.(webp|jpg)$/, '-nho.$1')}`, blob: b.blobNho },
      );
    } else if (!dsCu.has(anh)) continue;

    ds.push(anh);
    chuThich.push(
      maxChuThich && laObj
        ? String((muc as Record<string, unknown>).chuThich ?? '').trim().slice(0, maxChuThich)
        : '',
    );
  }

  // Không ảnh nào có chú thích thì để danh sách rỗng cho file gọn.
  return { ds, chuThich: chuThich.some(Boolean) ? chuThich : [], thayDoi };
}
