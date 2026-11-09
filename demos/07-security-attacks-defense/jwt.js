/**
 * Demo4 - jwt.js
 * 零依赖 JWT（HS256）：授权服务器签发 access_token，
 * 资源服务器用同一密钥验签即可放行 —— 无状态、可跨服务。
 */
const crypto = require('crypto');

const SECRET = 'demo4-shared-secret-do-not-use-in-prod';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}
function hmac(data) {
  return b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
}

function sign(payload, expiresInSeconds = 3600) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ iat: now, exp: now + expiresInSeconds, ...payload }));
  return `${header}.${body}.${hmac(`${header}.${body}`)}`;
}

function verify(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: '格式错误' };
  const [head, body, sig] = parts;
  const expected = hmac(`${head}.${body}`);
  const sigOk =
    sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!sigOk) return { valid: false, reason: '签名校验失败' };
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch {
    return { valid: false, reason: '载荷非法' };
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: '令牌已过期', payload };
  }
  return { valid: true, payload };
}

module.exports = { sign, verify };
