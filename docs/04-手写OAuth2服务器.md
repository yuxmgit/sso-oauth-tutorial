# 第 4 章：从零手写 OAuth2 授权码流程（核心实战）

> 配套实验：[Demo4 - 手写 OAuth2](../demos/04-oauth2-authorization-code)
> 本章是全教程的"毕业设计"：授权服务器、资源服务器、客户端三个角色全部亲手实现。
> 建议先读完第 2 章（协议理论）再动手。

## 4.1 我们要造什么

启动方式（零依赖，无需 npm install）：

```powershell
cd I:\work-body-dir\sso-oauth-tutorial\demos\04-oauth2-authorization-code
npm start
```

三个服务：客户端 `localhost:3000`（PrintShop）、授权服务器 `localhost:9000`、
资源服务器 `localhost:9001`。同一终端会打印各自的请求日志——
**强烈建议边操作边看日志**，你会亲眼看到 code 和 token 如何在服务之间流动。

架构与端口对应源码文件：

| 服务 | 文件 | 端口 | 职责 |
|------|------|------|------|
| 客户端 | client.js | 3000 | 发起授权、收 code、换 Token、调 API |
| 授权服务器 | auth-server.js | 9000 | 登录+授权页、签发 code、签发双令牌 |
| 资源服务器 | resource-server.js | 9001 | 验 Bearer Token，返回 /api/userinfo |

## 4.2 第一步：客户端发起授权

浏览器打开 `http://localhost:3000`，点击"用 OAuth 账号登录"。
客户端做的事情（client.js 的 `startLogin`）：

1. 生成随机字符串 `state`（防 CSRF，先记住它，第 7 章细讲）；
2. 把 state 存进自己的 Cookie（`oauth_state`），等回调时比对；
3. 302 重定向到授权服务器：

```
http://localhost:9000/authorize
  ?response_type=code
  &client_id=web-app
  &redirect_uri=http://localhost:3000/callback
  &scope=profile
  &state=x7f3a...
```

> **为什么 redirect_uri 必须精确匹配？**
> 授权服务器有"客户端注册表"（auth-server.js 的 `clients` 对象），
> redirect_uri 不在名单里直接拒绝——否则攻击者可伪造跳转地址截获 code（第 7 章演示）。

## 4.3 第二步：授权服务器验证身份 + 索要授权

浏览器落在 auth-server 的 `/authorize` 页面：

1. **校验参数**：client_id 存在？redirect_uri 精确匹配？response_type=code？不对就拒绝；
2. **展示登录页**：Bob 输入 `bob / 123456`（密码只交给授权服务器，客户端永远碰不到）；
3. **展示"授权书"**："PrintShop 申请获取你的昵称与邮箱（scope: profile），是否同意？"

这一步在真实世界里，就是你在微信里看到的那个授权弹窗：
> 微信读书申请获取你的：昵称、头像、地区 [允许] [拒绝]

**登录成功后，用户在授权服务器眼里就是"已认证的全局会话"**——
这是将来 SSO"第二次免登录"的伏笔（第 5、6 章展开）。

## 4.4 第三步：签发授权码，浏览器带回客户端

Bob 点击"同意授权"后（auth-server.js 的 `handleGrant`）：

```js
const code = crypto.randomBytes(16).toString('hex');
codes.set(code, {
  clientId, redirectUri, user: 'bob', scope: 'profile',
  expiresAt: Date.now() + 10 * 60 * 1000,   // 10 分钟有效
});
res.setHeader('Location', `${redirectUri}?code=${code}&state=${state}`);
```

三个安全细节：

- **code 存在服务端 Map 里**，URL 里带的只是"领取凭证"，不是凭证本身；
- **10 分钟过期**：给攻击者的时间窗口极小；
- 回跳时**把 state 原样带回**，客户端要核对。

浏览器自动跳转到 `http://localhost:3000/callback?code=xxx&state=xxx`。

## 4.5 第四步：客户端后端拿 code 换 Token（服务器对服务器）

client.js 的 `handleCallback` 做了三件事：

**① 校验 state（防 CSRF 的关键一行）：**

```js
if (!state || state !== cookies.oauth_state) {
  return res.end('❌ state 校验失败！可能遭遇 CSRF 攻击');
}
```

**② POST 到授权服务器的 /token（带 client_secret！）：**

```
POST http://localhost:9000/token
  grant_type=authorization_code
  code=xxx
  client_id=web-app
  client_secret=web-app-secret
  redirect_uri=http://localhost:3000/callback
```

**③ 授权服务器验证后签发双令牌（auth-server.js 的 `handleToken`）：**

```js
const record = codes.get(code);
codes.delete(code);          // 一次性！无论成败先作废，防重放
const accessToken  = sign({ sub: 'bob', scope: 'profile' }, 3600); // JWT
const refreshToken = crypto.randomBytes(24).toString('hex'); // 不透明随机串
```

还记得第 3 章的结论吗？**短 JWT + 不透明 Refresh Token**——实现完全一致。
返回的 JSON（只经过服务器之间，浏览器看不见）：
`{ access_token, token_type: "Bearer", expires_in: 3600, refresh_token }`

## 4.6 第五步：客户端拿 Token 调资源服务器

```
GET http://localhost:9001/api/userinfo
Authorization: Bearer TOKEN
```

resource-server.js 的核心是**本地验签**：

```js
const result = verify(auth.slice(7));
if (!result.valid) return 401;
```

资源服务器**不依赖授权服务器在线**，只用共享密钥本地验签——
这正是 Token 用 JWT 的意义：无状态、可横向扩容。

## 4.7 动手实验清单

1. `npm start` 后打开 `http://localhost:3000`，完成"登录 → 同意授权 → 回调"全流程；
2. **盯着终端日志**，数一数浏览器发了几个请求、服务器之间发了几个请求；
3. 重放实验：拿到回调 URL（含 code）后立刻刷新一次，
   `/token` 会返回 `invalid_grant`，亲眼见证"code 一次性"；
4. 把 `sign(..., 3600)` 改成 `sign(..., 10)`，观察 Token 过期后返回 401。

## 4.8 本章小结

- 授权码模式五步：发起 → 登录授权 → 发 code → code 换 Token → 调 API；
- 关键安全点：redirect_uri 精确匹配、code 一次性、state 防 CSRF；
- 双令牌设计：短 JWT + 长随机串。



