# ClashDash 设计稿

- 日期: 2026-07-15
- 状态: Draft (待用户审阅)
- 范围: 一个管理并下发 clash/mihomo 客户端与服务端配置的 Web 服务, 单用户, 多 Profile, 兼容本地与 Vercel 部署, 所有功能模块实现接口抽象

---

## 1. 背景与目标

ClashDash 是一个供单用户使用的 Web 服务, 用于:

1. 管理代理节点池 (手动录入 + 从外部订阅 URL 拉取导入)
2. 管理规则与规则包
3. 管理 ProxyProvider (订阅来源, 透传或导入两种模式)
4. 通过组合节点 / proxy-groups / rules / providers 形成 Profile (一份最终配置配方)
5. 通过固定订阅 URL 下发 Profile 对应的配置给客户端或 VPS 上的 mihomo 服务端

技术约束:
- 单用户
- Node.js, TypeScript, ESM
- 兼容本地 (node 进程) 与 Vercel 部署
- 所有功能模块实现接口抽象 (定义接口 + 可替换适配器)
- 存储抽象, 提供两个适配器: Postgres, SQLite
- Web 框架: Hono
- 前端: React + Vite + Tailwind, 极简管理 UI

---

## 2. 分层架构与接口抽象

四层, 每层依赖通过构造注入, 适配器可替换:

```
+--------------------------------------------------------+
|  UI 层 (React SPA, Vite 构建, 静态资源由 Hono serve)    |
+----------------------+---------------------------------+
                       | REST / JSON
+----------------------v---------------------------------+
|  API 层 (Hono routes + JWT 中间件 + 订阅 token 鉴权)   |
+----------------------+---------------------------------+
                       | 调用
+----------------------v---------------------------------+
|  服务层 (应用服务, 编排领域对象)                        |
|  AuthService / NodePoolService / ProviderService /     |
|  RuleService / RulePackService / ProfileService /      |
|  SubscriptionService                                   |
+----------------------+---------------------------------+
                       | 依赖 (构造注入)
+----------------------v---------------------------------+
|  基础设施接口 (可替换适配器)                            |
|  - IStorage                (Postgres / SQLite)         |
|  - INodeSource             (Manual / Provider 拉取)    |
|  - IConfigRenderer         (ClashYaml)                |
|  - ITokenizer              (Clash yaml / uri / base64 三种订阅解析)  |
|  - IPasswordHasher / IJwtIssuer                        |
|  - ICronScheduler          (node-cron / Vercel no-op)  |
+--------------------------------------------------------+
```

每个"功能模块"对应一个服务 + 一组接口适配器, 通过接口注入, 满足"所有功能模块实现接口抽象"的硬要求。

---

## 3. 领域模型

### 3.1 User

单用户系统, 仅一个 User 实体:
- `username: string`
- `passwordHash: string`

登录换取 JWT 用于管理 API 鉴权; JWT 与订阅 token (见 3.7) 是两套独立鉴权。

### 3.2 Node (节点池)

节点池统一存放 manual 与 provider 两类节点:

```
Node {
  id: string
  name: string
  tags: string[]
  source: 'manual' | providerId   // 来源; manual 用户录入, provider 由订阅导入
  readOnly: boolean                // manual=false 可编辑/删除; provider=true 不可改
  protocol: 'hysteria2' | 'shadowsocks' | 'vmess' | 'trojan' | 'tuic' | 'ssr' | ...
  proxyParams: object             // 渲染客户端 proxies: 段时直接用 (type/server/port/...)
  listenerDerivation: {
    enabled: boolean               // 是否具备派生 listener 的能力
                                   // 仅 manual 节点可由用户开启; provider 节点强制 false
    params?: object                // 开启后用户填入: listen 地址, port, 额外 listener 字段
  }
  createdAt: number
}
```

语义要点:
- 节点本质是"一条代理服务"的客户端参数 (`proxyParams`) + 可选的服务端派生能力 (`listenerDerivation`)
- `listenerDerivation` 是 **节点池层面的能力声明**, 描述"该节点是否具备派生 listener 的能力以及派生所需参数"; 并不直接写入 Profile 的 listeners 段
- 用户可在 Profile 层面决定是否将具备派生能力的节点实际派生为 listener (见 3.6 Profile.listeners)
- provider 节点只读, 无法由用户补服务端参数, 因此 listener 派生能力强制关闭 -- provider 节点只能出现在客户端 `proxies:` 段
- `listenerDerivation.params` 是用户持久化输入; 渲染时由 IConfigRenderer 按 `protocol + params` 合成 listener 条目, 合成结果不回写 Node

### 3.3 ProxyProvider (订阅来源)

```
ProxyProvider {
  id: string
  name: string
  passthrough: boolean            // true=透传, false=导入
  url: string                     // 远程订阅 URL, 必填
  format: 'clash' | 'uri' | 'base64'   // 仅 passthrough=false 时生效, 决定解析方式
  interval: number                // 刷新间隔秒; 本地模式生效, Vercel 模式忽略
  filter?: string[]               // 导入模式: 节点过滤正则数组 (元素之间 OR, 元素内部按正则匹配)
  excludeFilter?: string[]        // 导入模式: 排除匹配的节点 (数组 OR, 元素内部正则)
  excludeType?: string[]          // 导入模式: 按节点 protocol 排除 (字串精确匹配, 不支持正则)
  override?: {                    // 导入模式: 节点名称覆写
    additionalPrefix?: string     // 节点名称添加前缀
    additionalSuffix?: string     // 节点名称添加后缀
  }
  extraParams?: object            // passthrough=true 模式专用: 其它原样合并到 proxy-providers 段的字段
                                  // (如 health-check, payload-path/schema v1 不实现)
  createdAt: number
}
```

两种工作模式由 `passthrough` 区分:

- **passthrough=true (透传模式)**
  - 服务端不解析订阅内容
  - Provider 配置直接写入 Profile 的 `proxy-providers:` 段
  - 输出时固定 `type: http`, 其它字段由 `extraParams` 原样合并
  - 不产生 Node 入池

- **passthrough=false (导入模式)**
  - 服务端按 `interval` 拉取 URL, 调用 ITokenizer 按 `format` 解析为 Node 列表
  - 应用 `filter` / `excludeFilter` / `excludeType` / `override` 处理后入库
  - 入库 Node `source=providerId, readOnly=true`
  - 刷新时按 provider 整批替换该 provider 名下的旧节点

导入模式支持解析三种订阅格式:
- Clash YAML
- URI 列表 (如 `hysteria2://...`, `ss://...`)
- Base64 编码的 URI 列表

### 3.4 Rule (路由规则)

```
Rule {
  id: string
  type: 'DOMAIN' | 'DOMAIN-SUFFIX' | 'DOMAIN-KEYWORD' | 'IP-CIDR' | 'IP-CIDR6' |
         'GEOIP' | 'GEOSITE' | 'PROCESS-NAME' | 'MATCH' | ...
  match?: string                  // 类型对应匹配值; 仅 MATCH 类型留空
  target: string                  // 规则策略: DIRECT / REJECT / ProxyGroup name / ...
  noResolve?: boolean
}
```

Rule 是独立实体, 拥有自己的 CRUD (见 6.4); 可被 RulePack 引用, 也可直接被 Profile 的 ruleRefs 引用。

### 3.5 RulePack (规则包)

```
RulePack {
  id: string
  name: string
  rules: string[]             // 引用 Rule id + 顺序; 包内规则不嵌套包
}
```

- 独立于 Profile 存在, 可跨 Profile 复用
- 包内只含 Rule id 引用, 不嵌套 RulePack
- Rule 本身是独立实体, RulePack 改动只更新 `rules` 数组; Rule 字段改动通过独立 CRUD 完成

### 3.6 Profile (配置配方)

```
Profile {
  id: string
  name: string
  tags: string[]
  note?: string
  extraConfig: string             // 顶层 misc 字段 (mixed-port/allow-lan/mode/log-level/dns/hosts/...)
                                  // 的原始 yaml 文本; 保留透传字段, 由 Renderer 解析为顶层键
  nodeRefs: string[]             // Node id 引用 + 顺序; 仅存 id, 渲染时实时查节点池
  listeners: ListenerEntry[]    // 实际写入配置文件 listeners: 段的对象列表 (schema 见下, v1 待定)
  proxyGroups: [{
    id: string
    name: string                 // 卡片显示名 (供 UI)
    payload: string              // 完整 proxy-group 对象的 yaml 文本
                                  // 内含 name/type/proxies/url/interval/...
  }]
  ruleRefs: Array<               // 顺序敏感, 混排; 仅对 RulePack 是引用跟随
    | { type: 'rulePack', id: string }
    | { type: 'rule', id: string }
    | { type: 'inlineRule', rule: Rule }   // 行内新建规则不入 Rule 表
  >
  passthroughProviderIds: string[]   // passthrough=true 的 ProxyProvider id 列表
  updatedAt: number
}
```

#### ListenerEntry (v1 schema 待定, 暂行)

```
ListenerEntry {
  id: string                       // Profile 内唯一
  source: 'manual' | 'derived'    // manual=用户手动构造; derived=由 nodeRefs 中具备 listener 派生能力的节点派生而来
  nodeId?: string                  // source=derived 时必填, 指向 nodeRefs 中某个 Node id
  name: string                     // 输出至 listeners: 段的 name
  payload: object                  // source=manual: 用户直接编辑的 listener 对象;
                                   // source=derived: 渲染时由 Node.protocol + Node.listenerDerivation.params 合成
                                   //                 (此处 payload 字段在持久化时可为空, 由 Renderer 填充)
}
```

- `listeners` 段不区分客户端/服务端 Profile 身份: 用户在 Profile 上手动添加 listener 或选择派生节点 listener 均可
- 由 `nodeRefs` 中具备派生能力的节点 + 用户在 `listeners` 中创建 `source='derived'` 条目来引用, 才会真正输出; 仅拖入具备派生能力的节点本身并不会自动产生 listener 输出 -- 需用户在 Profile.listeners 显式派生
- 具体 ListenerEntry 的字段结构 (尤其 derived 模式的 params 覆写、manual 模式与 mihomo listeners schema 的强类型化程度) **v1 待进一步讨论**

引用语义:
- **节点 (nodeRefs)**: 引用跟随。Profile 只存 nodeId, 渲染时实时从节点池取数据。节点被删除或 provider 刷新不再含此 id -> 悬空引用, UI 标红, 渲染时跳过并继续输出其它节点。节点数据变化 (provider 刷新) -> 配置自动跟着更新。
- **规则包 (ruleRefs.type='rulePack')**: 引用跟随。RulePack 的 rules 变化后所有引用它的 Profile 输出跟着变。
- **规则 (ruleRefs.type='rule')**: 引用跟随。Rule 字段变化后所有引用它的 Profile 输出跟着变。
- **proxyGroups**: 内容直接存于 Profile, 不是引用; 用户编辑 yaml 文本即改即得。
- **listeners.source='derived'**: 引用跟随 nodeId; 节点删除则该 listener 条目悬空标红跳过。

不保留历史版本: Profile 保存即覆盖旧版本。

### 3.7 SubscriptionToken (订阅令牌)

```
SubscriptionToken {
  id: string
  token: string                   // 全局唯一, URNG 生成
  profileId: string               // 绑定单个 Profile
  note?: string                   // 用户备注, 如 "家里 clash 客户端"
  createdAt: number
}
```

- 一个 Profile 可绑定多个 SubscriptionToken (一 Profile 多订阅入口)
- 固定 URL: `GET /api/subscription?token=xxx`
- 鉴权独立于管理 JWT, 仅校验 token 存在且 belongsTo profile

---

## 4. 接口契约

### 4.1 IStorage

通用仓储接口, 按实体分仓库:

```
type Repo<T, ID> = {
  findById(id: ID): Promise<T | null>
  findAll(filter?: Partial<T>): Promise<T[]>
  insert(entity: Omit<T, 'id'>): Promise<T>
  update(id: ID, patch: Partial<T>): Promise<T>
  delete(id: ID): Promise<void>
}

IStorage {
  users:       Repo<User, string>
  nodes:       Repo<Node, string>
  providers:   Repo<ProxyProvider, string>
  rules:       Repo<Rule, string>
  rulePacks:   Repo<RulePack, string>
  profiles:    Repo<Profile, string>
  subTokens:    Repo<SubscriptionToken, string>
}
```

两个适配器:
- **PostgresAdapter**: 使用 `pg` + Drizzle ORM
- **SqliteAdapter**: 使用 `better-sqlite3` + Drizzle ORM

Drizzle 使用同一份 schema 描述 (其 dialect 抽象支持 pg 与 sqlite), 由 Drizzle 提供双 dialect 切换, schema 单一来源。

Rule 是独立实体, 拥有自己的 `rules` 仓库; RulePack 通过 `rules` 数组引用 Rule id, 表与表之间桥接由 RulePackRepo 内部维护 (见 9 节 `rule_pack_items` 桥表)。

### 4.2 INodeSource

```
INodeSource {
  pull(provider: ProxyProvider): Promise<RawNode[]>
}
```

两实现:
- **ManualNodeSource**: 接收用户输入 (yaml / uri 列表 / base64), 调用对应 ITokenizer 解析为 RawNode 列表再标准化为 Node
- **ProviderNodeSource**: 按 provider 配置拉取 URL, 调用 ITokenizer 解析为 Node 列表, 应用 filter / excludeFilter / excludeType / override

### 4.3 ITokenizer

```
ITokenizer {
  parse(rawText: string): RawProxy[]
}
```

三个实现解析三种订阅格式为统一的内部 `RawProxy` 中间对象, 再由 NodeRepo 标准化为 Node:
- ClashYamlTokenizer
- UriListTokenizer
- Base64Tokenizer

### 4.4 IConfigRenderer

```
IConfigRenderer {
  render(profile: Profile, ctx: RenderContext): Promise<string>
}
```

`ClashYamlRenderer` 渲染流程 (见第 5 节)。

### 4.5 ICronScheduler

```
ICronScheduler {
  register(provider: ProxyProvider, fn: () => Promise<void>): void
  unregister(providerId: string): void
  start(): void
  stop(): void
}
```

两实现:
- **NodeCronScheduler** (本地): 使用 node-cron, 按 provider.interval 调度
- **VercelNoopScheduler**: 注册即 noop (不抛错), 所有刷新靠外部触发 `/api/cron/refresh-providers` 端点

### 4.6 IPasswordHasher / IJwtIssuer

- `IPasswordHasher.hash(plain) / verify(plain, hash)`: 实现 bcrypt-edge (兼容 Edge Runtime)
- `IJwtIssuer.sign(payload) / verify(token)`: 实现 jsonwebtoken

---

## 5. 配置渲染流程

`ClashYamlRenderer.render(profile, ctx)` 步骤:

1. 解析 `extraConfig` (yaml 文本) 为顶层字段对象 (mixed-port / allow-lan / mode / log-level / dns / hosts / external-controller / tun / ...) -- 作为结果文档的顶层键
2. 遍历 `nodeRefs` -> 对每个 nodeId 从 NodeRepo 查; 悬空则跳过并继续:
   - 写一条 `proxies:` 条目, 数据取自 `node.proxyParams` (补充 `name: node.name`)
3. 遍历 `listeners` -> 对每个 ListenerEntry:
   - `source='manual'`: 直接取 `payload` 写一条 `listeners:` 条目
   - `source='derived'`: 按 `nodeId` 查 Node; 悬空则跳过; 否则由 `Node.protocol + Node.listenerDerivation.params` 合成 listener 条目, 用 `ListenerEntry.name` 覆写输出 name; 写一条 `listeners:` 条目
4. 遍历 `proxyGroups` -> 对每张卡:
   - 解析 `payload` (yaml 文本) 为对象
   - 写入 `proxy-groups:` 段
5. 遍历 `ruleRefs` 按顺序展开:
   - `type:'rulePack'` -> 查 RulePack, 按 `rules` 顺序展开每个 Rule
   - `type:'rule'` -> 查 Rule
   - `type:'inlineRule'` -> 直接用内嵌 Rule 对象
   - 合并写入 `rules:` 段
6. 遍历 `passthroughProviderIds` -> 对每个 providerId 查 ProxyProvider; 确认 `passthrough=true`:
   - 输出 `proxy-providers:` 段, 固定 `type: http`, `url` 取自 provider.url, 其余字段由 `extraParams` 原样合并
7. 序列化为最终 yaml 文本返回

输出文档结构:

```yaml
# extraConfig 顶层字段
mixed-port: 7890
allow-lan: true
mode: rule
log-level: info
dns:
  ...
proxies:
  - {name: ..., ...}        # 来自 nodeRefs 中所有节点
listeners:
  - {name: ..., ...}        # 来自 profile.listeners (manual + derived)
proxy-groups:
  - {name: ..., ...}        # 来自 proxyGroups
rules:
  - DOMAIN,...              # 来自 ruleRefs 展开 (rulePack + rule + inlineRule 混排)
proxy-providers:
  xxx: {...}                # 来自 passthroughProviderIds (passthrough=true)
```

---

## 6. REST API 表面

所有管理 API 均需 `Authorization: Bearer <jwt>` 鉴权 (除 `/api/auth/login`、`/api/cron/*`、`/api/subscription`).

### 6.1 鉴权
```
POST   /api/auth/login             { username, password } -> { jwt }
POST   /api/auth/logout            (前端清 token)
GET    /api/auth/me                 -> { username }
```

### 6.2 Nodes (节点池)
```
GET    /api/nodes                   ?tag=xxx&source=manual|provider 过滤
POST   /api/nodes                   手动添加 (body 含 rawText + 字段, 服务端调 ITokenizer 解析)
PUT    /api/nodes/:id               仅 manual 节点; 含 listenerDerivation 开关/params 编辑
DELETE /api/nodes/:id               仅 manual 节点
```

### 6.3 Providers
```
GET    /api/providers
POST   /api/providers
PUT    /api/providers/:id
DELETE /api/providers/:id
POST   /api/providers/:id/refresh   手动触发单个 provider 刷新 (JWT 鉴权)
POST   /api/cron/refresh-providers   外部 cron 入口 (CRON_SECRET Bearer 鉴权)
```

### 6.4 Rules
```
GET    /api/rules
POST   /api/rules
PUT    /api/rules/:id
DELETE /api/rules/:id
```

### 6.5 Rule Packs
```
GET    /api/rule-packs
POST   /api/rule-packs
PUT    /api/rule-packs/:id
DELETE /api/rule-packs/:id
GET    /api/rule-packs/:id           含内含规则展开列表
PUT    /api/rule-packs/:id/rules     批量更新 pack 内 rules 顺序/引用
```

### 6.6 Profiles
```
GET    /api/profiles                 ?tag=xxx&name=xxx 筛选
POST   /api/profiles
PUT    /api/profiles/:id
DELETE /api/profiles/:id
PUT    /api/profiles/:id/node-refs        调整 nodeRefs 顺序/增删
PUT    /api/profiles/:id/listeners        调整 listeners 顺序/增删
PUT    /api/profiles/:id/proxy-groups     增删 proxy-groups 卡片
PUT    /api/profiles/:id/proxy-groups/:cardId  单张卡 payload 编辑
PUT    /api/profiles/:id/rule-refs        调整 ruleRefs 顺序/增删
PUT    /api/profiles/:id/passthrough-providers  调整 passthroughProviderIds
GET    /api/profiles/:id/render           预览渲染结果 (鉴权同管理 API)
```

### 6.7 Subscription Tokens
```
GET    /api/profiles/:id/tokens
POST   /api/profiles/:id/tokens          创建 (body: { note? }) -> { token }
DELETE /api/tokens/:id                    删除
```

### 6.8 Subscription (公开但 token 鉴权)
```
GET    /api/subscription?token=xxx        -> Clash YAML 文本 (固定)
```

---

## 7. UI (极简 React SPA)

详见后续 UI 专项设计。本次 spec 仅约束:
- 三大主视图: Nodes / Profile Editor / RulePacks
- Vite + React 18 + Tailwind + @dnd-kit (拖拽)
- 静态资源由 Hono 兜底 serve; Vercel 上放在 publicDir
- 所有管理操作通过 REST API, 无 SSR

---

## 8. 部署

### 8.1 本地
- 单进程 `node dist/server.js`
- 环境变量:
  - `DATABASE_URL=sqlite:./clashdash.db` 或 `postgres://user:pass@host:5432/db`
  - `PORT=3000`
  - `JWT_SECRET=<random>`
  - `SUB_TOKEN_SALT=<random>` (生成订阅 token 用)
  - `CRON_SECRET=<random>` (外部 cron 触发端点鉴权)
- Provider 刷新由进程内 node-cron 按 provider.interval 调度

### 8.2 Vercel
- `api/index.ts` 导出 Hono app, 通过 `hono/vercel` 适配 Vercel Functions
- UI 静态文件放 `public/` (Vite 构建输出)
- 存储用 Vercel Postgres 或外部 Neon (通过 `DATABASE_URL` 切换)
- SQLite 仅本地开发用
- `provider.interval` 在 Vercel 模式下被忽略 (前端 UI 显示"Vercel 模式不生效")
- `/api/cron/refresh-providers` 端点保留, 需 `Authorization: Bearer <CRON_SECRET>` 鉴权
- **不在 `vercel.json` 配置 cron** (Vercel cron 为付费功能); 用户自托管 cron (如系统 crontab / GitHub Actions 定时) 外部触发该端点
- 单次 `/api/cron/refresh-providers` 内部遍历所有 passthrough=false 的 provider 执行刷新

---

## 9. 数据库 Schema 草案 (Drizzle)

主表:
- `users` (单行: username, passwordHash)
- `nodes` (id PK, name, tags JSON, source, sourceId, readOnly, protocol, proxyParams JSON, listenerDerivation JSON)
- `providers` (id PK, name, passthrough bool, url, format, interval int, filter JSON, excludeFilter JSON, excludeType JSON, override JSON, extraParams JSON, createdAt)
- `rules` (id PK, type, match, target, noResolve)
- `rule_packs` (id PK, name)
- `rule_pack_items` (packId FK, rule FK, order int)  -- 桥表保序, 维护 RulePack.rules
- `profiles` (id PK, name, tags JSON, note, extraConfig text, updatedAt)
- `profile_node_refs` (profileId FK, nodeId FK, order int)  -- 桥表保序, 维护 Profile.nodeRefs
- `profile_listeners` (id PK, profileId FK, source, nodeId nullable, name, payload JSON, order int)  -- 维护 Profile.listeners
- `profile_proxy_group_cards` (id PK, profileId FK, name, payload text, order int)  -- 维护 Profile.proxyGroups
- `profile_rule_refs` (profileId FK, refType, refId nullable, inlinePayload JSON nullable, order int)  -- 维护 Profile.ruleRefs
- `profile_passthrough_providers` (profileId FK, providerId FK, order int)
- `sub_tokens` (id PK, token unique, profileId FK, note, createdAt)

所有 JSON 字段使用 JSONB (Postgres) / TEXT + JSON.parse (SQLite), 由 Drizzle 双 dialect 处理。

注: `refType` 取值 `rulePack | rule | inlineRule`; `refId` 仅 `rulePack` / `rule` 类型有值; `inlinePayload` 仅 `inlineRule` 类型有值。

---

## 10. 技术栈定稿

- Runtime: Node.js 20+ / TypeScript / ESM
- Web: Hono (`hono/vercel` 用于 Vercel 入口)
- ORM: Drizzle ORM (双 dialect: `drizzle-orm/postgres-js` + `drizzle-orm/better-sqlite3`)
- Auth: `jsonwebtoken` + `bcrypt-edge` (兼容 Edge Runtime)
- Yaml: `yaml` 包 (解析/序列化)
- Cron (本地): `node-cron`
- HTTP 拉取: `undici` / `fetch` (Node 20+ 内置)
- UI: React 18 + Vite + Tailwind CSS + @dnd-kit (拖拽)
- Test: Vitest
- 包管理: pnpm (推荐)

---

## 11. 边界与 v1 不做项

明确 v1 不包含:
- 多用户 / RBAC
- 配置版本历史 / 回滚
- 订阅 URL 派生参数 (固定 URL + token)
- 用户自定义渲染器脚本 / 钩子表达式
- 节点测速 / 延迟测试
- 自动节点健康检测 (仅靠 provider 自身 healthCheck 配置)
- Profile 间继承 / 模板继承
- 规则包嵌套

未来可扩展:
- 节点延迟测试端点 (mihomo external-controller 联动)
- Profile 复制 / 导出 JSON 配方
