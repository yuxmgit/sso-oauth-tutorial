/**
 * Demo4 启动器：一键启动三个服务
 *   客户端(PrintShop)  : http://localhost:3000
 *   授权服务器         : http://localhost:9000
 *   资源服务器         : http://localhost:9001
 */
require('./client').start();
require('./auth-server').start();
require('./resource-server').start();

console.log('\n三个服务已全部启动，浏览器打开 http://localhost:3000 开始实验。');
console.log('流程：点击"用 OAuth 账号登录" → 授权服务器登录(bob/123456) → 同意授权 → 回调显示用户信息。');
console.log('终端会实时打印每个服务的请求日志，对照文档观察 code / token 的流动。');
