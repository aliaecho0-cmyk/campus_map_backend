# 上线前测试记录

> 范围：仅当前 `web/` 文件夹全栈（backend + frontend）。
> 云服务器跑旧版、本次不动；以下所有测试针对**本地新版**。
> 约定：每步记录统一用「测什么 / 怎么测 / 测试结果 / 发现的问题 / 做了什么修改 / 修改后复测结果」六段式。

---
## 已知限制 / 接受的风险 / 设计债

### 简短条目

- **STAFF_CODE 仍为默认值 `staff2026`（接受）**：一日活动，不更换口令、也不加默认值拦截。任何知道 `staff2026` 且姓名在白名单内的人均可登录 staff，此风险已接受。
  - 保留的兜底：`backend/src/server.js` 启动前校验 `STAFF_CODE`/`JWT_SECRET` 缺失或为空即 `process.exit(1)`；`backend/src/services/authService.js` `staffLogin` fail-closed（识别码未配置或不等即 `AUTH_REQUIRED`）。

- **boothId 无存在性校验（接受）**：不校验是否为真实摊位、无长度上限。接受原因：用户在现场扫码上报，造不出假 id；且领奖码需 staff 线下核销，人仍需到现场；单日活动，不值得改数据模型。

- **eventId 用 `Number()` 宽松解析（忽略）**：`"1.0"`/`"1e3"` 会被强转。非安全问题，忽略。

- **code/name 无长度上限（忽略）**：超长仅 401，不崩溃不绕过。忽略。

- **deviceId 自报身份、可被冒充（接受）**：`studentLogin` 只校验格式、不绑定归属，任何合法格式的 deviceId 都能登录并读取该设备的 reward + 明文领取码。deviceId 一旦泄露即可被冒充、抢核销。后续若办多活动或提高安全要求，需引入服务端会话 / 设备密钥绑定来修。

- **服务不校验 DB schema（已知限制）**：
  - 现象：指向空库 / 缺表库时，服务正常启动无报错；首个请求 `POST /auth/student` 返回 500「服务器内部错误」。
  - 根因：启动时仅校验数据库连接，未校验表结构；无 `/ready` 或 `/health` 探针。
  - 影响：故障延迟到首请求才暴露；自动化部署 / 无人值守场景下不易定位。
  - 当前规避：部署后手动发一个请求验证。
  - 后续方案：加启动时核心表存在性校验（`SELECT 1 FROM events LIMIT 1` 等）+ `/ready` 探针，失败 fail-fast。

- **未知路由返回 HTML 而非 JSON（已知限制）**：
  - 现象：访问未知路由返回 Express 默认 HTML 404 页。
  - 根因：未注册 JSON 格式的兜底 404 中间件。
  - 影响：前端 `res.json()` 解析 HTML 失败，可能误判为「网络错误」。
  - 当前规避：无（不影响现有 API 正确性）。
  - 后续方案：在所有路由之后加 `app.use((req,res)=>res.status(404).json({error:'Not Found'}))`。

- **启动校验不检查 JWT_SECRET 是否为占位符（已知限制）**：
  - 现状：`server.js` 启动时只校验 `JWT_SECRET` 非空，不校验其是否为已知占位符（如 `replace-with-...`）或是否足够随机。
  - 当前安全性：`JWT_SECRET` 为真随机值（64 位 hex），此缺口不触发。
  - 潜在风险：若将来误用占位符（如复制 `.env.example` 没改），服务会照常启动，且 token 可被伪造。
  - 缓解（可选）：启动时额外校验 `JWT_SECRET` 长度 ≥ 32 或匹配 `/^[0-9a-f]{64}$/`。
  - 结论：当前先不处理。

### 设计债：前端 eventId 写死

**现象**：前端调用 `recordBoothView` 时，`eventId` 写死为 `1`。

**根因**：后端 8 个接口没有一个返回 `eventId`。连 `eventEndAt` 都返回了，偏偏没返回 `eventId`。前端拿不到，只能写死。

**后端侧 eventId 是必要的**：
- `badges` 唯一约束 `(event_id, code)`
- `booth_view_records` 唯一约束 `(event_id, device_id, booth_id)`
- 没有它，多届时集章数据会跨届串

**已埋的不一致**：
- 登录校验：`getCurrentEvent()` → 「最新 active 活动」
- 浏览校验：URL 里的 `eventId`
- 今天单活动都是 1，看不出问题
- 将来出现第二条 active 活动 → 登录认 event 2，前端还 POST `/events/1/...` → `409 EVENT_NOT_ACTIVE` → 用户「点了没反应」

**当前决策**：不修。单活动 + 已上线 + 二维码已发出，写死 1 当前正确且安全。

**将来办第二届时**：
- 最小改动：让登录响应或 `/api/auth/me` 带上 `eventId`
- 前端从登录结果取，不再写死
- 后端 `recordView` 那套不用动
- ⚠️ 要改的不只是前端那个常量

---

## 部署检查项

- **NODE_ENV**：
  - 现象：临时服务未设 `NODE_ENV` 时，500 响应无 stack。
  - 结论：错误响应是否带 stack 依赖 `NODE_ENV`。
  - 行动：生产环境务必确认 `NODE_ENV=production`，避免把 stack 泄漏给用户。

---

## 第一步：堵安全漏洞（STAFF_CODE / JWT_SECRET / NODE_ENV）

### 0. 检查配置现状（已完成）

**读取配置的代码位置：**
- `STAFF_CODE`：`backend/src/services/authService.js:64`（`code !== process.env.STAFF_CODE`）
- `JWT_SECRET`：`backend/src/services/authService.js:14-18`（`requireSecret()`）、`:92`（`verifyToken`）
- `NODE_ENV`：`backend/src/middleware/errorHandler.js:49`（`isDev` 判定）、`:56`/`:63`（泄露 `err.stack`）

**示例值（`backend/.env.example`）与本地实际值（`backend/.env`）：**

| 变量 | 示例值 | 本地实际值 | 判断 |
|---|---|---|---|
| `STAFF_CODE` | `staff2026` | `staff2026` | ⚠️ 仍为默认值，可被猜中 |
| `JWT_SECRET` | `replace-with-a-32-byte-hex-string` | `9b03f6e0…23cdcb9`（64位 hex） | ✅ 已随机，当前不可伪造 |
| `NODE_ENV` | `development` | `development` | ⚠️ 本地开发态，当前会泄露 stack |

**绕过判断：**
- 若 `.env` 整行删除 `STAFF_CODE`（= undefined），且请求不带 `code`，则 `staffLogin` 的 `undefined !== undefined` 为 false，绕过识别码校验 → 白名单内任意姓名可登录。

---

### 1a. STAFF_CODE 未配置（undefined）时 staff 登录绕过

- **测什么**：删除 `STAFF_CODE` 后，只传白名单姓名（不带 code）能否登录成功。
- **怎么测的**：
  1. `cd backend` 并启动服务：`npm start`。
  2. 先列出白名单姓名（改 `.env` 之前查）：
     `node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('database.db'); console.log(db.prepare('SELECT name FROM staff_whitelist').all().map(r=>r.name).join(', '))"`
  3. 备份 `.env`，删除 `STAFF_CODE` 行，重启服务。
  4. 不带 code 登录：
     `node -e "fetch('http://localhost:3000/api/auth/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'<白名单姓名>'})}).then(r=>r.text()).then(console.log)"`
  5. 对照：带任意错误 code 登录（应 401）。
- **测试结果**：通过
  - 启动校验：`STAFF_CODE` 缺失时 `node src/server.js` 打印 `缺少必需环境变量: STAFF_CODE` 且 `EXIT_CODE=1`（未起服务）。
  - fail-closed（单元直调）：`STAFF_CODE` 未配置 + 不带 code + 白名单「张三」→ 抛 `AUTH_REQUIRED`（不再绕过）。
  - HTTP：`POST /api/auth/staff` 不带 code + `name=张三` → `401 AUTH_REQUIRED`。
  - 对照：`STAFF_CODE=staff2026` + 正确 code + 张三 → 返回 `role=staff`（未误杀正常登录）。
- **发现的问题**：
  - 主问题已修复。顺带观察到 HTTP 401 响应体带 `stack`（`NODE_ENV=development` 泄露堆栈），归入 1b 处理。
  - `STAFF_CODE` 仍为默认值 `staff2026`，已记入「已知限制 / 接受的风险」。
- **做了什么修改**：
  - `backend/src/server.js`：`listen` 前新增校验，`STAFF_CODE`/`JWT_SECRET` 缺失或为空时 `console.error` 并 `process.exit(1)`。
  - `backend/src/services/authService.js`：`staffLogin` 判断改为 `if (!process.env.STAFF_CODE || code !== process.env.STAFF_CODE) throw new Error('AUTH_REQUIRED')`（fail-closed，堵死 `undefined !== undefined` 绕过）。
- **修改后复测结果**：通过（本次即为修改后验证，见「测试结果」）。

---

### 1b. NODE_ENV=development 时错误堆栈泄露

- **核查结论（静态代码检查）**：`NODE_ENV=production` 时堆栈泄露面为 0。`errorHandler.js` 是唯一错误出口，`isDev = NODE_ENV === 'development'`（`errorHandler.js:49`）；只有 `:56`/`:63` 两处向响应体写 `err.stack`，均被 `isDev` 闸住。`NODE_ENV` 全项目只在 `errorHandler.js:49` 读一次；其余 8 处 `res.json` 全为成功路径、异常统一 `next(err)`；未映射错误响应体为硬编码 `INTERNAL_SERVER_ERROR`（不含 `err.message`）。未设 `NODE_ENV`（`undefined !== 'development'`）同样不泄露。**代码无需改动。**
- **附带边角（不阻塞上线）**：
  1. 畸形 JSON 请求体返回 500，应为 400。
  2. 未知路由无 404 JSON 处理（走 Express 默认 HTML）。
- **测什么**：触发一次 500，观察响应体是否带 `error.stack`。
- **怎么测的**：
  1. 服务保持运行（`.env` 为 development）。
  2. 发送畸形 JSON 触发内部错误：
     `node -e "fetch('http://localhost:3000/api/auth/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad json'}).then(r=>r.text()).then(console.log)"`
  3. 观察响应是否含 `"stack":"..."`。
  4. 对照：把 `.env` 的 `NODE_ENV` 改为 `production`，重启，重复（应无 stack）。
- **测试结果**：待测
- **发现的问题**：待补
- **做了什么修改**：待补
- **修改后复测结果**：待补

---

## 第二步：核心链路端到端冒烟

- **测什么**：跑 `backend/test-smoke.js`（19 步黑盒 HTTP 冒烟），验证核心链路「学生登录 → 逛 20 摊解锁 knowitall → 领码 → staff 核销 → 已核销」，以及幂等、权限、并发核销、活动过期、参数边界。
- **前置**：
  1. 备份 `database.db` → `database.db.bak.20260911-231532`。
  2. 杀掉 3000 旧 dev 服务（PID 3988），后台重启后端到最新代码（含 `server.js` 启动校验 + `authService` fail-closed）。
- **怎么测的**：`node --env-file=.env test-smoke.js`（后端已跑在 `http://localhost:3000`）。
- **测试结果**：✅ 通过 19/19。
  - 核心链路：登录 → 逛 20 摊解锁（unique=20）→ 领码 → staff 核销 → 已核销（步 1–7 全绿）。
  - 幂等：重复浏览计数不变、重复取码返回同码、重复核销 409（步 8–10）。
  - 权限：学生 token 调核销 403、无 token 401（步 11–12）。
  - 并发：并发核销同一码恰一成功一拒绝（步 14）。
  - 过期：临时改 `end_at` 为过去 → 取码 `EVENT_NOT_ACTIVE`、核销 `CLAIM_TOKEN_EXPIRED`，随后恢复（步 15–17）。
  - 边界：`deviceId` 非法 400、`eventId` 负 400（步 18–19）。
  - 活动截止 `eventEndAt=2026-09-19T15:59:59.000Z`（仍 active）。
- **发现的问题**：无（19 步全绿）。
- **做了什么修改**：无（纯验证，未改代码）。
- **修改后复测结果**：不适用。

---

## 第三步：边界输入（eventId / boothId / code / name）

- **测什么**：对 `eventId`/`boothId`（view 接口）与 `code`/`name`（staff 登录）做空值、超长、特殊字符、非字符串类型的边界输入。
- **怎么测的**：临时脚本 `_tmp_boundary.mjs`（已删），学生 token 打 view、直接打 staff 登录，逐用例打印 `status + error code`，测后清理测试设备数据。
- **测试结果**（实测）：
  - `eventId`（路由 `Number()` 强转 + `Number.isInteger`）：`0`/`-5`/`abc`/`1.5`/`1;DROP` → **400**；`1.0` → **200**（被 `Number("1.0")=1` 吞成活动 1）；`1e3`/`0x10`/超大数 → **404**（强转成整数后「活动不存在」）。
  - `boothId`（仅校验非空）：空白 → **400**；超长 5000 字符 / `../` 穿越 / emoji / 中文 / null 字节 → **全部 200 接受入库**。
  - `code`（严格相等）：null/空/数字/对象/数组/超长/带空格 → **全部 401**；正确 `staff2026` → 200。
  - `name`（SQLite bind）：null/空/数字/对象/数组/超长/带空格 → **全部 401**（**无 500**，node:sqlite 对非字符串 bind 不抛错）；张三 → 200。
- **发现的问题**：
  1. `boothId` **无长度上限、无字符集/存在性校验**（与 `docs/api.md` 声称「长度上限宽松校验」不一致）：5000 字符、`../`、null 字节均实测 200 入账并计奖。配合「无 booths 表」，任何非空字符串都能刷满 knowitall——**接口可刷 20 个任意摊位解锁，无需真正逛摊**。
  2. `eventId` 走 `Number()` 宽松解析：`"1.0"`→活动 1、`"1e3"`/`"0x10"`→整数。非安全漏洞（仍须匹配真实活动），但解析比预期宽松。
  3. `code`/`name` 无长度上限，但仅导致 401（不崩溃、不绕过），影响可忽略。
- **做了什么修改**：无（接受结果）。
- **修改后复测结果**：不适用。

---

## 第四步：越权 / IDOR（身份冒充）

- **测什么**：用「合法格式但非自己」的 deviceId，能否读到他人 reward / claim；以及是否存在参数注入型 IDOR。
- **怎么测的**：临时脚本 `_tmp_idor.mjs`（已删）。受害者 A 解锁并领码，攻击者 B ① 用自己 token 读、② 尝试 `?deviceId=` 注入、③ 直接用 A 的 deviceId 重新登录。
- **测试结果**（实测）：
  - B 用自己 token 读自己 → 空状态（unlocked=false、unique=0、claimToken=null），**读不到 A**。
  - B 尝试 `?deviceId=<A>` 注入 → 参数被忽略、仍读自己（`/api/me/reward` 的 deviceId 只取 JWT sub，不接受请求参数）→ **无参数型 IDOR**。
  - 攻击者直接用 A 的 deviceId 调 `POST /api/auth/student` → 200 拿到 A 的 token，随后读到 A 的 `unlocked=true、unique=20` 与 **A 的明文领取码** → **身份冒充成立**。
- **发现的问题**：
  1. `studentLogin` 只校验 deviceId 格式、不校验归属/密钥，任何合法格式的 deviceId 都能换到 token → 拿到他人 deviceId 即可完全冒充（读 reward + 明文领取码）。本质是「deviceId 即自报的 bearer 凭证，无身份绑定」。
  2. 正向：所有 `/api/me/*` 的 deviceId 均取 JWT sub、无请求参数注入点，经典参数型 IDOR 不存在。
- **危害评估**：领取码需 staff 线下扫码核销，冒充者要兑现仍须到现场；但可窃读他人领取码并抢先核销，且 deviceId 一旦泄露（共享设备 / XSS / 日志）即全盘暴露。单日活动场景危害 **低-中**。
- **做了什么修改**：无。风险已接受
- **修改后复测结果**：未修改。

---

## 第五步：异常处理（畸形请求 / 依赖异常 / 缺 schema）

- **测什么**：畸形 JSON、超大 body、非对象 body、未知路由、非 JSON content-type，以及「空 DB / 缺 schema」时服务端表现。
- **怎么测的**：临时脚本 `_tmp_exception.mjs`（对 3000）+ 起一个指向空 DB 的临时服务（3001，`DATABASE_PATH=./database.empty.db`）。
- **测试结果**（实测）：
  - 畸形 JSON → **500 INTERNAL_SERVER_ERROR**（应为 400）。
  - 超大 body（150kb）→ **500**（应为 413）。
  - body=数字 `123` → **500**（`express.json` 严格模式拒绝非对象，错误被误判为 500，应为 400）。
  - body=数组 `[]` → 401（优雅，无崩溃）。
  - text/plain body → 401（优雅，`express.json` 跳过解析）。
  - 未知路由 → 404 但 **text/html**（Express 默认 HTML「Cannot GET」，非 JSON）。
  - 空 DB 服务：**正常启动**（无报错），首请求 `POST /auth/student` → **500「服务器内部错误」**（无 schema 校验、无 readiness/health）。顺带：该服务未设 `NODE_ENV`，500 响应无 stack，再次印证 1c「未设 NODE_ENV 也不泄露」。
- **发现的问题**：
  1. `errorHandler` 只按 `err.message` 匹配错误码，body-parser 的解析错误（畸形 JSON / 超大 body / 严格模式拒绝）都带 `err.status`（400/413）但被忽略 → 一律 500。**已修复**（优先读 `err.type`/`err.status`）。
  2. **无 readiness / schema 校验**：DB 缺失/为空时服务照常启动，首请求才 500，故障无提前暴露。**未修 → 见「已知限制 / 接受的风险 / 设计债」章节**。
  3. 未知路由无 JSON 404，前端拿到 HTML 可能误判为网络错误。**未修 → 见「已知限制 / 接受的风险 / 设计债」章节**。
- **做了什么修改**：
  - `backend/src/middleware/errorHandler.js`：错误分类改为「业务错误码（`err.message` 映射）→ body-parser 错误（`err.type`/`err.status`：`entity.too.large`→413、`entity.parse.failed` 或其它 4xx status→400）→ 兜底 500」；新增 `PAYLOAD_TOO_LARGE: 413` 与 `INTERNAL_SERVER_ERROR` 消息映射。
- **修改后复测结果**：通过（7 例）——畸形 JSON→400、超大 body→413、body=数字→400；无 token→401、staff 错 code→401、student 坏 deviceId→400、body=数组→401（鉴权 / 业务错误不受影响）。

---

## 第六步：并发一致性（并发核销同一领取码）

- **测什么**：50 个并发请求核销【同一个】领取码，验证「一次性核销」语义——应恰好 1 个成功、其余 409，DB 仅 1 条核销记录。
- **接口**：`POST /api/staff/claim-tokens/redeem`；请求体 `{ claimToken }`；鉴权 `requireStaff`（staff JWT）。
- **怎么测的**：临时脚本 `_tmp_concurrency.mjs`（已删）。造 1 个未核销领取码 → `Promise.all` 同时发 50 个核销请求 → 收集 status/响应 → 直查 DB。
- **测试结果**（实测）：
  - HTTP：`200 × 1`，`409 CLAIM_TOKEN_REDEEMED × 49`。
  - DB：`claim_tokens.status='redeemed'`（`redeemed_by=张三`）；`redemptions` 表该 `claim_token_id` 记录数 = **1**。
  - 判定：✅ 无重复核销。
- **发现的问题**：无。三重兜底生效：`BEGIN IMMEDIATE`（`staffRedemptionService.js:47`）+ `UPDATE ... WHERE status='active'`（`claimTokenRepository.js:100`）+ `redemptions` `UNIQUE(claim_token_id)`（`initial_schema.sql:84`）。
- **做了什么修改**：无（测试通过）。
- **修改后复测结果**：不适用。

---

## 第七步：部署后验证（云端）

### 7.1 服务健康
- pm2 list：club-backend / tunnel online ✅
- curl -i localhost:3001：404 Express（后端活着）✅
- curl -i localhost:8080：200 HTML（前端正常）✅
- curl -I localhost（走80）：301 → https://app.divgate.com/（另一站点，非本服务）

### 7.2 完整链路（走域名）
- curl -I https://<域名>/：cache-control: no-cache, no-store, must-revalidate ✅
- curl -I https://<域名>/assets/*.js：public, max-age=31536000, immutable ✅
- curl -i https://<域名>/api/auth/me：401 JSON ✅
- CF-Cache-Status: DYNAMIC（Cloudflare 不缓存）✅

### 7.3 缺失 asset
- 请求不存在的 asset：返回 404（不再伪装 200 HTML）✅

### 7.4 进程常驻
- pm2 startup 已配 + pm2 save 已执行 ✅
- pm2 describe tunnel：restarts=0, uptime=36h ✅
- NODE_ENV=production ✅

### 7.5 安全验证
- 3001 对外暴露检查：外部 curl 47.76.221.148:3001 → Connection refused ✅
- （修复前：外部能访问 → 已通过 Node 绑定 127.0.0.1 修复）

### 发现的问题
- 无新增问题

### 已知限制（部署相关）
- Quick Tunnel（cloudflared --url）：域名随机，进程重启会变 → 服务器重启后二维码可能失效
- 无正式域名 + HTTPS，依赖 trycloudflare 临时域名

---

## 第八步：并发 / 压力测试（本地）

> 与第六步的分工：**第六步测「顺序重复」，本步测「同时并发」**（`Promise.all` 一次性发出，
> 不 await 上一个）。脚本 `backend/test-concurrency.js`，本地副本库执行，不碰生产。

### 8.1 测试方式
- **隔离**：`cp database.db database.test.db` → `DATABASE_PATH=database.test.db PORT=3001 node --env-file=.env src/server.js`
- **客户端**：`node:http` + keep-alive 连接池 50 条，模拟生产真实形态 `用户 → Cloudflare → nginx →（连接池）→ Node`
- **判定口径**：① 接口返回码 ② 直连查库行数（行数是幂等的铁证）

### 8.2 结果：4/4 组通过

| 组 | 场景 | 并发 | 结果 | 耗时 |
|---|---|---|---|---|
| 1 | 学生登录（不同设备） | 50 | 全部 200，各带 token | 50ms |
| 2 | 同一设备领码（幂等） | 50 | 全部 200 且**返回同一个码**；查库 `claim_tokens` 恰 **1 行** | 139ms |
| 3 | 同一码核销（幂等） | 50 | **1 成功 / 49 `CLAIM_TOKEN_REDEEMED`**；`redemptions` 恰 **1 行** | 108ms |
| 4 | 摊位浏览（压力 + 去重） | 1000 | 1000 全 200、**0 个 5xx、0 个锁错误**；查库净增 **1000 行**、抽查去重计数均为 10 | 4659ms |

### 8.3 关键结论
- 所有并发场景下后端 **0 个 5xx、0 个 `database is locked`**。
- 幂等在并发下成立：领码只生成一个码、核销只有一个成功、浏览去重计数不被刷大。
- 1000 并发摊位浏览 ≈ 4.7s 处理完（约 4.7ms/请求），与「Node 单线程 + 同步 SQLite 串行处理」的预期一致。

### 8.4 一个需要辨明的现象（已确认**不是**后端问题）
用内置 `fetch`（每条请求各开一条**新连接**）发 1000 并发时，出现大量 `ECONNREFUSED`（约 665/1000）。
排查过程：
1. 同一客户端、同样 1000 并发打**快接口** `/api/auth/me` → **1000/1000 全成功**。
2. 把服务端 listen backlog 从默认调到 **4096** → **无改善**（仍约 333 成功），排除 backlog。
3. 起一个**不含数据库**、仅延迟 20ms 的极简服务器（`test-probe-limit.js`），用同样方式打：
   - 400 并发 → 232/400；1000 并发 → 422/1000，**同样 `ECONNREFUSED`**
   - 同一批请求改用 keep-alive 50 条连接 → **1000/1000 全成功**
4. 结论：这是**本机单进程同时开上千条 TCP 连接的能力上限**（客户端 / OS 侧），**与后端无关**。
   生产链路经 nginx 连接池回源，Node 不会遭遇连接风暴。

### 发现的问题
- **无后端问题**。唯一现象（大量 `ECONNREFUSED`）已定位为测试客户端 / OS 侧的并发连接上限，非后端缺陷。

### 已知限制
- 后端为 Node 单线程 + 同步 SQLite，**请求实际串行处理**。按本次活动规模（单机、几百人、峰值每秒几十次）余量充足
  （1000 请求串行仅 4.7s）。若将来并发量级上台阶，正确方向是换异步驱动 + 连接池，**而非**给 SQLite 开多进程
  （多进程写会互相撞库锁，更糟）。
- 本步为**本地副本库**测试，未在生产上施压。
