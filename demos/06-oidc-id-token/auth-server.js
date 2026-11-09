/**
 * Demo6 - auth-server.js（OIDC Provider，端口 9000）
 * 在 OAuth2 之上叠加身份层：/token 额外签发 ID Token（含 nonce），
 * 并提供 /.well-known/openid-configuration 发现文档。
 */
const http = require('http');
const crypto = require('crypto');
const { sign } = require('./jwt');

const PORT = 9000;
const ISSUER = `http://localhost:${PORT}`;

const clients = {
  'web-app': {
    name: 'OIDC Demo 客户端',
    secret: 'web-app-secret',
    redirectUris: ['http://localhost:3000/callback'],
  },
};

const codes = new Map(); // code -> { clientId, redirectUri, user, scope, nonce, expiresAt }
const users = {
  bob: { password: '123456', name: 'Bob 打工人', email: 'bob@example.com' },
};

function page(title, body) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:560px;margin:40px auto;padding:0 16px}
input,button{padding:8px;margin:4px 0}.tip{color:#888;font-size:14px}</style>
</head><body><h1>${title}</h1>${body}</body></html>`;
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj, null, 2));
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, ISSUER);
    console.log(`[oidc] ${req.method} ${url.pathname} ${url.search}`);

    // 发现文档
    if (url.pathname === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        userinfo_endpoint: `${ISSUER}/userinfo`,
        scopes_supported: ['openid', 'profile'],
        id_token_signing_alg_values_supported: ['HS256'],
      });
    }

    // 授权端点：登录+授权合并展示（教学简化）
    if (url.pathname === '/authorize' && req.method === 'GET') {
      const clientId = url.searchParams.get('client_id');
      const redirectUri = url.searchParams.get('redirect_uri');
      const scope = url.searchParams.get('scope') || '';
      const client = clients[clientId];
      if (!client || !client.redirectUris.includes(redirectUri) || !scope.includes('openid')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(page('错误', '<p>❌ client/redirect_uri 校验失败，或缺少 openid scope</p>'));
      }
      const h = (n) => `<input type="hidden" name="${n}" value="${url.searchParams.get(n) || ''}">`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(page(
        `${client.name} 申请登录`,
        `<form method="POST" action="/authorize/grant">
           ${h('client_id')}${h('redirect_uri')}${h('scope')}${h('nonce')}${h('state')}
           账号：<input name="username"><br>
           密码：<input name="password" type="password"><br>
           <button>登录并同意</button>
         </form>
         <p class="tip">将获取你的身份（scope: ${scope}）</p>`
      ));
    }

    // 同意后签发授权码
    if (url.pathname === '/authorize/grant' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const p = new URLSearchParams(body);
        const user = users[p.get('username')];
        if (!user || user.password !== p.get('password')) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(page('登录失败', '<p>账号或密码错误（bob/123456）</p>'));
        }
        const code = crypto.randomBytes(16).toString('hex');
        codes.set(code, {
          clientId: p.get('client_id'),
          redirectUri: p.get('redirect_uri'),
          user: p.get('username'),
          scope: p.get('scope'),
          nonce: p.get('nonce'),
          expiresAt: Date.now() + 10 * 60 * 1000,
        });
        const redirectUri = p.get('redirect_uri');
        const sep = redirectUri.includes('?') ? '&' : '?';
        res.statusCode = 302;
        res.setHeader('Location', `${redirectUri}${sep}code=${code}&state=${encodeURIComponent(p.get('state') || '')}`);
        res.end();
      });
      return;
    }

    // Token 端点：签发 access_token + ID Token
    if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const p = new URLSearchParams(body);
        const client = clients[p.get('client_id')];
        if (!client || client.secret !== p.get('client_secret'))
          return json(res, 401, { error: 'invalid_client' });
        const record = codes.get(p.get('code'));
        codes.delete(p.get('code')); // 一次性
        if (!record || record.clientId !== p.get('client_id') || record.redirectUri !== p.get('redirect_uri'))
          return json(res, 400, { error: 'invalid_grant' });

        // ID Token：标准 OIDC 声明 + nonce
        const idToken = sign({
          iss: ISSUER,
          sub: record.user,
          aud: record.clientId,
          nonce: record.nonce,
          name: users[record.user].name,
          email: users[record.user].email,
        }, 3600);
        const accessToken = sign({ sub: record.user, scope: record.scope }, 3600);
        json(res, 200, {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          id_token: idToken,
        });
      });
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  });
}

function start() {
  createServer().listen(PORT, () => console.log(`OIDC 认证中心: http://localhost:${PORT}`));
}

module.exports = { start, clients, codes };
if (require.main === module) start();
