/**
 * Demo8 - token.js
 * 零依赖实现两种"令牌形态"：
 *   ① JWS / JWT：只签名（防篡改），payload 明文可见 —— 相当于"明信片"
 *   ② JWE：加密（保密），payload 只有持有私钥的一方能看 —— 相当于"上锁的信封"
 *
 * JWE 紧凑序列化格式（5 段，用 . 分隔）：
 *   BASE64URL(Header) . BASE64URL(EncryptedKey) . BASE64URL(IV) . BASE64URL(Ciphertext) . BASE64URL(Tag)
 */
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (str) => Buffer.from(str, 'base64url');

// ─────────────────────────────────────────────
// ① JWS：签名 JWT（Demo3 用过的东西，这里做对照）
// ─────────────────────────────────────────────
function signJwt(payload, secret, ttlSec = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const h = b64u(JSON.stringify(header));
  const p = b64u(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

function verifyJwt(token, secret) {
  const [h, p, s] = String(token).split('.');
  if (!h || !p || !s) return { valid: false, reason: '格式错误' };
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  if (expected !== s) return { valid: false, reason: '签名不匹配（内容被改过）' };
  const payload = JSON.parse(unb64u(p).toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000))
    return { valid: false, reason: '已过期' };
  return { valid: true, payload };
}

/** 任何人都能"读"JWT 的 payload —— 因为 base64 不是加密 */
function peekJwtPayload(token) {
  try {
    return JSON.parse(unb64u(String(token).split('.')[1]).toString('utf8'));
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// ② JWE：RSA-OAEP-256 包裹密钥 + AES-256-GCM 加密内容（标准五段式）
//
//   alg = RSA-OAEP-256：用接收方公钥加密"内容加密密钥 CEK"，只有私钥能解
//   enc = A256GCM     ：用 CEK 做 AES-GCM 对称加密，速度快，且自带完整性校验(Tag)
// ─────────────────────────────────────────────
function encryptJwe(payloadObj, publicKeyPem, kid = 'demo-key') {
  const protectedHeader = {
    alg: 'RSA-OAEP-256',
    enc: 'A256GCM',
    typ: 'JWT',
    cty: 'JWT',
    kid,
  };
  const headerB64 = b64u(JSON.stringify(protectedHeader));

  // 1) 随机生成一把一次性的对称密钥 CEK（32 字节 = 256 位）
  const cek = crypto.randomBytes(32);

  // 2) 用接收方公钥把 CEK 加密 → encrypted_key（只有接收方私钥能解开）
  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    cek
  );

  // 3) 用 CEK 加密业务数据（AES-256-GCM），AAD 绑定头部（防止换头攻击）
  const iv = crypto.randomBytes(12); // GCM 推荐 96 位随机 IV，绝不复用
  const cipher = crypto.createCipheriv('aes-256-gcm', cek, iv);
  cipher.setAAD(Buffer.from(headerB64, 'ascii'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payloadObj), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16 字节认证标签

  return [
    headerB64,
    b64u(encryptedKey),
    b64u(iv),
    b64u(ciphertext),
    b64u(tag),
  ].join('.');
}

function decryptJwe(token, privateKeyPem) {
  const parts = String(token).split('.');
  if (parts.length !== 5) throw new Error('不是合法的 JWE 紧凑序列化（应为 5 段）');
  const [h, ek, iv, ct, tag] = parts;

  const header = JSON.parse(unb64u(h).toString('utf8'));
  if (header.alg !== 'RSA-OAEP-256' || header.enc !== 'A256GCM')
    throw new Error(`不支持的算法组合：${header.alg} / ${header.enc}`);

  // 1) 私钥解出 CEK
  const cek = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    unb64u(ek)
  );

  // 2) 用 CEK 解密，并校验 Tag（被篡改会在这里抛错）
  const decipher = crypto.createDecipheriv('aes-256-gcm', cek, unb64u(iv));
  decipher.setAAD(Buffer.from(h, 'ascii'));
  decipher.setAuthTag(unb64u(tag));
  const plaintext = Buffer.concat([decipher.update(unb64u(ct)), decipher.final()]);

  return { header, payload: JSON.parse(plaintext.toString('utf8')) };
}

// ─────────────────────────────────────────────
// ③ JWE 的另一种常见形态：alg = "dir"（直接共享一把对称密钥）
//    适合"签发方和消费方本来就是同一个可信系统"的内部场景，没有 RSA 开销。
//    此时 encrypted_key 段为空字符串。
// ─────────────────────────────────────────────
function encryptJweDir(payloadObj, key32) {
  const headerB64 = b64u(JSON.stringify({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' }));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key32, iv);
  cipher.setAAD(Buffer.from(headerB64, 'ascii'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payloadObj), 'utf8'),
    cipher.final(),
  ]);
  return [headerB64, '', b64u(iv), b64u(ciphertext), b64u(cipher.getAuthTag())].join('.');
}

function decryptJweDir(token, key32) {
  const [h, ek, iv, ct, tag] = String(token).split('.');
  if (ek !== '') throw new Error('alg=dir 时 encrypted_key 段必须为空');
  const header = JSON.parse(unb64u(h).toString('utf8'));
  if (header.alg !== 'dir' || header.enc !== 'A256GCM') throw new Error('算法不支持');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key32, unb64u(iv));
  decipher.setAAD(Buffer.from(h, 'ascii'));
  decipher.setAuthTag(unb64u(tag));
  const plaintext = Buffer.concat([decipher.update(unb64u(ct)), decipher.final()]);
  return { header, payload: JSON.parse(plaintext.toString('utf8')) };
}

/** 拆解 JWE 五段，便于页面展示 */
function splitJwe(token) {
  const parts = String(token).split('.');
  const names = ['Header', 'EncryptedKey', 'IV', 'Ciphertext', 'Tag'];
  return parts.map((v, i) => ({
    name: names[i] || `Part${i + 1}`,
    value: v,
    bytes: v ? unb64u(v).length : 0,
  }));
}

module.exports = {
  signJwt, verifyJwt, peekJwtPayload,
  encryptJwe, decryptJwe,
  encryptJweDir, decryptJweDir,
  splitJwe,
};
