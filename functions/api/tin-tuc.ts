/**
 * Cloudflare Pages Function — ban thư ký viết và sửa bài Tin tức.
 *
 * Chỉ mã có vai trò "thu-ky" dùng được.
 *
 *   POST { ma }                            → danh sách bài
 *   PUT  { ma, slug }                      → lấy một bài
 *   PUT  { ma, slug, duLieu, anhBia?, moi } → lưu (moi = tạo bài mới)
 *   PUT  { ma, slug, xoa: true }           → xoá bài
 */
import {
  type EnvKho,
  json,
  chiThuKy,
  thieuCauHinh,
  docFile,
  ghiFile,
  xoaFile,
  lietKeThuMuc,
  sangBase64,
  ghiNhatKy,
  lamSlug,
} from '../../src/lib/kho-github';
import { docFrontmatter, vietFrontmatter } from '../../src/lib/frontmatter';

const THU_MUC = 'src/content/tin-tuc';

const DANH_MUC = [
  'cong-tac-xa-hoi',
  'phat-trien-thanh-vien',
  'van-hoa-the-thao',
  'su-kien',
];

const GIOI_HAN = { tieuDe: 200, moTa: 500, noiDung: 30000, anhByte: 3_000_000 };

const cat = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export const onRequestPost: PagesFunction<EnvKho> = async ({ request, env }) => {
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);
  const { loi } = await chiThuKy(env, ((await request.json().catch(() => ({}))) as { ma?: string }).ma);
  if (loi) return loi;

  const ds = await lietKeThuMuc(env, THU_MUC);
  const slugs = ds
    .filter((x) => x.name.endsWith('.md') && !x.name.startsWith('_'))
    .map((x) => x.name.replace(/\.md$/, ''));

  // Đọc tiêu đề và ngày của từng bài để danh sách hiện cho dễ nhìn.
  const bai = await Promise.all(
    slugs.map(async (slug) => {
      const f = await docFile(env, `${THU_MUC}/${slug}.md`);
      const fm = f ? docFrontmatter(f.noiDung).fm : {};
      return {
        slug,
        tieuDe: String(fm.tieuDe ?? slug),
        ngay: String(fm.ngay ?? ''),
        danhMuc: String(fm.danhMuc ?? ''),
      };
    }),
  );
  bai.sort((a, b) => b.ngay.localeCompare(a.ngay));

  return json({ danhSach: bai });
};

export const onRequestPut: PagesFunction<EnvKho> = async ({ request, env }) => {
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as {
    ma?: string;
    slug?: string;
    duLieu?: Record<string, unknown>;
    anhBia?: string;
    moi?: boolean;
    xoa?: boolean;
  };

  const { phien, loi } = await chiThuKy(env, body.ma);
  if (loi) return loi;

  const ip = request.headers.get('cf-connecting-ip') ?? '';

  // ── Tạo bài mới ───────────────────────────────────────────────────────────
  if (body.moi) {
    const tieuDe = cat(body.duLieu?.tieuDe, GIOI_HAN.tieuDe);
    if (!tieuDe) return json({ loi: 'Bài viết phải có tiêu đề.' }, 400);

    let slug = lamSlug(tieuDe) || 'bai-viet';
    // Trùng tên thì thêm số phía sau cho khỏi ghi đè bài cũ.
    const dangCo = new Set(
      (await lietKeThuMuc(env, THU_MUC)).map((x) => x.name.replace(/\.md$/, '')),
    );
    if (dangCo.has(slug)) {
      let n = 2;
      while (dangCo.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }

    const fm: Record<string, string | boolean> = {
      tieuDe,
      moTa: cat(body.duLieu?.moTa, GIOI_HAN.moTa),
      ngay: cat(body.duLieu?.ngay, 10) || new Date().toISOString().slice(0, 10),
      danhMuc: DANH_MUC.includes(String(body.duLieu?.danhMuc)) ? String(body.duLieu?.danhMuc) : 'su-kien',
      anhBia: '',
      album: cat(body.duLieu?.album, 100),
      noiBat: false,
    };

    if (typeof body.anhBia === 'string' && body.anhBia.startsWith('data:image/webp;base64,')) {
      const b64 = body.anhBia.slice('data:image/webp;base64,'.length).replace(/\s/g, '');
      if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return json({ loi: 'Ảnh bìa không hợp lệ.' }, 400);
      if (b64.length * 0.75 > GIOI_HAN.anhByte) return json({ loi: 'Ảnh bìa quá lớn.' }, 413);
      const ten = `tin-${slug}-${Date.now()}.webp`;
      await ghiFile(env, `public/images/tai-len/${ten}`, b64, null, `Ảnh bìa bài "${tieuDe}"`);
      fm.anhBia = `/images/tai-len/${ten}`;
    }

    const than = cat(body.duLieu?.noiDung, GIOI_HAN.noiDung);
    await ghiFile(
      env,
      `${THU_MUC}/${slug}.md`,
      sangBase64(vietFrontmatter(fm, than ? than + '\n' : '')),
      null,
      `Thêm bài viết "${tieuDe}"`,
    );
    await ghiNhatKy(env, phien!.slug, `tin-tuc/${slug}`, 'tao-moi', Boolean(fm.anhBia), ip);
    return json({ ok: true, slug });
  }

  const slug = String(body.slug ?? '');
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ loi: 'Mã bài viết không hợp lệ.' }, 400);

  const duongDan = `${THU_MUC}/${slug}.md`;
  const file = await docFile(env, duongDan);
  if (!file) return json({ loi: 'Không tìm thấy bài viết.' }, 404);

  // ── Xoá bài ───────────────────────────────────────────────────────────────
  if (body.xoa) {
    await xoaFile(env, duongDan, file.sha, `Xoá bài viết "${slug}"`);
    await ghiNhatKy(env, phien!.slug, `tin-tuc/${slug}`, 'xoa', false, ip);
    return json({ ok: true, daXoa: true });
  }

  const { fm, than } = docFrontmatter(file.noiDung);

  // ── Chỉ xem ───────────────────────────────────────────────────────────────
  if (!body.duLieu) return json({ bai: { slug, ...fm, noiDung: than.trim() } });

  // ── Lưu thay đổi ──────────────────────────────────────────────────────────
  const daDoi: string[] = [];
  const dat = (khoa: string, gt: string | boolean) => {
    if (fm[khoa] !== gt) {
      fm[khoa] = gt;
      daDoi.push(khoa);
    }
  };

  const tieuDe = cat(body.duLieu.tieuDe, GIOI_HAN.tieuDe);
  if (!tieuDe) return json({ loi: 'Bài viết phải có tiêu đề.' }, 400);
  dat('tieuDe', tieuDe);
  dat('moTa', cat(body.duLieu.moTa, GIOI_HAN.moTa));
  dat('ngay', cat(body.duLieu.ngay, 10));
  if (DANH_MUC.includes(String(body.duLieu.danhMuc))) dat('danhMuc', String(body.duLieu.danhMuc));
  dat('album', cat(body.duLieu.album, 100));
  dat('noiBat', Boolean(body.duLieu.noiBat));

  let thanMoi = than;
  const noiDung = cat(body.duLieu.noiDung, GIOI_HAN.noiDung);
  if (than.trim() !== noiDung) {
    thanMoi = noiDung ? noiDung + '\n' : '';
    daDoi.push('noiDung');
  }

  let coAnh = false;
  if (typeof body.anhBia === 'string' && body.anhBia.startsWith('data:image/webp;base64,')) {
    const b64 = body.anhBia.slice('data:image/webp;base64,'.length).replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return json({ loi: 'Ảnh bìa không hợp lệ.' }, 400);
    if (b64.length * 0.75 > GIOI_HAN.anhByte) return json({ loi: 'Ảnh bìa quá lớn.' }, 413);
    const ten = `tin-${slug}-${Date.now()}.webp`;
    await ghiFile(env, `public/images/tai-len/${ten}`, b64, null, `Ảnh bìa mới bài "${tieuDe}"`);
    fm.anhBia = `/images/tai-len/${ten}`;
    daDoi.push('anhBia');
    coAnh = true;
  }

  if (daDoi.length === 0) return json({ ok: true, khongDoi: true });

  await ghiFile(
    env,
    duongDan,
    sangBase64(vietFrontmatter(fm, thanMoi)),
    file.sha,
    `Cập nhật bài viết "${tieuDe}" (${daDoi.join(', ')})`,
  );
  await ghiNhatKy(env, phien!.slug, `tin-tuc/${slug}`, daDoi.join(','), coAnh, ip);

  return json({ ok: true, daDoi });
};
