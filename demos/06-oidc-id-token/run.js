/**
 * Demo6 启动器：OIDC 认证中心 + 客户端
 *   认证中心: http://localhost:9000
 *   客户端   : http://localhost:3000
 */
require('./auth-server').start();
require('./client').start();
console.log('\n实验：打开 http://localhost:3000，点击登录(bob/123456)，');
console.log('观察回调页的 ID Token 解码与四项本地校验（签名/iss/aud/nonce）。');
