/**
 * Demo7 - auth-server.js（授权服务器，端口 9000）
 * 与 Demo4 的区别：/authorize 接收 code_challenge（PKCE），/token 校验 code_verifier。
 * 用户库包含攻击者账号 eve —— 用于演示登录 CSRF 攻击。
 */
const http = require('http');
const crypto = require('crypto');
const { sign } = require('./jwt');

const PORT = 9000;

const clients = {
  'web-app': {
    name: 'Demo 客户端',
    secret: 'web-app-secret',
    redirectUris: ['http://localhost:3000/callback', 'http://localhost:3001/callback'],
  },
};

const codes = new Map(); // code -> { clientId, redirectUri, user, state, codeChallenge, expiresAt }
const users = {
  bob: { password: '123456', nickname: 'Bob 打工人' },
  eve: { password: '666666', nickname: 'Eve 攻击者' },
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
  res.end(JSON.stringify(obj));
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    console.log(`[auth] ${req.method} ${url.pathname} ${url.search}`);

    // 授权端点（登录+授权合并展示）
    if (url.pathname === '/authorize' && req.method === 'GET') {
      const clientId = url.searchParams.get('client_id');
      const redirectUri = url.searchParams.get('redirect_uri');
      const client = clients[clientId];
      // redirect_uri 精确匹配白名单（防重定向劫持）
      if (!client || !client.redirectUris.includes(redirectUri)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(page('错误', '<p>❌ client_id 或 redirect_uri 校验失败</p>'));
      }
      const g = (n) => `<input type="hidden" name="${n}" value="${url.searchParams.get(n) || ''}">`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(page(
        `${client.name} 请求授权`,
        `<form method="POST" action="/authorize/grant">
           ${g('client_id')}${g('redirect_uri')}${g('state')}${g('code_challenge')}${g('code_challenge_method')}
           账号：<input name="username">（bob/123456，eve/666666）<br>
           密码：<input name="password" type="password"><br>
           <button>登录并同意</button>
         </form>`
      ));
    }

    // 签发授权码（浏览器与攻击脚本都会走这里）
    if (url.pathname === '/authorize/grant' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const p = new URLSearchParams(body);
        const user = users[p.get('username')];
        if (!user || user.password !== p.get('password')) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(page('登录失败', '<p>账号或密码错误</p>'));
        }
        const code = crypto.randomBytes(16).toString('hex');
        codes.set(code, {
          clientId: p.get('client_id'),
          redirectUri: p.get('redirect_uri'),
          user: p.get('username'),
          state: p.get('state'),
          codeChallenge: p.get('code_challenge') || null,
          expiresAt: Date.now() + 10 * 60 * 1000,
        });
        console.log(`[auth] 签发 code 给 ${p.get('username')}，challenge=${p.get('code_challenge') ? '有(PKCE)' : '无'}`);
        const redirectUri = p.get('redirect_uri');
        const sep = redirectUri.includes('?') ? '&' : '?';
        res.statusCode = 302;
        res.setHeader('Location', `${redirectUri}${sep}code=${code}&state=${encodeURIComponent(p.get('state') || '')}`);
        res.end();
      });
      return;
    }

    // Token 端点：校验 code + PKCE verifier
    if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const p = new URLSearchParams(body);
        const client = clients[p.get('client_id')];
        if (!client || client.secret !== p.get('client_secret'))
          return json(res, 401, { error: 'invalid_client', error_description: 'client_id/secret 错误' });
        const record = codes.get(p.get('code'));
        codes.delete(p.get('code')); // 一次性
        if (!record || record.clientId !== p.get('client_id') || record.redirectUri !== p.get('redirect_uri'))
          return json(res, 400, { error: 'invalid_grant', error_description: '授权码无效或已使用' });

        // PKCE 校验：签发时带 challenge 的 code，换 Token 必须给出匹配的 verifier
        if (record.codeChallenge) {
          const verifier = p.get('code_verifier') || '';
          const computed = crypto.createHash('sha256').update(verifier).digest('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          if (computed !== record.codeChallenge) {
            return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE 校验失败：code_verifier 不匹配' });
          }
        }

        json(res, 200, {
          access_token: sign({ sub: record.user }, 3600),
          token_type: 'Bearer',
          expires_in: 3600,
          user: record.user,
        });
      });
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  });
}

function start() {
  createServer().listen(PORT, () => console.log(`授权服务器: http://localhost:${PORT}`));
}

module.exports = { start, codes };
if (require.main === module) start();
