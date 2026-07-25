# ClashDash 设计稿 v2

- 日期：2026-07-24
- 状态：Working Design（已合并用户确认项）
- 依据：继承 `2026-07-15-clashdash-design.md` 中的用户目标与业务范围，不继承其领域模型、接口、数据库和分层约束
- 范围：单用户、多 Profile 的 Clash/Mihomo 配置管理、编译与订阅下发服务

---

## 1. 产品目标

ClashDash 用于完成以下工作：

1. 管理用户自定义节点以及从远程订阅导入的节点。
2. 管理透传型和导入型 ProxyProvider。
3. 在 Profile 中组合节点、Listener、ProxyGroup、内联 Rule 和 RulePack。
4. 将 Profile 实时编译为 Mihomo YAML。
5. 通过可长期使用、可撤销的固定订阅 URL 下发配置。
6. 同时支持本地单进程部署和 Vercel 部署。

主要参与者：

- 管理用户：系统内唯一用户，负责全部配置管理。
- Mihomo/Clash 客户端：通过订阅 Token 获取一个 Profile 的配置。
- 外部 Cron：在没有进程内定时器的部署环境触发 Provider 刷新。

核心用户流程：

```text
管理 Node / Provider / RulePack
                ↓
          编排 Profile
                ↓
        预览并修正诊断
                ↓
        创建订阅 Token
                ↓
       客户端实时获取 YAML
```

---

## 2. v1 边界

v1 包含：

- 单用户登录和管理鉴权。
- 管理员修改密码和可选 TOTP 双因子认证。
- UserDefined Node 的创建、文本导入、编辑和删除。
- ProxyProvider 的导入、透传、刷新、过滤和覆写。
- RulePack 的创建、编辑、排序、复用和删除保护。
- Profile 的完整编排、预览和订阅输出。
- UserDefined Listener 和从节点派生 Listener。
- 一个 Profile 多个 SubscriptionToken。
- SQLite 本地存储和 PostgreSQL 存储。
- 本地进程内 Provider 调度和外部 Cron 调度。

v1 不包含：

- 多用户、RBAC、用户注册。
- 独立 Rule 管理。
- RulePack 嵌套。
- Profile 继承或模板继承。
- Profile 历史版本、回滚、乐观锁或冲突合并。
- 节点测速和自动健康检查。
- 用户自定义编译脚本。
- Token 有效期和访问历史。
- 密码找回、TOTP 恢复码和登录设备管理。

所有业务实体都不保存 `createdAt`、`updatedAt`、`version`、`revision` 等字段。

---

## 3. 设计原则

### 3.1 聚合所有权

- Rule 只能由 Profile 或 RulePack 拥有，不是独立实体。
- RulePack 直接拥有完整、有序的 Rule 数组。
- ProxyGroup 和 Listener 由 Profile 直接拥有。
- Profile 引用 Node、RulePack 和 ProxyProvider，但不能通过 Profile 修改这些对象。

### 3.2 完整对象与持久化引用

业务层和 API 的 Profile 详情返回完整关联对象：

- `selectedNodes` 返回完整 Node。
- RuleEntry 返回完整 RulePack。
- `passthroughProviders` 返回完整 PassthroughProvider。
- Derived Listener 返回完整 UserDefinedNode。

这些对象表示实时关联，不是 Profile 内的快照。持久化层只保存稳定关联标识，读取时解析为当前对象。关联对象变化后，Profile 不需要重新保存。

### 3.3 只抽象外部边界

不再要求每个功能模块都定义接口。只有存在 I/O、副作用或多实现需求的边界才抽象，例如：

- SQLite/PostgreSQL 数据访问与事务。
- 远程 HTTP 拉取。
- 订阅文本解析。
- 本地/外部定时调度。
- 密码哈希、JWT、TOTP 和 Secret 加密。

Rule 序列化、Profile 校验和 Mihomo 编译采用具体的纯领域服务，不为了形式统一增加接口。

### 3.4 字段命名

- ClashDash 明确定义的字段使用小驼峰。
- Provider 的 `excludeFilter`、`excludeType` 以及 `override` 内字段使用小驼峰。
- 输出 Mihomo YAML 时，将已知字段映射为 Mihomo 的横线命名。
- `Proxy`、`Listener`、`ProxyGroup`、`generalConfig` 中未被 ClashDash 建模的扩展字段保留用户输入的 Mihomo 原始键名，不递归猜测或重命名未知字段。

---

## 4. 通用值类型

```ts
type JsonPrimitive = null | boolean | number | string

type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

type JsonObject = {
  [key: string]: JsonValue
}
```

所有扩展配置必须是可 JSON 序列化的数据，不允许函数、Symbol、循环引用或 `undefined` 值进入持久化对象。

---

## 5. Rule 与 RulePack

### 5.1 Rule

Rule 是内联值对象，一条 Rule 对应最终配置中的一行规则：

```ts
type Rule = {
  type: string
  parameters: string[]
  policy: string
  modifiers?: string[]
}
```

转换公式：

```ts
[
  rule.type,
  ...rule.parameters,
  rule.policy,
  ...(rule.modifiers ?? []),
].join(',')
```

示例：

```ts
const rule: Rule = {
  type: 'IP-CIDR',
  parameters: ['192.168.0.0/16'],
  policy: 'DIRECT',
  modifiers: ['no-resolve'],
}
```

输出：

```yaml
- IP-CIDR,192.168.0.0/16,DIRECT,no-resolve
```

通用校验：

- `type` 和 `policy` 必填。
- `parameters`、`modifiers` 保持用户顺序。
- `MATCH` 的 `parameters` 必须为空。
- 已知类型执行参数数量和修饰符校验。
- 未知类型允许保存和输出，但生成兼容性警告。

### 5.2 RulePack

```ts
type RulePack = {
  id: string
  name: string
  rules: Rule[]
}
```

- RulePack 保存完整 Rule，不保存 Rule ID。
- RulePack 内 Rule 的数组顺序就是输出顺序。
- RulePack 不嵌套其他 RulePack。
- RulePack 变化后，引用它的所有 Profile 实时跟随。
- 被 Profile 引用的 RulePack 不允许删除，必须先解除引用。

### 5.3 Profile RuleEntry

```ts
type RuleEntry =
  | {
      type: 'rule'
      rule: Rule
    }
  | {
      type: 'rulePack'
      rulePack: RulePack
    }
```

Rule 和 RulePack 可以在一个 Profile 中任意混排。编译时 RulePack 在当前位置展开。

不存在：

- 独立 Rule 列表。
- Rule Repository。
- Rule CRUD API。
- RulePack 到独立 Rule 的桥接关系。

---

## 6. ProxyProvider

### 6.1 Provider 类型

```ts
type ProviderBase = {
  id: string
  name: string
  url: string
  interval: number
  filter?: string
  excludeFilter?: string
  excludeType?: string
  override?: ProviderOverride
}

type ProxyProvider =
  | PassthroughProvider
  | ImportProvider

type PassthroughProvider = ProviderBase & {
  type: 'passthrough'
  config: JsonObject
}

type ImportProvider = ProviderBase & {
  type: 'import'
  subscriptionFormat: 'clash' | 'uri' | 'base64'
}
```

PassthroughProvider：

- ClashDash 不拉取或解析远程节点。
- Provider 作为 `proxy-providers` 输出。
- 输出固定 `type: http`。
- `config` 保存未被 ClashDash 单独建模的 Mihomo Provider 字段。
- `config` 不允许重复包含 `name`、`type`、`url`、`interval`、`filter`、`exclude-filter`、`exclude-type` 或 `override`；这些字段只由对应的结构化属性生成。

ImportProvider：

- ClashDash 拉取远程内容并解析为 ProviderNode。
- `interval` 在本地模式控制进程内刷新。
- Vercel 模式忽略进程内调度，由外部 Cron 触发。
- ImportProvider 不进入最终 `proxy-providers`。

### 6.2 Filter

字段语义参照 Mihomo ProxyProvider：

- `filter`：保留名称匹配的节点。
- `excludeFilter`：排除名称匹配的节点。
- `filter` 和 `excludeFilter` 使用反引号 `` ` `` 分隔多条正则，多条之间为 OR。
- 正则表达式内部可以使用 `|`。
- `excludeType` 不使用正则，以 `|` 分隔协议类型。
- `excludeType` 根据节点配置中的 `type` 判断，匹配时忽略大小写。
- 排除判断优先于保留判断。
- 非法正则阻止保存 Provider。
- Filter 使用覆写前的原始节点名称。

### 6.3 Override

```ts
type ProviderOverride = {
  tfo?: boolean
  mptcp?: boolean
  udp?: boolean
  udpOverTcp?: boolean
  up?: string
  down?: string
  skipCertVerify?: boolean
  nameCertVerify?: string
  dialerProxy?: string
  interfaceName?: string
  routingMark?: number
  ipVersion?: string
  additionalPrefix?: string
  additionalSuffix?: string
  proxyName?: Array<{
    pattern: string
    target: string
  }>
  overrideExpr?: string[]
}
```

应用顺序与 Mihomo 保持一致：

1. 先完成 `filter`、`excludeFilter`、`excludeType`。
2. 应用固定代理字段覆写。
3. 按数组顺序应用 `proxyName`。
4. 应用 `additionalPrefix`。
5. 应用 `additionalSuffix`。
6. 按数组顺序应用 `overrideExpr`。

序列化为 Mihomo YAML 时的已知映射：

| ClashDash | Mihomo |
|---|---|
| `excludeFilter` | `exclude-filter` |
| `excludeType` | `exclude-type` |
| `udpOverTcp` | `udp-over-tcp` |
| `skipCertVerify` | `skip-cert-verify` |
| `nameCertVerify` | `name-cert-verify` |
| `dialerProxy` | `dialer-proxy` |
| `interfaceName` | `interface-name` |
| `routingMark` | `routing-mark` |
| `ipVersion` | `ip-version` |
| `additionalPrefix` | `additional-prefix` |
| `additionalSuffix` | `additional-suffix` |
| `proxyName` | `proxy-name` |
| `overrideExpr` | `override-expr` |

参考：

- <https://wiki.metacubex.one/config/proxy-providers/>
- <https://github.com/MetaCubeX/mihomo/blob/Meta/adapter/provider/provider.go>
- <https://github.com/MetaCubeX/mihomo/blob/Meta/adapter/provider/override.go>

---

## 7. Node

### 7.1 Proxy

```ts
type Proxy = {
  type: string
  [key: string]: JsonValue
}
```

Node 名称不放入 `Proxy`。编译时输出：

```ts
{
  name: node.name,
  ...node.proxy,
}
```

`proxy` 内的 `name` 为保留字段，保存时拒绝。

### 7.2 Node 类型

```ts
type Node = UserDefinedNode | ProviderNode

type UserDefinedNode = {
  type: 'userdefined'
  id: string
  name: string
  tags: string[]
  proxy: Proxy
  listenerTemplate?: ListenerTemplate
}

type ProviderNode = {
  type: 'provider'
  id: string
  name: string
  tags: string[]
  proxy: Proxy
  provider: ImportProvider
}
```

规则：

- UserDefinedNode 可编辑和删除。
- ProviderNode 只能由所属 ImportProvider 刷新、切换模式或删除来改变。
- ProviderNode 不允许拥有 ListenerTemplate。
- 不保存 `readOnly`，节点类型本身决定可修改性。
- 不单独保存 `protocol`，协议取自 `proxy.type`。

### 7.3 UserDefined Node 导入

用户可通过以下输入创建一个或多个 UserDefinedNode：

- Clash YAML。
- URI 列表。
- Base64 编码的 URI 列表。

解析格式属于输入操作，不保存到 Node。解析完成后 Node 与手工结构化创建的 UserDefinedNode 完全一致。

### 7.4 ProviderNode 稳定身份

Provider 刷新不能无条件生成新 Node ID，否则所有 Profile 选择都会失效。

刷新匹配要求：

- 同一上游节点再次出现时沿用原 Node ID。
- 参数变化更新原 Node。
- 上游节点消失后删除对应 ProviderNode。
- 无法可靠识别为旧节点时才创建新 Node。

上游订阅通常没有稳定 ID，因此导入适配器维护内部 `upstreamKey`。建议匹配顺序：

1. 上次保存的唯一原始名称。
2. 协议、服务器、端口和协议身份字段组成的稳定指纹。
3. 对重复或歧义项使用确定性的碰撞序号。

`upstreamKey` 是持久化细节，不进入 Node 业务对象。

---

## 8. Listener

### 8.1 UserDefined Listener

```ts
type Listener = {
  name: string
  type: string
  [key: string]: JsonValue
}
```

Listener 没有额外 ID，在一个 Profile 内以 `name` 唯一标识。

### 8.2 ListenerTemplate

UserDefinedNode 可保存一个不含 `name` 的 Listener 模板：

```ts
type ListenerTemplate = {
  type: string
  [key: string]: JsonValue
}
```

### 8.3 ListenerEntry

```ts
type ListenerEntry =
  | {
      type: 'userdefined'
      listener: Listener
    }
  | {
      type: 'derived'
      name: string
      node: UserDefinedNode
    }
```

Derived Listener 编译规则：

```ts
{
  name: entry.name,
  ...entry.node.listenerTemplate,
}
```

- Profile 只决定派生 Listener 的名称。
- v1 不支持 Profile 对 ListenerTemplate 字段覆写。
- 派生结果不回写 Node 或 Profile。
- Node 模板变化后派生结果实时跟随。
- Derived Listener 的 Node 必须同时出现在 Profile 的 `selectedNodes`。
- 节点删除或取消模板后，条目保留并标为失效，编译时警告并跳过。

---

## 9. ProxyGroup

ProxyGroup 是 Profile 内的结构化 Mihomo 对象，不是卡片，也不保存为 YAML 字符串。

```ts
type ProxyGroup = {
  name: string
  type: string
  proxies?: string[]
  use?: string[]
  [key: string]: JsonValue | undefined
}
```

规则：

- `name` 和 `type` 必填。
- ProxyGroup 在一个 Profile 内名称唯一。
- 数组顺序就是输出顺序。
- `proxies` 可引用已选择 Node、其他 ProxyGroup 或 Mihomo 内建策略。
- `use` 可引用当前 Profile 的 PassthroughProvider。
- ProxyGroup 不允许直接或间接循环引用。
- 未建模的 Mihomo 字段原样保留。
- Profile 保存整个 ProxyGroup 数组，不提供卡片 ID 或 YAML payload。

---

## 10. Profile

```ts
type Profile = {
  id: string
  name: string
  tags: string[]
  note?: string
  generalConfig: JsonObject
  selectedNodes: Node[]
  listeners: ListenerEntry[]
  proxyGroups: ProxyGroup[]
  ruleEntries: RuleEntry[]
  passthroughProviders: PassthroughProvider[]
}
```

这里的 Profile 是关联对象全部解析成功后的业务模型。持久化记录可能包含已删除对象的 ID，因此读取编辑数据时同时返回缺失引用：

```ts
type MissingProfileReference = {
  area:
    | 'selectedNodes'
    | 'listeners'
    | 'ruleEntries'
    | 'passthroughProviders'
  position: number
  id: string
  displayName?: string
}

type ResolvedProfile = {
  profile: Profile
  missingReferences: MissingProfileReference[]
}
```

- 正常关联在 `profile` 中返回完整对象。
- 缺失关联以原数组位置出现在 `missingReferences`，供 UI 显示失效占位项。
- 用户没有显式删除失效占位项时，保存操作继续保留原 ID 和顺序。
- ProfileCompiler 接收解析后的 Profile 和缺失引用诊断；缺失 Node 或 Derived Listener 按 Warning 跳过。
- `MissingProfileReference` 是编辑和诊断读模型，不改变正常 RuleEntry 直接携带完整 RulePack 的业务设计。

### 10.1 保存语义

- Profile 作为一个完整聚合保存。
- 数组增删和拖拽完成后整体覆盖保存。
- 不提供 Profile 内部对象的独立持久化生命周期。
- 不检查版本冲突，最后一次保存覆盖此前内容。
- 保存 Profile 不能修改嵌入展示的 Node、RulePack 或 Provider。
- 服务端使用关联对象的 ID 重新取得权威对象。

### 10.2 generalConfig

`generalConfig` 保存由用户控制的其他 Mihomo 顶层字段。

以下字段由 Profile 编译器生成，不允许出现在 `generalConfig`：

```text
proxies
listeners
proxy-groups
proxy-providers
rules
```

### 10.3 名称空间

一个 Profile 中以下名称共同参与引用解析：

- Node 名称。
- ProxyGroup 名称。
- PassthroughProvider 名称。
- Mihomo 内建策略名称。

约束：

- 同类名称不能重复。
- Node 与 ProxyGroup 不能同名。
- ProxyGroup 与 Provider 不应同名，编译时按错误处理。
- 用户名称不能占用 Mihomo 内建策略名。
- 名称冲突不自动重命名。

---

## 11. Profile 编译

### 11.1 诊断模型

```ts
type ProfileDiagnostic = {
  severity: 'error' | 'warning'
  code: string
  message: string
  location?: string
}

type ProfileCompileResult = {
  config?: JsonObject
  yaml?: string
  diagnostics: ProfileDiagnostic[]
}
```

- Warning 不阻止订阅输出。
- Error 阻止订阅输出。
- 管理预览可返回部分配置和完整诊断。
- 订阅接口不向客户端暴露内部诊断详情。

### 11.2 编译顺序

1. 校验并复制 `generalConfig`。
2. 按 `selectedNodes` 顺序生成 `proxies`。
3. 按 `listeners` 顺序生成 `listeners`。
4. 按 `passthroughProviders` 顺序生成 `proxy-providers`。
5. 校验并按顺序生成 `proxy-groups`。
6. 按 `ruleEntries` 顺序展开并生成 `rules`。
7. 序列化为确定性的 YAML。

空的生成段默认省略。

### 11.3 引用与错误

Warning：

- 已选择 Node 不存在：跳过 Node。
- Derived Listener 的 Node 或模板不存在：跳过 Listener。
- 未知 Rule 类型：保留输出。
- `MATCH` 后存在不可达规则。

Error：

- 名称重复或占用内建名称。
- ProxyGroup 引用不存在的 Node、Group 或 Provider。
- ProxyGroup 循环引用。
- Rule policy 无法解析。
- RulePack 不存在。
- Listener 名称或监听端点冲突。
- `generalConfig` 包含保留字段。
- 任一结构化对象不满足必填或类型约束。

如果缺失 Node 同时仍被 ProxyGroup 引用，则 Node 缺失本身是 Warning，但 ProxyGroup 的无效引用是 Error。

### 11.4 确定性

- 编译过程不修改输入对象。
- 相同业务数据必须生成一致的 YAML。
- 数组严格保持用户顺序。
- 对象扩展字段不应在读取、保存、编译过程中丢失。

---

## 12. SubscriptionToken

### 12.1 业务模型

```ts
type SubscriptionToken = {
  id: string
  note?: string
  profile: Profile
  token: string
}
```

- 一个 Token 只绑定一个 Profile。
- 一个 Profile 可以有多个 Token。
- Token 没有过期时间，直到用户撤销。
- 管理用户可以重复读取明文 Token 和完整订阅 URL。
- 删除 Profile 时删除其全部 Token。
- 撤销一个 Token 不影响同一 Profile 的其他 Token。

### 12.2 存储

为了同时满足鉴权查询和明文重复读取，持久化保存：

```ts
type StoredSubscriptionToken = {
  id: string
  note?: string
  profileId: string
  tokenHash: string
  encryptedToken: string
}
```

- `tokenHash` 用于订阅请求查找。
- `encryptedToken` 用于管理用户读取明文。
- 加密密钥来自部署 Secret，不写入数据库。
- Token 使用安全随机字节生成并编码为 URL-safe 字符串。

### 12.3 订阅行为

固定入口：

```http
GET /api/subscription?token=<token>
```

- SubscriptionToken 与管理 JWT、Cron Secret 互不通用。
- Token 有效且 Profile 无 Error 时返回 YAML。
- 只有 Warning 时仍返回 YAML。
- Profile 有 Error 时不返回部分配置。
- Token 无效或已撤销时返回相同行为。
- 响应禁止公共缓存，日志隐藏查询参数中的 Token。

---

## 13. 单用户认证

```ts
type User = {
  username: string
  passwordHash: string
  totpEnabled: boolean
  totpSecretEncrypted?: string
}
```

- 系统只有一个 User。
- 不提供注册、用户列表、删除、角色和权限管理。
- 数据库为空时，通过部署初始化配置创建唯一用户。
- 已有用户后忽略初始化配置。
- 用户名不存在和密码错误返回相同登录失败信息。
- 管理员可在 UI 中验证当前密码后修改密码，新密码不施加长度或字符复杂度策略。
- TOTP 为可选 RFC 6238 第二因子；绑定时返回二维码和 Secret，正确验证码确认后才启用。
- TOTP Secret 只以 AES-256-GCM 密文保存。启用后，登录和修改密码必须同时验证动态码。
- 停用 TOTP 必须验证当前密码和动态码，并删除持久化 Secret。

管理 JWT 至少包含：

```ts
type AdminJwtPayload = {
  sub: string
  iss: 'clashdash'
  aud: 'clashdash-admin'
  exp: number
}
```

`exp` 是 JWT 自身的安全声明，不是业务实体时间字段。

- JWT 默认有效期 24 小时。
- 不提供 Refresh Token 和服务端 JWT 黑名单。
- Logout 由前端删除 JWT 完成。
- 管理接口使用 `Authorization: Bearer <jwt>`。
- 更换签名 Secret 会使现有管理 JWT 全部失效。

---

## 14. 应用架构

```text
+---------------------------------------------------+
| React 管理 UI / Subscription / External Cron      |
+-----------------------------+---------------------+
                              |
+-----------------------------v---------------------+
| HTTP Delivery                                     |
| Auth middleware / DTO validation / error mapping  |
+-----------------------------+---------------------+
                              |
+-----------------------------v---------------------+
| Application Use Cases                             |
| Auth / Nodes / Providers / RulePacks / Profiles / |
| Subscriptions                                     |
+-----------------------------+---------------------+
                              |
+-----------------------------v---------------------+
| Domain                                            |
| Models / validators / MihomoProfileCompiler       |
+-----------------------------+---------------------+
                              |
+-----------------------------v---------------------+
| Infrastructure Ports                              |
| Store / HTTP fetch / parsers / scheduler / crypto |
+---------------------------------------------------+
```

依赖方向从外向内。Domain 不依赖 Web 框架、数据库驱动、定时库或部署平台。

### 14.1 应用用例

```text
Auth
  login / getCurrentUser / logout / getSecurityStatus
  changePassword / beginTotpSetup / confirmTotpSetup / disableTotp

Nodes
  listNodes / createUserDefinedNode / importUserDefinedNodes
  updateUserDefinedNode / deleteUserDefinedNode

Providers
  listProviders / createProvider / updateProvider / deleteProvider
  refreshProvider / refreshAllImportProviders

RulePacks
  listRulePacks / createRulePack / updateRulePack / deleteRulePack

Profiles
  listProfiles / getProfile / createProfile / saveProfile
  previewProfile / previewProfileDraft / deleteProfile

Subscriptions
  listSubscriptionTokens / issueSubscriptionToken
  getSubscriptionToken / revokeSubscriptionToken / renderSubscription
```

Rule、Listener 和 ProxyGroup 没有独立应用服务。

### 14.2 外部端口

只为以下能力定义端口：

- `AppStore`：聚合读写和事务。
- `RemoteContentFetcher`：远程 Provider 内容拉取。
- `SubscriptionParserRegistry`：按输入格式解析代理对象。
- `ProviderScheduler`：本地调度或 no-op 调度。
- `PasswordHasher`：密码哈希和校验。
- `AdminTokenService`：JWT 签发和验证。
- `TotpService`：RFC 6238 Secret、验证码和 provisioning URI。
- `SecretCipher`：TOTP 等持久化 Secret 的认证加密。
- `SubscriptionTokenCipher`：Token 加解密和摘要。

不定义 `Repo<T>`、`IConfigRenderer` 或每个模块一套形式化接口。

---

## 15. Provider 刷新事务

单个 ImportProvider 的刷新流程：

```text
取得 Provider 刷新锁
        ↓
拉取远程内容（事务外）
        ↓
解析、过滤、覆写（事务外）
        ↓
校验全部候选节点（事务外）
        ↓
开启数据库事务
        ↓
匹配旧节点并保留稳定 ID
        ↓
新增、更新、删除 ProviderNode
        ↓
提交事务
        ↓
释放刷新锁
```

要求：

- 拉取、解析、Filter、Override 或校验失败时不修改旧节点。
- 同一个 Provider 不允许两个刷新同时提交。
- 不同 Provider 可以并行刷新，但设置有限并发数。
- 全量 Cron 刷新中一个 Provider 失败不影响其他 Provider。
- 数据库事务只覆盖最终替换，不能包住远程网络请求。
- 删除的 ProviderNode 可能使 Profile 出现悬空选择，由编译诊断处理。

本地进程锁用于避免同进程并发；数据库侧还需要按 Provider 串行化提交，确保多实例部署下不会互相覆盖。

---

## 16. 持久化设计

### 16.1 原则

- Rule、Listener、ProxyGroup 按所属聚合嵌入保存。
- Profile 的有序内容优先保存为 JSON 数组，避免为纯值对象建立大量桥表。
- Profile 中的外部对象只保存 ID，读取时解析为完整对象。
- 为允许 Node 悬空引用，Profile JSON 中的 Node ID 不设置关系型外键。
- SQLite 和 PostgreSQL 共享逻辑契约，但分别维护方言适配与迁移，不声称使用一份物理 Schema 定义。

### 16.2 逻辑表

#### users

```text
username       primary key
password_hash  not null
totp_secret_encrypted  nullable
totp_enabled           not null, default false
```

应用保证该表最多一行。

#### providers

```text
id                   primary key
type                 passthrough | import
name                 unique, not null
url                  not null
interval             not null
subscription_format  nullable
filter               nullable
exclude_filter       nullable
exclude_type         nullable
override_json        nullable
config_json          nullable
```

数据库列使用 snake_case；读取后转换为领域模型小驼峰。

#### nodes

```text
id                      primary key
type                    userdefined | provider
name                    not null
tags_json               not null
proxy_json              not null
listener_template_json  nullable
provider_id             nullable
upstream_key            nullable
```

约束：

- `type=userdefined` 时 `provider_id`、`upstream_key` 为空。
- `type=provider` 时 `provider_id`、`upstream_key` 必填，ListenerTemplate 为空。
- `(provider_id, upstream_key)` 唯一。
- 删除 ImportProvider 时级联删除其 ProviderNode。

#### rule_packs

```text
id          primary key
name        unique, not null
rules_json  not null
```

不建立独立 Rule 表。

#### profiles

```text
id                              primary key
name                            not null
tags_json                       not null
note                            nullable
general_config_json             not null
selected_node_ids_json          not null
listeners_json                  not null
proxy_groups_json               not null
rule_entries_json               not null
passthrough_provider_ids_json   not null
```

持久化格式与业务对象的区别：

- Derived Listener 保存 Node ID，不复制 Node。
- RulePack RuleEntry 保存 RulePack ID，不复制 RulePack。
- Inline Rule 保存完整 Rule。
- `selectedNodes` 保存有序 Node ID。
- `passthroughProviders` 保存有序 Provider ID。

读取 Profile 时批量解析这些 ID，并生成完整对象或缺失引用诊断。

#### subscription_tokens

```text
id                primary key
profile_id        not null
note              nullable
token_hash        unique, not null
encrypted_token   not null
```

删除 Profile 时级联删除 Token。

### 16.3 JSON 与事务

- PostgreSQL 使用 JSONB。
- SQLite 使用 TEXT 保存规范化 JSON，由适配器负责序列化和解析。
- Profile 保存为单事务整体覆盖。
- RulePack 保存为单行整体覆盖。
- Provider 刷新在单事务中更新该 Provider 的全部 Node。
- 每个存储适配器必须通过同一套契约测试。

---

## 17. REST 资源表面

详细 DTO 属于实施文档，本设计只固定资源和行为边界。

```text
/api/auth
  login / me / logout

/api/account
  security status / change password / setup, confirm and disable TOTP

/api/nodes
  list / create userdefined / import / update / delete

/api/providers
  list / detail / create / update / delete / refresh

/api/rule-packs
  list / detail / create / update / delete

/api/profiles
  list / detail / create / save / delete / preview

/api/profiles/:id/tokens
  list plaintext tokens / create

/api/tokens/:id
  detail plaintext token / revoke

/api/subscription?token=...
  render bound Profile as YAML

/api/cron/refresh-providers
  refresh all ImportProvider with Cron Secret
```

Profile 保存使用完整聚合请求，不提供 ProxyGroup 卡片或独立 Rule 接口。

---

## 18. UI 设计边界

管理 UI 保持三个主要工作区：

### 18.1 Nodes

- UserDefined Node 列表、筛选、创建、文本导入、编辑和删除。
- Provider 列表作为 Nodes 工作区的来源管理区域。
- Provider 创建、编辑、刷新状态和刷新结果。
- ProviderNode 明确展示只读来源。
- ListenerTemplate 只在 UserDefinedNode 编辑器中出现。

### 18.2 Profile Editor

- 名称和 Tag 使用独立输入框。
- GeneralConfig 使用 YAML 文本编辑，保存时解析为对象。
- RuleEntry 使用可拖拽列表；内联 Rule 以行卡片编辑，并可与完整 RulePack 混排。
- Proxy 和 Listener 使用相同布局的选择器：选择按钮打开节点池浮层，下方显示已选择卡片；浮层支持快速创建 UserDefined Proxy 或 Profile 内联 Listener。
- ProxyGroup 使用卡片组；创建和编辑浮层只提供一个原始 YAML 文本框，保存后仍以对象进入 Profile。
- PassthroughProvider 使用独立选择器和已选卡片列表。
- 实时预览、错误和警告定位。
- SubscriptionToken 创建、明文查看、复制 URL 和撤销。

### 18.3 RulePacks

- RulePack 列表。
- 与 Profile 共用同一个可拖拽 Rule 行卡片编辑器，在 RulePack 内创建、编辑、删除和排序完整 Rule。
- RulePack 编辑器不显示 RulePack 选择入口，禁止嵌套。
- 展示引用该 RulePack 的 Profile。
- 被引用时阻止删除。

### 18.4 账户安全

- 展示密码持久化方式和 TOTP 状态。
- 验证当前密码后修改密码。
- 生成 TOTP 二维码、显示一次绑定 Secret，并使用 6 位动态码确认启用。
- 启用后，验证当前密码和动态码才能停用。

拖拽只改变数组顺序，用户点击保存时整体提交所属 Profile 或 RulePack。

---

## 19. 部署

### 19.1 本地

- 单 Node.js 进程提供管理 API、订阅接口和静态 UI。
- 可选 SQLite 或 PostgreSQL。
- ProviderScheduler 按 ImportProvider.interval 运行。
- 应用启动时注册已有 ImportProvider；创建、修改和删除 Provider 时同步更新调度。

### 19.2 Vercel

- 使用 Node.js Functions，不依赖常驻进程。
- 只使用 PostgreSQL。
- ProviderScheduler 为 no-op。
- 外部 Cron 使用 `CRON_SECRET` 调用刷新入口。
- 不要求在 `vercel.json` 中配置付费 Cron。
- 全量刷新使用有限并发，并为单个 Provider 设置网络超时。

### 19.3 配置

建议环境配置：

```text
DATABASE_URL
DATABASE_DIALECT=sqlite|postgres
DEPLOYMENT_MODE=local|vercel
APP_BASE_URL
PORT
JWT_SECRET
SUB_TOKEN_ENCRYPTION_KEY
TOTP_ENCRYPTION_KEY (optional, defaults to SUB_TOKEN_ENCRYPTION_KEY)
CRON_SECRET
INITIAL_USERNAME
INITIAL_PASSWORD
```

要求：

- Vercel 模式禁止 SQLite。
- 生产环境必须显式提供 JWT、Token 加密和 Cron Secret。
- 日志不得输出密码、JWT、SubscriptionToken、Cron Secret 或带 Token 的完整 URL。

---

## 20. 技术实现建议

技术栈是本设计的新实现选择，不从旧文档的接口约束推导：

- Runtime：Node.js 当前 LTS、TypeScript、ESM。
- HTTP：Hono。
- UI：React、Vite、Tailwind CSS、dnd-kit。
- Schema validation：Zod。
- YAML：`yaml`。
- SQL：Drizzle ORM，PostgreSQL/SQLite 分别维护方言定义和迁移。
- SQLite：仅本地使用的同步驱动。
- HTTP fetch：Node.js 内置 `fetch`。
- Local scheduler：node-cron。
- JWT：支持 ESM 且可固定算法、issuer、audience 的 JOSE 实现。
- Password：适合服务端密码存储的慢哈希实现。
- Test：Vitest；UI 端到端测试使用浏览器自动化工具。

选型原则：

- Vercel 运行于 Node.js Runtime，不以 Edge Runtime 兼容为目标。
- 不依赖运行时本地文件持久化。
- 不在 Domain 中导入 ORM、Web 框架或 UI 类型。

---

## 21. 测试策略

### 21.1 Domain 单元测试

- Rule 转换和类型校验。
- RulePack 展开顺序。
- ProxyGroup 引用图和循环检测。
- 名称空间冲突。
- UserDefined/Derived Listener 编译。
- Mihomo 字段小驼峰到横线命名映射。
- 编译确定性和扩展字段保留。

### 21.2 Provider 测试

- Clash、URI、Base64 三种解析。
- Filter、ExcludeFilter、ExcludeType 与 Mihomo 语义一致。
- Override 固定字段、ProxyName、前后缀和 OverrideExpr 顺序。
- 刷新失败保留旧节点。
- 稳定匹配保留 Node ID。
- 同 Provider 并发刷新串行化。
- 多 Provider 刷新部分失败隔离。

### 21.3 Store 契约测试

同一套用例分别运行在 SQLiteStore 和 PostgresStore：

- 聚合 CRUD。
- Profile 有序数组往返不变。
- RulePack 完整 Rule 往返不变。
- Provider 刷新事务回滚。
- ProviderNode 级联删除。
- Profile 删除级联 Token。
- Token 摘要唯一和明文可重复解密。

### 21.4 API 与安全测试

- 管理 JWT、SubscriptionToken、Cron Secret 不能混用。
- 登录错误不泄露用户名存在性。
- TOTP 使用 RFC 标准向量测试，并覆盖绑定、确认、登录、修改密码和停用流程。
- 数据库存储 TOTP 密文而不是明文 Secret。
- 无效和已撤销 SubscriptionToken 返回一致。
- Token 不进入日志和缓存。
- ProviderNode 修改接口被拒绝。
- Rule、Listener、ProxyGroup 不存在独立 CRUD。

### 21.5 Golden tests

为典型 Profile 保存输入对象和期望 YAML：

- 纯客户端配置。
- UserDefined Listener 服务端配置。
- ImportProvider Node。
- PassthroughProvider。
- Inline Rule 与 RulePack 混排。
- 悬空 Node Warning。
- 配置 Error 阻止订阅输出。

可选在 CI 中使用 Mihomo 配置检查命令验证 Golden YAML。

---

## 22. 项目结构建议

```text
src/
  domain/
    models/
    validation/
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
      sqlite/
      postgres/
    provider-fetch/
    parsers/
    scheduler/
    security/
  http/
    middleware/
    routes/
    dto/
  server/

ui/
  src/
    features/
      auth/
      nodes/
      providers/
      profiles/
      rule-packs/
      subscriptions/
```

模块组织按业务能力和依赖方向划分，不按每个数据库表机械拆分 Service/Repository。

---

## 23. 关键验收条件

1. 系统中不存在独立 Rule 实体、表、页面或 API。
2. RulePack 保存完整 Rule，Profile 可将 Rule 和 RulePack 任意混排。
3. Profile 中 ProxyGroup 以结构化对象保存，不存在卡片和 YAML payload。
4. 所有 `manual` 业务命名均替换为 `userdefined`。
5. Provider Filter 和 Override 行为与 Mihomo 保持一致，内部字段采用小驼峰。
6. Provider 刷新后，相同上游节点保持 Node ID 和 Profile 选择关系。
7. Provider 刷新失败不会破坏上一份有效节点。
8. Derived Listener 实时使用 UserDefinedNode 当前模板。
9. Profile 关联对象变化后无需重新保存即可反映在订阅输出中。
10. Profile 编译 Warning 可继续输出，Error 阻止订阅输出。
11. 管理用户可重复读取 SubscriptionToken 明文和订阅 URL。
12. SQLite 和 PostgreSQL 对同一业务输入产生相同对象和 YAML。
13. 本地定时刷新与外部 Cron 刷新都可用。
14. 所有业务实体都没有时间戳和版本字段。

---

## 24. 后续实施顺序

1. 建立 Domain 类型、校验器和 MihomoProfileCompiler。
2. 实现 Provider 解析、Filter、Override 和稳定身份匹配。
3. 定义 AppStore 端口并完成 SQLiteStore。
4. 完成应用用例和 HTTP Delivery。
5. 实现 PostgreSQLStore 并运行存储契约测试。
6. 实现管理 UI。
7. 完成本地调度、外部 Cron 和 Vercel 入口。
8. 通过 Golden YAML、数据库契约和端到端测试完成 v1 验收。
