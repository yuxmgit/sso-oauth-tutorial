# 第 6 章：OIDC —— 在 OAuth2 之上叠加"身份认证"

> 配套实验：[Demo6 - OIDC ID Token](../demos/06-oidc-id-token)

## 6.1 OAuth2 的"身份缺口"

第 4 章的 Demo4 有个隐藏问题：客户端拿到 access_token 后调 `/api/userinfo`，
**每个平台返回的格式都不一样**：

- GitHub 返回 `/user`：`{ login, name, email }`
- 微信返回：`{ openid, nickname }`
- Google 返回：`{ sub, email, name }`

客户端问 OAuth2 服务器："这个 Token 是谁？" OAuth2 的回答是："我不知道，我只管授权。"

> 类比：OAuth2 发的是"停车许可"——证明"这辆车被允许停在这里"；
> 但保安想知道"司机是谁"，许可上没写。这就是 OAuth2 的身份缺口。

## 6.2 OIDC 的答案：ID Token

OpenID Connect（OIDC，2014 年发布）在 OAuth2 之上加了一层：

- 新增 `openid` scope；
- 新增 **ID Token**——一个标准 JWT，里面装着用户身份；
- 走的是同样的授权码流程，只是 `/token` 多返回一个 `id_token`。

ID Token 的 Payload 是标准化的：

```json
{
  "iss": "http://localhost:9000",
  "sub": "bob",
  "aud": "web-app",
  "exp": 1730000000,
  "iat": 1729996400,
  "nonce": "n-0S6WzA",
  "name": "Bob 打工人",
  "email": "bob@example.com"
}
```

客户端拿到 ID Token 后**自己本地验签**，验过就知道"这次登录的是 bob"——不再需要额外调 API 问身份。

> 类比：OAuth2 发的是"停车许可"，OIDC 额外发了一张**带公章的驾驶证**——
> 上面印着司机姓名、有效期、防伪编号，保安自己就能验。

## 6.3 nonce：防"身份证被盗用重放"

OAuth2 的 state 防 CSRF；OIDC 的 nonce 防 **ID Token 重放**：

1. 客户端发起授权时生成随机 nonce，随请求发给认证中心，同时自己留一份；
2. 认证中心把 nonce 写进 ID Token；
3. 客户端收到后比对：Token 里的 nonce 必须等于自己当初发出的那个。

这样，攻击者即使截获了一张为"别人"签发的合法 ID Token，也无法冒充自己的登录会话。

## 6.4 Discovery：认证中心的"自我介绍"

OIDC 规定认证中心必须提供发现文档：

```
GET /.well-known/openid-configuration
→ {
    "issuer": "http://localhost:9000",
    "authorization_endpoint": "/authorize",
    "token_endpoint": "/token",
    "userinfo_endpoint": "/userinfo",
    "jwks_uri": "/jwks"
  }
```

客户端不再需要硬编码各端点地址，也不需要读各家文档——一切自动发现。
这就是"接 Google 和接 Auth0 的代码几乎一样"的原因。

## 6.5 OAuth2 vs OIDC 一图总结

| 维度 | OAuth2 | OIDC |
|------|--------|------|
| 回答的问题 | 允许你访问我的什么资源 | 这次登录的用户是谁 |
| 核心产物 | access_token | ID Token（JWT）+ access_token |
| 协议性质 | 授权框架 | 认证协议（构建在 OAuth2 之上） |
| 典型用途 | 调用开放平台 API | 第三方登录、统一身份认证 |

一句话：**"用 OIDC 登录"在底层就是"走了一遍 OAuth2 流程，多拿了一个 ID Token"。**

## 6.6 动手实验（Demo6）

npm start 后打开 http://localhost:3000：

1. 点击"用 OIDC 账号登录"（bob/123456）；
2. 回调页展示三样东西：ID Token、它的解码内容、验签结果；
3. 观察 Payload 里的 iss / sub / aud / nonce / exp；
4. 页面提供"篡改 Payload 再验签"实验：改掉内容后签名校验立即失败；
5. 访问 http://localhost:9000/.well-known/openid-configuration 查看发现文档。

## 6.7 本章小结

- OIDC = OAuth2 + 标准化的身份层（ID Token）；
- ID Token 是 JWT，客户端本地验签即可确认"用户是谁"；
- nonce 防重放，Discovery 让客户端零配置接入；
- 至此两大体系你都能亲手实现了——下一章来搞破坏（安全攻防）。

