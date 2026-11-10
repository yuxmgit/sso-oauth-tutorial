/**
 * Demo8 - server.js（JWE 加密令牌实验室，端口 3100）
 *
 * 同一个用户信息，分别用两种方式签发：
 *   JWT（JWS）：base64 明文 + 签名 —— 谁都能看到内容
 *   JWE      ：AES-256-GCM 加密 —— 没有私钥谁都看不到
 *
 * 端口选 3100，可与 Demo1/Demo3 的 3000 同时运行，方便对比。
 * 启动：npm start（等价 node server.js）
 */
const http = require('http');
const crypto = require('crypto');
const {
  signJwt, peekJwtPayload,
  encryptJwe, decryptJwe, splitJwe,
  encryptJweDir, decryptJweDir,
} = require('./token');

const PORT = 3100;
const JWT_SECRET = 'demo8-jwt-secret';

const users = {
  bob: { password: '123456', nickname: 'Bob 打工人', phone: '13800001234', idCard: '110101199001011234' },
  alice: { password: 'abc123', nickname: 'Alice 同学', phone: '13900005678', idCard: '310101199202027890' },
};

// 启动时生成一对 RSA 密钥（真实项目：私钥只在认证中心/资源服务器，公钥公开）
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const issued = new Map(); // id -> { jwt, jwe, payload }

const page = (title, body) => `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;line-height:1.7}
input,button{padding:8px;margin:4px 0}
pre{background:#f6f8fa;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all;font-size:13px}
table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:13px;vertical-align:top}
th{background:#fafafa}
.ok{color:#0a7a30}.err{color:#c00}.tip{color:#888;font-size:14px}
.btn{display:inline-block;background:#0366d6;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;margin:6px 8px 6px 0}
.warn{background:#fff8e1;border-left:4px solid #f0b400;padding:10px 14px;border-radius:4px}
</style></head><body><h1>${title}</h1>${body}</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // ① 首页：登录表单
  if (url.pathname === '/' && req.method === 'GET') {
    return res.end(page('JWE 加密令牌实验室（Demo8）',
      `<p>同一条用户信息（含手机号、身份证号），用两种方式签发令牌，对比"能否被看见"。</p>
       <form method="POST" action="/login">
         账号：<input name="username" placeholder="bob 或 alice"><br>
         密码：<input name="password" type="password" placeholder="123456"><br>
         <button>签发令牌</button>
       </form>
       <p class="tip">测试账号：bob/123456 或 alice/abc123</p>
       <p><a class="btn" href="/dir-demo">看 alg=dir（对称密钥）模式</a></p>`));
  }

  // ② 登录：同时签发 JWT（明文）和 JWE（密文）
  if (url.pathname === '/login' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const p = new URLSearchParams(body);
      const user = users[p.get('username')];
      if (!user || user.password !== p.get('password')) {
        return res.end(page('登录失败', '<p class="err">账号或密码错误。<a href="/">重试</a></p>'));
      }
      const payload = {
        sub: p.get('username'),
        name: user.nickname,
        phone: user.phone,     // 敏感：手机号
        idCard: user.idCard,   // 敏感：身份证号
        scope: 'profile',
      };
      const id = crypto.randomUUID().slice(0, 8);
      const jwt = signJwt(payload, JWT_SECRET, 3600);
      const jwe = encryptJwe(payload, publicKey);
      issued.set(id, { jwt, jwe, payload });

      const peek = JSON.stringify(peekJwtPayload(jwt), null, 2);
      const segments = splitJwe(jwe).map(
        (s) => `<tr><td>${s.name}</td><td>${s.bytes} 字节</td><td><code>${s.value.slice(0, 60)}${s.value.length > 60 ? '…' : ''}</code></td></tr>`
      ).join('');

      res.end(page('同一份数据，两种令牌',
        `<h3>原始业务数据（含敏感字段）</h3><pre>${JSON.stringify(payload, null, 2)}</pre>

         <h3>① JWT（JWS，只有签名）</h3>
         <pre>${jwt}</pre>
         <p class="err">⚠️ 把上面第二段 base64 解一下就能看到：</p>
         <pre>${peek}</pre>
         <p class="tip">签名只保证"没被篡改"，不保证"不被看见"。手机号、身份证号全部暴露。</p>

         <h3>② JWE（加密，5 段）</h3>
         <pre>${jwe}</pre>
         <table><tr><th>段</th><th>长度</th><th>内容（截断预览）</th></tr>${segments}</table>
         <p class="ok">✅ 除了 Header 能看出算法，其余全是密文；没有私钥无法还原任何业务字段。</p>

         <p>
           <a class="btn" href="/decrypt?id=${id}">用私钥解密 JWE</a>
           <a class="btn" href="/tamper?id=${id}">篡改密文试试</a>
         </p>`));
    });
    return;
  }

  // ③ 解密 JWE（服务端持有私钥）
  if (url.pathname === '/decrypt') {
    const rec = issued.get(url.searchParams.get('id'));
    if (!rec) return res.end(page('提示', '<p class="err">令牌不存在或服务已重启。<a href="/">重新登录</a></p>'));
    let out;
    try {
      const { header, payload } = decryptJwe(rec.jwe, privateKey);
      out = `<h3>解密成功</h3>
             <p>Header：<code>${JSON.stringify(header)}</code></p>
             <pre>${JSON.stringify(payload, null, 2)}</pre>
             <p class="tip">解密发生在服务端，私钥从未离开服务器；浏览器只经手密文。</p>`;
    } catch (e) {
      out = `<p class="err">解密失败：${e.message}</p>`;
    }
    return res.end(page('用私钥解密 JWE', out + '<p><a class="btn" href="/">返回</a></p>'));
  }

  // ④ 篡改实验：翻转密文中一个字节，GCM 的 Tag 校验会失败
  if (url.pathname === '/tamper') {
    const rec = issued.get(url.searchParams.get('id'));
    if (!rec) return res.end(page('提示', '<p class="err">令牌不存在。<a href="/">重新登录</a></p>'));
    const parts = rec.jwe.split('.');
    const raw = Buffer.from(parts[3], 'base64url');
    raw[0] = raw[0] ^ 0xff; // 篡改密文第一个字节
    parts[3] = raw.toString('base64url');
    const tampered = parts.join('.');

    let result;
    try {
      decryptJwe(tampered, privateKey);
      result = '<p class="err">居然解密成功了？这说明完整性校验失效（不应该发生）</p>';
    } catch (e) {
      result = `<p class="ok">✅ 解密被拒绝：<code>${e.message}</code></p>
                <p class="tip">AES-GCM 的认证标签（Tag）校验失败，说明密文/头部被改过，
                服务器绝不会把这份数据当作可信内容使用。</p>`;
    }
    return res.end(page('篡改密文实验', `
      <h3>原始密文段（Ciphertext）</h3><pre>${parts[3].slice(0, 80)}…</pre>
      <h3>篡改后（首字节取反）</h3><pre>${tampered.split('.')[3].slice(0, 80)}…</pre>
      ${result}
      <p><a class="btn" href="/">返回</a></p>`));
  }

  // ⑤ 对称密钥模式 alg=dir
  if (url.pathname === '/dir-demo') {
    const key = crypto.randomBytes(32);
    const payload = { sub: 'bob', msg: '内部服务间传递的敏感声明', level: 'internal' };
    const jwe = encryptJweDir(payload, key);
    const { payload: decrypted } = decryptJweDir(jwe, key);
    const parts = splitJwe(jwe).map(
      (s) => `<tr><td>${s.name}</td><td>${s.bytes} 字节</td><td><code>${s.value.slice(0, 60)}${s.value.length > 60 ? '…' : ''}</code></td></tr>`
    ).join('');
    return res.end(page('alg=dir（共享对称密钥）',
      `<pre>${jwe}</pre>
       <table><tr><th>段</th><th>长度</th><th>内容</th></tr>${parts}</table>
       <p class="tip">注意第 2 段（EncryptedKey）为空：密钥不是"包裹"过去的，而是双方事先共享一把对称密钥。</p>
       <h3>用同一把密钥解密</h3><pre>${JSON.stringify(decrypted, null, 2)}</pre>
       <p class="warn">dir 模式省掉了 RSA 开销，但密钥必须在签发方和消费方之间安全共享；
       一旦泄露，所有令牌都可被解开。跨组织场景请用 RSA-OAEP / ECDH-ES。</p>
       <p><a class="btn" href="/">返回</a></p>`));
  }

  res.statusCode = 404;
  res.end(page('404', '<p>页面不存在</p>'));
});

server.listen(PORT, () => {
  console.log(`Demo8 已启动: http://localhost:${PORT}`);
  console.log('测试账号: bob/123456 或 alice/abc123');
});
