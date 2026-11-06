# ClashDash

单用户的在线 mihomo（Clash.Meta）配置管理平台：汇聚订阅、管理代理组 / 规则 / 规则集 / 监听器，按配置方案生成订阅链接供客户端拉取。基于 Next.js，可部署到 Vercel Serverless。

## 功能

- **订阅**：支持 Clash YAML、Base64、分享链接（ss / ssr / vmess / vless / trojan / hysteria2 / tuic / wireguard / anytls）。每个订阅可选两种工作模式：
  - `inline`：服务端拉取并解析节点，写入配置的 `proxies`；
  - `provider`：输出为 `proxy-providers`，url 直接指向上游订阅，由客户端拉取。服务端仍会预拉取一份快照，用于节点预览、流量信息和代理组过滤预览。
- **节点处理**（在订阅上配置）：包含 / 排除过滤、重命名、国旗、前后缀。语义与 mihomo `filter` / `exclude-filter` / `override` 一致（支持 `(?i)` 等 Go regexp2 写法）；provider 订阅会编译成原生字段，由客户端执行。
- **节点与监听器**：手动节点（粘贴分享链接或 YAML 导入）和入站监听器全局管理，可在多个配置方案中复用；需要在方案中逐个添加（可排序）才会写入配置。监听器指定的代理组 / 子规则按名称在使用它的方案中解析。
- **配置方案**：基础配置（YAML，保留注释）+ 选用的订阅、手动节点、监听器 + 代理组 + 规则 / 子规则，每个方案对应一个带随机 token 的订阅链接。
- **规则集**：全局管理 rule-providers，方案中只输出实际被引用的规则集。
- **校验与预览**：生成时检查引用、循环、端口冲突、缺少 MATCH 等问题；有错误时订阅接口返回 422，客户端会保留旧配置。
- **内置模板**：基于 MetaCubeX meta-rules-dat 的基础分流。
- **备份**：全部数据导出 / 导入为 JSON。

## 本地开发

```bash
npm install
cp .env.example .env.local   # 修改 ADMIN_PASSWORD / JWT_SECRET
npm run dev
```

不设置 `DATABASE_URL` 时使用内嵌的 PGlite（数据保存在 `.data/pglite`，首次启动自动迁移），无需安装数据库。打开 http://localhost:3000 用 `ADMIN_PASSWORD` 登录。

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm test` | 单元测试（Vitest，数据库测试使用内存 PGlite） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run db:generate` | 修改 `src/db/schema.ts` 后生成迁移 |
| `npm run db:migrate` | 对 `DATABASE_URL` 指向的数据库执行迁移 |
| `npm run db:studio` | Drizzle Studio |

## 部署到 Vercel

1. 创建 Postgres 数据库，推荐 [Neon](https://neon.tech)（Vercel Marketplace 中可一键创建），复制连接串。
2. 执行迁移：

   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   ```

3. 在 Vercel 导入本仓库，设置环境变量：

   | 变量 | 说明 |
   | --- | --- |
   | `DATABASE_URL` | Postgres 连接串（`*.neon.tech` 自动使用 Neon serverless 驱动） |
   | `ADMIN_PASSWORD` | 登录密码 |
   | `JWT_SECRET` | 会话签名密钥，至少 32 位随机字符 |
   | `CRON_SECRET` | 定时任务密钥，Vercel Cron 会以 `Authorization: Bearer` 发送 |

4. 部署。`vercel.json` 中配置了每天一次的定时刷新（Hobby 计划的上限）；此外客户端拉取订阅链接时，超过缓存时长的订阅会按需刷新（单次最多等待 8 秒，失败则沿用上次的节点）。

### 注意

- 部分机场会屏蔽 Vercel 等数据中心 IP，导致服务端拉取失败。此时把该订阅切换为 `provider` 模式，由客户端直接拉取上游。
- 订阅链接即凭据，泄露后可在方案页「重置链接」。

## 技术栈

Next.js 15（App Router、Server Actions）· Drizzle ORM · Postgres / PGlite · Tailwind CSS · shadcn/ui · yaml · zod · Vitest
