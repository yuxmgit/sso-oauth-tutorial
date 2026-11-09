/**
 * Demo4 - auth-server.js（授权服务器，端口 9000）
 *
 * 职责（对照 RFC 6749）：
 *   ① /authorize          —— 登录页 + 授权确认页
 *   ② /authorize/grant    —— 签发一次性授权码并重定向回客户端
 *   ③ /token              —— 校验 code + client_secret，签发双令牌
 *   ④ /refresh            —— 用 refresh_token 换新 access_token
 *   ⑤ /introspect         —— 演示"令牌内省"（教学用）
 *
 * 教学要点：
 *   - code 一次性、10 分钟过期、用完即删（防重放）
 *   - redirect_uri 必须与注册时完全一致（防重定向劫持）
 *   - access_token 用 JWT：资源服务器无需回调即可本地验签
 */
const http = require('http');
const crypto = require('crypto');
const { sign } = require('./jwt');

const PORT = 9000;

// 客户端注册表（真实项目 = 管理员在控制台配置）
const clients = {
  'web-app': {
    name: 'PrintShop 打印店',
    secret: 'web-app-secret',
    redirectUris: ['http://localhost:3000/callback'],
  },
};

// 授权码存储：code -> { clientId, redirectUri, user, scope, expiresAt }
const codes = new Map();
// Refresh Token 存储：token -> { username, clientId }（长期、可吊销）
const refreshTokens = new Map();

// 预置账号（模拟认证中心的用户库）
const users = {
  bob: { password: '123456', nickname: 'Bob 打工人', email: 'bob@example.com' },
};

function page(title, body) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:600px;margin:40px auto;padding:0 16px}
input,button{padding:8px;margin:4px 0}pre{background:#222;color:#0f0;padding:12px;border-radius:6px;overflow:auto}
.tip{color:#888;font-size:14px}.btn{background:#36c;color:#fff;border:0;padding:10px 20px;border-radius:4px;cursor:pointer}</style>
</head><body><h1>${title}</h1>${body}</body></html>`;
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

// ① 授权端点：校验参数 → 展示登录页
function handleAuthorize(req, res, url) {
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const responseType = url.searchParams.get('response_type');
  const state = url.searchParams.get('state') || '';
  const scope = url.searchParams.get('scope') || '';

  const client = clients[clientId];
  if (!client) return res.end(page('错误', '<p>❌ 未知 client_id</p>'));
  if (!client.redirectUris.includes(redirectUri))
    return res.end(page('错误', '<p>❌ redirect_uri 与注册时不一致（安全拦截）</p>'));
  if (responseType !== 'code')
    return res.end(page('错误', '<p>❌ 仅支持 response_type=code（授权码模式）</p>'));

  // 登录表单，参数藏在隐藏域带到下一步
  const hidden = (n, v) => `<input type="hidden" name="${n}" value="${v}">`;
  res.end(
    page(
      `${client.name} 请求授权`,
      `<p>登录认证中心（测试账号 bob/123456）后确认授权。</p>
       <form method="POST" action="/authorize/confirm">
         ${hidden('client_id', clientId)}${hidden('redirect_uri', redirectUri)}
         ${hidden('state', state)}${hidden('scope', scope)}
         账号：<input name="username"><br>
         密码：<input name="password" type="password"><br>
         <button class="btn">登录</button>
       </form>`
    )
  );
}

// ② 授权确认：登录成功 → 展示"授权书"
function handleConfirm(req, res, body) {
  const p = new URLSearchParams(body);
  const user = users[p.get('username')];
  if (!user || user.password !== p.get('password')) {
    return res.end(page('登录失败', '<p>账号或密码错误，<a href="javascript:history.back()">返回</a></p>'));
  }
  const hidden = (n) => `<input type="hidden" name="${n}" value="${p.get(n)}">`;
  res.end(
    page(
      '授权确认',
      `<p>即将授权 <b>${clients[p.get('client_id')].name}</b> 获取：</p>
       <ul><li>你的昵称与邮箱（scope: ${p.get('scope')}）</li></ul>
       <form method="POST" action="/authorize/grant">
         ${hidden('client_id')}${hidden('redirect_uri')}${hidden('state')}${hidden('scope')}
         ${hidden('username', p.get('username'))}
         <button class="btn">同意授权</button>
       </form>
       <p class="tip">真实场景中这一步只有一次，之后静默放行（SSO 的"单点"）。</p>`
    )
  );
}

// ③ 签发授权码并重定向回客户端
function handleGrant(req, res, body) {
  const p = new URLSearchParams(body);
  const redirectUri = p.get('redirect_uri');
  const code = crypto.randomBytes(16).toString('hex');
  codes.set(code, {
    clientId: p.get('client_id'),
    redirectUri,
    user: p.get('username'),
    scope: p.get('scope'),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  const sep = redirectUri.includes('?') ? '&' : '?';
  res.statusCode = 302;
  res.setHeader('Location', `${redirectUri}${sep}code=${code}&state=${encodeURIComponent(p.get('state') || '')}`);
  res.end();
}

// ④ Token 端点（服务器对服务器，浏览器不参与！）
function handleToken(req, res, body) {
  const p = new URLSearchParams(body);
  const code = p.get('code');
  const clientId = p.get('client_id');
  const clientSecret = p.get('client_secret');

  const client = clients[clientId];
  if (!client || client.secret !== clientSecret) {
    return json(res, 401, { error: 'invalid_client', error_description: 'client_id 或 client_secret 错误' });
  }

  const record = codes.get(code);
  codes.delete(code); // ← 授权码一次性，无论成败先作废（防重放）

  if (!record) {
    return json(res, 400, { error: 'invalid_grant', error_description: '授权码无效（可能已使用或过期）' });
  }
  if (record.clientId !== clientId || record.redirectUri !== p.get('redirect_uri')) {
    return json(res, 400, { error: 'invalid_grant', error_description: 'client/redirect_uri 与签发时不匹配' });
  }

  // 签发双令牌：短 JWT + 长随机串
  const accessToken = sign({ sub: record.user, scope: record.scope, client_id: clientId }, 3600);
  const refreshToken = crypto.randomBytes(24).toString('hex');
  refreshTokens.set(refreshToken, { username: record.user, clientId });

  json(res, 200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: refreshToken,
  });
}

// ⑤ Refresh 端点
function handleRefresh(req, res, body) {
  const p = new URLSearchParams(body);
  const record = refreshTokens.get(p.get('refresh_token'));
  if (!record) return json(res, 400, { error: 'invalid_grant', error_description: 'refresh_token 无效' });

  const accessToken = sign({ sub: record.username, client_id: record.clientId }, 3600);
  json(res, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: 3600 });
}

// ⑥ 令牌内省（教学演示：资源服务器也可选择回调校验不透明令牌）
function handleIntrospect(req, res, body) {
  const p = new URLSearchParams(body);
  const result = require('./jwt').verify(p.get('token') || '');
  json(res, 200, { active: result.valid, payload: result.payload || null });
}

// HTTP 入口：统一解析 body，分发路由
function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      console.log(`[auth-server] ${req.method} ${url.pathname}`);

      if (url.pathname === '/authorize' && req.method === 'GET')
        return handleAuthorize(req, res, url);
      if (url.pathname === '/authorize/confirm' && req.method === 'POST')
        return handleConfirm(req, res, raw);
      if (url.pathname === '/authorize/grant' && req.method === 'POST')
        return handleGrant(req, res, raw);
      if (url.pathname === '/token' && req.method === 'POST') return handleToken(req, res, raw);
      if (url.pathname === '/refresh' && req.method === 'POST') return handleRefresh(req, res, raw);
      if (url.pathname === '/introspect' && req.method === 'POST') return handleIntrospect(req, res, raw);

      res.statusCode = 404;
      res.end('Not Found');
    });
  });
}

function start() {
  createServer().listen(PORT, () => console.log(`授权服务器(auth-server)  : http://localhost:${PORT}`));
}

module.exports = { start, codes, refreshTokens, users };

// 单独运行本文件时也可启动（便于调试）：node auth-server.js
if (require.main === module) start();
