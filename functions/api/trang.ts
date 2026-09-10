/**
 * Cloudflare Pages Function — ban thư ký sửa nội dung các trang hoạt động.
 *
 * Áp dụng cho 4 trang: Công tác xã hội, Phát triển thành viên, Văn hoá – Thể
 * thao, Sự kiện câu lạc bộ. Chỉ mã có vai trò "thu-ky" mới dùng được.
 *
 *   POST { ma }                 → danh sách trang
 *   PUT  { ma, slug }           → lấy nội dung một trang
 *   PUT  { ma, slug, duLieu }   → lưu
 */
import {
  type EnvKho,
  json,
  kiemTraMa,
  thieuCauHinh,
  docFile,
  ghiFile,
  lietKeThuMuc,
  sangBase64,
  ghiNhatKy,
} from '../../src/lib/kho-github';
import { docFrontmatter, vietFrontmatter } from '../../src/lib/frontmatter';

const THU_MUC = 'src/content/trang';

/** Trường ban thư ký được sửa. Ngoài danh sách này thì bỏ qua. */
const TRUONG_CHO_SUA = {
  tieuDe: 'chuoi',
  nhan: 'chuoi',
  moTa: 'vanBan',
  noiDung: 'vanBanDai', // phần thân markdown
} as const;

const GIOI_HAN = { chuoi: 200, vanBan: 600, vanBanDai: 20000 };

async function chiThuKy(env: EnvKho, ma: unknown) {
  const phien = await kiemTraMa(env, ma);
  if (!phien) return { loi: json({ loi: 'Đường dẫn không đúng hoặc đã hết hiệu lực.' }, 401) };
  if (phien.vai_tro !== 'thu-ky') {
    return { loi: json({ loi: 'Đường dẫn này không có quyền sửa nội dung trang.' }, 403) };
  }
  return { phien };
}

export const onRequestPost: PagesFunction<EnvKho> = async ({ request, env }) => {
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as { ma?: string };
  const { loi } = await chiThuKy(env, body.ma);
  if (loi) return loi;

  const ds = await lietKeThuMuc(env, THU_MUC);
  const slugs = ds
    .filter((x) => x.name.endsWith('.md') && !x.name.startsWith('_'))
    .map((x) => x.name.replace(/\.md$/, ''))
    .sort();

  return json({ danhSach: slugs });
};

export const onRequestPut: PagesFunction<EnvKho> = async ({ request, env }) => {
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as {
    ma?: string;
    slug?: string;
    duLieu?: Record<string, unknown>;
  };

  const { phien, loi } = await chiThuKy(env, body.ma);
  if (loi) return loi;

  const slug = String(body.slug ?? '');
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ loi: 'Mã trang không hợp lệ.' }, 400);

  const duongDan = `${THU_MUC}/${slug}.md`;
  const file = await docFile(env, duongDan);
  if (!file) return json({ loi: 'Không tìm thấy trang.' }, 404);

  const { fm, than } = docFrontmatter(file.noiDung);

  // Không có duLieu nghĩa là chỉ muốn xem nội dung để đổ lên form.
  if (!body.duLieu) {
    return json({ noiDung: { slug, ...fm, noiDung: than.trim() } });
  }

  const daDoi: string[] = [];
  let thanMoi = than;

  for (const [khoa, kieu] of Object.entries(TRUONG_CHO_SUA)) {
    if (!(khoa in body.duLieu)) continue;
    const max = GIOI_HAN[kieu as keyof typeof GIOI_HAN];
    const gt = String(body.duLieu[khoa] ?? '').trim().slice(0, max);

    if (khoa === 'noiDung') {
      if (than.trim() !== gt) {
        thanMoi = gt ? gt + '\n' : '';
        daDoi.push('noiDung');
      }
    } else if (fm[khoa] !== gt) {
      if (khoa === 'tieuDe' && !gt) continue; // tiêu đề không được để trống
      fm[khoa] = gt;
      daDoi.push(khoa);
    }
  }

  if (daDoi.length === 0) return json({ ok: true, khongDoi: true });

  await ghiFile(
    env,
    duongDan,
    sangBase64(vietFrontmatter(fm, thanMoi)),
    file.sha,
    `Cập nhật trang ${fm.tieuDe || slug} (${daDoi.join(', ')})`,
  );

  await ghiNhatKy(
    env,
    phien!.slug,
    `trang/${slug}`,
    daDoi.join(','),
    false,
    request.headers.get('cf-connecting-ip') ?? '',
  );

  return json({ ok: true, daDoi });
};
