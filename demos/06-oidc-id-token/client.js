/**
 * Demo6 - client.js（OIDC 客户端，端口 3000）
 * 与 Demo4 的区别：/token 响应里多了 id_token，客户端自己本地验签。
 * 页面展示：ID Token 原文、三段解码、验签结果、nonce 比对。
 */
const http = require('http');
const crypto = require('crypto');
const { verify, b64urlDecode } = require('./jwt');

const PORT = 3000;
const AUTH = 'http://localhost:9000';
const CLIENT_ID = 'web-app';
const CLIENT_SECRET = 'web-app-secret';
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const pendingNonce = new Map(); // state -> nonce（等回跳比对）

function page(title, body) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:760px;margin:40px auto;padding:0 16px}
pre{background:#222;color:#0f0;padding:12px;border-radius:6px;overflow:auto}
.btn{background:#36c;color:#fff;border:0;padding:10px 20px;border-radius:4px;cursor:pointer;text-decoration:none;display:inline-block}
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

function decodePart(part) {
  try { return b64urlDecode(part).toString('utf8'); } catch { return '(解码失败)'; }
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    console.log(`[client] ${req.method} ${url.pathname} ${url.search}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    // ① 发起 OIDC 登录：state 防 CSRF + nonce 防重放
    if (url.pathname === '/start') {
      const state = crypto.randomBytes(8).toString('hex');
      const nonce = crypto.randomBytes(8).toString('hex');
      pendingNonce.set(state, nonce);
      const target =
        `${AUTH}/authorize?response_type=code&client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=openid profile` +
        `&state=${state}&nonce=${nonce}`;
      res.setHeader('Set-Cookie', `oidc_state=${state}; HttpOnly; Path=/`);
      res.statusCode = 302;
      res.setHeader('Location', target);
      return res.end();
    }

    // ② 回调：换 Token → 本地验签 ID Token → 比对 nonce
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (state !== parseCookies(req.headers.cookie).oidc_state)
        return res.end(page('安全警告', '<p class="err">❌ state 校验失败，拒绝处理</p>'));

      const tokenRes = await fetch(`${AUTH}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code,
          client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI,
        }).toString(),
      });
      const tokens = await tokenRes.json();
      const idToken = tokens.id_token;

      // OIDC 核心：客户端本地验签 ID Token
      const [h, b, s] = idToken.split('.');
      const vr = verify(idToken);
      const payload = JSON.parse(decodePart(b));
      const expectedNonce = pendingNonce.get(state);
      pendingNonce.delete(state);
      const nonceOk = payload.nonce === expectedNonce;
      const audOk = payload.aud === CLIENT_ID;
      const issOk = payload.iss === AUTH;

      return res.end(page('OIDC 登录成功',
        `<pre>ID Token:\n${idToken}\n\nHeader:\n${decodePart(h)}\n\nPayload:\n${decodePart(b)}\n\nSignature:\n${s}</pre>
         <h3>本地校验结果</h3>
         <p class="${vr.valid ? 'ok' : 'err'}">签名验签：${vr.valid ? '✅ 通过' : '❌ 失败'}</p>
         <p class="${issOk ? 'ok' : 'err'}">iss 比对：${issOk ? '✅' : '❌'} ${payload.iss}</p>
         <p class="${audOk ? 'ok' : 'err'}">aud 比对：${audOk ? '✅' : '❌'} ${payload.aud}（应为 ${CLIENT_ID}）</p>
         <p class="${nonceOk ? 'ok' : 'err'}">nonce 比对：${nonceOk ? '✅' : '❌'}（防重放）</p>
         <p class="tip">登录用户：${payload.name}（${payload.sub}）。客户端没有调任何用户信息 API，全靠本地验签确认身份。</p>`
      ));
    }

    if (url.pathname === '/') {
      return res.end(page('OIDC Demo 客户端',
        `<p>通过 OpenID Connect 进行第三方登录。</p>
         <a class="btn" href="/start">用 OIDC 账号登录</a>
         <p class="tip">流程：发起（带 state+nonce）→ 认证中心登录(bob/123456) → 回调 → 本地验签 ID Token。</p>`
      ));
    }

    res.statusCode = 404;
    res.end('Not Found');
  });
}

function start() {
  createServer().listen(PORT, () => console.log(`OIDC 客户端: http://localhost:${PORT}`));
}

module.exports = { start };
if (require.main === module) start();
