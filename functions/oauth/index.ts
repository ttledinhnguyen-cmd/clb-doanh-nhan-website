/**
 * Bước 1 của đăng nhập GitHub cho trang quản trị /admin.
 *
 * Decap CMS mở /oauth → hàm này chuyển hướng người dùng sang GitHub để cấp quyền.
 * Cần đặt 2 biến môi trường trong Cloudflare Pages → Settings → Variables:
 *   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 */
interface Env {
  GITHUB_CLIENT_ID?: string;
}

export const onRequestGet: PagesFunction<Env> = ({ request, env }) => {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response(
      'Chưa cấu hình GITHUB_CLIENT_ID trong Cloudflare Pages → Settings → Variables.',
      { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  const url = new URL(request.url);
  const gitHub = new URL('https://github.com/login/oauth/authorize');
  gitHub.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  gitHub.searchParams.set('redirect_uri', `${url.origin}/callback`);
  gitHub.searchParams.set('scope', url.searchParams.get('scope') || 'repo,user');
  gitHub.searchParams.set('state', crypto.randomUUID());

  return Response.redirect(gitHub.toString(), 302);
};
