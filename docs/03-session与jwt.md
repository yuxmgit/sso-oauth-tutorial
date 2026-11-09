# 第 3 章：Session 与 JWT —— 两种凭证哲学

> 配套实验：[Demo3 - JWT 无状态登录](../demos/03-jwt-login)
> 本章是手写 OAuth2 服务器（第 4 章）的前置知识：授权服务器签发的 Access Token 本质上就是一种凭证，
> 理解了 Session 和 JWT 的取舍，才能理解 Token 该怎么设计。

---

## 3.1 回顾 Session 的哲学："档案柜"

第 1 章我们实现过：凭证 = 档案柜里的档案 + 用户手里的档案编号（Cookie 里的 sid）。

**Session 的特点：**

- ✅ 服务端完全可控：随时删档案（踢人下线、强制注销）；
- ✅ 网络上传输的只是一个无意义编号，不暴露任何用户信息；
- ❌ 服务端要维护存储：单机还好，**集群部署就是灾难**。

### Session 在集群下的尴尬

业务量大了，服务从 1 台扩到 3 台，前面挂 Nginx 负载均衡：

```
Bob 登录 → 请求落到 服务器1 → 档案存在 服务器1 的档案柜
Bob 刷新 → 请求落到 服务器2 → 档案柜里查无此人 → "未登录？！" 😱
```

传统解法有三种，各有代价：

| 方案 | 做法 | 代价 |
|------|------|------|
| Session 黏滞（Sticky） | Nginx 把同一用户固定转发到同一台 | 某台宕机 → 它的用户集体掉线；扩缩容麻烦 |
| Session 复制 | 各服务器互相同步所有 Session | 网络开销大，只适合小集群 |
| 集中存储（Redis） | 所有服务器共享一个 Redis 档案柜 | **主流方案**，但多引入一个必须高可用的组件 |

> **类比**：档案柜放在"中央档案室"（Redis），任何分店都能查——
> 但中央档案室本身就成了命脉，它挂了全场瘫痪。

有没有办法**根本不要档案柜**？把档案直接交给用户自己保管？——这就是 JWT 的哲学。

---

## 3.2 JWT 的哲学："画押的通行证"

**JWT（JSON Web Token，RFC 7519）** 是一段自包含的字符串，长得像这样：

```
eyJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6ImJvYiIsInJvbGUiOiJhZG1pbiJ9.sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

三段式，用 `.` 分隔：

| 段 | 名称 | 内容（Base64URL 编码的 JSON） |
|----|------|------------------------------|
| 第 1 段 | Header（头部） | `{"alg":"HS256","typ":"JWT"}` —— 用什么算法签名 |
| 第 2 段 | Payload（载荷） | `{"sub":"bob","role":"admin","exp":1699999999}` —— 用户信息 + 声明 |
| 第 3 段 | Signature（签名） | `HMAC-SHA256(base64(header) + "." + base64(payload), secret)` |

**核心机制：签名。**

```mermaid
sequenceDiagram
    participant C as 客户端
    participant S as 服务器
    C->>S: ①登录（账号密码）
    S->>C: ②签发 JWT（用 secret 签名）
    Note over C: ③客户端自行保管 JWT（localStorage/Cookie）
    C->>S: ④每次请求带上 JWT
    S->>S: ⑤用同样的 secret 重算签名，比对
    S->>C: ⑥签名一致且未过期 → 认为合法
```

注意第⑤步：服务器**不需要查任何存储**，重算签名对上了就放行。
用户信息（Payload）就写在 Token 里，服务器解开一看：`sub=bob, role=admin`。

> **类比**：Session 是"档案柜 + 编号"，JWT 是**盖了公章的通行证**。
> 门卫（服务器）不用打电话回总部核实，只需看通行证上的公章（签名）是不是真的——
> 公章只有总部有（secret 绝密），伪造不出；证件上写着姓名职位（Payload），一眼即知身份。

### 一个重要的澄清：JWT 的前两段不是加密！

Base64 只是编码，**任何人都能解开看**。所以：

- ✅ 可以放：用户 ID、昵称、角色、过期时间；
- ❌ 绝不能放：密码、手机号、身份证号等敏感信息；
- 需要加密场景要用 JWE（JWT Encrypted），本文不展开。

### Demo3 里的"破坏性实验"

Demo3 实现了一个零依赖的 JWT（用 Node 内置 `crypto` 做 HMAC-SHA256），
并提供了一个 `/tamper` 页面，让你亲手**把 Payload 里的 role 从 user 改成 admin**，
然后观察服务器如何拒绝——因为你在第 2 步改了内容，第 3 段签名就对不上了。

```powershell
cd I:\work-body-dir\sso-oauth-tutorial\demos\03-jwt-login
npm start
```

---

## 3.3 Session vs JWT：一张表看懂取舍

| 维度 | Session | JWT |
|------|---------|-----|
| 状态存储 | 服务端（内存/Redis） | 客户端自持，服务端无状态 |
| 集群友好度 | 需要集中存储或黏滞 | ✅ 天然无状态，随便扩缩容 |
| 注销/踢人 | ✅ 删档案即刻生效 | ❌ 签出去就收不回（除非黑名单，又变成有状态） |
| 传输内容 | 只有随机编号 | 自包含（信息暴露风险注意） |
| 性能 | 每请求查存储 | 每请求算签名（CPU，通常更便宜） |
| 跨域/跨服务 | Cookie 域限制 | ✅ 放 Header 即可，天然跨服务 |
| 典型场景 | 传统网站、对注销强需求 | 微服务间传递身份、OAuth2 的 Token、移动端/小程序 |

**实践建议（业界主流）：**

1. **面向用户的 Web 登录**：Session（或 JWT 存 HttpOnly Cookie）都可以，需要"立即踢人"选 Session；
2. **服务间/微服务**：JWT 是标配——服务 A 签发，服务 B 只需共享验签公钥即可识别身份，无需共享 Session；
3. **用 JWT 时的补救措施**：短有效期（15 分钟~1 小时）+ Refresh Token 换新，把"无法注销"的风险窗口压小；
4. **JWT 存放位置**：Web 端推荐 HttpOnly Cookie（防 XSS 偷取）；放 localStorage 方便但怕 XSS。

---

## 3.4 与 OAuth 的连接点

现在你能看懂 OAuth2 里两个 Token 的设计了：

| OAuth2 中的 Token | 实际形态 | 为什么 |
|------------------|---------|--------|
| Access Token | 通常是 JWT（或随机串） | 资源服务器无状态验签即可放行，集群友好 |
| Refresh Token | 随机串（不透明） | 长期凭证不能自包含！必须存服务端，才能随时吊销 |

> **为什么 Refresh Token 不用 JWT？** 因为它长期有效，一旦签出无法收回。
> 所以用不透明随机串 + 服务端存储——需要吊销时删掉记录即可。
> 这也解释了 3.3 表格里"注销难"问题的标准解法：**短 JWT + 可吊销的 Refresh Token**。

---

## 3.5 动手实验（Demo3）

```powershell
cd I:\work-body-dir\sso-oauth-tutorial\demos\03-jwt-login
npm start
# 访问 http://localhost:3000
```

实验步骤：

1. 登录（bob/123456），获得 JWT；
2. 访问 `/profile`，服务器无状态验签放行；
3. 打开 `/debug/token`，把 JWT 拆成三段逐段解码（页面已帮你解码好）；
4. 打开 `/tamper` 页面，体验"修改 role 后签名校验失败"；
5. `Ctrl+C` 重启服务，再用**同一个 JWT** 访问 `/profile`——依然有效！
   （对比 Demo1：Session 版重启后立刻掉线。这就是"无状态"。）

---

## 3.6 本章小结

- Session = 档案柜 + 编号：可控、可注销，但集群要共享存储；
- JWT = 盖章通行证：无状态、跨服务，但签出难收回、Payload 非加密；
- 短 JWT + Refresh Token（不透明随机串 + 服务端可吊销）是主流组合拳；
- 下一章，我们将用这套知识**从零手写一个完整的 OAuth2 授权码流程**。
