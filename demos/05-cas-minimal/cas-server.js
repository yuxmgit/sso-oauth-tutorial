/**
 * Demo5 - cas-server.js（CAS 认证中心，端口 8000）
 *
 * 端点：
 *   /login            —— 登录页（带 service 参数：登录成功后回跳的应用回调地址）
 *   /login (POST)     —— 验证账密 → 创建 TGT → 种 TGC Cookie → 签发 ST → 重定向 service?ticket=ST
 *   /serviceValidate  —— 应用后端回调验票（服务器对服务器）：校验 ST 并立即作废
 *   /logout           —— 全局登出（销毁 TGT，清 TGC）
 *
 * 核心概念：
 *   TGT = Ticket Granting Ticket（全局会话，存服务端 Map）
 *   TGC = TGT 的 Cookie（浏览器持有，仅 CAS 域可见）
 *   ST  = Service Ticket（一次性，发给某个具体应用）
 */
const http = require('http');
const crypto = require('crypto');

const PORT = 8000;

const tgts = new Map(); // tgtId -> username
const sts = new Map();  // st -> { user, service }（验一次即废）

const users = {
  bob: { password: '123456', nickname: 'Bob 打工人' },
};

function page(title, body) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:560px;margin:40px auto;padding:0 16px}
input,button{padding:8px;margin:4px 0}.tip{color:#888;font-size:14px}</style>
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

function issueTicket(tgtId, service, res) {
  const st = 'ST-' + crypto.randomBytes(12).toString('hex');
  sts.set(st, { user: tgts.get(tgtId), service });
  res.statusCode = 302;
  res.setHeader('Location', `${service}${service.includes('?') ? '&' : '?'}ticket=${st}`);
  res.end();
  console.log(`[cas] 签发 ${st.slice(0, 10)}... 回跳 ${service}`);
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    console.log(`[cas] ${req.method} ${url.pathname} ${url.search}`);

    // ① 登录页（GET）
    if (url.pathname === '/login' && req.method === 'GET') {
      const service = url.searchParams.get('service') || '';
      const cookies = parseCookies(req.headers.cookie);
      const tgtId = cookies.CASTGC;

      // 已有全局会话（TGT 有效）→ 免登录，直接签发 ST（这就是"单点"）
      if (tgtId && tgts.has(tgtId) && service) {
        console.log(`[cas] TGT 有效，SSO 免登录，直接签发 ST 给 ${service}`);
        return issueTicket(tgtId, service, res);
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(
        page(
          'CAS 统一认证中心',
          `<form method="POST" action="/login">
             <input type="hidden" name="service" value="${service}">
             账号：<input name="username"><br>
             密码：<input name="password" type="password"><br>
             <button>登录</button>
           </form>
           <p class="tip">bob/123456。service=${service || '(无)'}</p>`
        )
      );
    }

    // ② 提交登录（POST）
    if (url.pathname === '/login' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const p = new URLSearchParams(body);
        const service = p.get('service') || '';
        const user = users[p.get('username')];
        if (!user || user.password !== p.get('password')) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(page('登录失败', '<p>账号或密码错误，<a href="javascript:history.back()">返回</a></p>'));
        }
        // 创建全局会话 TGT，种 TGC Cookie
        const tgtId = 'TGT-' + crypto.randomBytes(16).toString('hex');
        tgts.set(tgtId, p.get('username'));
        res.setHeader('Set-Cookie', `CASTGC=${tgtId}; HttpOnly; Path=/`);
        console.log(`[cas] 登录成功，创建 TGT=${tgtId.slice(0, 12)}...`);
        if (service) return issueTicket(tgtId, service, res);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(page('登录成功', '<p>你已在 CAS 建立全局会话，可直接访问各接入应用。</p>'));
      });
      return;
    }

    // ③ 验票端点（应用后端服务器对服务器调用）
    if (url.pathname === '/serviceValidate' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const p = new URLSearchParams(body);
        const ticket = p.get('ticket');
        const record = sts.get(ticket);
        sts.delete(ticket); // 一次性：无论成败立即作废
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (!record) return res.end(JSON.stringify({ ok: false, error: '票据无效或已使用' }));
        if (record.service !== p.get('service'))
          return res.end(JSON.stringify({ ok: false, error: 'service 与签发时不匹配' }));
        res.end(JSON.stringify({ ok: true, username: record.user }));
      });
      return;
    }

    // ④ 全局登出
    if (url.pathname === '/logout') {
      const cookies = parseCookies(req.headers.cookie);
      const tgtId = cookies.CASTGC;
      if (tgtId) tgts.delete(tgtId);
      res.setHeader('Set-Cookie', 'CASTGC=; Max-Age=0; Path=/');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(page('已全局登出', '<p>TGT 已销毁。访问任一应用都需重新登录。<a href="/">回首页</a></p>'));
    }

    // MARKER3
    res.statusCode = 404;
    res.end('Not Found');
  });
}

function start() {
  createServer().listen(PORT, () => console.log(`CAS 服务器: http://localhost:${PORT}`));
}

module.exports = { start, tgts, sts };
if (require.main === module) start();
