/**
 * Demo4 - client.js（客户端应用，端口 3000）
 *
 * 职责：
 *   ① /            —— 首页，"用 OAuth 账号登录"按钮（跳转授权服务器）
 *   ② /callback    —— 接收授权码，校验 state，后端换 Token，再调资源 API
 *   ③ /profile     —— 用 access_token 调资源服务器 /api/userinfo
 *
 * 教学要点：
 *   - 发起授权前生成 state 并存入 Cookie，回调时比对 —— 防 CSRF（第 7 章展开）
 *   - code 换 Token 是【服务器对服务器】的 POST，浏览器全程见不到 access_token
 */
const http = require('http');
const crypto = require('crypto');

const PORT = 3000;
const AUTH = 'http://localhost:9000';
const RESOURCE = 'http://localhost:9001';
const CLIENT_ID = 'web-app';
const CLIENT_SECRET = 'web-app-secret';
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

function page(title, body) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px}
pre{background:#222;color:#0f0;padding:12px;border-radius:6px;overflow:auto}
.btn{background:#36c;color:#fff;border:0;padding:10px 20px;border-radius:4px;cursor:pointer;text-decoration:none;display:inline-block}
.tip{color:#888;font-size:14px}</style>
</head><body><h1>${title}</h1>${body}</body></html>`;
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > -1) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

async function postForm(urlStr, params) {
  const res = await fetch(urlStr, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  return { status: res.status, json: await res.json() };
}

// ① 发起授权：生成 state（随机数）存 Cookie，302 到授权服务器
function startLogin(res) {
  const state = crypto.randomBytes(8).toString('hex');
  const target =
    `${AUTH}/authorize?response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=profile&state=${state}`;
  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Path=/`);
  res.statusCode = 302;
  res.setHeader('Location', target);
  res.end();
}

// ② 授权回调：校验 state → 用 code 换 Token → 调资源服务器
async function handleCallback(req, res, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(req.headers.cookie);

  // 防 CSRF：比对回调的 state 与发起时存下的 state
  if (!state || state !== cookies.oauth_state) {
    return res.end(page('安全警告', '<p>❌ state 校验失败！可能遭遇 CSRF 攻击，拒绝处理。</p>'));
  }

  // 服务器对服务器：拿 code + client_secret 换 Token
  const tokenRes = await postForm(`${AUTH}/token`, {
    grant_type: 'authorization_code',
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
  });
  if (tokenRes.status !== 200) {
    return res.end(page('换 Token 失败', `<pre>${JSON.stringify(tokenRes.json, null, 2)}</pre>`));
  }
  const { access_token, refresh_token } = tokenRes.json;

  // 用 access_token 调资源服务器（依然在服务器端进行）
  const apiRes = await fetch(`${RESOURCE}/api/userinfo`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const userinfo = await apiRes.json();

  res.setHeader('Set-Cookie', [
    `access_token=${access_token}; HttpOnly; Path=/`,
    `refresh_token=${refresh_token}; HttpOnly; Path=/`,
    'oauth_state=; Max-Age=0; Path=/',
  ]);
  res.end(
    page(
      '授权成功！',
      `<p>✅ 完整授权码流程走通。</p>
       <h3>资源服务器返回的用户信息</h3>
       <pre>${JSON.stringify(userinfo, null, 2)}</pre>
       <p class="tip">整个过程中浏览器从未见过 access_token —— 它只在 client 后端与 auth-server 之间流动。</p>
       <p><a class="btn" href="/profile">再访问一次 /profile（验证 Cookie 里的 Token）</a></p>`
    )
  );
}

// ③ /profile：用 Cookie 中的 access_token 调资源服务器
async function handleProfile(req, res) {
  const token = parseCookies(req.headers.cookie).access_token;
  if (!token) return res.end(page('Profile', '<p>⛔ 没有 Token，<a href="/">先登录</a></p>'));
  const apiRes = await fetch(`${RESOURCE}/api/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (apiRes.status !== 200) {
    return res.end(page('Profile', `<p>❌ 资源服务器拒绝（${apiRes.status}）</p>`));
  }
  res.end(page('Profile', `<pre>${JSON.stringify(await apiRes.json(), null, 2)}</pre>`));
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    console.log(`[client] ${req.method} ${url.pathname}`);
    if (url.pathname === '/' && url.searchParams.get('action') === 'login') return startLogin(res);
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(
        page(
          'PrintShop 打印店（OAuth2 客户端）',
          `<p>这是一个第三方应用，它没有自己的账号体系，通过 OAuth2 请求你的授权：</p>
           <a class="btn" href="/?action=login">用 OAuth 账号登录</a>
           <p class="tip">点击后你将被重定向到 localhost:9000（授权服务器）进行登录与授权。</p>`
        )
      );
    }
    if (url.pathname === '/callback') return handleCallback(req, res, url).catch((e) => res.end(String(e)));
    if (url.pathname === '/profile') return handleProfile(req, res).catch((e) => res.end(String(e)));
    res.statusCode = 404;
    res.end('Not Found');
  });
}

function start() {
  createServer().listen(PORT, () => console.log(`客户端(client-app): http://localhost:${PORT}`));
}

module.exports = { start };
if (require.main === module) start();
