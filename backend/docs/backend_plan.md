# Web 后端构建与数据库规划

> 项目：online_map_try Web 版本
> 文档范围：后端服务与数据库设计
> 当前阶段：规划阶段
> 更新时间：2026-09-09
>
> 本文只关注后端和数据库，不讨论 Web 前端页面、组件和交互实现。

---

## 1. 项目目标

Web 版本是现有微信小程序版 `online_map_try` 的网站版本。

当前后端阶段主要实现以下三个功能：

1. 学生打开页面按设备自动签发 student JWT（无感登录），工作人员通过专用入口输入白名单姓名后签发 staff JWT；
2. 用户浏览不同摊位后，去重累计并解锁“百事通”徽章；
3. 领取码签发、工作人员核验以及一次性原子核销。

本阶段不处理：

- Web 前端页面；
- 前端路由和组件；
- 地图视觉展示；
  - 摊位详情页的 UI；
- 活动后台管理页面；
- 工作人员管理后台页面；
- 支付功能；
- 微信 `openid` 登录；
- 账号密码注册与登录；
- 复杂的权限管理系统。

---

## 2. 当前后端基础

当前 Web 后端基于以下技术：

- Node.js
- Express
- SQLite
- `node:sqlite`
- SQLite WAL 模式
- 每个连接显式开启 `PRAGMA foreign_keys=ON`
- JWT
- 数据库事务

———

## 3. 当前功能缺口

目前后端需要补齐以下内容：

### 3.1 领取码功能

目前没有完整实现：

- 领取码签发；
- 领取码哈希存储；
- 以统一活动截止时间作为领取码失效点；
- 领取码状态查询；
- 学生解锁 knowitall 后领取码的签发与复用；

### 3.2 工作人员核验

目前没有完整实现：

- 工作人员角色校验；
- 工作人员核验领取码；
- 检查领取码是否存在；
- 检查领取码是否已超过活动截止时间；
- 检查领取码是否已经使用；
- 返回可供工作人员确认的奖励信息。

### 3.3 工作人员核销

目前没有完整实现：

- 工作人员原子核销；
- 防止并发重复核销；
- 防止同一个领取码被重复使用；
- 核销记录；
- 核销时间；
- 核销工作人员记录。

### 3.4 数据库迁移

目前需要增加版本化数据库迁移机制，避免后续直接修改生产数据库结构。

建议新增：
schema_migrations

用于记录已经执行过的数据库迁移版本。

———

## 4. 后端分层建议

建议保持以下分层：

```text
HTTP Route
↓
Middleware
↓
Service / Domain Logic
↓
Repository / SQL
↓
SQLite Database
```

### 4.1 Route 层

负责：

- 解析请求参数；
- 校验基本字段；
- 调用业务服务；
- 返回 HTTP 状态码；
  - 统一返回错误格式。

Route 层不应直接实现复杂数据库事务。

### 4.2 Middleware 层

建议包含：

```text
requireAuth
requireStaff
errorHandler
validateRequest
```

其中：

- requireAuth：校验 JWT；
- requireStaff：校验登录用户当前仍然是工作人员；
- errorHandler：统一处理错误；
- validateRequest：校验请求参数。

### 4.3 Service 层

建议新增或拆分以下服务：

```text
authService
boothViewService
badgeService
claimTokenService
staffRedemptionService
```

其中：

- authService：student（device_id）无感签发、staff 白名单姓名校验与签发；
- boothViewService：记录摊位浏览；
- badgeService：统计浏览进度和解锁徽章；
- claimTokenService：获取（固定唯一码）、校验领取码；
- staffRedemptionService：核验和原子核销。

### 4.4 Repository 层

Repository 层负责：

- 执行 SQL；
- 查询数据；
- 插入记录；
- 更新状态；
- 处理数据库结果。

业务规则应尽量保留在 Service 层，而不是散落在 Route 和 SQL 中。

———

## 5. 用户与登录设计

## 5.1 用户角色与入口

系统只设两种角色，不设管理员：

```text
角色      权限
━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
student  浏览摊位、查看徽章、领取奖励、查看自己的领取码
────────  ──────────────────────────────────────────────
staff    核验领取码、核销领取码、查看后台数据
```

无账号密码，身份由入口自动区分：

```text
学生       打开公共入口页面 → 自动完成身份签发，无任何输入
工作人员   打开专用入口页面 → 输入姓名（须在白名单中）→ 获得 staff 身份
```

身份标识：

- 学生：身份是设备标识 device_id，由前端生成并保存在浏览器 localStorage，后端不为学生建立任何用户行；
- 工作人员：身份是姓名 name，来自工作人员白名单表 staff_whitelist（见 7.1），姓名在签发时必须真实存在。

———

## 5.2 JWT 签发

登录方式（无感登录，无注册、无密码）：

```text
学生 student      打开页面 → 前端读取本地 device_id → 自动调用登录接口，签发 student JWT
工作人员 staff   打开专用入口（?code=staff2026）→ 输入姓名 → 校验通过后签发 staff JWT
```

学生不需要任何输入；工作人员还需额外提供姓名以完成白名单校验，仅凭识别码无法登录。

统一失效点：

所有 JWT 的过期时间统一指向活动截止时间，不按签发时刻计算相对时长：

北京时间 2026-09-19 23:59:59

建议 JWT Payload：

学生令牌：

```json
{
"sub": "dev_1726735999_a8f3k2XY",
"role": "student",
"iat": 0,
"exp": 0
}
```

工作人员令牌：

```json
{
"sub": "张三",
"role": "staff",
"name": "张三",
"iat": 0,
"exp": 0
}
```

说明：

- 学生的 sub 是 device_id（见 5.4 设备标识规则），用于追踪该设备的浏览、徽章、领取记录；
- 工作人员的 sub 与 name 都是白名单中的姓名，用于识别具体操作人；
- exp 为活动截止时间（北京时间 2026-09-19 23:59:59）的绝对时间戳，与领取码失效点一致；到期后令牌自动失效，无需人工清理；
- role 建议放入 JWT：前端可据此一眼区分并展示学生 / 工作人员两套界面，无需多发一次 /me 请求；但 role 只能作为身份提示，不能作为唯一的权限依据；
- 真正的权限依据取决于 sub 指向的身份：student 无撤销需求（无状态，签发后有效至活动结束）；staff 有实时撤销需求，每次都要查白名单；
- 每次需要 staff 权限时，都要实时核对姓名是否仍在白名单中——仅验 JWT 是不够的，因为旧令牌在技术上仍然有效；
- 若某姓名从白名单移除，staff 接口会因查不到该姓名而立即返回错误，旧 staff JWT 随即失效，从而实现即时撤销；
- JWT 密钥来自环境变量 JWT_SECRET，不写死在代码里、不提交进仓库；否则任何拿到代码的人都能用同一密钥自行伪造一张签名有效的 staff JWT。

建议环境变量：

```text
JWT_SECRET=replace-with-a-long-random-secret
STAFF_CODE=staff2026
ACTIVITY_END=2026-09-19T23:59:59+08:00
```

生产环境必须使用强随机 JWT 密钥，且不写入代码仓库。

———

## 5.3 认证接口

### 学生自动登录（student）

前端打开公共入口时自动完成身份初始化：

POST /api/auth/student

请求体：

```json
{
"deviceId": "dev_1726735999_a8f3k2XY"
}
```

处理流程：

1. 校验并规整 device_id（格式见 5.4）；
2. 若未携带 device_id，后端自动生成随机 UUID 作为兜底；
3. 签发 role = 'student' 的 JWT，sub = device_id；
4. JWT exp = 活动截止时间（北京时间 2026-09-19 23:59:59）；
5. 返回 JWT 与学生身份信息。

要点：

- 前端无需登录框，不要求用户输入任何信息；
- 后端不创建学生用户行，浏览、徽章、领取记录都按 device_id 记账；
- 学生令牌为无状态设计，签发后有效至活动结束。

### 工作人员登录（staff 白名单）

工作人员通过专用入口进入，输入姓名后由后端校验并签发 staff JWT：

POST /api/auth/staff

请求体：

```json
{
"code": "staff2026",
"name": "张三"
}
```

处理流程：

1. 校验 code 是否等于环境变量 STAFF_CODE；
2. 查询工作人员白名单表 staff_whitelist，确认 name 存在；
3. 上述两者缺一不可，任一失败都返回 401 且不区分失败原因；
4. 签发 role = 'staff' 的 JWT，sub = name，name = name；
5. JWT exp = 活动截止时间（北京时间 2026-09-19 23:59:59）；
6. 返回 JWT 与工作人员信息。

要点：

- 仅有识别码无法登录，姓名必须真实存在于白名单；
- 每次 staff 敏感操作仍应实时核对姓名是否在白名单中，实现权限即时撤销；
- 普通学生不能通过该接口获得 staff 身份；
- 识别码不放入学生令牌，其生成与安全细节见 18.10。

不应返回：

- JWT Secret；
- code；
- 白名单完整内容；
- 内部数据库信息。

### 获取当前用户

GET /api/auth/me

请求头：

Authorization: Bearer <jwt>

返回当前用户基本信息。

学生端查看徽章解锁与领取码状态请使用 9.1 的 `GET /api/me/reward`，不要把奖励状态塞进 /me，保持 `/me` 只表达身份。

## 5.4 设备标识规则（device_id）

学生的身份完全由前端生成的 device_id 表达，规则如下。

生成：

前端页面加载时检查浏览器 localStorage 中是否已有 device_id：

- 存在则直接复用；
- 不存在则生成新值并写入 localStorage。

格式：

```text
dev_<时间戳>_<8 位随机字符>
```

示例：dev_1726735999_a8f3k2XY

说明：

- 时间戳取设备首次访问的秒级时间；
- 8 位随机字符从大小写字母和数字中选取，降低同一秒内重复概率；
- 同一设备反复打开页面得到同一 device_id，便于后端按设备聚合记录；
- device_id 包含时间戳，便于运营判断设备首次访问时间；
- 链接被分享后，他人打开会生成不同 device_id，不会被误认为同一学生；
- 学生在调用登录接口时必须把 device_id 作为请求参数传给后端，后端将其填入 JWT 的 sub。

———

## 6. 数据库总体设计

当前核心数据关系：

学生身份是 device_id（见 5.4），不落库；以下记录类表都以 device_id 作为学生维度的主键。

```text
events
├── badges               （徽章定义；本阶段只有 knowitall 一条）
│    └── user_badges     （device_id 的解锁记录）
├── booth_view_records   （device_id 的浏览去重记录）
└── claim_tokens         （每学生一条领取码，直接挂 device_id）
      └── redemptions    （核销成功记录，claim_token_id 唯一）
```

```text
staff_whitelist
├── claim_tokens      （redeemed_by 记录核销 staff）
└── redemptions       （staff_name 记录核销 staff）
```

关系说明：

- 本阶段固定为一个活动、一个徽章（knowitall）、一个奖励；`reward_code` 不在数据库重复存储，在代码里写死为常量（如 `REWARD_CODE = 'free-drink'`）；
- 学生链路：浏览不同摊位去重累计 → 达标后写 user_badges（解锁记录）；首次出示领取码时写 claim_tokens（直接关联 device_id，UNIQUE(device_id) 保证每学生至多一条）；
- 核销链路：staff 提交领取码 → claim_tokens.status 由 active 置 redeemed → redemptions 追加一条核销记录；
- 一个领取码只能被成功核销一次（redemptions.claim_token_id 唯一）；
- staff 的核销记录引用白名单中的姓名。

———

## 7. 核心表设计

系统不设 users 表：学生身份为前端 device_id（见 5.4），不落库；staff 身份来自 staff_whitelist 白名单。

## 7.1 staff_whitelist

工作人员白名单表，staff 的姓名即身份来源。

建议字段：

```sql
CREATE TABLE staff_whitelist (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT NOT NULL UNIQUE,
created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

字段说明：

```text
字段             说明
━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━
id               白名单记录 ID
───────────────  ─────────────────
name             工作人员姓名（唯一）
───────────────  ─────────────────
created_at       录入时间
───────────────  ─────────────────
updated_at       更新时间
```

说明：

- staff 登录时后端校验 STAFF_CODE 且 name 存在于本表，两者缺一不可；
- name 唯一，避免同名歧义；
- 记录表中的核销人字段（redeemed_by）引用本表姓名；
- 从本表移除某姓名，即实时撤销其 staff 权限。

安全要求：

- 本表由运营 / 管理在活动开始前通过初始化脚本或后台预先录入；
- 不提供学生注册接口，学生不写入任何身份表；
- 不设 admin 角色。

———

## 7.2 events

活动表。

建议字段：

```sql
CREATE TABLE events (
id INTEGER PRIMARY KEY AUTOINCREMENT,
slug TEXT NOT NULL UNIQUE,
name TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'draft',
end_at INTEGER NOT NULL,
created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
CHECK (status IN ('draft', 'active', 'closed'))
);
```

字段说明：

```text
字段        说明
━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━
id          活动 ID
──────────  ─────────────────────
slug        活动唯一标识
──────────  ─────────────────────
name        活动名称
──────────  ─────────────────────
status      活动状态
──────────  ─────────────────────
end_at      活动截止时间（UTC epoch 秒，统一失效点）
──────────  ─────────────────────
created_at  创建时间
──────────  ─────────────────────
updated_at  更新时间
```

统一失效点：

end_at 是活动截止时间，使用 UTC epoch 秒存储；JWT 与领取码都以它为统一失效点，不再为每条领取码单独计算有效期。所有判断使用 `now < end_at`，不得将不同格式的时间字符串直接比较。比较时必须让 `now` 与 `end_at` 同型（都用 epoch 秒整数，`now = Date.now() / 1000` 取整）；禁止把整数 `end_at` 与文本类型 `CURRENT_TIMESTAMP` 直接比较——SQLite 中该比较恒为 false，会导致核销永远失败。

关闭判定以时间为主：`now >= end_at`（半开区间，见 18.1）即视为活动关闭。`status='closed'` 仅作运营人工兜底（本阶段没有管理后台会把它置为 closed，任何代码也不会自动写）。业务统一用「活动可用 = `status='active' AND now < end_at`」这个唯一判断函数，auth / booth / claim-token / staff 各处共用，避免各路由各自散写一套时间判断。

统一的活动可用判定（独立 Util，业务代码各处必须调用它，不得自行拼条件）：

```js
function isActivityActive(event) {
  return event.status === 'active' && Date.now() / 1000 < event.end_at;
}
```

调用点都走这一个函数：学生认证（5.3）、摊位浏览（8.1）、领取码获取（9.2）、staff 核销（10.2）。以后若调整规则（如改 `<=`、新增状态），只改这一处。SQL 无法调用 JS 函数时，用与之等价的 `e.status = 'active' AND e.end_at > ?now`（见 11.3）。

当前活动取值：

北京时间 2026-09-19 23:59:59

- 权威截止时刻统一为北京时间 2026-09-19 23:59:59（UTC 2026-09-19T15:59:59.000Z）。`events.end_at`、JWT `exp`、环境变量 `ACTIVITY_END` 都以这一时刻为准；全篇只允许出现这一个时间，不得在别处再写 2026-09-20 00:00:00。

———

## 7.3 badges

徽章定义表。

建议字段：

```sql
CREATE TABLE badges (
id INTEGER PRIMARY KEY AUTOINCREMENT,
event_id INTEGER NOT NULL,
code TEXT NOT NULL,
name TEXT NOT NULL,
description TEXT,
required_unique_booths INTEGER NOT NULL,
created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
UNIQUE (event_id, code),
FOREIGN KEY (event_id) REFERENCES events(id),
CHECK (required_unique_booths > 0)
);
```

当前网页版本硬性要求：只做 knowitall，不激活 roamer。

```text
只做徽章：knowitall（百事通：浏览不同摊位去重计数后解锁）
不做徽章：roamer（漫游者 / 驻场，依赖定位上报、围栏和时长校验，本期不做）
```

徽章解锁规则：

用户在同一个活动中浏览过的不同摊位数量
>= 徽章要求数量

奖励与徽章解耦：knowitall 对应唯一的奖励，奖励类型不写进 badges；`reward_code` 由代码常量表达（`REWARD_CODE = 'free-drink'`，见 7.6）。

———

## 7.4 booth_view_records

学生设备浏览摊位记录表（device_id 见 5.4）。

建议字段：

```sql
CREATE TABLE booth_view_records (
id INTEGER PRIMARY KEY AUTOINCREMENT,
event_id INTEGER NOT NULL,
device_id TEXT NOT NULL,
booth_id TEXT NOT NULL,
first_viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
last_viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
view_count INTEGER NOT NULL DEFAULT 1,
UNIQUE (event_id, device_id, booth_id),
FOREIGN KEY (event_id) REFERENCES events(id),
CHECK (view_count > 0)
);
```

核心约束：

(event_id, device_id, booth_id) 唯一

这样可以保证：

- 同一设备重复浏览同一个摊位不会重复计数；
- 同一设备浏览不同摊位可以累计；
- view_count 可以用于统计，但徽章进度只按去重后的记录数量计算。

booth_id 语义（已确认）：本阶段不建 `booths` 表。摊位 id 由前端在约定的合法列表中写死展示，后端把 `booth_id` 当作与前端约定的不透明字符串处理，只做「非空、长度上限」的宽松校验，不校验其是否真实存在，因此不设 BOOTH_NOT_FOUND 错误码（见 12）。

记录浏览时建议使用 UPSERT：

```sql
INSERT INTO booth_view_records (
event_id,
device_id,
booth_id
)
VALUES (?, ?, ?)
ON CONFLICT (event_id, device_id, booth_id)
DO UPDATE SET
last_viewed_at = CURRENT_TIMESTAMP,
view_count = view_count + 1;
```

———

## 7.5 user_badges

学生设备已解锁徽章表。

建议字段：

```sql
CREATE TABLE user_badges (
id INTEGER PRIMARY KEY AUTOINCREMENT,
device_id TEXT NOT NULL,
badge_id INTEGER NOT NULL,
unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
UNIQUE (device_id, badge_id),
FOREIGN KEY (badge_id) REFERENCES badges(id)
);
```

核心约束：

(device_id, badge_id) 唯一

徽章解锁应该是幂等的。

同一个徽章重复触发解锁时：

- 第一次插入记录；
- 后续请求不重复插入（幂等）；
- 解锁本身不生成领取码；领取码只在学生首次出示时首签一次（见 9.2）。

———

## 7.6 奖励与领取码关系（单奖励，去中间表）

本阶段固定为一个活动、一个徽章（knowitall）、一个奖励，不再引入 reward_entitlements 中间表：

- 奖励类型用代码常量表达，一处定义：`const REWARD_CODE = 'free-drink';`（连同展示文案写在配置或常量文件里，不写入任何表）；
- 「学生已解锁 knowitall」= user_badges 中存在该 device_id 的记录（见 7.5）；
- 「学生的领取码」= claim_tokens 中该 device_id 的记录，直接关联学生，不再经中间表（见 7.7）；
- 「已核销」= claim_tokens.status='redeemed'，redemptions 有对应记录；
- 学生端需要的三态（可领取 / 已核销 / 已过期）由 user_badges + claim_tokens + 活动 end_at 推导，规则见 9.1。

———

## 7.7 claim_tokens

学生领取码表。每名学生至多一条：直接挂 device_id，不再经过 reward_entitlements 中间表；仅当该学生已解锁 knowitall 之后才会被创建（首签见 9.2）。

建议字段：

```sql
CREATE TABLE claim_tokens (
id INTEGER PRIMARY KEY AUTOINCREMENT,
device_id TEXT NOT NULL,
token_hash TEXT NOT NULL UNIQUE,
token_ciphertext TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'active',
issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
redeemed_at TEXT,
redeemed_by TEXT,
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
UNIQUE (device_id),
CHECK (status IN ('active', 'redeemed'))
);
```

字段说明：

```text
字段              说明
━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━
id                领取码记录 ID
────────────────  ──────────────────────
device_id         领取码所属学生（JWT sub，见 5.4）
────────────────  ──────────────────────
token_hash        领取码哈希（SHA-256）
────────────────  ──────────────────────
token_ciphertext  服务端可解密的领取码密文
────────────────  ──────────────────────
status            领取码状态（active / redeemed，同时是“该学生奖励是否已核销”的权威字段）
────────────────  ──────────────────────
issued_at         签发时间
────────────────  ──────────────────────
redeemed_at       核销时间（权威：核验 ≡ 核销 同一原子操作，无独立“核验”字段）
────────────────  ──────────────────────
redeemed_by       核销 staff 姓名
────────────────  ──────────────────────
updated_at        更新时间
```

说明：

- UNIQUE(device_id)：每个学生至多一条领取码，天然满足“一个奖励一个领取码 / 一个二维码”；
- 不设 event_id：本阶段单活动（见 18.1），活动可用性与失效点由 events 全局判断；
- 只有已解锁 knowitall 的学生能首签（服务层先查 user_badges，见 9.2）；
- redeemed_by 记录核销 staff 姓名（取自已签发的 staff JWT），不设外键，便于白名单增删时不受约束；
- 核销即无二义，故不设 verified_at / verified_by。

领取码状态：

```text
active
redeemed
```

领取码自身不记录过期时间；是否仍在有效期内，由活动 end_at 判断（见 7.2）。超过活动截止时间，或已核销的领取码均视为不可用。

### 领取码存储规则

数据库保存两种形式：`token_ciphertext` 保存服务端可解密的领取码密文，用于后续请求复用并返回同一个二维码；`token_hash` 保存领取码的 SHA-256 哈希，用于工作人员提交领取码时查询。数据库不保存未加密的领取码明文。解密密钥只从服务端环境变量读取，不写入数据库或日志。

### 领取码生成规则（首次随机生成，后续复用）

领取码为每个学生固定的唯一随机码，用于二维码展示：

```text
首次请求时：使用密码学安全随机数生成领取码
计算 token_hash = SHA-256(领取码)
加密领取码得到 token_ciphertext
在同一事务中将 token_hash 和 token_ciphertext 写入 claim_tokens
后续请求：按 device_id 查询并解密 token_ciphertext，复用同一条 claim_tokens 记录
```

说明：

- 同一个学生永远复用同一个领取码；
- 学生解锁 knowitall 后只取得一个领取码，对应一个二维码；
- 数据库保存 token_ciphertext 和 token_hash，不保存未加密的领取码明文；
- 领取码不会因重复打开、重复请求而重新生成或签发；
- 领取码有效期统一到活动截止时刻，不使用单独的短 TTL；
- 核销成功后 status 置 redeemed，领取码立即失效，用户端不再返回码；
- UNIQUE(device_id) 保证并发首签最多插入一条，其余走复用；
- 首签必须使用事务和 `ON CONFLICT` / 唯一约束保证并发幂等。

校验 / 核销流程：

1. 接收工作人员提交的明文领取码；
2. 后端计算 SHA-256(token)；
3. 使用 token_hash 查询数据库；
4. 重新检查领取码状态（claim_tokens.status，权威）与活动可用（isActivityActive，见 7.2）；
5. 不直接在数据库中保存或返回领取码哈希。


———

## 7.8 redemptions

工作人员核销记录表（append-only，即最终方案中的「核销记录」）。

每次工作人员成功核销一个领取码，就在本表追加一条记录，用于回答：

- 哪位工作人员核销了什么码；
- 某个工作人员核销了多少次；
- 哪些学生被核销（奖励类型由代码常量 REWARD_CODE 表达，见 7.6）。

建议字段：

```sql
CREATE TABLE redemptions (
id INTEGER PRIMARY KEY AUTOINCREMENT,
claim_token_id INTEGER NOT NULL,
staff_name TEXT NOT NULL,
student_device_id TEXT NOT NULL,
redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (claim_token_id) REFERENCES claim_tokens(id),
UNIQUE (claim_token_id)
);
```

字段说明：

```text
字段                 说明
━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━
id                  核销记录 ID
─────────────────  ──────────────────
claim_token_id      被核销的领取码记录
─────────────────  ──────────────────
staff_name          核销人姓名（白名单）
─────────────────  ──────────────────
student_device_id   被核销学生设备标识（取自已核销的 claim_tokens.device_id）
─────────────────  ──────────────────
redeemed_at         核销时间
```

说明：

- 与更新 claim_tokens 在同一事务中写入（见 11.2 / 11.3）；
- student_device_id 冗余自 claim_tokens.device_id，免 join 即可完成运营统计；奖励类型由代码常量 REWARD_CODE 表达（见 7.6），不在此重复存储；
- 本表只增不改不删，作为核销审计与数据追踪的权威来源；
- staff_name 引用白名单姓名，不设外键，便于白名单增删不受约束。

———

## 7.9 schema_migrations

数据库迁移记录表。

建议字段：

```sql
CREATE TABLE schema_migrations (
version TEXT PRIMARY KEY,
applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

迁移文件示例：

```text
migrations/
├── 001_initial_schema.sql
├── 002_add_claim_tokens.sql
├── 003_add_schema_migrations.sql
└── ...
```

迁移要求：

- 每个迁移只执行一次；
- 执行成功后记录版本；
- 执行失败时回滚；
- 不建议手动修改已经执行过的迁移；
- 新结构通过新增迁移完成。

———

## 8. 百事通徽章流程

## 8.1 浏览摊位

学生设备浏览摊位时：

POST /api/events/:eventId/booths/:boothId/view

请求头：

Authorization: Bearer <jwt>

后端处理：

1. 校验 JWT；
2. 从 JWT 的 sub 解析 device_id；
3. 查询活动；
4. 检查活动可用：`status='active'` 且 `now < end_at`（见 7.2 的统一判断函数）；
5. 插入或更新 booth_view_records（device_id 维度）；
6. 统计该设备在当前活动中浏览过的不同摊位数；
7. 检查是否达到徽章条件；
8. 如果达到条件，则幂等插入 user_badges（解锁记录；解锁成功不等于生成领取码）；
9. 返回当前浏览进度（含解锁状态）。

返回示例：

```json
{
"eventId": 1,
"boothId": "booth-001",
"uniqueBoothCount": 5,
"badges": [
{
"code": "knowitall",
"unlocked": true,
"requiredUniqueBooths": 5
}
]
}
```

说明：浏览解锁只写 user_badges，不会在本接口创建领取码。学生侧完整状态（是否解锁、领取码、可领取 / 已核销 / 已过期）由 9.1 的 `GET /api/me/reward` 提供。

## 8.2 徽章解锁事务

解锁只写 user_badges（领取码另行首签，见 9.2）。建议将以下操作放在同一个事务中：

```text
记录摊位浏览
↓
统计去重摊位数量
↓
判断徽章条件
↓
插入 user_badges（ON CONFLICT DO NOTHING）
```

解锁必须幂等：重复触发只保留一条 user_badges，不产生领取码、不重复解锁。

```sql
INSERT INTO user_badges (device_id, badge_id)
SELECT ?, b.id
FROM badges b
WHERE b.id = ? AND b.code = 'knowitall'
ON CONFLICT (device_id, badge_id) DO NOTHING;
```

并发要点——`user_badges(device_id, badge_id)` 唯一约束是最终防线：

- 多条并发请求可能同时通过「去重数 >= 阈值」的判断；
- 由 `user_badges(device_id, badge_id)` 唯一约束兜底去重，避免重复解锁；
- 浏览记录与解锁 INSERT 必须在同一个事务内提交（见 13.1）；
- INSERT 影响 0 行表示已解锁，直接视为已解锁，不重复插入；
- 领取码不在此创建：解锁后学生首次出示时才首签（见 9.2）；每名学生一个领取码由 `claim_tokens.UNIQUE(device_id)` 保证。

———

## 9. 学生端领取码接口设计（/api/me）

本阶段每个学生只有一个 knowitall 徽章、一个奖励、一个领取码，因此学生端做成“自我”资源：不引入 reward_entitlements，也就不需要 `/:entitlementId` 这类带资源 id 的路径。以下接口名称为建议方案，具体 URL 可以根据现有路由命名调整。

———

## 9.1 查看我的奖励状态

学生加载奖励页时调用，一次返回：是否解锁、浏览进度、领取码是否存在与状态，供前端区分显示「未解锁 / 可领取 / 已核销 / 已过期」。本接口只读，永不创建领取码。

GET /api/me/reward

请求头：

Authorization: Bearer <jwt>

响应示例：

```json
{
"badge": {
"code": "knowitall",
"name": "百事通",
"unlocked": true,
"requiredUniqueBooths": 5,
"uniqueBoothCount": 5
},
"reward": {
"code": "free-drink",
"claimStatus": "active",
"claimToken": "A7K9-X2M4-Q8P1",
"redeemedAt": null
},
"eventEndAt": "2026-09-19T15:59:59.000Z"
}
```

字段说明与前端渲染：

- `badge.unlocked=false`：未解锁，只展示浏览进度（uniqueBoothCount / requiredUniqueBooths）；
- `badge.unlocked=true` 且 `reward.claimStatus='none'`：已解锁但尚未首签 → 显示「可领取」，点击后调 9.2 生成并展示二维码；
- `reward.claimStatus='active'`：返回 claimToken，直接展示二维码（领取码）；
- `reward.claimStatus='redeemed'`：claimToken=null、redeemedAt 有值 → 显示「已核销」，不再展示二维码；
- 未核销但 `now >= eventEndAt`：前端显示「已过期」，不再调用 9.2 / 9.3 获取码；已核销的不受活动截止影响，仍显示「已核销」；
- `reward.code` 即常量 REWARD_CODE（见 7.6）；
- claimStatus 推导：无 user_badges 记录 → 页面整体“未解锁”；有记录但无 claim_token → `none`；claim_tokens.status=`active` → `active`；`redeemed` → `redeemed`；
- `/api/auth/me` 只表达身份，不承载奖励状态，避免通用接口被撑大。

———

## 9.2 获取 / 出示领取码（首签或复用）

POST /api/me/claim-token

请求头：

Authorization: Bearer <jwt>

处理规则：

1. 用户必须登录；
2. 必须先解锁 knowitall：user_badges 中存在该 device_id 记录，否则拒绝（BADGE_NOT_UNLOCKED，见 12）；
3. 活动必须可用：isActivityActive（见 7.2）；
4. claim_tokens 不存在时，按 7.7 的首次生成规则创建；已存在且 active 时复用同一条记录，解密返回同一个码；并发首签由 UNIQUE(device_id) 兜底；
5. 领取码有效期统一到活动截止时刻，不设置单独的 10 分钟 TTL；
6. 已核销（status='redeemed'）时不再返回码，返回已核销错误；
7. 活动关闭或当前时间达到截止时刻后，不再返回领取码。

响应示例：

```json
{
"claimToken": "A7K9-X2M4-Q8P1",
"claimStatus": "active",
"eventEndAt": "2026-09-19T15:59:59.000Z"
}
```

注意：

- 领取码固定唯一：同一学生每次返回同一个码（首次随机生成后复用，不重新签发）；
- 数据库保存领取码密文和 SHA-256 哈希，不保存未加密明文；
- 活动关闭或达到活动截止时刻后不再返回领取码；
- 核销后不再返回码，前端显示「已核销」。

———

## 9.3 查看我的领取码状态（只读）

GET /api/me/claim-token

本接口只读，永远不触发领取码首签（首签只能由 9.2 的 POST 完成）。用于页面间回显二维码或核销后查状态。

未核销时：

```json
{
"claimStatus": "active",
"claimToken": "A7K9-X2M4-Q8P1",
"eventEndAt": "2026-09-19T15:59:59.000Z",
"redeemedAt": null
}
```

已核销时：

```json
{
"claimStatus": "redeemed",
"claimToken": null,
"eventEndAt": "2026-09-19T15:59:59.000Z",
"redeemedAt": "2026-09-09T12:10:00.000Z"
}
```

推荐规则：

- 领取码固定唯一，同一学生每次返回同一个码（首次随机生成后复用）；
- 不重新签发、不生成新码；
- 核销后不再返回码，前端显示「已核销」。

———

## 10. 工作人员核验并立即核销流程

## 10.1 staffRedeem

工作人员使用一个按钮、一次请求完成领取码核验、奖励发放和核销，不拆成 verify/redeem 两个操作。

建议接口：

POST /api/staff/claim-tokens/redeem

请求头：

Authorization: Bearer <staff-jwt>

请求体：

```json
{
"claimToken": "A7K9-X2M4-Q8P1"
}
```

requireStaff 中间件需要：

1. 解析 JWT；
2. 确认 JWT 中 role = 'staff'；
3. 取得 JWT 中的姓名 name（即 sub）；
4. 实时查询 staff_whitelist，确认该姓名仍存在；
5. 通过后才能访问工作人员接口。

不能只相信 JWT 本身，姓名需实时在白名单中，以实现权限即时撤销。

## 10.2 核验与立即核销逻辑

请求处理时：

1. 对明文领取码计算 SHA-256；
2. 按 token_hash 查询 claim_tokens（行内即含 device_id），取出当前活动；
3. 检查活动可用：调用 isActivityActive(event)（统一判断，见 7.2）；
4. 检查领取码状态为 active；
5. 在同一事务中将 claim_tokens 置为 redeemed，记录 redeemed_at / redeemed_by（唯一一次权威核销）；
6. 在同一事务中写入一条 redemptions（claim_token_id、staff_name、student_device_id 取自该 claim_tokens.device_id）并提交；
7. 返回核销成功和奖励发放成功。

核验 ≡ 核销 在同一原子操作内完成并立即发奖。后续提交相同领取码只返回已核销错误，不再次发奖；不存在“先验后销”两步流程，因此没有独立的 verified_at / verified_by。

核验失败、活动关闭、达到截止时间、领取码已核销时，不发奖、不写入核销记录、不改变任何状态。

工作人员接口不返回领取码明文、领取码哈希、JWT 或不必要的内部数据库字段。

## 11.2 核销必须原子完成

领取码核销必须在一个数据库事务中完成：

```text
BEGIN IMMEDIATE
↓
按 token_hash 查询领取码
↓
检查领取码状态为 active
↓
检查是否超过活动截止时间
↓
更新 claim_tokens 为 redeemed（权威状态，记录 redeemed_at / redeemed_by）
↓
写入 redemptions（student_device_id 取自已核销的 claim_tokens.device_id）
↓
COMMIT
```

如果任意一步失败：

```sql
ROLLBACK
```

不能出现：

- claim_tokens 已置 redeemed 但 redemptions 未写入（或反之）；
- 两个工作人员同时核销成功；
- 核销失败但数据库已经部分更新。
- 语义：核验 ≡ 核销 在同一原子操作内完成，因此不设独立的 verified_at / verified_by；`redeemed_at` / `redeemed_by` 就是唯一且权威的核销记录，不存在两步流程，也不得据此拆成两步核验。

## 11.3 并发控制

同一个领取码只能成功核销一次。

建议在事务中使用带条件的更新。

时间处理约定：`?now` 为服务端在请求入口统一计算的 epoch 秒整数（`now = Math.floor(Date.now() / 1000)`），与 `end_at` 同型；`?staffName` 取自 staff JWT 的 name。禁止在 WHERE / SET 中直接使用 `CURRENT_TIMESTAMP`（TEXT）与整数 `end_at` 比较。`?now` 在单次请求内每次绑定同一个值，保证同一事务内 redeemed_at / updated_at 一致（同一时刻）。

```sql
UPDATE claim_tokens
SET
status = 'redeemed',
redeemed_at = ?now,
redeemed_by = ?staffName,
updated_at = ?now
WHERE token_hash = ?hash
AND status = 'active'
AND EXISTS (
SELECT 1
FROM events e
WHERE e.status = 'active'
AND e.end_at > ?now
);
```

注意：

- `status='active'` 作为唯一状态闸门，配合 BEGIN IMMEDIATE 的写锁，让「读取 → 更新」之间无可被另一个 staff 抢占的窗口，保证同一个领取码最多一次成功；
- claim_tokens 不再挂 event：SQL 里的 `EXISTS (SELECT 1 FROM events WHERE status='active' AND end_at > ?now)` 与代码里的 isActivityActive 语义一致（SQL 侧无法调用 JS 函数，业务代码统一走该函数）；
- 若将来出现多条 active 活动，此 EXISTS 会误判，届时应给 claim_tokens 加回 event_id 或把“当前活动”显式传入（本阶段单活动，见 18.1）；
- 参数（now / staffName / hash）统一通过预处理语句按序绑定，禁止字符串拼接，防注入。

然后检查：

changes === 1

如果更新行数不是 1，则说明：

- 领取码不存在；
- 领取码已使用；
- 已超过活动截止时间；
- 其他工作人员已经抢先核销。

此时直接返回错误并回滚，不产生任何发奖、不写任何记录。

只有更新成功后，才写核销记录（student_device_id 直接取自已置 redeemed 的 claim_tokens 行，不再有 reward_entitlements）：

```sql
INSERT INTO redemptions (claim_token_id, staff_name, student_device_id)
SELECT ct.id, ?staffName, ct.device_id
FROM claim_tokens ct
WHERE ct.token_hash = ?hash;
```

最后提交事务。中途（含写核销记录）任一步抛错则整体回滚，保证 claim_tokens 与 redemptions 状态一致。

## 11.4 核销成功响应

```json
{
"success": true,
"claimTokenStatus": "redeemed",
"redeemedAt": "2026-09-09T12:10:00.000Z",
"redeemedBy": {
"name": "张三",
"role": "staff"
},
"reward": {
"code": "free-drink"
}
}
```

———

## 12. 错误码建议

建议统一错误响应格式：

```json
{
"error": {
"code": "CLAIM_TOKEN_EXPIRED",
"message": "已超过活动截止时间"
}
}
```

建议错误码：

```text
错误码                   HTTP 状态    说明
━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━
AUTH_REQUIRED                  401    未登录
───────────────────────  ───────────  ──────────────────
INVALID_TOKEN                  401    JWT 无效
───────────────────────  ───────────  ──────────────────
STAFF_REQUIRED                 403    需要工作人员权限
───────────────────────  ───────────  ──────────────────
USER_NOT_FOUND                 404    用户不存在
───────────────────────  ───────────  ──────────────────
EVENT_NOT_FOUND                404    活动不存在
───────────────────────  ───────────  ──────────────────
CLAIM_TOKEN_NOT_FOUND          404    领取码不存在
───────────────────────  ───────────  ──────────────────
CLAIM_TOKEN_EXPIRED            409    已超过活动截止时间
───────────────────────  ───────────  ──────────────────
CLAIM_TOKEN_REDEEMED           409    领取码已经核销
───────────────────────  ───────────  ──────────────────
BADGE_NOT_UNLOCKED             403    未解锁 knowitall，无法首签领取码
───────────────────────  ───────────  ──────────────────
INVALID_REQUEST                400    请求参数错误
───────────────────────  ───────────  ──────────────────
EVENT_NOT_ACTIVE               409    活动当前不可用
```

———

## 13. 事务设计

项目已有 withTransaction，建议继续统一使用。

推荐将事务分为以下几类：

### 13.1 浏览摊位与徽章解锁事务

记录浏览
统计去重摊位
判断徽章
插入 user_badges（解锁；领取码不在此创建）

### 13.2 领取码首签事务

首次随机生成领取码
计算哈希
幂等插入 claim_tokens（已存在则复用）
按 device_id 查询并复用同一条记录

### 13.3 工作人员核销事务

锁定事务（BEGIN IMMEDIATE）
检查领取码
更新领取码为 redeemed
写入 redemptions 核销记录（student_device_id 取自已核销的 claim_tokens.device_id）
提交事务

### 13.4 SQLite 事务建议

核销流程建议使用：

```sql
BEGIN IMMEDIATE
```

原因：

- 在读取后更新前尽早获得写锁；
- 降低两个工作人员同时核销成功的风险；
- 保证 claim_tokens 置 redeemed 与 redemptions 写入在同一个事务内完成。
- 每个连接在建立时执行一次 `PRAGMA foreign_keys=ON`，否则表间外键不被 SQLite 强制，跨表一致性只能靠应用层。

事务中不要进行：

- 网络请求；
- 长时间等待；
- 调用第三方服务；
- 发送邮件；
- 复杂计算。

———

## 14. 安全要求

### 14.1 登录与身份安全

- 无账号密码，系统不存在明文密码与密码哈希；
- student JWT 由后端按 device_id 签发，学生不能自行指定或提升身份；
- STAFF_CODE 识别码需保密，配合白名单姓名联合校验才能登录；
- JWT 中的 role 只作提示，staff 授权始终以 staff_whitelist 实时白名单为准；
- 生产环境必须使用 HTTPS。

### 14.2 JWT 安全

- JWT Secret 使用环境变量；
- 生产环境使用高强度随机 Secret；
- exp 统一设为活动截止时间（北京时间 2026-09-19 23:59:59），不按签发时刻计算相对时长；
- 不在 URL 中传递 JWT；
- 每次 staff 请求实时核对姓名是否在白名单中；
- 姓名从白名单移除后，应阻止旧 staff JWT 继续访问 staff 接口。

### 14.3 领取码安全

- 领取码首次使用密码学安全随机数生成，后续请求复用同一个领取码，不使用 HMAC 确定性派生；
- 领取码使用足够长度和熵的随机字符串，具体格式由实现确定，不将 8 位 base32 作为固定要求；
- 数据库保存领取码密文和 SHA-256 哈希，不保存未加密明文；
- 解密密钥只存在服务端环境变量；
- 不在日志中输出明文领取码；
- 不通过 URL 参数传递领取码；
- 以活动截止时间（events.end_at）统一失效，不单独为每条码设有效期；
- 每个学生固定一个唯一领取码，不重新签发；
- 核销成功后立即失效；
- 同一个领取码最多成功核销一次。

### 14.4 工作人员接口安全

- 所有 staff 接口必须经过 requireStaff；
- 不能仅凭前端传递的角色字段授权；
- 每次核验和核销都记录工作人员；
- 生产环境必须使用 HTTPS；
- 可以考虑增加工作人员操作频率限制。

### 14.5 日志安全

日志中禁止记录：

- JWT；
- STAFF_CODE / 识别码；
- 领取码明文；
- 领取码哈希；
- 完整用户敏感信息。

可以记录：

- 请求 ID；
- 操作类型；
- 学生 device_id；
- staff 姓名；
- 领取码记录 ID（claim_tokens.id）；
- 操作结果；
- 错误码。

———

## 15. 测试规划

## 15.1 身份认证测试

需要覆盖：

- 学生首次访问携带 device_id 签发 student JWT；
- 同一 device_id 复用同一身份、不重复签发异常；
- 携带无效 / 伪造 JWT 访问受保护接口被拒绝；
- 超过活动截止时间后 JWT 失效；
- 正确识别码 + 白名单姓名能签发 staff JWT；
- 错误识别码，或不在白名单的姓名，都不能签发 staff JWT；
- 姓名从白名单移除后，旧 staff JWT 不能继续访问 staff 接口；
- student 不能访问 staff 接口。

## 15.2 摊位与徽章测试

需要覆盖：

- 第一次浏览摊位；
- 重复浏览同一摊位；
- 浏览不同摊位；
- 去重计数；
- 达到徽章条件；
- 未达到徽章条件；
- 重复触发徽章解锁；
- 重复触发不重复解锁（user_badges 幂等）；
- 多个并发请求下不重复解锁、不重复生成领取码。

## 15.3 领取码测试

需要覆盖：

- 正常获取领取码；
- 数据库不保存明文；
- 领取码能够正常哈希查询；
- 超过活动截止时间的领取码视为不可用；
- 同一设备多次请求返回同一个码；
- 不同设备领取码互不相同；
- 未解锁 knowitall 时首签被拒（BADGE_NOT_UNLOCKED）；
- 只有已解锁的学生能首签，且只能按 JWT sub（device_id）拿到自己的领取码；
- 已核销奖励不再返回码。

## 15.4 工作人员核验并立即核销测试

需要覆盖：

- staff 使用一次请求完成领取码核验、立即发奖和核销；
- student 不能执行工作人员核验/核销接口；
- 不在白名单的姓名不能执行工作人员接口；
- 领取码不存在；
- 已超过活动截止时间的领取码；
- 领取码已核销时返回已核销错误；
- 核验失败不得改变 claim_tokens / redemptions 任何状态；
- 核验成功（核销）后领取码状态为 redeemed；
- 核销成功后 redemptions 写入一条正确记录（student_device_id 取自已核销的领取码行）；
- 核销成功后领取者查询只显示“已核销”，不再返回二维码；
- 核验和发奖中途失败时事务整体回滚；
- 并发提交同一个领取码时最多一个请求成功，不能重复发奖；
- 同一领取码重复提交返回已核销错误，不得覆盖首次核销的 redeemed_at / redeemed_by。

———

## 16. 推荐实现顺序

### 阶段一：确认数据库基线

- 确认当前数据库初始化方式；
- 确认当前所有表结构；
- 确认每个连接执行 `PRAGMA foreign_keys=ON`；
- 确认当前 withTransaction 的实现；
- 确认当前认证中间件；
- 增加 schema_migrations；
- 整理初始迁移文件。

### 阶段二：完成无感登录身份签发

- 增加学生 device_id 身份与 student JWT 签发（/api/auth/student）；
- 增加 staff_whitelist 表与 STAFF_CODE + 白名单姓名校验（/api/auth/staff）；
- 增加 requireAuth；
- 增加活动截止时间（events.end_at）；
- 增加 /api/auth/me。

### 阶段三：完善摊位与徽章

- 确认 booth_view_records 唯一约束；
- 完成去重浏览；
- 完善徽章进度统计；
- 完成徽章幂等解锁（仅写 user_badges，领取码在 9.2 首签）。

### 阶段四：实现领取码

- 增加 claim_tokens；
- 增加领取码首次随机生成与哈希存储；
- 按活动截止时刻统一失效；
- 增加领取码一对一复用规则（UNIQUE(device_id)）；
- 增加 GET /api/me/reward 我的奖励状态接口（见 9.1）；
- 增加 POST /api/me/claim-token 首签接口（见 9.2）。

### 阶段五：实现工作人员功能

- 增加 requireStaff；
- 实现 staffRedeem（一次请求完成核验、立即发奖和核销）；
- 确认核销字段只用 redeemed_at / redeemed_by（无 verified_*）；
- 增加原子核销事务；
- 增加并发测试。

### 阶段六：完善错误处理与安全

- 统一错误格式；
- 检查敏感日志；
- 增加输入校验；
- 增加请求频率限制；
- 检查所有 staff 路由权限；
- 运行后端测试。

———

## 17. 当前暂不实现的内容

以下功能不属于当前后端第一阶段：

- 前端页面；
- 前端登录 UI；
- 地图页面；
- 摊位详情 UI；
- 工作人员扫码 UI；
- 活动与白名单管理后台；
- 活动创建和编辑后台；
- 摊位管理后台；
- 奖励库存管理；
- 多级工作人员权限；
- 微信登录；
- 账号密码注册与登录；
- 短信验证码；
- 邮箱验证；
- 支付；
- 复杂审计系统；
- 多数据库支持；
- Redis；
- 微服务拆分。

———

## 18. 待确认问题

以下问题需要产品、运营和后端一起确认。

### 18.1 活动截止时间（已确认）

- 本项目只有一个活动，不设计多活动并行运行场景。
- 所有网站服务在北京时间 2026-09-19 23:59:59 关闭。
- 活动关闭后，领取码过期，工作人员不能核验或核销领取码。
- 所有 JWT 与领取码在同一截止时刻失效。
- 业务判断采用半开区间：当前时间 < 截止时间时有效；当前时间 >= 截止时间时失效。
- 领取码有效期不单独设置短 TTL，统一以活动截止时刻为失效点。

### 18.2 领取码格式与生命周期（已确认）

- 本阶段只有一个徽章（knowitall），对应唯一的奖励，reward_code 由代码常量表达（见 7.6）。
- 一个学生只对应一个二维码和一个领取码（claim_tokens.UNIQUE(device_id)）。
- 领取码第一次请求时随机生成，数据库保存领取码密文和哈希，不保存未加密明文；
- 后续请求复用同一条领取码记录和同一个领取码，不重新生成、不重新签发。
- 核销成功后领取码立即失效，用户端不再展示。

### 18.3 核验和核销（已确认）

- 工作人员使用一个接口、一次请求完成领取码核验、立即发奖和核销，不拆成两个操作；
- 核验 ≡ 核销 在同一原子操作内完成，因此不设 verified_at / verified_by；`redeemed_at` / `redeemed_by` 即唯一且权威的核销记录；每个学生只有一个领取码，重复提交返回已核销错误，不会覆盖首次 redeemed_at / redeemed_by；
- 核销成功后不可撤销（已核销记录只增不改）；
- 活动关闭后不可核验、不可核销。

### 18.4 徽章范围（已确认）

- 本阶段只实现 knowitall 徽章。
- 本阶段不启用 roamer，也不因 roamer 或驻场时长解锁徽章或生成领取码。

### 18.5 一个奖励是否允许多个领取码（已确认）

每个学生固定一个唯一领取码，不允许多个码（claim_tokens.UNIQUE(device_id)）。

### 18.6 徽章规则是否可配置

当前建议将徽章规则放在 badges 表中：

required_unique_booths

本项目当前只有一个活动，knowitall 的要求是浏览不同摊位后按去重数量解锁。

### 18.7 活动与接口关闭规则

- 本项目只有一个活动；活动状态和截止时间共同决定服务是否可用。
- 活动处于 closed，或当前时间 >= 2026-09-19 23:59:59（北京时间）时，工作人员不得核验或核销，学生不得获取领取码。
- 所有业务时间判断统一使用 `now < cutoff`；截止时间对应 UTC `2026-09-19T15:59:59.000Z`。

### 18.8 活动是否必须存在

所有浏览、徽章和奖励行为都应该关联具体活动。

建议：

event_id 必须存在；
活动必须处于 active 状态；
closed 状态的活动不再允许产生新的浏览和领取码；
活动可用统一为一个判断函数「`status='active' AND now < end_at`」，被 auth / booth / claim-token / staff 所有接口共用，避免各路由散写（见 7.2 与 10.2）。

### 18.10 staff 专用入口与白名单

已定：

- 不开放注册，也没有 staff 账号；
- 工作人员使用固定识别码（STAFF_CODE，固定为 staff2026）进入专用入口，所有工作人员共用同一个链接；
- 仅凭识别码不能获得权限，还需输入姓名，且姓名必须在 staff_whitelist 白名单中；
- 白名单在活动开始前由运营通过数据库脚本或后台管理预录入；
- 领取码采用 `token_ciphertext` + `token_hash`：前者供服务端解密并复用同一个二维码，后者供工作人员核验查询；
- 解密密钥仅存于服务端环境变量，不写入数据库或日志。

仍需确认：

- 识别码泄漏时如何作废或更换；
- 白名单的维护入口（脚本 vs 简单后台）；
- 生产环境后续是否需要独立的账号管理体系。

———

## 19. 最终目标

本阶段完成后，后端应满足以下条件：

### 登录

学生打开页面携带 device_id 自动获得 student JWT，无需注册与登录；
工作人员在专用入口输入白名单姓名后获得 staff JWT；
受保护接口可以通过 sub（device_id / 姓名）识别操作者；
JWT 统一在活动截止时间（北京时间 2026-09-19 23:59:59）失效。

### 百事通徽章

学生设备浏览不同摊位；
后端按活动和 device_id 去重统计；
满足条件后解锁 knowitall；
user_badges 不会重复解锁，领取码不会重复生成。

### 领取码

学生设备可以为自己的奖励获取一个固定唯一的领取码；
领取码保存密文和哈希，前端以二维码呈现；
领取码在活动截止时间前有效，超过后不可核销；
不重新签发，核销后码失效、用户端不再显示；
学生可通过 GET /api/me/reward 查看解锁与领取码状态（可领取 / 已核销 / 已过期）。

### 工作人员核验并立即核销

只有白名单内的 staff 可以执行 `staffRedeem`；一次请求完成领取码核验、立即发奖和核销。成功后将 claim_tokens 置 redeemed 并写入一条 redemptions 记录；同一个领取码最多成功一次，并发请求不会重复发奖。

———

## 20. 实现完成标准

满足以下条件后，认为当前后端第一阶段完成：

- [ ] 学生携带 device_id 自动签发 student JWT；
- [ ] JWT 能正常签发和校验；
- [ ] staff 通过识别码 + 白名单姓名签发 staff JWT；
- [ ] staff 权限通过实时白名单姓名判断；
- [ ] 不同摊位浏览记录可以去重；
- [ ] knowitall 徽章能够正确解锁（仅写 user_badges）；
- [ ] user_badges 幂等解锁，不重复插入；
- [ ] 系统不再有 reward_entitlements；claim_tokens 直接挂 device_id（UNIQUE(device_id)）；
- [ ] claim_tokens 不设 verified_at / verified_by，仅以 redeemed_at / redeemed_by 记录核销；
- [ ] badges / redemptions 不保存 reward_code（代码常量 REWARD_CODE 表达）；
- [ ] 每个数据库连接开启 PRAGMA foreign_keys=ON；
- [ ] claim_tokens 表完成；
- [ ] redemptions 核销记录表完成；
- [ ] 领取码固定唯一（首次随机生成，后续复用）；
- [ ] 领取码保存服务端密文和 SHA-256 哈希，不保存未加密明文；
- [ ] 领取码以活动截止时间（end_at）为失效点；
- [ ] GET /api/me/reward 返回解锁与领取码状态（可领取 / 已核销 / 已过期），POST /api/me/claim-token 首签复用；
- [ ] 工作人员通过一个 staffRedeem 接口完成核验、立即发奖和核销；
- [ ] 核验失败不改变任何状态，核验成功后 claim_tokens 置 redeemed 且 redemptions 写入；
- [ ] 核销使用事务；
- [ ] 核销后 redemptions 写入正确记录；
- [ ] 并发核销最多一个成功；
- [ ] 核验和核销错误码统一；
- [ ] 敏感数据不写入日志；
- [ ] 认证、徽章、领取码和核销测试通过。