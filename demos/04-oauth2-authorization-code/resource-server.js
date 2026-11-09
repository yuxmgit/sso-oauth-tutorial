/**
 * Demo4 - resource-server.js（资源服务器，端口 9001）
 *
 * 职责：校验 Bearer Token（本地验签 JWT，无需回调授权服务器），返回用户资料。
 * 这就是"为什么 access_token 用 JWT"——资源服务器无状态、可横向扩容。
 */
const http = require('http');
const { verify } = require('./jwt');

const PORT = 9001;

function start() {
  http
    .createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      console.log(`[resource] ${req.method} ${url.pathname}`);

      if (url.pathname !== '/api/userinfo') {
        res.statusCode = 404;
        return res.end('Not Found');
      }

      // 从 Authorization: Bearer xxx 提取令牌
      const auth = req.headers.authorization || '';
      if (!auth.startsWith('Bearer ')) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Bearer');
        return res.end(JSON.stringify({ error: 'no_token', error_description: '缺少 Bearer Token' }));
      }

      // 本地验签（资源服务器知道共享密钥即可，不依赖授权服务器在线）
      const result = verify(auth.slice(7));
      if (!result.valid) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'invalid_token', error_description: result.reason }));
      }
      if (!result.payload.scope || !result.payload.scope.includes('profile')) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: 'insufficient_scope', error_description: '缺少 profile 权限' }));
      }

      // 模拟从数据库取用户资料
      const users = { bob: { nickname: 'Bob 打工人', email: 'bob@example.com' } };
      const u = users[result.payload.sub] || { nickname: '未知用户', email: '-' };

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ username: result.payload.sub, ...u, scope: result.payload.scope }));
    })
    .listen(PORT, () => console.log(`资源服务器(resource-server): http://localhost:${PORT}`));
}

module.exports = { start };
if (require.main === module) start();
