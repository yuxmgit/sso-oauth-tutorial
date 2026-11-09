/**
 * Demo2 - app.js
 * 应用工厂：创建一个"独立"的登录应用（各自独立 Session 存储）
 * 被同一进程启动两个实例，模拟部署在不同服务器上的两个系统。
 */
const http = require('http');
const crypto = require('crypto');

const users = {
  bob: { password: '123456', nickname: 'Bob 打工人' },
  alice: { password: 'abc123', nickname: 'Alice 同学' },
};

function page(title, body, badge) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px}
input,button{padding:8px;margin:4px 0}pre{background:#f4f4f4;padding:12px;border-radius:6px}
.tip{color:#888;font-size:14px}</style>
</head><body><h1>${title}</h1>${badge}${body}</body></html>`;
}

function createApp(name, port, color) {
  const sessions = new Map(); // ← 每个应用独立的"档案柜"

  function parseCookies(header) {
    const out = {};
    (header || '').split(';').forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > -1) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
    });
    return out;
  }

  const otherPort = port === 3000 ? 3001 : 3000;
  const otherName = port === 3000 ? '应用B(Wiki)' : '应用A(OA)';
  const badge =
    `<p style="color:${color}">这是 ${name}，端口 ${port}。` +
    `另一个应用：<a href="http://localhost:${otherPort}">去 ${otherName}</a></p>`;

  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const sid = parseCookies(req.headers.cookie).sid;
    const html = (t, b) => page(t, b, badge);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (url.pathname === '/login' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const p = new URLSearchParams(body);
        const user = users[p.get('username')];
        if (!user || user.password !== p.get('password')) {
          res.end(html('登录失败', '<p>账号或密码错误，<a href="/login">重试</a></p>'));
          return;
        }
        const newSid = crypto.randomUUID();
        sessions.set(newSid, { username: p.get('username'), loginAt: new Date().toISOString() });
        res.setHeader('Set-Cookie', `sid=${newSid}; HttpOnly; Path=/`);
        res.statusCode = 302;
        res.setHeader('Location', '/profile');
        res.end();
      });
      return;
    }

    if (url.pathname === '/profile') {
      const session = sid && sessions.get(sid);
      if (!session) {
        res.end(
          html(
            `${name} - Profile`,
            '<p>⛔ 未登录（哪怕你刚刚在另一个应用登录过！）</p><p><a href="/login">在本应用登录</a></p>'
          )
        );
        return;
      }
      res.end(html(`${name} - Profile`, `<p>✅ 你好，${session.nickname}（${session.username}）</p>`));
      return;
    }

    if (url.pathname === '/logout') {
      if (sid) sessions.delete(sid);
      res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/');
      res.statusCode = 302;
      res.setHeader('Location', '/login');
      res.end();
      return;
    }

    // 教学调试：看浏览器发来的 Cookie 头 & 本应用档案柜内容
    if (url.pathname === '/debug') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify(
          { app: name, cookieHeader: req.headers.cookie || null, sessionStoreSize: sessions.size },
          null,
          2
        )
      );
      return;
    }

    // 默认：登录表单
    res.end(
      html(
        `${name} 登录`,
        '<form method="POST" action="/login">账号：<input name="username"><br>' +
          '密码：<input name="password" type="password"><br><button>登录</button></form>'
      )
    );
  });
}

module.exports = { createApp };
