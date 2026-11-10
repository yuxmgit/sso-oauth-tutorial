# 术语表（GLOSSARY）

> 遇到陌生名词，先来这里查。中英对照 + 一句话解释。

## 基础概念

| 术语 | 英文 | 一句话解释 |
|------|------|-----------|
| 单点登录 | SSO (Single Sign-On) | 一次登录，访问多个互相信任的系统 |
| 单点登出 | SLO (Single Logout) | 一处登出，所有系统一起登出 |
| 认证 | Authentication | "你是谁"——验证身份（输密码、刷脸） |
| 授权 | Authorization | "你能干什么"——授予访问权限 |
| 会话 | Session | 服务端记住"你已登录"的一段时间 |
| 凭证 | Credential | 证明身份的东西（密码、Cookie、Token） |
| 令牌 | Token | 一段代表权限/身份的字符串 |

## Cookie / Session 相关

| 术语 | 英文 | 一句话解释 |
|------|------|-----------|
| Cookie | Cookie | 浏览器存储、随请求自动携带的小段数据 |
| Session ID | Session ID | 服务端会话的编号，通常放 Cookie 里 |
| 会话存储 | Session Store | 服务端保存会话数据的地方（内存/Redis） |
| HttpOnly | HttpOnly | Cookie 属性：禁止 JS 读取，防 XSS 偷 Cookie |
| Secure | Secure | Cookie 属性：仅 HTTPS 传输 |
| SameSite | SameSite | Cookie 属性：限制跨站请求是否携带 Cookie，防 CSRF |
| Cookie 域 | Cookie Domain | Cookie 只发给匹配的域名（跨域不携带） |

## JWT 相关

| 术语 | 英文 | 一句话解释 |
|------|------|-----------|
| JWT | JSON Web Token | 自包含、可验签的令牌，三段式：头部.载荷.签名 |
| 无状态 | Stateless | 服务端不存会话，靠验签确认令牌合法性 |
| 签名 | Signature | 用密钥对内容做的"防伪印章" |
| 声明 | Claim | JWT 载荷里的一条信息（如 `sub`、`exp`） |
| 过期时间 | exp (expiration) | 令牌失效的时间戳 |
| 刷新令牌 | Refresh Token | 用来换新 Access Token 的长期令牌 |
| JWS | JSON Web Signature | "签名版 JWT"，三段式，内容明文可见，只保证未被篡改 |
| JWE | JSON Web Encryption | "加密版 JWT"，五段式，内容只有持有密钥的一方能读 |
| CEK | Content Encryption Key | 一次性对称内容密钥，JWE 用它加密数据，再用 RSA 包裹传递 |
| 混合加密 | Hybrid Encryption | 非对称算法送密钥 + 对称算法加密数据，JWE/HTTPS 都这么做 |
| 算法标识 | alg / enc | JWE 头部两个必需字段：alg 管密钥怎么给，enc 管内容怎么加密 |
| 认证标签 | Tag (AEAD) | GCM 等算法输出的完整性校验值，密文被改则解密失败 |
| 附加认证数据 | AAD (Additional Authenticated Data) | 参与完整性校验但不加密的头部数据，防"换头攻击" |
| 密钥编号 | kid (Key ID) | 头部里标记用哪把密钥，支持密钥轮换 |
| 公钥 | Public Key | 非对称密钥对中可公开的那一半，用于加密或验签 |
| 私钥 | Private Key | 非对称密钥对中必须保密的那一半，用于解密或签名 |
| 对称密钥 | Symmetric Key | 加密和解密共用同一把钥匙，快但分发困难 |
| 共享密钥 | Shared Secret | 双方事先约定同一把对称密钥（对应 JWE 的 `dir` 模式） |
| 初始化向量 | IV (Initialization Vector) | 每次加密都要新的随机种子，同一密钥下绝不复用 |
| 密钥轮换 | Key Rotation | 定期更换密钥，靠 `kid` 双钥并行实现平滑过渡 |
| 密钥管理服务 | KMS (Key Management Service) | 托管密钥、提供加解密接口的服务，密钥本体不出门 |

## OAuth 相关

| 术语 | 英文 | 一句话解释 |
|------|------|-----------|
| OAuth 2.0 | OAuth 2.0 | 资源所有者授权第三方应用访问其资源的授权框架 |
| 资源所有者 | Resource Owner | 用户本人 |
| 客户端 | Client | 请求授权的第三方应用 |
| 授权服务器 | Authorization Server | 发令牌的服务器 |
| 资源服务器 | Resource Server | 存放受保护资源（API）的服务器 |
| 授权码 | Authorization Code | 一次性中间凭证，用于换取 Access Token |
| 访问令牌 | Access Token | 客户端访问资源 API 的通行证 |
| 重定向 URI | Redirect URI | 授权完成后浏览器被送回的地址 |
| scope | Scope | 申请的权限范围（如 `read:user`） |
| state | State | 随机字符串，防 CSRF 攻击 |
| PKCE | PKCE | 授权码 + 验证码，防授权码被截获（RFC 7636） |
| 隐式模式 | Implicit Flow | OAuth2 旧模式，直接返回 Token，已不推荐 |
| 客户端凭证 | Client Credentials | OAuth2 模式之一：服务对服务，无用户参与 |

## OIDC 相关

| 术语 | 英文 | 一句话解释 |
|------|------|-----------|
| OpenID Connect | OIDC | 建在 OAuth2 之上的身份认证层 |
| ID Token | ID Token | JWT 格式的"身份证"，证明用户是谁 |
| nonce | nonce | 一次性随机数，防 ID Token 重放攻击 |
| 发现文档 | Discovery | `/.well-known/openid-configuration`，自描述端点 |

## CAS / SAML 相关

| 术语 | 英文 | 一句话解释 |
|------|------|-----------|
| CAS | Central Authentication Service | 耶鲁开发的企业级单点登录协议 |
| TGT | Ticket Granting Ticket | CAS 服务端的"全局会话"，存在用户浏览器 Cookie 引用 |
| ST | Service Ticket | CAS 发给具体应用的一次性票据 |
| SAML | Security Assertion Markup Language | 基于 XML 的企业级联合认证协议 |
| 断言 | Assertion | SAML 中"该用户已认证"的 XML 声明 |
| SP | Service Provider | 服务提供方（业务应用） |
| IdP | Identity Provider | 身份提供方（认证中心） |

## 安全相关

| 术语 | 英文 | 一句话解释 |
|------|------|-----------|
| CSRF | Cross-Site Request Forgery | 跨站请求伪造：借用户身份偷偷发请求 |
| XSS | Cross-Site Scripting | 跨站脚本攻击：注入 JS 偷信息 |
| 重定向劫持 | Open Redirect Attack | 诱导授权结果跳到攻击者控制的地址 |
| 中间人攻击 | MITM | 传输链路上截获/篡改数据 |
| 重放攻击 | Replay Attack | 截获合法凭证重复使用 |
