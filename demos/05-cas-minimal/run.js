/**
 * Demo5 启动器：CAS 服务器 + 两个接入应用
 *   CAS 服务器 : http://localhost:8000
 *   应用1 (OA) : http://localhost:3000
 *   应用2 (Wiki): http://localhost:3001
 */
require('./cas-server').start();
require('./app').createApp('应用A(OA系统)', 3000, '#36c').listen(3000, () => {
  console.log('应用 A (OA)  : http://localhost:3000');
});
require('./app').createApp('应用B(Wiki系统)', 3001, '#c33').listen(3001, () => {
  console.log('应用 B (Wiki): http://localhost:3001');
  console.log('\n实验：A 登录一次，B 免登录直接进 —— 这就是 CAS 的"单点"效果。');
});
