/**
 * Demo3 - jwt.js
 * 零依赖 JWT 实现（HS256 = HMAC-SHA256），用于教学。
 * 注意：真实项目请使用成熟库（如 jsonwebtoken），这里为了让你看懂每一步。
 */
const crypto = require('crypto');

const SECRET = 'demo3-secret-do-not-use-in-prod'; // 真实项目放环境变量，且要足够长

// base64url 编码（JWT 用 base64url：+ 换成 -，/ 换成 _，去掉 =）
function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

// 签发 JWT
function sign(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { iat: now, exp: now + 3600, ...payload }; // 默认 1 小时过期

  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(fullPayload));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

// 校验 JWT：返回 { valid, payload, reason }
function verify(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: '格式错误：JWT 必须是三段式' };
  const [head, body, sig] = parts;

  // ① 重算签名比对（防篡改的核心）
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest());
  // 用固定时间的字符串比较，避免时序侧信道（真实项目必须这样做）
  const sigOk =
    sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!sigOk) return { valid: false, reason: '签名校验失败：内容被篡改或密钥不对' };

  // ② 解出载荷
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch {
    return { valid: false, reason: '载荷不是合法 JSON' };
  }

  // ③ 校验过期时间
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: '令牌已过期', payload };
  }

  return { valid: true, payload };
}

module.exports = { sign, verify, b64url, b64urlDecode, SECRET };
