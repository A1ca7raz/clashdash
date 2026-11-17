# ClashDash

ClashDash 是一个单用户 mihomo 配置管理平台，用于管理订阅、节点与规则，并生成可供客户端拉取的配置链接。

## 部署

### Node.js 自托管

1. 安装依赖并准备环境变量：

   ```bash
   npm ci
   cp .env.example .env.local
   ```

   编辑 `.env.local`，设置 `ADMIN_INITIAL_PASSWORD` 和 `JWT_SECRET`；其余变量按需要填写。

2. 默认使用 PGlite，无需安装数据库，启动时自动迁移。生产环境应持久化 `.data` 目录。若使用 Postgres，请设置 `DATABASE_URL`；全空数据库会在首次登录验证初始密码后自动迁移，也可提前执行 `npm run db:migrate`。

3. 构建并启动：

   ```bash
   npm run build
   npm start
   ```

Node.js 部署会自动运行内建 Cron，每 30 秒检查一次，并按各订阅的刷新间隔拉取更新，无需额外配置定时任务。

### Vercel

1. 创建 Postgres 数据库，在 Vercel 项目中配置 `DATABASE_URL`、`ADMIN_INITIAL_PASSWORD` 和 `JWT_SECRET`。
2. 全空数据库可在首次登录时自动初始化，也可提前在本地或 CI 中执行：

   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   ```

3. 导入仓库并完成部署。

Vercel 不运行内建 Cron。如需定时刷新，请设置 `CRON_SECRET`，并使用自己的定时任务调用：

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.example/api/cron/refresh
```

客户端拉取配置时只读取已保存的节点快照，不会临时拉取上游订阅。任何表缺失都会进入初始化流程，但仅全空数据库会自动迁移；部分缺表需要人工修复，不会被自动改写。

## 安全说明

- **登录保护**：可选接入 Cloudflare Turnstile（设置 `TURNSTILE_SITE_KEY` 与 `TURNSTILE_SECRET_KEY` 后登录需通过人机验证）。未配置 Turnstile 时登录接口没有硬性限流，仅 TOTP 步骤有失败次数限制（攻击者可重新提交密码绕过，属纵深防御），请为 `ADMIN_INITIAL_PASSWORD` 与管理密码选择高强度口令。
- **密码找回**：`ADMIN_OVERRIDE_PASSWORD` 为一次性恢复变量。设置后首次启动/访问即重置管理密码并清除两步验证，随后整个服务进入锁定状态；移除该变量并重新部署/重启后，用该密码登录。请勿在数据库初始化完成前设置它。
- **订阅抓取**：默认拒绝指向环回/内网/保留地址的订阅 URL（含重定向后的每一跳），响应体上限 10MB（`SUBSCRIPTION_MAX_BYTES` 可调）。订阅转换器部署在局域网时设置 `SUBSCRIPTION_ALLOW_PRIVATE_NETWORK=1` 放行。已知残余风险：域名在校验与连接之间可能被重新解析（DNS rebinding/TOCTOU）。
- **响应头**：生产环境启用 CSP 等安全响应头；CSP 目前为 `script-src 'unsafe-inline'` 的折中策略，nonce 化严格 CSP 为后续工作。

## 开发环境

```bash
npm ci
cp .env.example .env.local
npm run dev
```

启动前修改 `.env.local` 中的 `ADMIN_INITIAL_PASSWORD` 和 `JWT_SECRET`。开发环境默认使用 `.data/pglite` 中的内嵌数据库，首次启动自动迁移。

打开 http://localhost:3000 ，使用 `ADMIN_INITIAL_PASSWORD` 登录。管理员初始化后，可在设置页修改密码；之后修改该环境变量不会覆盖已有密码。
