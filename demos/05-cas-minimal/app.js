/**
 * Demo5 - app.js
 * CAS 客户端应用工厂：未登录 → 跳 CAS 登录 → 带 ST 回来 → 验票 → 建立局部会话
 */
const http = require('http');
const crypto = require('crypto');

const CAS = 'http://localhost:8000';

function page(title, body, badge, extraLinks = '') {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:560px;margin:40px auto;padding:0 16px}
pre{background:#f4f4f4;padding:12px;border-radius:6px}.tip{color:#888;font-size:14px}
a{display:inline-block;margin-right:12px}</style>
</head><body><h1>${title}</h1>${badge}${body}<p>${extraLinks}</p></body></html>`;
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > -1) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

function createApp(name, port, color) {
  const sessions = new Map(); // 应用自己的局部会话
  const callbackUrl = `http://localhost:${port}/cas-callback`;
  const badge = `<p style="color:${color}">${name}，端口 ${port}。另一个应用：<a href="http://localhost:${port === 3000 ? 3001 : 3000}">${port === 3000 ? '应用B(Wiki)' : '应用A(OA)'}</a></p>`;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const cookies = parseCookies(req.headers.cookie);
    const session = cookies.sid && sessions.get(cookies.sid);
    const html = (t, b, l = '') => page(t, b, badge, l);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    console.log(`[${name}] ${req.method} ${url.pathname} ${url.search}`);

    // CAS 回调：验票并建立局部会话
    if (url.pathname === '/cas-callback') {
      const ticket = url.searchParams.get('ticket');
      const r = await fetch(`${CAS}/serviceValidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ticket, service: callbackUrl }).toString(),
      });
      const result = await r.json();
      if (!result.ok) return res.end(html('验票失败', `<p>❌ ${result.error}</p>`));
      const sid = crypto.randomUUID();
      sessions.set(sid, { username: result.username, loginAt: new Date().toISOString() });
      res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/`);
      res.statusCode = 302;
      res.setHeader('Location', '/profile');
      return res.end();
    }

    // 受保护资源
    if (url.pathname === '/profile') {
      if (!session)
        return res.end(html(
          `${name} - 未登录`,
          `<p>⛔ 未登录。<a href="/login">去登录</a></p><p class="tip">点击后将被重定向到 CAS（localhost:8000）。</p>`
        ));
      return res.end(html(
        `${name} - Profile`,
        `<p>✅ 你好，${session.username}</p><pre>${JSON.stringify(session, null, 2)}</pre>`,
        `<a href="/logout">本应用登出</a><a href="http://localhost:8000/logout">CAS 全局登出</a>`
      ));
    }

    if (url.pathname === '/login') {
      res.statusCode = 302;
      res.setHeader('Location', `${CAS}/login?service=${encodeURIComponent(callbackUrl)}`);
      return res.end();
    }

    if (url.pathname === '/logout') {
      if (cookies.sid) sessions.delete(cookies.sid);
      res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/');
      return res.end(html('本应用已登出', '<p>局部会话已清除（CAS 全局会话仍在，可"单点"免密重登本应用）。</p>'));
    }

    // 默认：引导页
    res.end(html(
      `${name}`,
      `<p>这是一个通过 CAS 接入单点登录的应用。</p>
       <p><a href="/profile">访问受保护的 /profile</a>（未登录会跳转 CAS）</p>`
    ));
  });
}

module.exports = { createApp };
