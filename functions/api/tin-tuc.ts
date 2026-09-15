/**
 * Cloudflare Pages Function — ban thư ký viết bài cho bốn mục hoạt động.
 *
 * Mỗi bài thuộc một mục: Công tác xã hội, Phát triển thành viên, Văn hoá – Thể
 * thao, Sự kiện CLB. Bài hiện ở trang của đúng mục đó và ở trang Tin tức.
 * Chỉ tài khoản quản trị và ban thư ký dùng được.
 *
 *   POST {}                                        → danh sách bài
 *   PUT  { slug }                                  → lấy một bài
 *   PUT  { moi: true, duLieu, anhBia?, anhMoi? }   → tạo bài mới
 *   PUT  { slug, duLieu, anhBia?, anhMoi? }        → lưu
 *   PUT  { slug, xoa: true }                       → xoá bài
 *
 * Ảnh trong bài được tải lên trước qua /api/anh; mỗi lần bấm Lưu là một commit.
 */
import {
  type EnvKho,
  type ThayDoiFile,
  json,
  thieuCauHinh,
  docFile,
  lietKeThuMuc,
  docCaThuMuc,
  ghiMotCommit,
  LoiXungDot,
  lamSlug,
  taoBlob,
  tachAnh,
  chotBoAnh,
} from '../../src/lib/kho-github';
import { boi, ghiNhatKy, ipCua, yeuCauDangNhap } from '../../src/lib/tai-khoan';
import { type BanGhi, docFrontmatter, vietFrontmatter } from '../../src/lib/frontmatter';

const THU_MUC = 'src/content/tin-tuc';

const DANH_MUC = ['cong-tac-xa-hoi', 'phat-trien-thanh-vien', 'van-hoa-the-thao', 'su-kien'];

const GIOI_HAN = { tieuDe: 200, moTa: 500, noiDung: 30000, hinhAnh: 30 };

type YeuCau = {
  slug?: string;
  duLieu?: Record<string, unknown>;
  anhBia?: string;
  anhMoi?: unknown;
  moi?: boolean;
  xoa?: boolean;
};

const cat = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

const laNgayThat = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
};

/**
 * Ngày đăng phải đúng dạng YYYY-MM-DD và là ngày có thật. Ghi sai một ngày kiểu
 * 2026-13-45 là cả website dựng lại thất bại, nên chặn ngay từ đây: sai thì giữ
 * ngày cũ của bài, bài mới thì lấy ngày hôm nay.
 */
const ngayHopLe = (v: unknown, duPhong: unknown = '') => {
  const s = cat(v, 10);
  if (laNgayThat(s)) return s;
  const cu = cat(duPhong, 10);
  return laNgayThat(cu) ? cu : new Date().toISOString().slice(0, 10);
};

async function xuLyAnh(
  env: EnvKho,
  slug: string,
  fm: BanGhi,
  body: YeuCau,
  daDoi: string[],
  thayDoi: ThayDoiFile[],
): Promise<Response | null> {
  if (typeof body.anhBia === 'string') {
    const a = tachAnh(body.anhBia);
    if ('loi' in a) return json({ loi: `Ảnh bìa: ${a.loi}` }, 400);
    const ten = `tin-${slug}-${Date.now()}.${a.duoi}`;
    thayDoi.push({ duongDan: `public/images/tai-len/${ten}`, blob: await taoBlob(env, a.b64) });
    fm.anhBia = `/images/tai-len/${ten}`;
    daDoi.push('anhBia');
  }

  if (body.duLieu && Array.isArray(body.duLieu.hinhAnh)) {
    const kq = chotBoAnh(fm.hinhAnh, body.duLieu.hinhAnh, body.anhMoi, GIOI_HAN.hinhAnh);
    if (JSON.stringify(fm.hinhAnh ?? []) !== JSON.stringify(kq.ds)) {
      fm.hinhAnh = kq.ds;
      daDoi.push('hinhAnh');
    }
    thayDoi.push(...kq.thayDoi);
  }
  return null;
}

const loiMayChu = (e: unknown) => {
  if (e instanceof LoiXungDot) return json({ loi: e.message }, 409);
  console.error('Bài viết lỗi:', e);
  return json({ loi: 'Máy chủ gặp lỗi. Anh/chị thử lại sau ít phút.' }, 500);
};

export const onRequestPost: PagesFunction<EnvKho> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env, 'bien-tap');
  if (phien instanceof Response) return phien;
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);

  try {
    const bai = (await docCaThuMuc(env, THU_MUC)).map(({ ten, noiDung }) => {
      const fm = docFrontmatter(noiDung).fm;
      return {
        slug: ten,
        tieuDe: String(fm.tieuDe ?? ten),
        ngay: String(fm.ngay ?? ''),
        danhMuc: String(fm.danhMuc ?? ''),
        anhBia: String(fm.anhBia ?? ''),
        soAnh: Array.isArray(fm.hinhAnh) ? fm.hinhAnh.length : 0,
      };
    });
    bai.sort((a, b) => b.ngay.localeCompare(a.ngay));
    return json({ danhSach: bai });
  } catch (e) {
    return loiMayChu(e);
  }
};

export const onRequestPut: PagesFunction<EnvKho> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env, 'bien-tap');
  if (phien instanceof Response) return phien;
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);

  const body = (await request.json().catch(() => ({}))) as YeuCau;
  const ip = ipCua(request);

  try {
    // ── Tạo bài mới ───────────────────────────────────────────────────────
    if (body.moi) {
      const tieuDe = cat(body.duLieu?.tieuDe, GIOI_HAN.tieuDe);
      if (!tieuDe) return json({ loi: 'Bài viết phải có tiêu đề.' }, 400);

      let slug = lamSlug(tieuDe);
      if (slug.length < 2) slug = `bai-viet-${Date.now()}`;
      // Trùng tên thì thêm số phía sau cho khỏi ghi đè bài cũ.
      const dangCo = new Set(
        (await lietKeThuMuc(env, THU_MUC)).map((x) => x.name.replace(/\.md$/, '')),
      );
      if (dangCo.has(slug)) {
        let n = 2;
        while (dangCo.has(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }

      const fm: BanGhi = {
        tieuDe,
        moTa: cat(body.duLieu?.moTa, GIOI_HAN.moTa),
        ngay: ngayHopLe(body.duLieu?.ngay),
        danhMuc: DANH_MUC.includes(String(body.duLieu?.danhMuc)) ? String(body.duLieu?.danhMuc) : 'su-kien',
        anhBia: '',
        album: cat(body.duLieu?.album, 100),
        hinhAnh: [],
        noiBat: false,
      };

      const thayDoi: ThayDoiFile[] = [];
      const loiAnh = await xuLyAnh(env, slug, fm, body, [], thayDoi);
      if (loiAnh) return loiAnh;

      const than = cat(body.duLieu?.noiDung, GIOI_HAN.noiDung);
      thayDoi.push({
        duongDan: `${THU_MUC}/${slug}.md`,
        noiDung: vietFrontmatter(fm, than ? than + '\n' : ''),
        shaCu: null,
      });
      await ghiMotCommit(env, thayDoi, `Thêm bài viết "${tieuDe}"${boi(phien)}`);
      await ghiNhatKy(env, phien.tenDangNhap, `tin-tuc/${slug}`, 'tao-moi', Boolean(fm.anhBia), ip);
      return json({ ok: true, slug });
    }

    const slug = String(body.slug ?? '');
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ loi: 'Mã bài viết không hợp lệ.' }, 400);

    const duongDan = `${THU_MUC}/${slug}.md`;
    const file = await docFile(env, duongDan);
    if (!file) return json({ loi: 'Không tìm thấy bài viết.' }, 404);

    // ── Xoá bài ───────────────────────────────────────────────────────────
    if (body.xoa) {
      await ghiMotCommit(env, [{ duongDan, xoa: true }], `Xoá bài viết "${slug}"${boi(phien)}`);
      await ghiNhatKy(env, phien.tenDangNhap, `tin-tuc/${slug}`, 'xoa', false, ip);
      return json({ ok: true, daXoa: true });
    }

    const { fm, than } = docFrontmatter(file.noiDung);

    // ── Chỉ xem ───────────────────────────────────────────────────────────
    if (!body.duLieu) return json({ bai: { slug, ...fm, noiDung: than.trim() } });

    // ── Lưu thay đổi ──────────────────────────────────────────────────────
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
    dat('ngay', ngayHopLe(body.duLieu.ngay, fm.ngay));
    if (DANH_MUC.includes(String(body.duLieu.danhMuc))) dat('danhMuc', String(body.duLieu.danhMuc));
    dat('album', cat(body.duLieu.album, 100));
    if ('noiBat' in body.duLieu) dat('noiBat', Boolean(body.duLieu.noiBat));

    let thanMoi = than;
    const noiDung = cat(body.duLieu.noiDung, GIOI_HAN.noiDung);
    if (than.trim() !== noiDung) {
      thanMoi = noiDung ? noiDung + '\n' : '';
      daDoi.push('noiDung');
    }

    const thayDoi: ThayDoiFile[] = [];
    const loiAnh = await xuLyAnh(env, slug, fm, body, daDoi, thayDoi);
    if (loiAnh) return loiAnh;

    if (daDoi.length === 0) return json({ ok: true, khongDoi: true });

    thayDoi.push({ duongDan, noiDung: vietFrontmatter(fm, thanMoi), shaCu: file.sha });
    await ghiMotCommit(env, thayDoi, `Cập nhật bài viết "${tieuDe}" (${daDoi.join(', ')})${boi(phien)}`);
    await ghiNhatKy(
      env,
      phien.tenDangNhap,
      `tin-tuc/${slug}`,
      daDoi.join(','),
      daDoi.includes('anhBia') || daDoi.includes('hinhAnh'),
      ip,
    );
    return json({ ok: true, daDoi });
  } catch (e) {
    return loiMayChu(e);
  }
};
