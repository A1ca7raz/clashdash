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

2. 默认使用 PGlite，无需安装数据库，启动时自动迁移。生产环境应持久化 `.data` 目录。若使用 Postgres，请设置 `DATABASE_URL` 并执行：

   ```bash
   npm run db:migrate
   ```

3. 构建并启动：

   ```bash
   npm run build
   npm start
   ```

Node.js 部署会自动运行内建 Cron，每 30 秒检查一次，并按各订阅的刷新间隔拉取更新，无需额外配置定时任务。

### Vercel

1. 创建 Postgres 数据库，在 Vercel 项目中配置 `DATABASE_URL`、`ADMIN_INITIAL_PASSWORD` 和 `JWT_SECRET`。
2. 在本地或 CI 中执行数据库迁移：

   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   ```

3. 导入仓库并完成部署。

Vercel 不运行内建 Cron。如需定时刷新，请设置 `CRON_SECRET`，并使用自己的定时任务调用：

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.example/api/cron/refresh
```

客户端拉取配置时只读取已保存的节点快照，不会临时拉取上游订阅。

## 开发环境

```bash
npm ci
cp .env.example .env.local
npm run dev
```

启动前修改 `.env.local` 中的 `ADMIN_INITIAL_PASSWORD` 和 `JWT_SECRET`。开发环境默认使用 `.data/pglite` 中的内嵌数据库，首次启动自动迁移。

打开 http://localhost:3000 ，使用 `ADMIN_INITIAL_PASSWORD` 登录。管理员初始化后，可在设置页修改密码；之后修改该环境变量不会覆盖已有密码。
