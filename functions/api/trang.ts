/**
 * Cloudflare Pages Function — ban thư ký sửa nội dung các trang hoạt động.
 *
 * Áp dụng cho 4 trang: Công tác xã hội, Phát triển thành viên, Văn hoá – Thể
 * thao, Sự kiện câu lạc bộ. Chỉ tài khoản quản trị và ban thư ký dùng được.
 *
 *   POST {}                 → danh sách trang
 *   PUT  { slug }           → lấy nội dung một trang
 *   PUT  { slug, duLieu }   → lưu
 */
import {
  type EnvKho,
  json,
  thieuCauHinh,
  docFile,
  ghiFile,
  lietKeThuMuc,
  sangBase64,
} from '../../src/lib/kho-github';
import { boi, ghiNhatKy, ipCua, yeuCauDangNhap } from '../../src/lib/tai-khoan';
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

export const onRequestPost: PagesFunction<EnvKho> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env, 'bien-tap');
  if (phien instanceof Response) return phien;
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);

  const ds = await lietKeThuMuc(env, THU_MUC);
  const slugs = ds
    .filter((x) => x.name.endsWith('.md') && !x.name.startsWith('_'))
    .map((x) => x.name.replace(/\.md$/, ''))
    .sort();

  return json({ danhSach: slugs });
};

export const onRequestPut: PagesFunction<EnvKho> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env, 'bien-tap');
  if (phien instanceof Response) return phien;
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as {
    slug?: string;
    duLieu?: Record<string, unknown>;
  };

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
    `Cập nhật trang ${fm.tieuDe || slug} (${daDoi.join(', ')})${boi(phien)}`,
  );

  await ghiNhatKy(env, phien.tenDangNhap, `trang/${slug}`, daDoi.join(','), false, ipCua(request));

  return json({ ok: true, daDoi });
};
