/**
 * Bước 2 của đăng nhập GitHub cho trang quản trị /admin.
 *
 * GitHub gọi lại đây kèm `code`; hàm đổi code lấy access token rồi gửi token về
 * cửa sổ Decap CMS đang chờ qua postMessage, theo đúng giao thức của Decap.
 */
interface Env {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

const trangKetQua = (trangThai: 'success' | 'error', noiDung: unknown) => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Đang đăng nhập…</title></head>
<body style="font:15px system-ui;padding:2rem;color:#00558f">
<p>Đang hoàn tất đăng nhập, cửa sổ này sẽ tự đóng…</p>
<script>
  (function () {
    var payload = 'authorization:github:${trangThai}:' + ${JSON.stringify(JSON.stringify(noiDung))};
    function gui(e) {
      if (!window.opener) return;
      window.opener.postMessage(payload, e && e.origin ? e.origin : '*');
    }
    window.addEventListener('message', gui, false);
    if (window.opener) window.opener.postMessage('authorizing:github', '*');
  })();
</script>
</body></html>`;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const html = (body: string, status = 200) =>
    new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return html(trangKetQua('error', { message: 'Chưa cấu hình GitHub OAuth.' }), 500);
  }

  const code = new URL(request.url).searchParams.get('code');
  if (!code) return html(trangKetQua('error', { message: 'Thiếu mã xác thực.' }), 400);

  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const kq = (await res.json()) as { access_token?: string; error_description?: string };

    if (!kq.access_token) {
      return html(trangKetQua('error', { message: kq.error_description ?? 'Không lấy được token.' }), 401);
    }
    return html(trangKetQua('success', { token: kq.access_token, provider: 'github' }));
  } catch (e) {
    console.error('OAuth callback lỗi:', e);
    return html(trangKetQua('error', { message: 'Lỗi kết nối tới GitHub.' }), 502);
  }
};
