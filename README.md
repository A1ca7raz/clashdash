# ClashDash

ClashDash 是一个面向 Mihomo 的结构化配置管理器。它维护 Node、Provider、RulePack 与 Profile，生成确定性的 Clash YAML，并通过可撤销的固定订阅 URL 分发。

核心数据约束：

- Rule 只内联存在于 Profile 或 RulePack；RulePack 保存完整 Rule。
- Profile 中的 ProxyGroup 是对象，不是卡片或 YAML 字符串。
- Profile API 返回完整关联对象，数据库只保存稳定关联 ID。
- ImportProvider 节点只由刷新流程修改；UserDefinedNode 可独立编辑。
- 实体没有 `createdAt`、`updatedAt`、`version`，保存采用最后写入覆盖。
- 订阅 Token 的明文可由管理接口重复读取；数据库保存摘要与 AES-GCM 加密密文。

## 本地快速开始（SQLite）

需要 Node.js 24+、pnpm 11+。

```bash
pnpm install
cp .env.example .env
```

设置两个 Secret：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

将 base64url 值用于 `CLASHDASH_TOKEN_KEY`，另一个至少 32 字节的随机值用于 `CLASHDASH_JWT_SECRET`。加载环境变量后：

```bash
npm run migrate
npm run dev:server
npm run dev:ui
```

当数据库中没有用户时，启动过程自动使用 `CLASHDASH_ADMIN_USERNAME`（默认 `admin`）和必填的 `CLASHDASH_ADMIN_PASSWORD` 创建唯一管理员。没有公开初始化接口；数据库已有用户时，修改环境变量不会重置其密码。登录后可从侧栏“账户安全”修改密码。

Vite UI 默认使用开发端口；生产构建执行 `npm run build`，然后 `npm start`，本地服务会同时提供 `public/` 静态文件和 API。

## Demo 数据

加载与服务端相同的环境变量后，可显式写入一套演示数据：

```bash
npm run seed:demo
```

该命令不会在正常启动时自动执行。它使用 `demo-*` 固定 ID 幂等写入 4 个节点（其中 2 个为 Provider 只读节点）、1 个 ImportProvider、1 个 PassthroughProvider、1 个 RulePack、1 个完整 Profile 和 1 个订阅 Token。重复执行会恢复这些 Demo 对象的预设内容，同时保留其他用户数据和已有 Demo Token。

演示地址均使用 `example.com`，用于展示模型和 UI，不是真实订阅；点击 ImportProvider 的刷新会失败并保留现有演示节点。不要在生产数据库执行该命令。

## PostgreSQL

设置：

```dotenv
CLASHDASH_DATABASE_DIALECT=postgres
DATABASE_URL=postgres://user:password@host:5432/clashdash
```

然后运行 `npm run migrate`。PostgreSQL 使用 JSONB 保存聚合值；Provider 节点替换位于事务中，并使用 Provider 级 advisory lock 串行化多实例提交。

## Vercel

Vercel 模式只允许 PostgreSQL。配置 `DATABASE_URL`、`CLASHDASH_JWT_SECRET`、`CLASHDASH_TOKEN_KEY`、`CLASHDASH_ADMIN_PASSWORD`，可选配置 `CLASHDASH_ADMIN_USERNAME` 和独立的 `CLASHDASH_CRON_SECRET`。`api/index.ts` 导出与本地相同的 Hono 应用；Vercel 使用 no-op 进程内调度器。

外部调度器可调用：

```text
POST /api/cron/providers/refresh
X-Cron-Secret: <CLASHDASH_CRON_SECRET>
```

Cron Secret、管理 JWT、SubscriptionToken 三类凭证不能互换。

## Provider 兼容范围

Provider 内部字段使用小驼峰：`excludeFilter`、`excludeType`、`udpOverTcp`、`skipCertVerify`、`additionalPrefix`、`proxyName`、`overrideExpr` 等；生成 Mihomo YAML 时转换为横线命名。

Filter 执行顺序为 `excludeType` → `excludeFilter` → `filter`，并在 Override 修改名称之前执行。Override 顺序为固定字段 → `proxyName` → 前缀 → 后缀 → `overrideExpr`。详细边界见 [Provider 兼容说明](docs/compat/mihomo-provider-patterns.md)。

## 安全说明

- 管理接口使用 24 小时 HS256 JWT，固定校验 issuer 与 audience。
- 密码使用带随机 Salt 的 scrypt 哈希持久化，数据库不保存明文；修改密码不设置最低长度或字符复杂度。
- 可选 TOTP 兼容 RFC 6238（SHA-1、6 位、30 秒），启用后登录、修改密码和停用 TOTP 都需要动态验证码。
- TOTP Secret 使用 AES-256-GCM 加密持久化。建议单独设置 32 字节 base64url 的 `CLASHDASH_TOTP_KEY`；未设置时回退到 `CLASHDASH_TOKEN_KEY`。
- SubscriptionToken 是由 `a-z0-9-_` 组成的 32 位密码学随机字符串；公开订阅端点为 `GET /api/profile?apikey=<token>`。订阅鉴权只查摘要，管理读取才解密密文。
- 更换 `CLASHDASH_TOKEN_KEY` 后，已有 Token 密文无法恢复；更换实际用于 TOTP 的密钥后，已绑定的 TOTP 也无法验证。
- 不要把 Authorization、JWT、密码或 Token 写入反向代理访问日志。

TOTP 当前不生成恢复码。如果身份验证器和仍有效的管理登录都丢失，运维人员需要直接在数据库中将 `users.totp_enabled` 设为 false/0，并清空 `totp_secret_encrypted`，随后重新登录并绑定。

## 验收

```bash
npm run typecheck
npm test
npm run build
```

NixOS 上运行浏览器测试时可指定系统 Chromium：

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)" npm run test:e2e
```

若已安装 Mihomo，可将 Profile 预览保存后执行：

```bash
mihomo -t -f generated-profile.yaml
```
