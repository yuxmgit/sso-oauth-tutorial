/**
 * Demo3 - server.js
 * JWT 无状态登录（零依赖）。
 * 启动：npm start，访问 http://localhost:3000
 *
 * 特色实验：
 *   /debug/token —— 解剖你的 JWT 三段
 *   /tamper      —— 亲手篡改 Payload，观察签名校验如何拒绝
 */
const http = require('http');
const { sign, verify, b64url, b64urlDecode } = require('./jwt');

const PORT = 3000;
const users = {
  bob: { password: '123456', nickname: 'Bob 打工人', role: 'user' },
  alice: { password: 'abc123', nickname: 'Alice 同学', role: 'user' },
};

function page(title, body) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 16px}
input,button{padding:8px;margin:4px 0}pre{background:#222;color:#0f0;padding:12px;border-radius:6px;overflow:auto}
.err{color:#c00}.ok{color:#080}.tip{color:#888;font-size:14px}</style>
</head><body><h1>${title}</h1>${body}</body></html>`;
}

// 无状态：不需要 sessions Map！服务器重启后 Token 依然有效。
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // 从 Authorization: Bearer xxx 或 ?token= 中提取 JWT
  function getToken() {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    return url.searchParams.get('token');
  }

  // ① 首页/登录表单
  if (url.pathname === '/login' && req.method === 'GET') {
    res.end(
      page(
        '登录（Demo3 JWT）',
        '<form method="POST" action="/login">账号：<input name="username"><br>' +
          '密码：<input name="password" type="password"><br><button>登录</button></form>' +
          '<p class="tip">bob/123456 或 alice/abc123</p>'
      )
    );
    return;
  }

  // ② 提交登录 → 签发 JWT
  if (url.pathname === '/login' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const p = new URLSearchParams(body);
      const user = users[p.get('username')];
      if (!user || user.password !== p.get('password')) {
        res.end(page('登录失败', '<p>账号或密码错误，<a href="/login">重试</a></p>'));
        return;
      }
      // 核心一行：签发 Token（用户信息就放在里面）
      const token = sign({ sub: p.get('username'), nickname: user.nickname, role: user.role });
      res.end(
        page(
          '登录成功',
          `<p>你的 JWT：</p><pre>${token}</pre>
           <p><a href="/profile?token=${encodeURIComponent(token)}">去 /profile 验证</a>（URL 方式）</p>
           <p class="tip">也可以用 Header 方式：<code>Authorization: Bearer &lt;token&gt;</code></p>
           <p><a href="/debug/token?token=${encodeURIComponent(token)}">解剖这个 JWT</a></p>
           <p><a href="/tamper?token=${encodeURIComponent(token)}">去 /tamper 做破坏性实验</a></p>`
        )
      );
    });
    return;
  }

  // ③ 受保护的 /profile：无状态验签
  if (url.pathname === '/profile') {
    const token = getToken();
    if (!token) {
      res.end(page('Profile', '<p>⛔ 未提供 Token，<a href="/login">请登录</a></p>'));
      return;
    }
    const result = verify(token);
    if (!result.valid) {
      res.end(page('Profile', `<p class="err">❌ Token 无效：${result.reason}</p>`));
      return;
    }
    res.end(
      page(
        'Profile',
        `<p class="ok">✅ 验签通过！</p>
         <pre>${JSON.stringify(result.payload, null, 2)}</pre>
         <p>注意：服务器没有存任何会话，全靠 Token 自带的签名和载荷。</p>`
      )
    );
    return;
  }

  // ④ 解剖 JWT
  if (url.pathname === '/debug/token') {
    const token = getToken();
    if (!token) {
      res.end(page('解剖 JWT', '<p>缺少 token 参数</p>'));
      return;
    }
    const [h, b, s] = token.split('.');
    res.end(
      page(
        '解剖 JWT',
        `<pre>第一段 Header（Base64 解码）:
${b64urlDecode(h).toString('utf8')}

第二段 Payload（Base64 解码）:
${b64urlDecode(b).toString('utf8')}

第三段 Signature（Base64，不可读，是 HMAC 结果）:
${s}</pre>
        <p class="tip">前两段只是 Base64 编码，人人可读 —— JWT 不是加密！</p>`
      )
    );
    return;
  }

  // ⑤ 破坏性实验：篡改 role
  if (url.pathname === '/tamper') {
    const token = getToken();
    if (!token) {
      res.end(page('篡改实验', '<p>缺少 token 参数，请先登录</p>'));
      return;
    }
    const [h, b, sig] = token.split('.');
    const payload = JSON.parse(b64urlDecode(b).toString('utf8'));
    payload.role = 'admin'; // 作恶：把自己提成 admin！
    const forgedBody = b64url(JSON.stringify(payload));
    const forged = `${h}.${forgedBody}.${sig}`; // 签名没重新算！

    const result = verify(forged);
    res.end(
      page(
        '篡改实验',
        `<pre>原始 Payload: ${JSON.stringify(payload, null, 2)}

伪造 Token: ${forged}

校验结果: ${result.valid ? '✅ 通过（不该发生！）' : '❌ ' + result.reason}</pre>
        <p>改了内容但没改签名 → 签名对不上 → 拒绝。这就是签名的意义。</p>`
      )
    );
    return;
  }

  res.statusCode = 404;
  res.end(page('404', '<p>页面不存在</p>'));
});

server.listen(PORT, () => {
  console.log(`Demo3 已启动: http://localhost:${PORT}`);
  console.log('实验亮点: /debug/token 解剖 JWT；/tamper 篡改 role 体验签名拒绝；重启服务后 Token 依然有效（无状态）');
});
