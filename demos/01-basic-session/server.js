/**
 * Demo1：单系统登录 —— Session + Cookie 的最基础实现
 * 零第三方依赖，只用 Node 内置模块。
 * 启动：npm start （等价于 node server.js）
 * 访问：http://localhost:3000
 */
const http = require('http');
const crypto = require('crypto');

const PORT = 3000;

// ─────────────────────────────────────────────
// "档案柜"：Session 存储（内存 Map，重启即清空）
// key: sessionId, value: { username, loginAt }
// ─────────────────────────────────────────────
const sessions = new Map();

// 简易用户表（真实项目应存数据库，且密码要哈希）
const users = {
  bob: { password: '123456', nickname: 'Bob 打工人' },
  alice: { password: 'abc123', nickname: 'Alice 同学' },
};

// 极简 HTML 工具函数
const page = (title, body) => `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px}
input,button{padding:8px;margin:4px 0}pre{background:#f4f4f4;padding:12px;border-radius:6px}
.tip{color:#888;font-size:14px}</style></head><body><h1>${title}</h1>${body}</body></html>`;

// 解析 Cookie 头
function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > -1) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.sid;

  // 路由：登录表单
  if (url.pathname === '/' || url.pathname === '/login') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      page(
        '登录（Demo1 单系统登录）',
        `<form method="POST" action="/login">
           账号：<input name="username" placeholder="bob 或 alice"><br>
           密码：<input name="password" type="password" placeholder="123456"><br>
           <button>登录</button>
         </form>
         <p class="tip">测试账号：bob/123456 或 alice/abc123</p>
         <p class="tip">实验提示：登录前先访问 <a href="/profile">/profile</a> 感受"未登录"状态。</p>`
      )
    );
    return;
  }

  // 路由：提交登录
  if (url.pathname === '/login' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const username = params.get('username');
      const password = params.get('password');
      const user = users[username];

      if (!user || user.password !== password) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(page('登录失败', `<p>账号或密码错误。<a href="/login">重试</a></p>`));
        return;
      }

      // ① 登录成功：创建 Session（往档案柜里放一份档案）
      const newSid = crypto.randomUUID();
      sessions.set(newSid, { username, loginAt: new Date().toISOString() });

      // ② 把档案编号塞给浏览器（Set-Cookie）
      res.setHeader('Set-Cookie', `sid=${newSid}; HttpOnly; Path=/`);
      res.statusCode = 302;
      res.setHeader('Location', '/profile');
      res.end();
    });
    return;
  }

  // 路由：个人主页（受保护资源）
  if (url.pathname === '/profile') {
    const session = sid && sessions.get(sid);
    if (!session) {
      // 档案柜里查无此编号 → 未登录
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        page('Profile', `<p>⛔ 未登录，请先 <a href="/login">登录</a>。</p>`)
      );
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      page(
        'Profile',
        `<p>✅ 你好，${session.nickname}（${session.username}）</p>
         <pre>服务端 Session 内容：
${JSON.stringify(session, null, 2)}</pre>
         <p><a href="/logout">退出登录</a></p>`
      )
    );
    return;
  }

  // 路由：退出登录
  if (url.pathname === '/logout') {
    if (sid) sessions.delete(sid); // 服务器删档案
    res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/'); // 浏览器删 Cookie
    res.statusCode = 302;
    res.setHeader('Location', '/login');
    res.end();
    return;
  }

  // 路由：检查当前请求带了什么 Cookie（教学用）
  if (url.pathname === '/debug/headers') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ cookieHeader: req.headers.cookie || null, sessions: sessions.size }, null, 2));
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(page('404', '<p>页面不存在</p>'));
});

server.listen(PORT, () => {
  console.log(`Demo1 已启动: http://localhost:${PORT}`);
  console.log('测试账号: bob/123456 或 alice/abc123');
});
