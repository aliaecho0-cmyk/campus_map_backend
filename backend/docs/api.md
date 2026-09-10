

```markd
# online_map_try Web 版本 - API 接口契约

> 版本：v1.0
> 更新时间：2026-09-09
> 本文档供前端、后端、测试同学联调使用。


## 1. 通用约定

### 1.1 基础 URL

| 环境 | 地址 |
|:---|:---|
| 开发环境 | `http://<服务器IP>:<端口>` |
| 生产环境 | `http://<服务器IP>:<端口>` |

> 具体 IP 和端口号由部署时确定，联调时由后端提供。

### 1.2 认证方式

除登录接口外，所有接口需要在请求头中携带 JWT：

```
Authorization: Bearer <jwt_token>
```

### 1.3 统一响应格式

**成功响应**：直接返回业务数据，无外层 `code`/`data` 包裹。

**错误响应**：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

### 1.4 通用错误码

| 错误码 | HTTP 状态 | 说明 |
|:---|:---|:---|
| `AUTH_REQUIRED` | 401 | 未登录，请携带 JWT |
| `INVALID_TOKEN` | 401 | JWT 无效或已过期 |
| `STAFF_REQUIRED` | 403 | 需要工作人员权限 |
| `BADGE_NOT_UNLOCKED` | 403 | 未解锁 knowitall，无法操作 |
| `EVENT_NOT_FOUND` | 404 | 活动不存在 |
| `CLAIM_TOKEN_NOT_FOUND` | 404 | 领取码不存在 |
| `EVENT_NOT_ACTIVE` | 409 | 活动当前不可用（未开始或已结束） |
| `CLAIM_TOKEN_EXPIRED` | 409 | 已超过活动截止时间 |
| `CLAIM_TOKEN_REDEEMED` | 409 | 领取码已经核销 |
| `INVALID_REQUEST` | 400 | 请求参数错误 |

### 1.5 日期时间格式

所有时间字段统一使用 **ISO 8601** 格式（UTC 时区）：

```
2026-09-19T15:59:59.000Z
```


## 2. 认证接口

### 2.1 学生自动登录（无感登录）

学生打开页面时调用，前端携带 device_id 换取 student JWT。

**接口**：`POST /api/auth/student`

**请求头**：无

**请求体**：

```json
{
  "deviceId": "dev_1726735999_a8f3k2XY"
}
```

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---|:---|
| `deviceId` | string | 是 | 设备标识，格式 `dev_<timestamp>_<8位随机>` |

**成功响应（200 OK）**：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "dev_1726735999_a8f3k2XY",
    "role": "student"
  },
  "eventEndAt": "2026-09-19T15:59:59.000Z"
}
```

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `token` | string | JWT，后续请求需在 `Authorization` 头中携带 |
| `user.id` | string | 设备标识（即 JWT 的 `sub`） |
| `user.role` | string | 固定为 `student` |
| `eventEndAt` | string | 活动截止时间，用于前端倒计时 |

**错误响应**：

| HTTP 状态 | 错误码 | 说明 |
|:---|:---|:---|
| 400 | `INVALID_REQUEST` | `deviceId` 格式不合法 |


### 2.2 工作人员登录

工作人员通过专用入口进入，输入识别码 + 姓名，换取 staff JWT。

**接口**：`POST /api/auth/staff`

**请求头**：无

**请求体**：

```json
{
  "code": "staff2026",
  "name": "张三"
}
```

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---|:---|
| `code` | string | 是 | 工作人员识别码，固定为 `staff2026` |
| `name` | string | 是 | 工作人员姓名，须在白名单中 |

**成功响应（200 OK）**：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "张三",
    "role": "staff"
  },
  "eventEndAt": "2026-09-19T15:59:59.000Z"
}
```

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `token` | string | JWT，后续请求需在 `Authorization` 头中携带 |
| `user.id` | string | 工作人员姓名（即 JWT 的 `sub`） |
| `user.role` | string | 固定为 `staff` |
| `eventEndAt` | string | 活动截止时间 |

**错误响应**：

| HTTP 状态 | 错误码 | 说明 |
|:---|:---|:---|
| 401 | `AUTH_REQUIRED` | 识别码错误或姓名不在白名单中（不区分具体原因） |

> 为安全考虑，识别码错误和白名单校验失败返回相同的 401 错误，不透露具体失败原因。


### 2.3 获取当前用户信息

**接口**：`GET /api/auth/me`

**请求头**：`Authorization: Bearer <jwt>`

**请求体**：无

**成功响应（200 OK）**：

学生：

```json
{
  "id": "dev_1726735999_a8f3k2XY",
  "role": "student"
}
```

工作人员：

```json
{
  "id": "张三",
  "role": "staff"
}
```

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `id` | string | 学生为 `device_id`，工作人员为姓名 |
| `role` | string | `student` 或 `staff` |

**错误响应**：

| HTTP 状态 | 错误码 | 说明 |
|:---|:---|:---|
| 401 | `AUTH_REQUIRED` | 未携带 JWT |
| 401 | `INVALID_TOKEN` | JWT 无效或已过期 |

> 本接口只返回身份信息，不返回奖励状态。奖励状态请使用 `GET /api/me/reward`。


## 3. 摊位与徽章接口

### 3.1 浏览摊位

学生浏览某个摊位时调用，记录浏览行为，并在达到阈值时自动解锁 knowitall 徽章。

**接口**：`POST /api/events/:eventId/booths/:boothId/view`

**路径参数**：

| 参数 | 类型 | 说明 |
|:---|:---|:---|
| `eventId` | integer | 活动 ID |
| `boothId` | string | 摊位 ID（由前端传入，后端不校验存在性） |

**请求头**：`Authorization: Bearer <student-jwt>`

**请求体**：无

**成功响应（200 OK）**：

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

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `eventId` | integer | 活动 ID |
| `boothId` | string | 当前浏览的摊位 ID |
| `uniqueBoothCount` | integer | 该设备已去重浏览的摊位总数 |
| `badges[].code` | string | 徽章代码，本阶段只有 `knowitall` |
| `badges[].unlocked` | boolean | 该徽章是否已解锁 |
| `badges[].requiredUniqueBooths` | integer | 解锁所需去重摊位数 |

**错误响应**：

| HTTP 状态 | 错误码 | 说明 |
|:---|:---|:---|
| 401 | `AUTH_REQUIRED` | 未携带 JWT |
| 401 | `INVALID_TOKEN` | JWT 无效或已过期 |
| 404 | `EVENT_NOT_FOUND` | 活动不存在 |
| 409 | `EVENT_NOT_ACTIVE` | 活动不可用（未开始或已结束） |
| 400 | `INVALID_REQUEST` | `boothId` 为空或超长 |


## 4. 领取码接口（学生端）

### 4.1 获取我的奖励状态

学生加载奖励页时调用，返回解锁进度、领取码状态（三态：未解锁 / 可领取 / 已核销 / 已过期）。

**接口**：`GET /api/me/reward`

**请求头**：`Authorization: Bearer <student-jwt>`

**请求体**：无

**成功响应（200 OK）**：

**情况一：未解锁 knowitall**

```json
{
  "badge": {
    "code": "knowitall",
    "name": "百事通",
    "unlocked": false,
    "requiredUniqueBooths": 5,
    "uniqueBoothCount": 3
  },
  "reward": null,
  "eventEndAt": "2026-09-19T15:59:59.000Z"
}
```

**情况二：已解锁，但未首签（可领取）**

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
    "claimStatus": "none",
    "claimToken": null,
    "redeemedAt": null
  },
  "eventEndAt": "2026-09-19T15:59:59.000Z"
}
```

**情况三：已首签，未核销（可展示二维码）**

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

**情况四：已核销**

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
    "claimStatus": "redeemed",
    "claimToken": null,
    "redeemedAt": "2026-09-09T12:10:00.000Z"
  },
  "eventEndAt": "2026-09-19T15:59:59.000Z"
}
```

**情况五：已解锁但活动已过期（不可领取）**

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
    "claimStatus": "expired",
    "claimToken": null,
    "redeemedAt": null
  },
  "eventEndAt": "2026-09-19T15:59:59.000Z"
}
```

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `badge.code` | string | 固定为 `knowitall` |
| `badge.name` | string | 徽章名称 |
| `badge.unlocked` | boolean | 是否已解锁 |
| `badge.requiredUniqueBooths` | integer | 解锁所需去重摊位数 |
| `badge.uniqueBoothCount` | integer | 当前已去重浏览摊位数 |
| `reward.code` | string | 奖励代码，固定为 `free-drink` |
| `reward.claimStatus` | string | `none` / `active` / `redeemed` / `expired` |
| `reward.claimToken` | string | 领取码明文，仅在 `active` 时返回 |
| `reward.redeemedAt` | string | 核销时间，仅在 `redeemed` 时有值 |
| `eventEndAt` | string | 活动截止时间 |

**前端渲染指引**：

| `unlocked` | `claimStatus` | 前端显示 |
|:---|:---|:---|
| `false` | — | 显示进度条：`已浏览 X / 5 个摊位` |
| `true` | `none` | 显示 **「可领取」** 按钮，点击后调用 4.2 |
| `true` | `active` | 显示二维码（`claimToken` 内容） |
| `true` | `redeemed` | 显示 **「已核销」**，不展示二维码 |
| `true` | `expired` | 显示 **「活动已结束」**，不展示二维码 |

**错误响应**：

| HTTP 状态 | 错误码 | 说明 |
|:---|:---|:---|
| 401 | `AUTH_REQUIRED` | 未携带 JWT |
| 401 | `INVALID_TOKEN` | JWT 无效或已过期 |


### 4.2 获取 / 出示领取码（首签或复用）

学生点击「可领取」按钮时调用。如果从未生成过领取码，则首次随机生成；如果已存在且未核销，则复用返回同一个码。

**接口**：`POST /api/me/claim-token`

**请求头**：`Authorization: Bearer <student-jwt>`

**请求体**：无

**成功响应（200 OK）**：

```json
{
  "claimToken": "A7K9-X2M4-Q8P1",
  "claimStatus": "active",
  "eventEndAt": "2026-09-19T15:59:59.000Z"
}
```

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `claimToken` | string | 领取码明文，用于生成二维码 |
| `claimStatus` | string | 固定为 `active` |
| `eventEndAt` | string | 活动截止时间 |

**错误响应**：

| HTTP 状态 | 错误码 | 说明 |
|:---|:---|:---|
| 401 | `AUTH_REQUIRED` | 未携带 JWT |
| 401 | `INVALID_TOKEN` | JWT 无效或已过期 |
| 403 | `BADGE_NOT_UNLOCKED` | 未解锁 knowitall，无法首签 |
| 409 | `EVENT_NOT_ACTIVE` | 活动不可用 |
| 409 | `CLAIM_TOKEN_EXPIRED` | 已超过活动截止时间 |
| 409 | `CLAIM_TOKEN_REDEEMED` | 领取码已核销 |

> 同一个学生永远返回同一个 `claimToken`（首次随机生成后复用）。不重新签发。


### 4.3 查询领取码状态（只读）

用于页面切换后回显二维码，或轮询查询核销状态。**本接口永不创建领取码**。

**接口**：`GET /api/me/claim-token`

**请求头**：`Authorization: Bearer <student-jwt>`

**请求体**：无

**成功响应（200 OK）**：

**未核销**：

```json
{
  "claimStatus": "active",
  "claimToken": "A7K9-X2M4-Q8P1",
  "eventEndAt": "2026-09-19T15:59:59.000Z",
  "redeemedAt": null
}
```

**已核销**：

```json
{
  "claimStatus": "redeemed",
  "claimToken": null,
  "eventEndAt": "2026-09-19T15:59:59.000Z",
  "redeemedAt": "2026-09-09T12:10:00.000Z"
}
```

**从未首签**：

```json
{
  "claimStatus": "none",
  "claimToken": null,
  "eventEndAt": "2026-09-19T15:59:59.000Z",
  "redeemedAt": null
}
```

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `claimStatus` | string | `none` / `active` / `redeemed` |
| `claimToken` | string | 领取码明文，仅在 `active` 时返回 |
| `eventEndAt` | string | 活动截止时间 |
| `redeemedAt` | string | 核销时间，仅在 `redeemed` 时有值 |

**错误响应**：

| HTTP 状态 | 错误码 | 说明 |
|:---|:---|:---|
| 401 | `AUTH_REQUIRED` | 未携带 JWT |
| 401 | `INVALID_TOKEN` | JWT 无效或已过期 |


## 5. 工作人员接口

### 5.1 核销领取码（核验 + 核销 + 发奖）

工作人员扫描或输入学生出示的领取码，一次请求完成：核验领取码有效性 → 核销 → 发奖 → 写入核销记录。

**接口**：`POST /api/staff/claim-tokens/redeem`

**请求头**：`Authorization: Bearer <staff-jwt>`

**请求体**：

```json
{
  "claimToken": "A7K9-X2M4-Q8P1"
}
```

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---|:---|
| `claimToken` | string | 是 | 学生出示的领取码明文 |

**成功响应（200 OK）**：

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

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `success` | boolean | 固定为 `true` |
| `claimTokenStatus` | string | 固定为 `redeemed` |
| `redeemedAt` | string | 核销时间 |
| `redeemedBy.name` | string | 核销人姓名 |
| `redeemedBy.role` | string | 固定为 `staff` |
| `reward.code` | string | 奖励代码，固定为 `free-drink` |

**错误响应**：

| HTTP 状态 | 错误码 | 说明 |
|:---|:---|:---|
| 401 | `AUTH_REQUIRED` | 未携带 JWT |
| 401 | `INVALID_TOKEN` | JWT 无效或已过期 |
| 403 | `STAFF_REQUIRED` | 非工作人员，或姓名已从白名单移除 |
| 404 | `CLAIM_TOKEN_NOT_FOUND` | 领取码不存在 |
| 409 | `CLAIM_TOKEN_EXPIRED` | 已超过活动截止时间 |
| 409 | `CLAIM_TOKEN_REDEEMED` | 领取码已经核销 |
| 409 | `EVENT_NOT_ACTIVE` | 活动不可用 |

> 核销是**原子操作**：同一个领取码并发请求时，最多只有一个能成功，其余返回 `CLAIM_TOKEN_REDEEMED`。


## 6. 接口速查表

| 用途 | 方法 | URL | 认证 |
|:---|:---|:---|:---|
| 学生登录 | POST | `/api/auth/student` | 无 |
| 工作人员登录 | POST | `/api/auth/staff` | 无 |
| 获取当前用户 | GET | `/api/auth/me` | JWT |
| 浏览摊位 | POST | `/api/events/:eventId/booths/:boothId/view` | Student JWT |
| 获取奖励状态 | GET | `/api/me/reward` | Student JWT |
| 获取/出示领取码 | POST | `/api/me/claim-token` | Student JWT |
| 查询领取码状态 | GET | `/api/me/claim-token` | Student JWT |
| 工作人员核销 | POST | `/api/staff/claim-tokens/redeem` | Staff JWT |


## 7. 附录：JWT 说明

### 7.1 Student JWT Payload

```json
{
  "sub": "dev_1726735999_a8f3k2XY",
  "role": "student",
  "iat": 1758254399,
  "exp": 1789790399
}
```

### 7.2 Staff JWT Payload

```json
{
  "sub": "张三",
  "role": "staff",
  "name": "张三",
  "iat": 1758254399,
  "exp": 1789790399
}
```

### 7.3 过期时间

所有 JWT 的 `exp` 统一为活动截止时间：
- 北京时间：`2026-09-19 23:59:59`
- UTC 时间：`2026-09-19T15:59:59.000Z`
- Unix 时间戳：`1789790399`


## 8. 附录：领取码格式说明

- 长度：19 位（含分隔符）
- 格式：`XXXX-XXXX-XXXX-XXXX`（4 组，每组 4 位大写字母或数字）
- 示例：`A7K9-X2M4-Q8P1-W5R3`
- 字符集：`A-Z` + `0-9`（排除易混淆字符如 `0`/`O`、`1`/`I`，具体由实现决定）


*本文档定稿后，前后端按此契约并行开发。接口变更需双方确认并更新本文档。*