/**
 * Demo7 启动器：授权服务器 + 漏洞版客户端 + 安全版客户端 + 攻击者页面
 *   授权服务器   : http://localhost:9000
 *   漏洞版客户端 : http://localhost:3000（缺 state 校验）
 *   安全版客户端 : http://localhost:3001（state + PKCE）
 *   攻击者页面   : http://localhost:3002
 */
require('./auth-server').start();
require('./client-vuln').start();
require('./client-secure').start();
require('./attacker').start();

console.log('\n靶场已就绪。实验入口：http://localhost:3002（Eve 的攻击页面）');
