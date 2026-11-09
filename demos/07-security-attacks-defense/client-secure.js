/**
 * Demo7 - client-secure.js（安全版客户端，端口 3001）
 * 防线：state 校验（防登录 CSRF）+ PKCE S256（防授权码截获）。
 */
const http = require('http');
const crypto = require('crypto');

const PORT = 3001;
const AUTH = 'http://localhost:9000';
const CLIENT_ID = 'web-app';
const CLIENT_SECRET = 'web-app-secret';
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const pending = new Map(); // state -> verifier 映射

function page(title, body) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:560px;margin:40px auto;padding:0 16px}
.btn{background:#080;color:#fff;border:0;padding:10px 20px;border-radius:4px;cursor:pointer;text-decoration:none;display:inline-block}
.ok{color:#080}.err{color:#c00}.tip{color:#888;font-size:14px}</style>
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

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    console.log(`[secure] ${req.method} ${url.pathname} ${url.search}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    // 发起授权：生成 state（防CSRF）+ code_verifier（PKCE）
    if (url.pathname === '/start') {
      const state = crypto.randomBytes(8).toString('hex');
      const verifier = crypto.randomBytes(32).toString('base64url'); // 43字符随机串
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // S256
      pending.set(state, { verifier });
      res.setHeader('Set-Cookie', `secure_state=${state}; HttpOnly; Path=/`);
      console.log(`[secure] 发起授权 state=${state.slice(0, 8)}... challenge=${challenge.slice(0, 16)}...`);
      res.statusCode = 302;
      res.setHeader('Location',
        `${AUTH}/authorize?response_type=code&client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=profile` +
        `&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`);
      return res.end();
    }

    // 回调：先校验 state，再带 code_verifier 换 Token
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!state || state !== parseCookies(req.headers.cookie).secure_state) {
        console.log('[secure] state 校验失败！疑似登录 CSRF 攻击');
        return res.end(page('安全拦截', '<p class="err">❌ state 校验失败！检测到登录 CSRF 攻击，已拒绝。</p>'));
      }
      const { verifier } = pending.get(state) || {};
      pending.delete(state);
      const r = await fetch(`${AUTH}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code,
          client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        }).toString(),
      });
      const result = await r.json();
      if (r.status !== 200) {
        return res.end(page('失败', `<p class="err">❌ 换 Token 失败：${JSON.stringify(result)}</p>`));
      }
      return res.end(page('安全版客户端',
        `<p class="ok">✅ 登录成功：${result.user}（state 与 PKCE 双重防线全部通过）</p>`
      ));
    }

    res.end(page('安全版客户端（3001）',
      `<a class="btn" href="/start">正常登录入口</a>
       <p class="tip">发起时带 code_challenge(S256)，换 Token 时带 code_verifier。</p>`));
  });
}

function start() {
  createServer().listen(PORT, () => console.log(`安全版客户端: http://localhost:${PORT}`));
}

module.exports = { start };
if (require.main === module) start();
