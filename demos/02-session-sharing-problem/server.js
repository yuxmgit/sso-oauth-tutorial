/**
 * Demo2 启动器：同一进程启动两个"独立"应用
 *   应用 A（OA 系统）  : http://localhost:3000
 *   应用 B（Wiki 系统）: http://localhost:3001
 */
const { createApp } = require('./app');

createApp('应用A(OA系统)', 3000, '#36c').listen(3000, () => {
  console.log('应用 A (OA)  : http://localhost:3000');
});

createApp('应用B(Wiki系统)', 3001, '#c33').listen(3001, () => {
  console.log('应用 B (Wiki): http://localhost:3001');
  console.log('\n实验：先在 A 登录 (bob/123456)，再打开 B 的 /profile —— B 不认识你！');
  console.log('再分别访问两个应用的 /debug，观察 Cookie 头与各自独立的 Session 存储。');
});
