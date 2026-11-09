/**
 * Demo7 - client-vuln.js（漏洞版客户端，端口 3000）
 * 故意【不校验 state】——演示登录 CSRF 攻击如何得手。
 */
const http = require('http');

const PORT = 3000;
const AUTH = 'http://localhost:9000';
const CLIENT_ID = 'web-app';
const CLIENT_SECRET = 'web-app-secret';
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

function page(title, body) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:560px;margin:40px auto;padding:0 16px}
.btn{background:#c33;color:#fff;border:0;padding:10px 20px;border-radius:4px;cursor:pointer;text-decoration:none;display:inline-block}
.err{color:#c00}.tip{color:#888;font-size:14px}</style>
</head><body><h1>${title}</h1>${body}</body></html>`;
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    console.log(`[vuln] ${req.method} ${url.pathname} ${url.search}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      // 漏洞点：完全不校验 state，拿到 code 就换 Token
      const r = await fetch(`${AUTH}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code,
          client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI,
        }).toString(),
      });
      const result = await r.json();
      if (r.status !== 200) {
        return res.end(page('失败', `<p class="err">换 Token 失败：${JSON.stringify(result)}</p>`));
      }
      return res.end(page(
        '漏洞版客户端',
        `<p class="err">⚠️ 登录成功：${result.user}（如果这不是你自己输入的账号，说明你被 CSRF 攻击了！）</p>
         <p>这个客户端没有校验 state —— 攻击者用自己账号拿到的授权码可以强行登录到你的浏览器。</p>`
      ));
    }

    if (url.pathname === '/start') {
      const target =
        `${AUTH}/authorize?response_type=code&client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=profile`;
      res.statusCode = 302;
      res.setHeader('Location', target);
      return res.end();
    }

    res.end(page('漏洞版客户端（3000）',
      `<a class="btn" href="/start">正常登录入口（供对照）</a>
       <p class="tip">此客户端故意缺失 state 校验，是本靶场的"靶子"。</p>`));
  });
}

function start() {
  createServer().listen(PORT, () => console.log(`漏洞版客户端: http://localhost:${PORT}`));
}

module.exports = { start };
if (require.main === module) start();
