/**
 * Cloudflare Pages Function — ban thư ký tự tạo album ảnh cho thư viện.
 *
 * Dữ liệu album nằm trong src/data/thu-vien.json. Album cũ do
 * scripts/build-assets.mjs sinh từ ảnh gốc ngoài kho, chỉ lưu tên ảnh; album tạo
 * ở đây lưu thẳng đường dẫn ảnh trong images/tai-len/ và mang cờ tuWeb.
 *
 *   POST {}                                      → danh sách album
 *   PUT  { slug }                                → một album
 *   PUT  { moi: true, duLieu, danhSach, anhMoi } → tạo album
 *   PUT  { slug, duLieu, danhSach, anhMoi }      → lưu
 *   PUT  { slug, xoa: true }                     → xoá album
 */
import {
  type EnvKho, type ThayDoiFile, json, thieuCauHinh, docFile,
  docCaThuMuc, ghiMotCommit, LoiXungDot, lamSlug, chotBoAnh,
} from '../../src/lib/kho-github';
import { boi, ghiNhatKy, ipCua, yeuCauDangNhap } from '../../src/lib/tai-khoan';
import { docFrontmatter, vietFrontmatter } from '../../src/lib/frontmatter';

const FILE_THU_VIEN = 'src/data/thu-vien.json';
const THU_MUC_TIN = 'src/content/tin-tuc';
const DANH_MUC = ['cong-tac-xa-hoi', 'phat-trien-thanh-vien', 'van-hoa-the-thao', 'su-kien'];
const GIOI_HAN = { ten: 150, anh: 60 };

/**
 * Khai lại kiểu và hai hàm đường dẫn ngay tại đây, KHÔNG import từ src/lib/anh.ts:
 * file đó dùng node:fs nên Worker không nạp được.
 */
type AnhAlbum = { ten: string; ngang?: boolean; lon?: string; nho?: string };
type Album = { slug: string; ten: string; danhMuc: string; soAnh: number; anh: AnhAlbum[]; tuWeb?: boolean };

const duongDanLon = (slug: string, a: AnhAlbum) => a.lon || `/images/hoat-dong/${slug}/${a.ten}.webp`;
const duongDanNho = (slug: string, a: AnhAlbum) => a.nho || `/images/hoat-dong/${slug}/${a.ten}-thumb.webp`;

type YeuCau = {
  slug?: string;
  duLieu?: Record<string, unknown>;
  danhSach?: unknown;
  anhMoi?: unknown;
  moi?: boolean;
  xoa?: boolean;
};

const cat = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

const loiMayChu = (e: unknown) => {
  if (e instanceof LoiXungDot) return json({ loi: e.message }, 409);
  console.error('Album lỗi:', e);
  return json({ loi: 'Máy chủ gặp lỗi. Anh/chị thử lại sau ít phút.' }, 500);
};

/** Đọc thư viện ảnh kèm sha để ghi lại an toàn. */
async function docThuVien(env: EnvKho): Promise<{ ds: Album[]; sha: string }> {
  const file = await docFile(env, FILE_THU_VIEN);
  if (!file) throw new Error('Không đọc được thư viện ảnh.');
  return { ds: JSON.parse(file.noiDung) as Album[], sha: file.sha };
}

/** Ghi lại đúng định dạng mà scripts/build-assets.mjs đang dùng. */
const vietThuVien = (ds: Album[]) => JSON.stringify(ds, null, 2) + '\n';

/**
 * Dựng lại mảng `anh` từ danh sách đường dẫn mà chotBoAnh chốt.
 *
 * chotBoAnh chỉ trả về đường dẫn, mọi trường khác của phần tử đầu vào bị bỏ qua,
 * nên `ngang` phải tra lại: ưu tiên giá trị client vừa đo được từ ảnh mới, không
 * có thì lấy giá trị cũ của album, không có nữa thì mặc định ảnh ngang.
 *
 * `nho` cũng vậy. Ảnh mới tải lên có bản nhỏ đuôi `-nho`, nhưng ảnh của album cũ
 * do scripts/build-assets.mjs sinh lại mang đuôi `-thumb`. Suy ra máy móc theo
 * đuôi `-nho` là làm hỏng hết ảnh nhỏ của album cũ khi ban thư ký bấm Lưu.
 */
function dungMangAnh(
  dsDuongDan: string[],
  ngangMoi: Map<string, boolean>,
  ngangCu: Map<string, boolean>,
  nhoCu: Map<string, string> = new Map(),
): AnhAlbum[] {
  return dsDuongDan.map((p) => ({
    ten: p.replace(/^.*\//, '').replace(/\.(webp|jpg)$/, ''),
    ngang: ngangMoi.get(p) ?? ngangCu.get(p) ?? true,
    lon: p,
    nho: nhoCu.get(p) ?? p.replace(/\.(webp|jpg)$/, '-nho.$1'),
  }));
}

/** Bảng tra `ngang` theo đường dẫn, lấy từ danhSach client gửi lên. */
function bangNgang(danhSach: unknown): Map<string, boolean> {
  const b = new Map<string, boolean>();
  for (const m of Array.isArray(danhSach) ? danhSach : []) {
    if (m && typeof m === 'object') {
      const x = m as Record<string, unknown>;
      if (typeof x.anh === 'string' && typeof x.ngang === 'boolean') b.set(x.anh, x.ngang);
    }
  }
  return b;
}

export const onRequestPost: PagesFunction<EnvKho> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env, 'bien-tap');
  if (phien instanceof Response) return phien;
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);
  try {
    const { ds } = await docThuVien(env);
    return json({
      ok: true,
      danhSach: ds.map((a) => ({
        slug: a.slug,
        ten: a.ten,
        danhMuc: a.danhMuc,
        soAnh: a.anh.length,
        tuWeb: a.tuWeb === true,
        bia: a.anh[0] ? duongDanNho(a.slug, a.anh[0]) : '',
      })),
    });
  } catch (e) { return loiMayChu(e); }
};

export const onRequestPut: PagesFunction<EnvKho> = async ({ request, env }) => {
  const phien = await yeuCauDangNhap(request, env, 'bien-tap');
  if (phien instanceof Response) return phien;
  if (thieuCauHinh(env)) return json({ loi: 'Hệ thống chưa được kích hoạt.' }, 503);
  const ip = ipCua(request);
  try {
    const body = (await request.json().catch(() => ({}))) as YeuCau;
    const { ds, sha } = await docThuVien(env);

    // ── Tạo album mới ────────────────────────────────────────────────────
    if (body.moi) {
      const ten = cat(body.duLieu?.ten, GIOI_HAN.ten);
      if (!ten) return json({ loi: 'Album phải có tên.' }, 400);

      const danhMuc = String(body.duLieu?.danhMuc ?? '');
      if (!DANH_MUC.includes(danhMuc)) return json({ loi: 'Mục hoạt động không hợp lệ.' }, 400);

      let slug = lamSlug(ten);
      if (slug.length < 2) slug = `album-${Date.now()}`;
      const dangCo = new Set(ds.map((a) => a.slug));
      if (dangCo.has(slug)) {
        let n = 2;
        while (dangCo.has(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }

      const kq = chotBoAnh([], body.danhSach, body.anhMoi, GIOI_HAN.anh);
      if (kq.ds.length === 0) {
        return json({ loi: 'Album phải có ít nhất một ảnh. Anh/chị bấm "Thêm ảnh" rồi lưu lại giúp em.' }, 400);
      }

      const anh = dungMangAnh(kq.ds, bangNgang(body.danhSach), new Map());
      ds.push({ slug, ten, danhMuc, soAnh: anh.length, anh, tuWeb: true });

      const thayDoi: ThayDoiFile[] = [...kq.thayDoi, { duongDan: FILE_THU_VIEN, noiDung: vietThuVien(ds), shaCu: sha }];
      await ghiMotCommit(env, thayDoi, `Tạo album "${ten}"${boi(phien)}`);
      await ghiNhatKy(env, phien.tenDangNhap, `album/${slug}`, 'tao', true, ip);
      return json({ ok: true, slug });
    }

    const slug = String(body.slug ?? '');
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) return json({ loi: 'Mã album không hợp lệ.' }, 400);
    const i = ds.findIndex((a) => a.slug === slug);
    if (i < 0) return json({ loi: 'Không tìm thấy album.' }, 404);
    const album = ds[i];

    // ── Xoá album ─────────────────────────────────────────────────────────
    if (body.xoa) {
      if (album.tuWeb !== true) {
        return json({ loi: 'Album này do ban kỹ thuật tạo, không xoá trên web được.' }, 400);
      }

      const thayDoi: ThayDoiFile[] = [];
      for (const a of album.anh) {
        thayDoi.push({ duongDan: 'public' + duongDanLon(slug, a), xoa: true });
        thayDoi.push({ duongDan: 'public' + duongDanNho(slug, a), xoa: true });
      }

      // Gỡ album khỏi những bài viết đang gắn nó, kẻo bài trỏ vào album không còn.
      for (const { ten, noiDung } of await docCaThuMuc(env, THU_MUC_TIN)) {
        const { fm, than } = docFrontmatter(noiDung);
        if (String(fm.album ?? '') !== slug) continue;
        fm.album = '';
        thayDoi.push({ duongDan: `${THU_MUC_TIN}/${ten}.md`, noiDung: vietFrontmatter(fm, than) });
      }

      ds.splice(i, 1);
      thayDoi.push({ duongDan: FILE_THU_VIEN, noiDung: vietThuVien(ds), shaCu: sha });

      await ghiMotCommit(env, thayDoi, `Xoá album "${album.ten}"${boi(phien)}`);
      await ghiNhatKy(env, phien.tenDangNhap, `album/${slug}`, 'xoa', false, ip);
      return json({ ok: true, daXoa: true });
    }

    // ── Chỉ xem ───────────────────────────────────────────────────────────
    if (!body.duLieu) {
      return json({
        ok: true,
        album: {
          slug: album.slug,
          ten: album.ten,
          danhMuc: album.danhMuc,
          tuWeb: album.tuWeb === true,
          anh: album.anh.map((a) => duongDanLon(slug, a)),
          ngang: album.anh.map((a) => a.ngang ?? true),
        },
      });
    }

    // ── Lưu album đã có ──────────────────────────────────────────────────
    const ten = cat(body.duLieu.ten, GIOI_HAN.ten);
    if (!ten) return json({ loi: 'Album phải có tên.' }, 400);
    const danhMuc = String(body.duLieu.danhMuc ?? '');
    if (!DANH_MUC.includes(danhMuc)) return json({ loi: 'Mục hoạt động không hợp lệ.' }, 400);

    const dsCu = album.anh.map((a) => duongDanLon(slug, a));
    const ngangCu = new Map(dsCu.map((p, k) => [p, album.anh[k].ngang ?? true]));
    const nhoCu = new Map(dsCu.map((p, k) => [p, duongDanNho(slug, album.anh[k])]));

    const kq = chotBoAnh(dsCu, body.danhSach, body.anhMoi, GIOI_HAN.anh);
    if (kq.ds.length === 0) {
      return json({ loi: 'Album phải có ít nhất một ảnh. Anh/chị bấm "Thêm ảnh" rồi lưu lại giúp em.' }, 400);
    }

    const anhMoiDs = dungMangAnh(kq.ds, bangNgang(body.danhSach), ngangCu, nhoCu);

    // Phát hiện không có gì đổi, để khỏi tốn một lượt dựng Cloudflare. So theo
    // đường dẫn đã suy ra, vì album cũ chỉ lưu `ten` còn album mới lưu cả `lon`.
    const gonLai = (ds: AnhAlbum[]) =>
      JSON.stringify(ds.map((a) => [duongDanLon(slug, a), duongDanNho(slug, a), a.ngang ?? true]));
    const khongDoi =
      album.ten === ten &&
      album.danhMuc === danhMuc &&
      gonLai(album.anh) === gonLai(anhMoiDs) &&
      kq.thayDoi.length === 0;
    if (khongDoi) return json({ ok: true, khongDoi: true });

    ds[i] = { ...album, ten, danhMuc, soAnh: anhMoiDs.length, anh: anhMoiDs, tuWeb: album.tuWeb === true };

    const thayDoi: ThayDoiFile[] = [...kq.thayDoi, { duongDan: FILE_THU_VIEN, noiDung: vietThuVien(ds), shaCu: sha }];
    await ghiMotCommit(env, thayDoi, `Cập nhật album "${ten}"${boi(phien)}`);
    await ghiNhatKy(env, phien.tenDangNhap, `album/${slug}`, 'sua', kq.thayDoi.length > 0, ip);
    return json({ ok: true, slug });
  } catch (e) { return loiMayChu(e); }
};
