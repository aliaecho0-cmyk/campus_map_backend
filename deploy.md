# DEPLOY.md（补全版）

> 百团大战活动系统 · 部署与运维记录
> 最后更新：2026-09-12
> 维护者：yixuewang

---

## 0. 当前真实状态（2026-09-12 核对）

| 项 | 现状 | 目标 |
|---|---|---|
| 服务器 `server.js` 绑定 | 硬编码 `'127.0.0.1'` | 环境变量 `HOST` |
| 服务器 `.env` | 无 `HOST` 变量 | 加 `HOST=127.0.0.1` |
| 本地 `server.js` | ✅ 环境变量版，本地启动正常（`0.0.0.0:3000`），已提交 `30a6a27` | ✅ |
| 本地 `.env` | 无 `HOST`（走兜底 `0.0.0.0`） | ✅ |
| 服务器 git 仓库 | 无 | 无（用文件上传部署） |

⚠️ **本地与服务器 `server.js` 不一致**：
- 本地：环境变量版（已提交）
- 服务器：硬编码版

**下次部署时统一**：把本地版本传上去 + 服务器 `.env` 加 `HOST=127.0.0.1`。

---

## 1. 架构总览

```
用户浏览器
    ↓ https://<tunnel-域名>.trycloudflare.com
Cloudflare（Quick Tunnel）
    ↓
cloudflared --url http://localhost:8080 --no-autoupdate
    ↓
Nginx (127.0.0.1:8080)          ← club-map 站点入口
    ├─ /          → /var/www/club-map（前端静态文件）
    └─ /api/      → 127.0.0.1:3001（Node 后端）
    ↓
Node (127.0.0.1:3001)           ← 后端 API

另外：Nginx 还监听 0.0.0.0:80 → 301 跳 https://app.divgate.com/
     （divgate.com 站点，与本服务无关）
```

**端口对照表**

| 端口 | 进程 | 绑定 | 用途 |
|---|---|---|---|
| 80 | nginx | 0.0.0.0 | divgate.com（301 跳转） |
| 8080 | nginx | 127.0.0.1 | club-map 前端入口（tunnel 指向这） |
| 3001 | node | 127.0.0.1 | club-map 后端 API（只给本机） |
| 22 | sshd | 0.0.0.0 | SSH（限定来源 IP） |

---

## 2. 服务器信息

| 项 | 值 |
|---|---|
| 云厂商 | 阿里云 ECS |
| 规格 | 2核4G |
| 公网 IP | 47.76.221.148 |
| 主机名 | iZj6cdnd8frh7l2k0itt59Z |
| 后端路径 | /root/backend |
| 前端路径 | /var/www/club-map |
| Nginx 配置 | /etc/nginx/conf.d/club-map.conf（830 字节） |
| 数据库 | /root/backend/database.db（98304 字节，2026-09-12 10:07） |

**pm2 进程**

| 名称 | 状态 | 说明 |
|---|---|---|
| club-backend | online | 后端 API |
| club-frontend | stopped | 前端（由 Nginx 托管静态文件，无需跑） |
| tunnel | online | cloudflared 隧道 |
| pm2-logrotate | online | 日志轮转 |

---

## 3. 部署方式

**服务器上没有 git 仓库。部署采用「文件上传」方式。**

- 本地用 git 管理代码
- 部署时：本地 build（前端）+ 上传文件（后端）到服务器
- 回滚靠文件备份（不是 git tag）

### 3.1 后端部署流程

```bash
# 本地：确认改动的文件
git status
git diff --name-only HEAD~1

# 服务器：备份要覆盖的文件（保留目录层级）
cd /root/backend
BK=.deploy-backup-$(date +%Y%m%d_%H%M%S)
mkdir -p $BK/middleware $BK/services
cp -p src/server.js $BK/
cp -p src/middleware/errorHandler.js $BK/middleware/
cp -p src/services/authService.js $BK/services/
md5sum src/server.js src/middleware/errorHandler.js src/services/authService.js > $BK/MANIFEST.md5

# 服务器：备份数据库
cp -p database.db database.db.bak-$(date +%Y%m%d_%H%M%S)

# 本地：上传改动的文件（scp）
scp backend/src/server.js root@47.76.221.148:/root/backend/src/
scp backend/src/middleware/errorHandler.js root@47.76.221.148:/root/backend/src/middleware/
scp backend/src/services/authService.js root@47.76.221.148:/root/backend/src/services/

# 服务器：核对 MD5（与本地哈希一致才继续）
md5sum src/server.js src/middleware/errorHandler.js src/services/authService.js

# 服务器：重启 + 验证
pm2 restart club-backend --update-env
pm2 logs club-backend --lines 50
curl -i localhost:3001
```

⚠️ **`--update-env` 必须加**：pm2 默认不重读 `.env`，不加则新环境变量不生效。

### 3.2 前端部署流程

```bash
# 本地：build
cd frontend
npm run build
# 自动读 .env.production（VITE_API_BASE= 空串）

# 本地：上传到服务器临时目录
scp -r dist root@47.76.221.148:/tmp/club-map-new

# 服务器：确认 Nginx 指向的目录
nginx -T 2>/dev/null | grep -E 'root|alias' | grep -i club
# 期望：root /var/www/club-map;

# 服务器：整目录替换（原子切换，避免旧 assets 残留）
mv /var/www/club-map /var/www/club-map_backup_$(date +%Y%m%d_%H%M%S)
mv /tmp/club-map-new /var/www/club-map

# 确认
ls -la /var/www/club-map
```

**为什么 `.env.production` 里 `VITE_API_BASE=` 是空串**：
见 `frontend/src/services/api.js`——请求路径本身已带 `/api` 前缀，需让 `BASE_URL` 为空、走同源 `/api`，避免 `/api` 前缀重复。

**为什么整目录替换**：
前端 build 是全量快照，增量覆盖会残留旧 assets，导致「新 HTML 引用已删的旧 JS」或「旧 JS 残留但不被引用」。

**前端环境变量文件**：
- `.env.development`：`VITE_API_BASE=http://localhost:3000`（开发时直连本地后端）
- `.env.production`：`VITE_API_BASE=`（构建时置空，走同源相对路径）
- Vite 按 `mode` 自动读取（`npm run dev` 读 development，`npm run build` 读 production）

**前端 API 层（frontend/src/services/api.js）**：
- 开发：`BASE_URL = 'http://localhost:3000'`，直连本地后端（靠后端 CORS 允许跨域）
- 生产：`BASE_URL = ''`，请求走 `/api/...` 相对路径，由 Nginx 反代
- 未使用 Vite 代理（`server.proxy` 未配置）

**前端构建配置（vite.config.js）**：
- `base: './'`：资源用相对路径，不写死域名
- `build.outDir: 'dist'`：输出到 dist/
- `build.assetsDir: 'assets'`：资源在 dist/assets/
- 无 `server.proxy`：开发时走 CORS 直连后端

**前端 package.json scripts**：
- `dev`: `vite`
- `build`: `vite build`
- `preview`: `vite preview`

---

## 4. 回滚流程

### 4.1 后端回滚

```bash
cd /root/backend
BK=.deploy-backup-<TS>

cp -p $BK/server.js src/server.js
cp -p $BK/middleware/errorHandler.js src/middleware/errorHandler.js
cp -p $BK/services/authService.js src/services/authService.js

pm2 restart club-backend --update-env
```

### 4.2 数据库回滚

```bash
cd /root/backend
cp -p database.db.bak-<TS> database.db
pm2 restart club-backend
```

⚠️ **注意**：DB 回滚会丢失备份之后的所有写入。只在确认必要时做。

### 4.3 前端回滚

```bash
mv /var/www/club-map /var/www/club-map_broken_<TS>
mv /var/www/club-map_backup_<TS> /var/www/club-map
```

### 4.4 Nginx 配置回滚

```bash
cp -p /etc/nginx/conf.d/club-map.conf.bak-<TS> /etc/nginx/conf.d/club-map.conf
nginx -t && systemctl reload nginx
```

---

## 5. 关键配置

### 5.1 Nginx 配置（club-map.conf）

**完整配置**：

```nginx
# club-map 项目：由 cloudflared Quick Tunnel 从公网 HTTPS 进来，本端口仅本机监听
server {
    listen 127.0.0.1:8080;
    server_name localhost;

    root /var/www/club-map;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # index.html 不缓存
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # 带 hash 的 assets 长缓存
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**关键点**：
- `listen 127.0.0.1:8080`：只绑本机，外部访问不到（cloudflared 走 localhost:8080）
- `location /api/` → 反代到 `127.0.0.1:3001`，并传 `X-Forwarded-*` 头
- `location = /index.html`：精确匹配，HTML 不缓存
- `location /assets/`：带 hash 资源长缓存；**此 location 无 try_files，缺失 asset 天然返回 404，不会伪装成 HTML**
- `location /`：SPA 回退（`try_files ... /index.html`），仅对非 assets、非 api 路径生效

**已实测生效**：
- `GET /` → `cache-control: no-cache, no-store, must-revalidate`
- `GET /assets/*.js` → `cache-control: public, max-age=31536000, immutable`
- `CF-Cache-Status: DYNAMIC`（Cloudflare 不缓存，直接回源）
- 缺失 asset 返回 404

### 5.2 后端绑定地址（server.js）

**当前服务器状态（硬编码，2026-09-12）**：
```js
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

**目标状态（环境变量版，本地已改）**：
```js
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
```

**统一步骤（下次部署时执行）**：
1. 服务器 `.env` 加 `HOST=127.0.0.1`
2. 服务器 `server.js` 改为环境变量版（或把本地版本传上去）
3. `pm2 restart club-backend --update-env`

**验证**：
- 服务器 `curl localhost:3001` → 通
- 外部 `curl 47.76.221.148:3001` → Connection refused

#### HOST 值的选择

| 架构 | HOST 值 |
|---|---|
| Nginx 与 Node 同机（当前架构） | `127.0.0.1` |
| Node 直接对外（无 Nginx，不推荐） | `0.0.0.0` |
| Docker 容器内 | `0.0.0.0`（靠 Docker 网络隔离） |
| Nginx 在另一台机器（同 VPC 内网） | Node 的内网 IP（如 `172.16.x.x`） |
| Serverless / PaaS | 平台决定，通常不用管 |

**判断标准**：Node 是否只给本机 Nginx 用？
- **是** → `127.0.0.1`
- **否** → `0.0.0.0`（或按上表选）

⚠️ **换服务器时不一定要改**：只要新服务器架构是「Nginx + Node 同机」，还是 `127.0.0.1`。

### 5.3 环境变量（.env）

**当前服务器 `.env` 变量**（2026-09-12 核实）：
| 变量 | 值 |
|---|---|
| JWT_SECRET | `<redacted>` |
| STAFF_CODE | `<redacted>` |
| PORT | 3001 |
| NODE_ENV | production |

**目标（环境变量版部署时增加）**：
| 变量 | 值 | 说明 |
|---|---|---|
| HOST | 127.0.0.1 | 只绑本机 |

**本地 `.env`**：
| 变量 | 值 |
|---|---|
| JWT_SECRET | `<redacted>` |
| STAFF_CODE | `<redacted>` |
| PORT | 3000 |
| NODE_ENV | development |

本地无 `HOST`，`server.js` 兜底 `0.0.0.0`。

⚠️ **敏感值（`JWT_SECRET`、`STAFF_CODE`）不在此文档记录，见各环境 `.env`。**
注：`STAFF_CODE` 当前为默认值 `staff2026`，风险已接受（一日活动，不更换）。

### 5.4 CORS 配置

**当前状态**：`Access-Control-Allow-Origin: *`（允许所有来源）。

**正式上线时建议收紧**：
```js
app.use(cors({
  origin: 'https://你的正式域名',
}));
```

**说明**：
- 生产环境前端与后端同源（都走 Nginx），严格说 CORS 可以完全关掉
- 但当前用 `*` 是为了兼容开发和 trycloudflare 临时域名
- 换成正式域名后，应收紧到具体域名

**当前决策**：保持 `*`（临时活动、简化配置）。活动结束后无需处理。

### 5.5 数据库

**文件**：`/root/backend/database.db`（SQLite）

**备份**：
- 部署前手动备份（见第 3.1 节）
- 当前无自动定期备份（已知限制，见第 8 节）

**初始化 / 迁移**：
- ⚠️ 待确认：是否有迁移脚本（如 `run-migration.js`）？
- ⚠️ 待确认：schema 如何初始化？是否有 `initial_schema.sql`？

**员工白名单**：
- ⚠️ 待确认：白名单表名、如何导入

**建议**（如将来需要自动备份）：
```bash
# 每天凌晨 3 点备份
0 3 * * * cp /root/backend/database.db /root/backend/backups/database-$(date +\%Y\%m\%d).db
```

---

## 6. 开机自启

已配置：

```bash
pm2 startup          # 生成 systemd 服务 /etc/systemd/system/pm2-root.service
pm2 save             # 保存当前进程列表到 /root/.pm2/dump.pm2
```

**验证**：
```bash
systemctl status pm2-root   # 应为 enabled
ls -la /root/.pm2/dump.pm2  # 应有文件
```

**效果**：服务器重启后，pm2 自动恢复 club-backend / tunnel / pm2-logrotate。

⚠️ **注意**：tunnel 是 Quick Tunnel，重启后域名会变（见第 8 节）。

---

## 7. 部署后验证清单

```bash
# 7.1 服务健康
pm2 list                                    # club-backend / tunnel online
curl -i localhost:3001                      # Express 404（后端活着）
curl -i localhost:8080                      # 200 HTML（前端正常）

# 7.2 完整链路（走域名）
curl -I https://<tunnel-域名>/              # no-cache, no-store, must-revalidate
curl -I https://<tunnel-域名>/assets/*.js   # public, max-age=31536000, immutable
curl -i https://<tunnel-域名>/api/auth/me   # 401 JSON

# 7.3 缺失 asset
curl -I https://<tunnel-域名>/assets/不存在的文件.js   # 404

# 7.4 进程常驻
pm2 describe tunnel | grep -E "restarts|uptime"        # restarts=0
cat /root/backend/.env | grep NODE_ENV                 # production

# 7.5 安全验证（外部访问 3001 应被拒）
# ⚠️ 在本地电脑跑，不是服务器上：
curl -m 5 http://47.76.221.148:3001                    # Connection refused
```

---

## 8. 已知限制与风险

| 项 | 说明 | 影响 |
|---|---|---|
| **Quick Tunnel 域名随机** | `cloudflared --url` 每次重启分配新域名 | 服务器重启/进程崩溃 → 二维码失效 |
| **无正式域名 + HTTPS** | 依赖 trycloudflare 临时域名 | 不稳定，不适合长期 |
| **无 readiness / schema 校验** | 服务仅校验 DB 连接，不校验表结构 | 空库/缺表时首请求才 500 |
| **未知路由返回 HTML 404** | 未注册 JSON 兜底中间件 | 前端 `res.json()` 解析失败 |
| **无监控** | 服务挂了没有主动告警 | 需人工定期检查 |
| **无自动备份** | 数据库备份靠手动 | 数据丢失风险 |
| **本地/服务器 server.js 不一致** | 服务器硬编码，本地环境变量版 | 下次部署需统一 |
| **CORS 仍为 `*`** | 未收紧到具体域名 | 当前可接受；正式域名后应改 |
| **前端 eventId 写死** | 后端无接口返回 eventId，前端只能写死 1 | 多届时需改（详见 test.md） |

---

## 9. 待办（未来改进）

- [ ] **统一 server.js**：本地与服务器都改为环境变量版
- [ ] 改成 **Named Tunnel**（固定域名），根治二维码失效问题
- [ ] 配 **正式域名 + HTTPS**（Let's Encrypt 或 Cloudflare 证书）
- [ ] **CORS 收紧**到正式域名
- [ ] 加 **`/ready` 探针 + 启动时 schema 校验**
- [ ] 加 **JSON 兜底 404 中间件**
- [ ] 加 **监控告警**（如 UptimeRobot 免费方案）
- [ ] 加 **数据库定期自动备份**
- [ ] 把服务器代码**纳入 git 管理**，实现真正的 `git pull` 部署
- [ ] 评估**最终服务器规格**（当前 2核4G 是否够，取决于活动规模）
- [ ] 确认 **DB 迁移 / schema 初始化 / 白名单导入** 流程（见第 5.5 节）

---

## 10. 部署历史

| 日期 | 内容 | 备注 |
|---|---|---|
| 2026-09-12 | 后端 errorHandler 修复 + 前端重新 build + Nginx 缓存头 | 首次正式部署 |
| 2026-09-12 | 安全修复：Node 绑定改为 `127.0.0.1` | 消除 3001 暴露 |
| 2026-09-12 | 本地 server.js 改为环境变量版（commit 30a6a27） | 待下次部署统一到服务器 |

### 备份文件清单（2026-09-12 核实）

| 文件 | 大小 | 存在 |
|---|---|---|
| /root/backend/.deploy-backup-20260912_004132/ | - | ✅ |
| └ MANIFEST.md5 | 175B | ✅ |
| /root/backend/database.db.bak-20260912_004132 | 90112B | ✅ |
| /etc/nginx/conf.d/club-map.conf.bak-20260912_005158 | 556B | ✅ |
| /root/backend/src/server.js.bak-20260912 | - | ❌ 未生成 |

**建议**：活动结束后、确认稳定再删这些备份。

---

## 11. 常用命令速查

```bash
# 服务状态
pm2 list
pm2 describe club-backend
pm2 logs club-backend --lines 50

# 重启
pm2 restart club-backend --update-env
pm2 restart tunnel

# Nginx
nginx -t                          # 测语法
systemctl reload nginx            # 平滑重载
nginx -T | grep -E 'root|proxy'   # 看配置

# 当前 tunnel 域名
ps aux | grep cloudflared

# 数据库
sqlite3 /root/backend/database.db
.tables
.schema <表名>
SELECT * FROM <表名> LIMIT 10;
```

---

## 12. 相关文件位置

| 文件 | 路径 |
|---|---|
| 后端入口 | /root/backend/src/server.js |
| 错误处理 | /root/backend/src/middleware/errorHandler.js |
| 认证中间件 | /root/backend/src/middleware/requireAuth.js |
| 核销服务 | /root/backend/src/services/staffRedemptionService.js |
| 前端 API 层 | frontend/src/services/api.js |
| Nginx 配置 | /etc/nginx/conf.d/club-map.conf |
| 前端构建配置 | frontend/vite.config.js |
| 前端 package.json | frontend/package.json |
| 前端环境变量 | frontend/.env.development、frontend/.env.production |

---

## 13. 待确认项（补全文档用）

以下内容需要你核实后补充：

1. **数据库迁移 / schema 初始化**：有没有 `run-migration.js`、`initial_schema.sql`？怎么跑？
2. **员工白名单**：表名是什么？怎么导入？（SQL 还是脚本？）
3. **正式 HTTPS 方案**：下次上线用 Let's Encrypt 还是 Cloudflare 证书？
4. **日志轮转配置**：pm2-logrotate 的具体配置（保留多久、多大）？

---

*本文档由部署过程整理，如有变更请同步更新。*