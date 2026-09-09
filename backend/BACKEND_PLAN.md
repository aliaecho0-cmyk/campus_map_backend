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
- 领取码与具体奖励权益的关联。

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

北京时间 2026-09-20 00:00:00

建议 JWT Payload：

学生令牌：

```json
{
"sub": "dev_1726735999_a8f3k2",
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
- exp 为活动截止时间（北京时间 2026-09-20 00:00:00）的绝对时间戳，与领取码失效点一致；到期后令牌自动失效，无需人工清理；
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
"deviceId": "dev_1726735999_a8f3k2"
}
```

处理流程：

1. 校验并规整 device_id（格式见 5.4）；
2. 若未携带 device_id，后端自动生成随机 UUID 作为兜底；
3. 签发 role = 'student' 的 JWT，sub = device_id；
4. JWT exp = 活动截止时间（北京时间 2026-09-20 00:00:00）；
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
5. JWT exp = 活动截止时间（北京时间 2026-09-20 00:00:00）；
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

示例：dev_1726735999_a8f3k2

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
├── badges
├── booth_view_records
└── reward_entitlements
```

```text
badges
└── user_badges
```

```text
reward_entitlements
└── claim_tokens
```

```text
claim_tokens
└── redemptions       （核销成功后的核销记录）
```

```text
staff_whitelist
├── claim_tokens      （verified_by 记录核验 staff）
└── redemptions       （staff_name 记录核销 staff）
```

关系说明：

- 一个设备（device_id）可以浏览多个摊位；
- 同一设备在同一活动中对同一个摊位只计算一次；
- 一个设备可以解锁多个徽章；
- 一个徽章可以对应一个或多个奖励权益；
- 一个奖励权益对应一个固定唯一的领取码（见 7.7）；
- 一个领取码只能被成功核销一次；
- 每次核销成功写入一条 redemptions 核销记录；
- 领取码与设备、活动和奖励权益绑定；
- staff 的核验、核销记录引用白名单中的姓名。

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
- 记录表中的核验人 / 核销人字段（verified_by / redeemed_by）引用本表姓名；
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
end_at TEXT NOT NULL,
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
end_at      活动截止时间（统一失效点）
──────────  ─────────────────────
created_at  创建时间
──────────  ─────────────────────
updated_at  更新时间
```

统一失效点：

end_at 是活动截止时间，JWT 与领取码都以它为统一失效点，不再为每条领取码单独计算有效期。

当前活动取值：

北京时间 2026-09-20 00:00:00

最终截止时间需要产品和运营确认。

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
reward_code TEXT,
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
- 后续请求不重复插入；
- 不重复创建奖励权益；
- 不重复创建领取码。

———

## 7.6 reward_entitlements

学生设备奖励权益表，即最终方案中的「领取记录 claims」。
该表表示：

某个设备（学生）已经获得某项奖励的资格

建议字段：

```sql
CREATE TABLE reward_entitlements (
id INTEGER PRIMARY KEY AUTOINCREMENT,
event_id INTEGER NOT NULL,
device_id TEXT NOT NULL,
badge_id INTEGER,
reward_code TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'available',
granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
redeemed_at TEXT,
redeemed_by TEXT,
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
UNIQUE (event_id, device_id, reward_code),
FOREIGN KEY (event_id) REFERENCES events(id),
FOREIGN KEY (badge_id) REFERENCES badges(id),
CHECK (status IN ('available', 'redeemed', 'cancelled'))
);
```

字段说明：

```text
字段           说明
━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━
id             奖励权益 ID
─────────────  ────────────────
event_id       所属活动
─────────────  ────────────────
device_id      奖励拥有者（学生设备标识）
─────────────  ────────────────
badge_id       产生奖励的徽章
─────────────  ────────────────
reward_code    奖励类型
─────────────  ────────────────
status         当前状态
─────────────  ────────────────
granted_at     奖励产生时间
─────────────  ────────────────
redeemed_at    核销时间
─────────────  ────────────────
redeemed_by    核销工作人员姓名
─────────────  ────────────────
updated_at     更新时间
```

说明：

- device_id 取自学生 JWT 的 sub（见 5.4）；
- redeemed_by 记录核销 staff 的姓名，不设外键，便于白名单增删时不受约束；
- 同一个 device 在同一个活动中对同一奖励只产生一条权益。

建议不要把领取码明文直接放在 reward_entitlements 中。
领取码单独放在 claim_tokens 表，方便：

- 以活动截止点判断有效性；
- 保存首次随机签发后的领取码哈希；
- 后续请求复用同一条领取码记录；
- 记录签发时间、核验和核销行为。

———

## 7.7 claim_tokens

领取码表。

建议字段：

```sql
CREATE TABLE claim_tokens (
id INTEGER PRIMARY KEY AUTOINCREMENT,
entitlement_id INTEGER NOT NULL,
token_hash TEXT NOT NULL UNIQUE,
status TEXT NOT NULL DEFAULT 'active',
issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
verified_at TEXT,
verified_by TEXT,
redeemed_at TEXT,
redeemed_by TEXT,
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (entitlement_id) REFERENCES reward_entitlements(id),
CHECK (status IN ('active', 'redeemed'))
);
```

字段说明：

```text
字段              说明
━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━
id                领取码记录 ID
────────────────  ──────────────────────
entitlement_id    关联奖励权益
────────────────  ──────────────────────
token_hash        领取码哈希
────────────────  ──────────────────────
status            领取码状态
────────────────  ──────────────────────
issued_at         签发时间
────────────────  ──────────────────────
verified_at       最近一次核验时间
────────────────  ──────────────────────
verified_by       最近一次核验 staff 姓名
────────────────  ──────────────────────
redeemed_at       核销时间
────────────────  ──────────────────────
redeemed_by       核销 staff 姓名
────────────────  ──────────────────────
updated_at        更新时间
```

说明：

- verified_by / redeemed_by 记录 staff 姓名（取自已签发的 staff JWT），不设外键，便于白名单增删时不受约束；
- 领取码所属学生通过 entitlement_id 关联 reward_entitlements 的 device_id 得到。

领取码状态：

```text
active
redeemed
```

领取码自身不记录过期时间；是否仍在有效期内，由关联活动的 end_at 判断（见 7.2）。超过活动截止时间，或已核销的领取码均视为不可用。

### 领取码存储规则

后端按规则现算领取码：

明文领取码由 HMAC 派生，每次「出示」时现算返回同一个码

数据库只保存：

SHA-256(token)

不保存明文领取码。

示例：

const tokenHash = sha256(rawToken);

查询领取码时：

1. 接收用户提交的明文领取码；
2. 后端计算 SHA-256；
3. 使用哈希查询数据库；
4. 不直接在数据库中保存明文。

### 领取码生成规则（首次随机生成，后续复用）

领取码为每个奖励权益固定的唯一随机码，用于二维码展示：

```text
首次请求时：使用密码学安全随机数生成领取码
计算 token_hash = SHA-256(领取码)
在同一事务中将 token_hash 写入 claim_tokens
后续请求：按 entitlement_id 查询并复用同一条 claim_tokens 记录
```

说明：

- 同一个奖励权益永远复用同一个领取码；
- 一个徽章只有一个奖励权益，因此一个徽章只有一个二维码；
- 数据库只保存 token_hash，不保存领取码明文；
- 领取码不会因重复打开、重复请求而重新生成或签发；
- 领取码有效期统一到活动截止时刻，不使用单独的短 TTL；
- 核销成功后 status 置 redeemed，领取码立即失效，用户端不再返回码；
- `claim_tokens.entitlement_id` 必须具有唯一约束，保证一个权益最多一条领取码记录；
- 首签必须使用事务和 `ON CONFLICT`/唯一约束保证并发幂等。

校验 / 核销流程：

1. 接收工作人员提交的明文领取码；
2. 后端计算 SHA-256(token)；
3. 使用 token_hash 查询数据库；
4. 重新检查领取码状态、奖励权益状态、活动状态和活动截止时间；
5. 不直接在数据库中保存或返回领取码哈希。


———

## 7.8 redemptions

工作人员核销记录表（append-only，即最终方案中的「核销记录」）。

每次工作人员成功核销一个领取码，就在本表追加一条记录，用于回答：

- 哪位工作人员核销了什么码；
- 某个工作人员核销了多少次；
- 哪些学生被核销、核销了什么奖励。

建议字段：

```sql
CREATE TABLE redemptions (
id INTEGER PRIMARY KEY AUTOINCREMENT,
claim_token_id INTEGER NOT NULL,
staff_name TEXT NOT NULL,
student_device_id TEXT NOT NULL,
reward_code TEXT NOT NULL,
redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (claim_token_id) REFERENCES claim_tokens(id)
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
student_device_id   被核销学生设备标识
─────────────────  ──────────────────
reward_code         被核销的奖励类型
─────────────────  ──────────────────
redeemed_at         核销时间
```

说明：

- 与更新 claim_tokens / reward_entitlements 在同一事务中写入（见 11.2）；
- staff_name / student_device_id / reward_code 冗余存储，免 join 即可完成运营统计查询；
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
4. 检查活动是否可用；
5. 插入或更新 booth_view_records（device_id 维度）；
6. 统计该设备在当前活动中浏览过的不同摊位数；
7. 检查是否达到徽章条件；
8. 如果达到条件，则幂等解锁徽章；
9. 如果徽章对应奖励，则创建奖励权益；
10. 返回当前浏览进度。

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

## 8.2 徽章解锁事务

建议将以下操作放在同一个事务中：

```text
记录摊位浏览
↓
统计去重摊位数量
↓
判断徽章条件
↓
插入 user_badges
↓
插入 reward_entitlements
```

这样可以避免以下问题：

- 徽章已经解锁但奖励没有创建；
- 奖励创建了但徽章记录没有创建；
- 并发请求导致重复奖励；
- 同一个奖励权益被重复插入。

建议使用：

```sql
INSERT ... ON CONFLICT DO NOTHING
```

保证解锁逻辑幂等。

———

## 9. 领取码接口设计

以下接口名称为建议方案，具体 URL 可以根据现有路由命名调整。

———

## 9.1 获取 / 出示领取码：claimToken

建议接口：

POST /api/entitlements/:entitlementId/claim-token

也可以使用统一的命名：

POST /api/claimToken

推荐使用资源型路径：

POST /api/entitlements/:entitlementId/claim-token

请求头：

Authorization: Bearer <jwt>

处理规则：

1. 用户必须登录；
2. 只能为自己的奖励权益获取领取码；
3. 奖励权益必须存在；
4. 奖励权益状态必须是 available；
5. 领取码记录不存在时，使用密码学安全随机数首次生成领取码，计算哈希并插入 `claim_tokens`；之后始终查询并复用同一条记录；
6. 领取码有效期统一到活动截止时刻，不设置单独的 10 分钟 TTL；
7. 活动关闭或当前时间达到截止时刻后，不再返回领取码；
8. 返回领取码明文（前端渲染为二维码展示）。

响应示例：

```json
{
"claimToken": "A7K9-X2M4-Q8P1",
"eventEndAt": "2026-09-19T16:00:00.000Z",
"entitlement": {
"id": 12,
"rewardCode": "free-drink",
"status": "available"
}
}
```

注意：

- 领取码固定唯一，同一奖励权益每次返回同一个码（首次随机生成后复用，不重新签发）；
- 数据库只保存领取码哈希；
- 活动关闭或达到活动截止时刻后不再返回领取码；
- 核销后不再返回码，用户端显示「已领取」。

———

## 9.2 查看自己的领取码状态

建议接口：

GET /api/entitlements/:entitlementId/claim-token

该接口在领取码仍有效时返回同一个码（与 9.1 一致），核销后只返回状态：

```json
{
"entitlementId": 12,
"status": "active",
"claimToken": "A7K9-X2M4-Q8P1",
"eventEndAt": "2026-09-19T16:00:00.000Z",
"redeemedAt": null
}
```

已核销时：

```json
{
"entitlementId": 12,
"status": "redeemed",
"claimToken": null,
"eventEndAt": "2026-09-19T16:00:00.000Z",
"redeemedAt": "2026-09-09T12:10:00.000Z"
}
```

推荐规则：

- 领取码固定唯一，后端每次都能返回同一个码（由 7.7 规则现算）；
- 不重新签发、不生成新码；
- 核销后不再返回码，用户端显示「已领取」。

———

## 10. 工作人员核验流程

## 10.1 staffVerify

建议接口：

POST /api/staff/claim-tokens/verify

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

## 10.2 核验逻辑

核验时：

1. 对明文领取码计算哈希；
2. 查询 claim_tokens，并关联 reward_entitlements 与 events；
3. 检查活动存在且处于 active 状态，当前时间早于北京时间 2026-09-20 00:00:00；
4. 检查领取码状态为 active；
5. 检查奖励权益状态为 available；
6. 如果这是第一次成功核验，则写入 verified_at / verified_by；后续成功核验不覆盖第一次记录；
7. 返回核验结果。

核验接口只负责：

确认当前领取码是否有效，并展示奖励信息

核验接口不能完成核销。

响应示例：

```json
{
"valid": true,
"claimTokenStatus": "active",
"entitlement": {
"id": 12,
"rewardCode": "free-drink",
"status": "available"
},
"owner": {
"deviceId": "dev_1726735999_a8f3k2",
"role": "student"
},
"event": {
"id": 1,
"name": "Campus Market",
"endAt": "2026-09-19T16:00:00.000Z"
}
}
```

如果无效：

```json
{
"valid": false,
"reason": "CLAIM_TOKEN_EXPIRED"
}
```

核验不应返回：

- 领取码明文；
- 领取码哈希；
- JWT；
- 内部数据库字段。

———

## 11. 工作人员核销流程

## 11.1 staffRedeem

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

## 11.2 核销必须原子完成

领取码核销必须在一个数据库事务中完成：

```text
BEGIN IMMEDIATE
↓
查询领取码
↓
检查领取码状态
↓
检查是否超过活动截止时间
↓
检查奖励权益状态
↓
更新 claim_tokens
↓
更新 reward_entitlements
↓
写入 redemptions
↓
COMMIT
```

如果任意一步失败：

```sql
ROLLBACK
```

不能出现：

- 领取码已经变成已核销，但奖励权益仍然可用；
- 奖励权益已经变成已核销，但领取码仍然可用；
- 两个工作人员同时核销成功；
- 核销失败但数据库已经部分更新。

## 11.3 并发控制

同一个领取码只能成功核销一次。

建议在事务中使用带条件的更新：

```sql
UPDATE claim_tokens
SET
status = 'redeemed',
redeemed_at = CURRENT_TIMESTAMP,
redeemed_by = ?,
updated_at = CURRENT_TIMESTAMP
WHERE token_hash = ?
AND status = 'active'
AND (SELECT e.end_at
     FROM reward_entitlements re
     JOIN events e ON e.id = re.event_id
     WHERE re.id = claim_tokens.entitlement_id) > CURRENT_TIMESTAMP;
```

然后检查：

changes === 1

如果更新行数不是 1，则说明：

- 领取码不存在；
- 领取码已使用；
- 已超过活动截止时间；
- 其他工作人员已经抢先核销。

只有更新成功后，才继续更新奖励权益：

```sql
UPDATE reward_entitlements
SET
status = 'redeemed',
redeemed_at = CURRENT_TIMESTAMP,
redeemed_by = ?,
updated_at = CURRENT_TIMESTAMP
WHERE id = ?
AND status = 'available';
```

同时写入核销记录：

```sql
INSERT INTO redemptions (
claim_token_id,
staff_name,
student_device_id,
reward_code
)
VALUES (?, ?, ?, ?);
```

最后提交事务。

## 11.4 核销成功响应

```json
{
"success": true,
"claimTokenStatus": "redeemed",
"entitlementStatus": "redeemed",
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
BOOTH_NOT_FOUND                404    摊位不存在
───────────────────────  ───────────  ──────────────────
ENTITLEMENT_NOT_FOUND          404    奖励权益不存在
───────────────────────  ───────────  ──────────────────
CLAIM_TOKEN_NOT_FOUND          404    领取码不存在
───────────────────────  ───────────  ──────────────────
CLAIM_TOKEN_EXPIRED            409    已超过活动截止时间
───────────────────────  ───────────  ──────────────────
CLAIM_TOKEN_REDEEMED           409    领取码已经核销
───────────────────────  ───────────  ──────────────────
ENTITLEMENT_REDEEMED           409    奖励已经核销
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
解锁徽章
创建奖励权益

### 13.2 领取码首签事务

首次随机生成领取码
计算哈希
幂等插入 claim_tokens（已存在则复用）
按 entitlement_id 查询并复用同一条记录

### 13.3 工作人员核销事务

锁定事务
检查领取码
检查奖励权益
更新领取码
更新奖励权益
写入 redemptions 核销记录
提交事务

### 13.4 SQLite 事务建议

核销流程建议使用：

```sql
BEGIN IMMEDIATE
```

原因：

- 在读取后更新前尽早获得写锁；
- 降低两个工作人员同时核销成功的风险；
- 保证领取码和奖励权益状态一致。

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
- exp 统一设为活动截止时间（北京时间 2026-09-20 00:00:00），不按签发时刻计算相对时长；
- 不在 URL 中传递 JWT；
- 每次 staff 请求实时核对姓名是否在白名单中；
- 姓名从白名单移除后，应阻止旧 staff JWT 继续访问 staff 接口。

### 14.3 领取码安全

- 领取码由 HMAC 确定性派生，不落明文；
- 领取码长度足够（8 位 base32 约 40 bit）；
- 数据库只保存 SHA-256；
- 不在日志中输出明文领取码；
- 不通过 URL 参数传递领取码；
- 以活动截止时间（events.end_at）统一失效，不单独为每条码设有效期；
- 每个奖励权益固定一个唯一码，不重新签发、不作废旧码；
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
- 奖励权益 ID；
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
- 不重复创建奖励权益；
- 多个并发请求下不重复创建徽章和奖励。

## 15.3 领取码测试

需要覆盖：

- 正常获取领取码；
- 数据库不保存明文；
- 领取码能够正常哈希查询；
- 超过活动截止时间的领取码视为不可用；
- 同一设备多次请求返回同一个码；
- 不同设备领取码互不相同；
- 只有奖励拥有者可以获取自己的领取码；
- 已核销奖励不再返回码。

## 15.4 工作人员核验测试

需要覆盖：

- staff 正常核验；
- student 不能核验；
- 不在白名单的姓名不能核验；
- 领取码不存在；
- 已超过活动截止时间的领取码；
- 领取码已核销；
- 核验不会直接改变核销状态。

## 15.5 工作人员核销测试

需要覆盖：

- 正常核销；
- 核销后领取码状态为 redeemed；
- 核销后奖励状态为 redeemed；
- 重复核销失败；
- 超过活动截止时间的领取码不能核销；
- 并发核销时最多一个请求成功；
- 核销中途失败时事务回滚；
- 正确记录核销工作人员和时间；
- 核销成功后 redemptions 写入一条正确记录（staff / student / reward / 时间）。

———

## 16. 推荐实现顺序

### 阶段一：确认数据库基线

- 确认当前数据库初始化方式；
- 确认当前所有表结构；
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
- 完成徽章幂等解锁；
- 完成奖励权益幂等创建。

### 阶段四：实现领取码

- 增加 claim_tokens；
- 增加领取码首次随机生成与哈希存储；
- 按活动截止时刻统一失效；
- 增加领取码一对一复用规则；
- 增加用户领取码接口。

### 阶段五：实现工作人员功能

- 增加 requireStaff；
- 实现 staffVerify；
- 实现 staffRedeem；
- 增加核验记录字段；
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
- 所有网站服务在北京时间 2026-09-20 00:00:00 关闭。
- 活动关闭后，领取码过期，工作人员不能核验或核销领取码。
- 所有 JWT 与领取码在同一截止时刻失效。
- 业务判断采用半开区间：当前时间 < 截止时间时有效；当前时间 >= 截止时间时失效。
- 领取码有效期不单独设置短 TTL，统一以活动截止时刻为失效点。

### 18.2 领取码格式与生命周期（已确认）

- 一个徽章只对应一个奖励权益。
- 一个奖励权益只对应一个二维码和一个领取码。
- 领取码第一次请求时随机生成，数据库只保存领取码哈希。
- 后续请求复用同一条领取码记录和同一个领取码，不重新生成、不重新签发。
- 核销成功后领取码立即失效，用户端不再展示。

### 18.3 核验和核销（已确认）

- 核验和核销使用两个接口。
- 只保留第一次成功核验的工作人员和时间；后续核验不覆盖第一次成功核验记录。
- 核验不会直接改变领取码或奖励权益的核销状态。
- 核销成功后不可撤销已核销权益。
- 活动关闭后不可核验、不可核销。

### 18.4 徽章范围（已确认）

- 本阶段只实现 knowitall 徽章。
- 本阶段不启用 roamer，也不因 roamer 或驻场时长创建任何奖励权益。

### 18.5 一个奖励是否允许多个领取码（已确认）

每个奖励权益固定一个唯一领取码，不允许多个码。

### 18.6 徽章规则是否可配置

当前建议将徽章规则放在 badges 表中：

required_unique_booths

本项目当前只有一个活动，knowitall 的要求是浏览不同摊位后按去重数量解锁。

### 18.8 是否保留 roamer

已定（硬性要求）：只做 knowitall，不做 roamer。

roamer 及 presence_* 相关代码与表仅保留为移植参考，不作为本版本的激活规则。

### 18.9 活动是否必须存在

所有浏览、徽章和奖励行为都应该关联具体活动。

建议：

event_id 必须存在；
活动必须处于 active 状态；
closed 状态的活动不再允许产生新的浏览和领取码。

### 18.10 staff 专用入口与白名单

已定：

- 不开放注册，也没有 staff 账号；
- 工作人员使用固定识别码（STAFF_CODE，固定为 staff2026）进入专用入口，所有工作人员共用同一个链接；
- 仅凭识别码不能获得权限，还需输入姓名，且姓名必须在 staff_whitelist 白名单中；
- 白名单在活动开始前由运营通过数据库脚本或后台管理预录入。

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
JWT 统一在活动截止时间（北京时间 2026-09-20 00:00:00）失效。

### 百事通徽章

学生设备浏览不同摊位；
后端按活动和 device_id 去重统计；
满足条件后解锁 knowitall；
徽章和奖励权益不会重复创建。

### 领取码

学生设备可以为自己的奖励获取一个固定唯一的领取码；
领取码只保存哈希，前端以二维码呈现；
领取码在活动截止时间前有效，超过后不可核销；
不重新签发，核销后码失效、用户端不再显示。

### 工作人员核验

只有白名单内的 staff 可以核验；
核验可以确认领取码是否有效；
核验不会直接完成核销。

### 工作人员核销

只有白名单内的 staff 可以核销；
领取码和奖励权益在同一事务中更新；
核销成功写入 redemptions 核销记录；
同一个领取码最多成功核销一次；
并发请求不会导致重复核销。

———

## 20. 实现完成标准

满足以下条件后，认为当前后端第一阶段完成：

- [ ] 学生携带 device_id 自动签发 student JWT；
- [ ] JWT 能正常签发和校验；
- [ ] staff 通过识别码 + 白名单姓名签发 staff JWT；
- [ ] staff 权限通过实时白名单姓名判断；
- [ ] 不同摊位浏览记录可以去重；
- [ ] knowitall 徽章能够正确解锁；
- [ ] 奖励权益能够幂等创建；
- [ ] claim_tokens 表完成；
- [ ] redemptions 核销记录表完成；
- [ ] 领取码固定唯一（首次随机生成，后续复用）；
- [ ] 领取码只保存哈希；
- [ ] 领取码以活动截止时间（end_at）为失效点；
- [ ] staffVerify 接口完成；
- [ ] staffRedeem 接口完成；
- [ ] 核销使用事务；
- [ ] 核销后 redemptions 写入正确记录；
- [ ] 并发核销最多一个成功；
- [ ] 核验和核销错误码统一；
- [ ] 敏感数据不写入日志；
- [ ] 认证、徽章、领取码和核销测试通过。