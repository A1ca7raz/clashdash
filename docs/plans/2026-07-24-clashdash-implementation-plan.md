# ClashDash v1 实施计划

- 日期：2026-07-24
- 设计依据：[`docs/specs/2026-07-24-clashdash-design-v2.md`](../specs/2026-07-24-clashdash-design-v2.md)
- 状态：Ready for implementation
- 目标：从空项目实现可本地运行、可部署至 Vercel 的 ClashDash v1

---

## 1. 执行原则

1. 按本文任务顺序实施，不先搭 UI 再补领域行为。
2. 每项核心行为先写失败测试，再写最小实现。
3. 每个任务结束至少运行相关测试、类型检查和格式检查。
4. 不添加设计稿明确排除的时间戳、版本、独立 Rule 或 ProxyGroup 卡片模型。
5. 不为了形式统一给纯函数和单实现领域服务增加接口。
6. SQLiteStore 和 PostgresStore 必须通过同一套存储契约测试。
7. Provider 刷新、Profile 保存和 RulePack 保存的事务边界先于 HTTP 路由实现。
8. 所有密钥、JWT、密码和 SubscriptionToken 必须在日志层统一脱敏。

建议的持续验证命令：

```bash
pnpm typecheck
pnpm test
pnpm build
```

涉及数据库适配时额外运行：

```bash
pnpm test:sqlite
pnpm test:postgres
```

涉及 UI 时额外运行：

```bash
pnpm test:ui
pnpm test:e2e
```

---

## 2. 目标目录

```text
api/
  index.ts

src/
  domain/
    json.ts
    models/
    rules/
    providers/
    profiles/
    compiler/
  application/
    auth/
    nodes/
    providers/
    rule-packs/
    profiles/
    subscriptions/
  infrastructure/
    store/
      contract/
      sqlite/
      postgres/
    fetch/
    parsers/
    scheduler/
    security/
  http/
    app.ts
    errors.ts
    middleware/
    routes/
    schemas/
  server/
    bootstrap.ts
    main.ts

ui/
  index.html
  src/
    app/
    api/
    features/
    components/

tests/
  fixtures/
  golden/
  integration/

drizzle/
  sqlite/
  postgres/
```

---

## 3. 里程碑

| 里程碑 | 交付结果 |
|---|---|
| M1 | 领域模型、Rule、Provider 兼容处理和 ProfileCompiler 可独立测试 |
| M2 | SQLite 下完整业务用例和 Provider 原子刷新可用 |
| M3 | 管理认证、订阅 Token 和 HTTP API 可用 |
| M4 | PostgreSQL 与 Vercel 运行适配完成 |
| M5 | 三个管理工作区和端到端验收完成 |

---

## 4. Task 1：项目骨架与质量门禁

### 文件

```text
package.json
pnpm-lock.yaml
tsconfig.json
tsconfig.server.json
tsconfig.ui.json
vite.config.ts
vitest.config.ts
.gitignore
src/http/app.ts
src/server/main.ts
ui/index.html
ui/src/main.tsx
ui/src/app/App.tsx
tests/smoke/app.test.ts
```

### 实施

- 初始化单一 pnpm 项目。
- 配置 TypeScript ESM 和严格类型检查。
- 配置服务端编译与 Vite UI 构建。
- 创建最小 Hono app 和 `/api/health`。
- 创建最小 React SPA。
- 配置 Vitest 的 Node 和 DOM 两个测试环境。
- 添加统一脚本：`dev`、`build`、`typecheck`、`test`、`test:ui`。
- 暂不接数据库和认证。

### 测试

- `app.request('/api/health')` 返回 200。
- UI 根组件可以渲染。
- 服务端构建不包含浏览器专用代码，UI 构建不包含数据库驱动。

### 完成条件

```bash
pnpm typecheck
pnpm test
pnpm build
```

全部通过。

---

## 5. Task 2：共享值类型与领域模型

### 文件

```text
src/domain/json.ts
src/domain/models/rule.ts
src/domain/models/rule-pack.ts
src/domain/models/provider.ts
src/domain/models/node.ts
src/domain/models/listener.ts
src/domain/models/proxy-group.ts
src/domain/models/profile.ts
src/domain/models/subscription-token.ts
src/domain/models/user.ts
src/domain/models/index.ts
src/domain/models/models.test.ts
```

### 实施

- 按 v2 设计稿定义所有业务类型。
- RuleEntry 使用 `type: 'rule' | 'rulePack'`。
- Node 使用 `type: 'userdefined' | 'provider'`。
- ListenerEntry 使用 `type: 'userdefined' | 'derived'`。
- Profile 中的关联对象使用完整对象。
- Provider 的 Filter 和 Override 字段使用小驼峰。
- 不定义独立 Rule 实体或 Rule ID。
- 不定义 `createdAt`、`updatedAt`、`version`、`revision`。
- ID 统一使用随机 UUID，不使用编码时间的 ID。

### 测试

- 建立可编译的典型对象 fixture。
- 验证 JsonValue 不允许函数和 `undefined`。
- 使用类型测试阻止 ProviderNode 出现 ListenerTemplate。
- 使用源码守卫测试检查禁止字段和旧 `manual` 命名未进入领域模型。

---

## 6. Task 3：Rule 校验、序列化与 RulePack 展开

### 文件

```text
src/domain/rules/rule-validator.ts
src/domain/rules/rule-serializer.ts
src/domain/rules/rule-entry-expander.ts
src/domain/rules/rule-validator.test.ts
src/domain/rules/rule-serializer.test.ts
src/domain/rules/rule-entry-expander.test.ts
tests/fixtures/rules.ts
```

### 实施

- 实现 Rule 通用校验。
- 为常用类型添加参数数量和 Modifier 校验。
- 未知类型输出 Warning，不阻止序列化。
- 实现 `[type, ...parameters, policy, ...modifiers]` 序列化。
- 实现 RuleEntry 顺序展开。
- 展开后检查 `MATCH` 后的不可达规则。
- RulePack 缺失由调用方转换为 Error。

### 核心用例

- `DOMAIN-SUFFIX,example.com,Proxy`
- `IP-CIDR,192.168.0.0/16,DIRECT,no-resolve`
- `PROCESS-NAME,steam.exe,Game`
- `MATCH,Proxy`
- Inline Rule、RulePack、Inline Rule 混排。

---

## 7. Task 4：Mihomo Provider Filter 兼容层

### 文件

```text
src/domain/providers/pattern-list.ts
src/domain/providers/provider-filter.ts
src/domain/providers/provider-filter.test.ts
tests/fixtures/provider-filter-cases.ts
docs/compat/mihomo-provider-patterns.md
```

### 兼容性前置实验

Mihomo 使用 Go `regexp2`，不能直接假定所有表达式都与 JavaScript RegExp 等价。先建立兼容测试语料，再锁定实现：

- 反引号分隔多条表达式。
- `(?i)` 忽略大小写。
- 普通 `|` alternation。
- 捕获组和替换引用。
- 正向/负向 lookaround。
- Unicode 节点名称。
- 非法表达式。
- 可能发生灾难性回溯的表达式。

实现一个隔离的 `MihomoPattern` 适配层。业务代码不能直接调用原生 `RegExp`。

### 实施

- `filter`、`excludeFilter` 按反引号拆分。
- 多条 Filter 之间为 OR。
- ExcludeType 按 `|` 拆分并忽略大小写。
- 处理顺序为 ExcludeType、ExcludeFilter、Filter。
- Filter 匹配 Override 前名称。
- 为表达式匹配设置输入长度和执行时间保护。
- 不支持的表达式必须在 Provider 保存时返回明确校验错误，不能静默改变语义。
- 将最终支持边界和 Mihomo 差异记录到兼容说明。

### 完成条件

- 官方文档示例全部通过。
- 项目 fixture 中的常见机场筛选表达式全部通过。
- ReDoS fixture 不得无限阻塞测试进程。

---

## 8. Task 5：Provider Override 与 OverrideExpr

### 文件

```text
src/domain/providers/provider-override.ts
src/domain/providers/mihomo-field-map.ts
src/domain/providers/override-expression/tokenizer.ts
src/domain/providers/override-expression/parser.ts
src/domain/providers/override-expression/evaluator.ts
src/domain/providers/provider-override.test.ts
src/domain/providers/override-expression/evaluator.test.ts
tests/fixtures/provider-override-cases.ts
```

### 实施顺序

1. 固定字段覆写。
2. `proxyName` 按数组顺序替换。
3. `additionalPrefix`。
4. `additionalSuffix`。
5. `overrideExpr` 按数组顺序执行。

### OverrideExpr 范围

实现 Mihomo 文档列出的 yq v4 子集：

- 路径读取、赋值和删除。
- `=`、`|=`、`+=`、`-=`、`*=`。
- Pipe、union、`select`、`//`。
- 比较和布尔运算。
- 数组、Mapping、标量字面量。
- 文档列出的集合、字符串和转换函数。

不允许：

- 文件或环境变量访问。
- 动态代码执行。
- 未在 Mihomo 子集中出现的 yq 功能。

### 测试

- 固定字段映射到 Mihomo 横线命名。
- `proxyName` 捕获组替换。
- 前后缀顺序。
- 多条 OverrideExpr 顺序执行。
- 表达式错误包含数组下标和原表达式。
- 输入代理对象不被原地修改。

---

## 9. Task 6：订阅解析器与 Node 标准化

### 文件

```text
src/infrastructure/parsers/parser-registry.ts
src/infrastructure/parsers/clash-yaml-parser.ts
src/infrastructure/parsers/uri-list-parser.ts
src/infrastructure/parsers/base64-parser.ts
src/infrastructure/parsers/uri/
  shadowsocks.ts
  shadowsocksr.ts
  vmess.ts
  vless.ts
  trojan.ts
  hysteria2.ts
  tuic.ts
src/infrastructure/parsers/normalizer.ts
src/infrastructure/parsers/parsers.test.ts
tests/fixtures/subscriptions/
```

### 实施

- 解析器输出统一的 Proxy 值对象。
- Clash YAML 只读取 `proxies` 数组。
- URI 列表忽略空行，逐行返回定位明确的错误。
- Base64Parser 只负责解码，再委托 URIListParser。
- Node 名称从输入代理中提取，随后从 Proxy 内删除 `name`。
- UserDefined 导入生成 `type: 'userdefined'`。
- Provider 导入生成 `type: 'provider'`。
- 未支持协议必须返回可展示诊断，不能生成残缺节点。

### 测试

- 每种协议至少包含普通、URL 编码、IPv6 和非法输入 fixture。
- Base64 标准和 URL-safe 输入。
- Clash YAML 中扩展代理字段往返不丢失。
- 多节点导入保持原始顺序。

---

## 10. Task 7：Listener、ProxyGroup 与 ProfileCompiler

### 文件

```text
src/domain/profiles/listener-compiler.ts
src/domain/profiles/name-registry.ts
src/domain/profiles/proxy-group-validator.ts
src/domain/profiles/reference-graph.ts
src/domain/compiler/profile-compiler.ts
src/domain/compiler/yaml-serializer.ts
src/domain/compiler/diagnostics.ts
src/domain/compiler/profile-compiler.test.ts
tests/golden/*.input.ts
tests/golden/*.yaml
```

### 实施

- 编译 UserDefined Listener。
- 编译 Derived Listener，名称覆盖模板名称。
- 校验 Derived Node 已被 Profile 选择且仍有模板。
- 建立 Node、ProxyGroup、Provider、内建策略名称注册表。
- 校验 ProxyGroup `proxies` 和 `use`。
- 使用有向图检测 ProxyGroup 循环引用。
- 展开 RuleEntry 并校验 policy。
- 阻止 GeneralConfig 保留键。
- 将已知小驼峰字段映射为 Mihomo 横线字段。
- 输出稳定、确定性的 YAML。

### Golden 场景

- 纯 UserDefined Node 客户端配置。
- Derived Listener 服务端配置。
- ImportProvider Node 与 PassthroughProvider 混合。
- Inline Rule 与 RulePack 混排。
- 缺失 Node Warning 但仍输出。
- 缺失 Node 被 ProxyGroup 引用导致 Error。
- 名称冲突、Group 环和无效 Rule policy。

### 完成条件

- 同一输入重复编译结果逐字节一致。
- 编译不修改输入对象。
- Error 阻止有效订阅结果，Warning 不阻止。

完成本任务即达到 M1。

---

## 11. Task 8：AppStore 契约与 SQLiteStore

### 文件

```text
src/application/ports/app-store.ts
src/infrastructure/store/contract/app-store.contract.ts
src/infrastructure/store/sqlite/schema.ts
src/infrastructure/store/sqlite/migrations.ts
src/infrastructure/store/sqlite/sqlite-store.ts
src/infrastructure/store/sqlite/mappers.ts
src/infrastructure/store/sqlite/sqlite-store.test.ts
drizzle/sqlite/*.sql
```

### AppStore 能力

- 唯一 User 的读取和初始化。
- Node、Provider、RulePack、Profile、SubscriptionToken 的聚合操作。
- 根据 ID 批量解析 Profile 关联对象。
- 查询 RulePack、Provider、Node 被哪些 Profile 引用。
- 单 Provider Node 替换事务。
- Profile 删除与 Token 级联。

不要定义通用 `Repo<T>`。

### SQLite 映射

- JSON 字段保存为规范化 JSON 文本。
- RulePack 的 Rule 数组嵌入 `rules_json`。
- Profile 保存有序 ID 和内联值对象数组。
- Derived Listener 持久化 Node ID。
- RulePack RuleEntry 持久化 RulePack ID。
- Node 引用不设置外键，以保留悬空引用。
- ProviderNode 对 Provider 使用级联外键。
- 所有表不出现时间戳和版本列。

### 测试

- 全部聚合往返不变。
- 数组顺序不变。
- 完整对象解析正确。
- 缺失引用返回位置、ID 和展示信息。
- 保存未删除的失效占位项不会丢失原引用。
- RulePack 被引用时拒绝删除。
- Profile 删除级联 SubscriptionToken。
- 事务异常完整回滚。

---

## 12. Task 9：Provider 刷新服务

### 文件

```text
src/application/ports/remote-content-fetcher.ts
src/infrastructure/fetch/node-fetcher.ts
src/application/providers/provider-refresh-service.ts
src/application/providers/provider-node-matcher.ts
src/application/providers/provider-lock.ts
src/application/providers/provider-refresh-service.test.ts
tests/integration/provider-refresh.sqlite.test.ts
```

### 实施

- 网络请求设置连接、响应和总体超时。
- 设置订阅内容最大体积。
- 拉取、解析、Filter、Override、校验均在数据库事务外完成。
- 候选节点全部有效后开启替换事务。
- 使用原始名称和稳定指纹匹配旧 ProviderNode。
- 匹配成功沿用 Node ID。
- 删除不再出现的 ProviderNode。
- 同 Provider 使用进程锁和数据库提交串行化。
- 多 Provider 全量刷新使用有限并发。
- 单个失败不影响其他 Provider。

### 测试

- HTTP 失败、超时、超限、解析失败均保留旧节点。
- 参数改变但身份相同沿用 ID。
- 节点消失后删除，Profile 引用变为缺失诊断。
- 两次并发刷新不会交叉覆盖。
- 不同 Provider 可并行完成。

---

## 13. Task 10：本地调度器

### 文件

```text
src/application/ports/provider-scheduler.ts
src/infrastructure/scheduler/node-cron-scheduler.ts
src/infrastructure/scheduler/noop-scheduler.ts
src/infrastructure/scheduler/scheduler.test.ts
```

### 实施

- 本地启动时注册全部 ImportProvider。
- 创建、修改 interval、切换类型和删除时同步调度。
- PassthroughProvider 不注册刷新任务。
- Vercel 使用 NoopScheduler。
- 调度回调只调用 ProviderRefreshService，不复制刷新逻辑。
- Shutdown 时停止全部本地任务。

完成 Task 8–10 后达到 M2。

---

## 14. Task 11：密码、JWT 与 SubscriptionToken 安全实现

### 文件

```text
src/application/ports/password-hasher.ts
src/application/ports/admin-token-service.ts
src/application/ports/subscription-token-cipher.ts
src/application/ports/secret-cipher.ts
src/application/ports/totp-service.ts
src/infrastructure/security/aes-gcm-secret-cipher.ts
src/infrastructure/security/rfc6238-totp-service.ts
src/infrastructure/security/scrypt-password-hasher.ts
src/infrastructure/security/jose-admin-token-service.ts
src/infrastructure/security/aes-subscription-token-cipher.ts
src/infrastructure/security/security.test.ts
```

### 实施

- 密码使用服务端慢哈希，随机 Salt 随哈希编码保存。
- JWT 固定算法、issuer、audience，并验证 exp。
- JWT 默认 24 小时，不建立 RefreshToken 和黑名单。
- SubscriptionToken 使用 32 字节安全随机数和 base64url。
- 保存 Token Hash 用于鉴权查询。
- 使用带认证的对称加密保存可重复读取的明文 Token。
- 管理查询可以解密并返回完整 Token。
- TOTP 使用 RFC 6238 的 SHA-1、6 位、30 秒参数，并允许相邻一个时间窗口。
- TOTP Secret 使用独立 SecretCipher 加密存储，不保存明文。
- 日志和错误永不包含密码、JWT 或 Token。

### 测试

- 正确和错误密码。
- JWT 篡改、错误 issuer/audience、过期。
- Token 加密往返、错误密钥和篡改密文。
- 同一明文产生稳定 Hash，但加密密文可使用随机 nonce。
- 创建后和后续查询均可得到相同明文 Token。
- RFC 6238 标准向量，以及 TOTP Secret 加密往返和篡改失败。

---

## 15. Task 12：应用用例

### 文件

```text
src/application/auth/*.ts
src/application/nodes/*.ts
src/application/providers/*.ts
src/application/rule-packs/*.ts
src/application/profiles/*.ts
src/application/subscriptions/*.ts
src/application/errors.ts
src/application/application.test.ts
```

### 实施

- 实现设计稿列出的全部用例。
- 输入操作只接收 DTO，不接受数据库记录。
- 输出 Profile 时解析为完整关联对象。
- Profile 保存只使用关联对象 ID，不允许借保存 Profile 修改关联对象。
- RulePack 保存整体替换完整 Rule 数组。
- ProviderNode 更新和删除用例不存在。
- Profile Preview 支持已保存 Profile 和未保存草稿。
- Subscription 渲染只在没有 Error 时返回 YAML。
- 删除 Profile 同一事务删除 Token。
- 初始化 User 只在数据库为空时执行。
- 支持修改密码，以及 TOTP 绑定、确认、登录验证和停用。

### 测试

- 每个用例至少包含成功、NotFound、ValidationError 和 Conflict 路径。
- 最后写入覆盖此前 Profile，不检查版本。
- Token 可以重复明文查询。
- TOTP 启用后，登录和修改密码必须提供有效动态码。
- 三类凭证不能进入错误的用例入口。

---

## 16. Task 13：HTTP Delivery

### 文件

```text
src/http/app.ts
src/http/errors.ts
src/http/middleware/admin-auth.ts
src/http/middleware/cron-auth.ts
src/http/middleware/request-logging.ts
src/http/routes/auth.ts
src/http/routes/nodes.ts
src/http/routes/providers.ts
src/http/routes/rule-packs.ts
src/http/routes/profiles.ts
src/http/routes/subscriptions.ts
src/http/routes/cron.ts
src/http/schemas/*.ts
src/http/http.test.ts
```

### 实施

- 使用 Zod 在 HTTP 边界验证 JSON、路径和查询参数。
- 统一映射 400、401、404、409、422、502、503。
- 管理接口统一使用 Bearer JWT。
- Cron 接口只接受 Cron Secret。
- 订阅接口只接受 SubscriptionToken。
- Profile 保存接收完整关联对象，但只读取关联对象 ID。
- Token 管理接口返回完整明文和订阅 URL。
- 请求日志清除 Authorization 和 `token` 查询参数。
- YAML 响应设置正确 Content-Type 和 `Cache-Control: no-store`。
- 账户安全接口提供密码修改与 TOTP 状态、绑定、确认和停用；二维码与 Secret 响应禁止缓存。

### 测试

- 使用 Hono `app.request()` 覆盖全部资源和错误映射。
- 验证不存在独立 `/api/rules`。
- 验证不存在 ProxyGroup 卡片接口。
- 验证 ProviderNode 写操作被拒绝。
- 验证管理 JWT、Cron Secret、SubscriptionToken 互不通用。

完成 Task 11–13 后达到 M3。

---

## 17. Task 14：PostgresStore

### 文件

```text
src/infrastructure/store/postgres/schema.ts
src/infrastructure/store/postgres/migrations.ts
src/infrastructure/store/postgres/postgres-store.ts
src/infrastructure/store/postgres/mappers.ts
src/infrastructure/store/postgres/postgres-store.test.ts
drizzle/postgres/*.sql
tests/integration/store-contract.postgres.test.ts
```

### 实施

- 按逻辑 Schema 建立 PostgreSQL 方言定义。
- JSON 字段使用 JSONB。
- Profile 和 RulePack 聚合保存行为与 SQLite 一致。
- Provider 刷新使用数据库事务和 Provider 级提交锁。
- Serverless 连接配置限制单 Function 连接占用。
- 不强行复用 SQLite 物理 Schema 定义。

### 完成条件

- AppStore 契约测试在 SQLite 和 PostgreSQL 上完全通过。
- 同一 Golden Profile 在两个数据库中编译出逐字节相同 YAML。

---

## 18. Task 15：Bootstrap、本地入口和 Vercel 入口

### 文件

```text
src/server/config.ts
src/server/bootstrap.ts
src/server/main.ts
api/index.ts
vercel.json
scripts/migrate.ts
```

### 实施

- 根据 `DATABASE_DIALECT` 创建 Store。
- Vercel 模式拒绝 SQLite。
- 校验生产必需 Secret。
- 数据库中没有 User 时，使用环境变量中的初始用户名和密码自动创建唯一 User。
- 不提供公开初始化接口，已有 User 不因环境变量变化而重置密码。
- 本地启动 HTTP Server 和 NodeCronScheduler。
- Vercel 导出同一个 Hono app，使用 NoopScheduler。
- `vercel.json` 只配置路由和构建，不配置 Cron。
- 提供 SQLite/PostgreSQL 迁移命令。
- 支持优雅停止本地 Scheduler 和数据库连接。

### 测试

- 配置缺失和非法组合。
- Local/SQLite、Local/PostgreSQL、Vercel/PostgreSQL 三种 bootstrap。
- Vercel/SQLite 明确失败。

完成 Task 14–15 后达到 M4。

---

## 19. Task 16：UI 基础与认证

### 文件

```text
ui/src/app/App.tsx
ui/src/app/router.tsx
ui/src/api/client.ts
ui/src/features/auth/*
ui/src/components/layout/*
ui/src/components/feedback/*
```

### 实施

- 登录页、管理布局和三个主工作区导航。
- 账户安全页提供密码修改和可选 TOTP 管理；登录页在服务端要求时显示动态码输入。
- API client 自动携带管理 JWT。
- 401 时清理 JWT 并回到登录页。
- 错误组件展示统一 ApiError。
- 不把 SubscriptionToken 放入全局日志或错误追踪。

---

## 20. Task 17：Nodes 与 Providers UI

### 文件

```text
ui/src/features/nodes/*
ui/src/features/providers/*
```

### 实施

- Node 名称、Tag、类型和 Provider 筛选。
- UserDefined Node 结构化编辑和文本批量导入。
- ListenerTemplate 编辑。
- ProviderNode 只读展示来源。
- Provider 类型联合表单。
- Filter、ExcludeFilter、ExcludeType 和 Override 编辑。
- Provider 刷新和结果展示。
- Vercel 模式提示 interval 不执行进程内调度。

### 测试

- UserDefined/ProviderNode 权限差异。
- Provider 模式切换影响提示。
- 小驼峰字段提交和回显。
- 刷新失败保留已有列表。

---

## 21. Task 18：RulePacks 与 Profile Editor UI

### 文件

```text
ui/src/features/rule-packs/*
ui/src/features/profiles/*
ui/src/features/subscriptions/*
```

### RulePacks

- 与 Profile 共用 Rule 行卡片和拖拽组件，在 RulePack 内创建、编辑、删除和排序完整 Rule。
- RulePack 模式不提供 RulePack 选择入口，避免嵌套。
- Rule 表单根据 type 辅助 parameters 和 modifiers。
- 展示引用 Profile。
- 被引用时阻止删除。

### Profile Editor

- 名称和 Tag 独立编辑，GeneralConfig 使用 YAML 文本编辑并解析为对象。
- RuleEntry 可拖拽排序，内联 Rule 使用行卡片编辑，并与完整 RulePack 对象混排。
- Proxy/Listener 使用选择按钮、节点池浮层和已选卡片列表，浮层支持快速创建 Proxy/Listener。
- ProxyGroup 使用卡片组，以单一原始 YAML 编辑框完成创建和修改。
- PassthroughProvider 使用独立选择器。
- 未保存草稿预览。
- 按 location 将诊断定位到具体编辑项。
- 失效引用显示红色占位项，用户未删除时保存继续保留。

### SubscriptionToken

- 创建 Token。
- 重复查看明文 Token。
- 复制固定订阅 URL。
- 撤销 Token。

### 测试

- 拖拽只改变数组顺序。
- Profile 整体保存，不调用细粒度卡片接口。
- RulePack 更新后重新读取 Profile 得到最新完整对象。
- Token 创建后和刷新页面后均可读取同一明文。

---

## 22. Task 19：端到端与部署验收

### 文件

```text
tests/e2e/auth.spec.ts
tests/e2e/nodes.spec.ts
tests/e2e/providers.spec.ts
tests/e2e/rule-packs.spec.ts
tests/e2e/profiles.spec.ts
tests/e2e/subscriptions.spec.ts
README.md
.env.example
```

### E2E 主链路

1. 使用环境变量自动创建的唯一用户登录。
2. 修改密码，绑定 TOTP，并验证后续登录要求动态码。
3. 创建 UserDefined Node 和 ListenerTemplate。
4. 创建 ImportProvider 并刷新节点。
5. 创建 PassthroughProvider。
6. 创建保存完整 Rule 的 RulePack。
7. 创建 Profile，混排 Inline Rule 和 RulePack。
8. 创建 ProxyGroup 对象和 Derived Listener。
9. 预览 YAML 并确认无 Error。
10. 创建 SubscriptionToken。
11. 退出管理登录后仅凭 Token 获取 YAML。
12. 使用密码与 TOTP 重新登录并重复查看同一明文 Token。
13. 撤销 Token，确认旧 URL 失效。

### 故障链路

- Provider 刷新远程失败后旧节点仍可订阅。
- Provider 刷新删除节点后 Profile 显示失效引用。
- 失效节点未被 Group 使用时仅 Warning。
- Group 使用失效节点时订阅被 Error 阻止。
- RulePack 被引用时删除失败。
- SQLite 和 PostgreSQL Golden YAML 一致。

### 文档

README 至少包含：

- 本地 SQLite 快速开始。
- 本地 PostgreSQL 配置。
- Vercel 部署与外部 Cron 示例。
- 环境变量。
- 数据库迁移。
- 初始用户创建。
- Token 和日志安全注意事项。
- Provider Filter/Override 兼容范围。
- 显式、幂等且不会随生产启动自动执行的 Demo 数据 seed 命令。

完成本任务即达到 M5 和 v1 实施完成条件。

---

## 23. 最终验收命令

```bash
pnpm typecheck
pnpm test
pnpm test:sqlite
pnpm test:postgres
pnpm test:ui
pnpm test:e2e
pnpm build
```

可选 Mihomo 兼容验收：

```bash
mihomo -t -f tests/golden/generated/full-profile.yaml
```

任何验收失败都不能通过删除测试、放宽核心业务断言或回退到旧 Draft 模型解决。
