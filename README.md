# 百团大战校园地图

面向校园社团招新活动的移动端网页应用。项目提供像素风互动地图、88 个摊位资料、活动信息、浏览进度奖励和工作人员扫码核销，并支持中文与英文界面。

## 主要功能

- 在像素地图上查看、搜索和定位摊位
- 浏览社团列表、分类和中英文详情
- 查看当日舞台表演、隐藏任务与兑奖点
- 六步新手教程，可通过地图右上角问号按钮重新播放
- 浏览同一摊位满 3 秒后记录一次有效浏览，同一活动内按摊位去重
- 浏览 20 个不同摊位后解锁“百事通”徽章并领取奖励二维码
- 工作人员登录、扫码核销和重复核销保护
- 背景音乐、启动动画及中英文界面

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | Vite 5、原生 JavaScript、HTML Canvas、CSS |
| 二维码 | `qrcode`、`html5-qrcode` |
| 后端 | Node.js、Express 5 |
| 数据库 | Node.js 内置 `node:sqlite` |
| 鉴权 | JWT |

请求链路：

```text
浏览器 → Vite 前端 → /api → Express → SQLite
```

开发环境下，前端默认请求 `http://localhost:3000`；生产构建使用同源 `/api`，由 Web 服务器反向代理到后端。

## 环境要求

- Node.js `>= 22.5.0`，后端依赖该版本提供的 `node:sqlite`
- npm
- 如需测试工作人员核销，需要带摄像头的浏览器和 HTTPS 或 `localhost`

## 本地启动

项目没有根目录统一启动脚本，前端和后端需要分别安装、运行。

### 1. 启动后端

```bash
cd backend
npm install
cp .env.example .env
```

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env
```

编辑 `backend/.env`：

```dotenv
JWT_SECRET=请替换为至少32字节的随机密钥
STAFF_CODE=工作人员入口识别码
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
```

可用 Node.js 生成随机 JWT 密钥：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

不要在真实环境中使用 `.env.example` 的示例密钥或识别码，也不要提交 `backend/.env`。

首次运行时创建数据库：

```bash
node run-migration.js
```

这会在 `backend/database.db` 创建表结构、活动和“百事通”徽章。已有旧数据库需要把徽章阈值更新为 20 时，再运行：

```bash
node run-migration.js 002_update_knowitall_threshold.sql
```

启动开发服务：

```bash
npm run dev
```

后端默认监听 `http://localhost:3000`。

### 2. 启动前端

打开另一个终端：

```bash
cd frontend
npm install
npm run dev
```

访问终端中 Vite 输出的地址，通常是 `http://localhost:5173`。

## 工作人员核销

工作人员姓名必须先加入 `staff_whitelist`。在 `backend` 目录执行以下命令可添加本地测试人员：

```bash
node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync('database.db'); db.prepare('INSERT OR IGNORE INTO staff_whitelist (name) VALUES (?)').run('张三'); db.close();"
```

工作人员入口格式：

```text
http://localhost:5173/#/staff?code=<STAFF_CODE>
```

登录成功后，底栏“奖励”会替换为“核销”。扫码页会验证后端身份，核销成功或失败后自动恢复扫描。

## 浏览与奖励规则

1. 学生首次进入时，前端生成并保存设备标识，通过后端换取学生 JWT。
2. 用户在首页打开摊位气泡或进入社团详情页，并停留满 3 秒。
3. 前端调用浏览接口；后端按“活动 + 设备 + 摊位”去重计数。
4. 浏览 20 个不同摊位后，后端解锁“百事通”徽章。
5. 学生在奖励页领取二维码，工作人员扫码后完成核销。

当前前端浏览接口的活动 ID 固定为 `1`。如果将来启用多活动，需要同时调整 `frontend/src/services/boothView.js` 的活动选择逻辑。

## 常用命令

### 前端

```bash
cd frontend
npm run dev       # 启动开发服务器
npm run build     # 构建到 frontend/dist
npm run preview   # 本地预览生产构建
```

### 后端

```bash
cd backend
npm run dev       # 监听文件变更并重启
npm start         # 启动服务
node run-migration.js
```

## 项目结构

```text
campus_map_full/
├─ frontend/
│  ├─ src/
│  │  ├─ components/       # 地图、底栏、教程、唱片机等组件
│  │  ├─ data/             # 摊位、社团资料、Logo 与地图网格数据
│  │  ├─ pages/            # 地图、社团、活动、奖励和工作人员页面
│  │  ├─ services/         # API、登录、浏览计数和业务数据访问
│  │  ├─ styles/           # 全局像素风样式与动画
│  │  ├─ i18n.js           # 中英文界面文案与数据本地化
│  │  └─ main.js           # 前端入口
│  ├─ 地图相关素材/          # 地图边框、唱片机和背景音乐
│  ├─ 地图替换图片/          # 地图纹理
│  ├─ 人物素材/              # 像素角色动作帧
│  └─ 社团logo合集/          # 社团 Logo
├─ backend/
│  ├─ migrations/          # SQLite 初始化与迁移脚本
│  ├─ src/
│  │  ├─ middleware/       # JWT、权限与错误处理
│  │  ├─ repositories/     # SQLite 数据访问
│  │  ├─ routes/           # Express API 路由
│  │  ├─ services/         # 登录、浏览、领奖和核销逻辑
│  │  └─ test/             # 冒烟、并发与限制测试
│  └─ docs/                # API 契约与后端设计文档
├─ deploy.md               # 生产部署、回滚和运维说明
└─ test.md                 # 上线前测试记录与已知限制
```

## 数据维护

- 最新摊位号、地图坐标和分类：`frontend/src/data/mock.js`
- 社团中英文简介、邮箱和活动玩法：`frontend/src/data/booth-info.js`
- 社团 Logo 匹配：`frontend/src/data/logo-map.js`
- 活动与公告模拟数据：`frontend/src/data/mock.js`
- 徽章阈值与活动状态：SQLite 的 `badges`、`events` 表

社团资料来源于 `摊位信息（中英文）.xlsx`，摊位坐标来源于 `摊位图.xlsx`。这两个源文件当前不在仓库中；更新静态数据时应保留源文件版本，并核对 88 个摊位是否全部匹配、分类是否重复或遗漏。

不要直接修改 `frontend/dist` 或构建后生成的带哈希资源；应修改 `frontend/src` 或素材目录后重新执行 `npm run build`。

## API 与部署

- 完整 API 契约见 [`backend/docs/api.md`](backend/docs/api.md)
- 后端设计说明见 [`backend/docs/backend_plan.md`](backend/docs/backend_plan.md)
- 生产部署、Nginx 反代、备份和回滚见 [`deploy.md`](deploy.md)
- 上线前测试与已知限制见 [`test.md`](test.md)

生产构建读取 `frontend/.env.production`，其中 `VITE_API_BASE` 为空，使请求走同源 `/api`。部署时需要让 Nginx 或其他 Web 服务器把 `/api` 反向代理到 Express 服务。

## 测试

前端至少应执行生产构建：

```bash
cd frontend
npm run build
```

后端启动并连接到本地或隔离测试数据库后，可运行：

```bash
cd backend
node --env-file=.env src/test/test-smoke.js
```

冒烟脚本会写入测试设备数据、添加测试工作人员，并短暂修改后恢复活动截止时间。不要直接对生产数据库运行。并发测试和完整上线核验步骤见 [`test.md`](test.md)。

## 安全注意事项

- `JWT_SECRET` 和 `STAFF_CODE` 只能保存在未提交的 `backend/.env` 或部署环境变量中。
- 生产环境应使用 HTTPS，避免 JWT、工作人员识别码和二维码在传输中泄露。
- 工作人员身份每次进入扫码页都会向后端重新校验；移出白名单后，旧身份会失效。
- SQLite 数据库包含浏览记录和核销记录，应定期备份并限制文件访问权限。
