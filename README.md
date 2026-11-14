# ClashDash

单用户的在线 mihomo（Clash.Meta）配置管理平台：汇聚订阅、管理代理组 / 规则 / 规则集 / 监听器，按配置方案生成订阅链接供客户端拉取。基于 Next.js，可部署到 Vercel Serverless。

## 功能

- **订阅**：支持 Clash YAML、Base64、分享链接（ss / ssr / vmess / vless / trojan / hysteria2 / tuic / wireguard / anytls）。每个订阅可选两种工作模式：
  - `inline`：通过表单编辑，服务端拉取并解析节点，写入配置的 `proxies`；
  - `provider`：通过 YAML 编辑，输出为 `proxy-providers`，url 直接指向上游订阅，由客户端拉取。服务端仍会预拉取一份快照，用于节点预览、流量信息和代理组过滤预览。
- **节点处理**（在订阅上配置）：包含 / 排除过滤、重命名、国旗、前后缀。语义与 mihomo `filter` / `exclude-filter` / `override` 一致（支持 `(?i)` 等 Go regexp2 写法）；provider 订阅会编译成原生字段，由客户端执行。
- **代理组**：通过 YAML 编辑类型、选项、显式成员、订阅 / 手动节点来源和过滤条件，并预览展开后的节点。
- **节点与监听器**：手动节点（粘贴分享链接或 YAML 导入）和入站监听器全局管理，可在多个配置方案中复用；需要在方案中逐个添加（可排序）才会写入配置。监听器指定的代理组 / 子规则按名称在使用它的方案中解析。
- **配置方案**：基础配置（YAML，保留注释）+ 选用的订阅、手动节点、监听器 + 代理组 + 规则 / 子规则，每个方案对应一个带随机 token 的订阅链接，支持批量删除；订阅、节点、监听器和规则集本体仍全局共享。
- **规则集**：通过 YAML 全局管理 HTTP / inline rule-providers，inline 使用 `payload` 编写内置规则；方案中只输出实际被引用的规则集。
- **工具 / 密码指针**：全局跨方案管理字符串密码，在 YAML 中只能以 `password: *shared-password` 形式作为 `password` 字段的值引用；生成时由服务端展开，最终配置不包含别名。密码指针名称创建后固定，只能逐条编辑值或删除，不提供批量管理；删除有引用的密码指针时，会把各配置对象中的该别名固化为当前字符串并保留注释及其他密码指针别名，此后这些密码不再随密码指针更新。
- **安全设置**：可在设置页修改管理员密码、启用 TOTP 两步验证。密码使用 scrypt 哈希存储；修改密码或切换两步验证后，其他登录会话失效。
- **校验与预览**：生成时检查引用、循环、端口冲突、缺少 MATCH 等问题；有错误时订阅接口返回 422，客户端会保留旧配置。规则列表可插入带可选文本的分隔线，仅用于编辑展示，不写入生成的配置。
- **备份**：配置业务数据导出 / 导入为 JSON，不包含管理员密码、TOTP 密钥或登录状态；恢复时这些认证信息保持不变。

## 本地开发

```bash
npm install
cp .env.example .env.local   # 修改 ADMIN_PASSWORD / JWT_SECRET
npm run dev
```

不设置 `DATABASE_URL` 时使用内嵌的 PGlite（数据保存在 `.data/pglite`，首次启动自动迁移），无需安装数据库。打开 http://localhost:3000 用 `ADMIN_PASSWORD` 完成首次登录。密码初始化后保存在数据库中，之后可在设置页修改；再修改环境变量不会覆盖数据库密码。

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm test` | 单元测试（Vitest，数据库测试使用内存 PGlite） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run preview` | 完整构建后以生产模式启动 |
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
   | `ADMIN_PASSWORD` | 管理员首次初始化密码；初始化后不再作为登录密码覆盖来源 |
   | `JWT_SECRET` | 会话签名密钥，至少 32 位随机字符 |
   | `CRON_SECRET` | 定时任务密钥，Vercel Cron 会以 `Authorization: Bearer` 发送 |

4. 部署。`vercel.json` 中配置了每天一次的定时刷新（Hobby 计划的上限）；此外客户端拉取订阅链接时，超过缓存时长的订阅会按需刷新（单次最多等待 8 秒，失败则沿用上次的节点）。

### 注意

- 部分机场会屏蔽 Vercel 等数据中心 IP，导致服务端拉取失败。此时把该订阅切换为 `provider` 模式，由客户端直接拉取上游。
- 订阅链接即凭据，泄露后可在方案页「重置链接」。
- 丢失认证器时，停止服务后设置一个临时的 `ADMIN_PASSWORD`，在数据库中执行 `DELETE FROM admin_auth WHERE id = 1;`，并轮换 `JWT_SECRET`。重新启动后可使用临时密码重新初始化；轮换签名密钥会使旧会话全部失效。
- 已知遗留：密码和 TOTP 登录接口暂未实现限流；公网部署时应通过平台或反向代理限制请求频率。

## 技术栈

Next.js 15（App Router、Server Actions）· Drizzle ORM · Postgres / PGlite · Tailwind CSS · shadcn/ui · yaml · zod · otplib · Vitest
