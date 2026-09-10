/**
 * Cloudflare Pages Function — ban thư ký sửa thông tin chung của câu lạc bộ.
 *
 * Ghi vào src/data/site.json. Chỉ mở những trường an toàn để sửa nhầm cũng
 * không làm vỡ trang: các mục cấu trúc như tiêu chí hoạt động, số liệu trang
 * chủ vẫn để nguyên vì chúng ràng buộc với bố cục.
 *
 *   POST { ma }           → lấy thông tin hiện tại
 *   PUT  { ma, duLieu }   → lưu
 */
import {
  type EnvKho,
  json,
  chiThuKy,
  thieuCauHinh,
  docFile,
  ghiFile,
  sangBase64,
  ghiNhatKy,
} from '../../src/lib/kho-github';

const DUONG_DAN = 'src/data/site.json';

/** Trường cho sửa, kèm độ dài tối đa. */
const TRUONG = {
  khauHieu: 200,
  moTa: 600,
  'lienHe.diaChi': 300,
  'lienHe.dienThoai': 60,
  'lienHe.email': 120,
  'lienHe.facebook': 300,
  'lienHe.youtube': 300,
  'lienHe.zalo': 300,
} as const;

type Site = Record<string, any>;

const lay = (o: Site, duong: string) =>
  duong.split('.').reduce<any>((x, k) => (x == null ? x : x[k]), o);

const dat = (o: Site, duong: string, gt: string) => {
  const phan = duong.split('.');
  const cuoi = phan.pop()!;
  const cha = phan.reduce<any>((x, k) => (x[k] ??= {}), o);
  cha[cuoi] = gt;
};

async function docSite(env: EnvKho) {
  const f = await docFile(env, DUONG_DAN);
  if (!f) return null;
  return { site: JSON.parse(f.noiDung) as Site, sha: f.sha };
}

export const onRequestPost: PagesFunction<EnvKho> = async ({ request, env }) => {
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);
  const { loi } = await chiThuKy(env, ((await request.json().catch(() => ({}))) as { ma?: string }).ma);
  if (loi) return loi;

  const kq = await docSite(env);
  if (!kq) return json({ loi: 'Không đọc được thông tin câu lạc bộ.' }, 404);

  const ra: Record<string, string> = {};
  for (const duong of Object.keys(TRUONG)) ra[duong] = String(lay(kq.site, duong) ?? '');
  return json({ thongTin: ra });
};

export const onRequestPut: PagesFunction<EnvKho> = async ({ request, env }) => {
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as {
    ma?: string;
    duLieu?: Record<string, unknown>;
  };
  const { phien, loi } = await chiThuKy(env, body.ma);
  if (loi) return loi;

  const kq = await docSite(env);
  if (!kq) return json({ loi: 'Không đọc được thông tin câu lạc bộ.' }, 404);

  const daDoi: string[] = [];
  for (const [duong, max] of Object.entries(TRUONG)) {
    if (!(duong in (body.duLieu ?? {}))) continue;
    const gt = String(body.duLieu![duong] ?? '').trim().slice(0, max);
    if (duong === 'khauHieu' && !gt) continue; // khẩu hiệu không được để trống
    if (String(lay(kq.site, duong) ?? '') !== gt) {
      dat(kq.site, duong, gt);
      daDoi.push(duong);
    }
  }

  if (daDoi.length === 0) return json({ ok: true, khongDoi: true });

  await ghiFile(
    env,
    DUONG_DAN,
    sangBase64(JSON.stringify(kq.site, null, 2) + '\n'),
    kq.sha,
    `Cập nhật thông tin câu lạc bộ (${daDoi.join(', ')})`,
  );
  await ghiNhatKy(
    env,
    phien!.slug,
    'thong-tin-clb',
    daDoi.join(','),
    false,
    request.headers.get('cf-connecting-ip') ?? '',
  );

  return json({ ok: true, daDoi });
};
