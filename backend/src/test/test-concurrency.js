// test-concurrency.js
// ---------------------------------------------------------------------------
// 后端【真并发】测试：与非顺序重复不同，本脚本用 Promise.all **同时**发出请求，
// 验证幂等逻辑在压力下不产生重复数据，且高并发下不 500 / 不锁超时。
//
// 与 test-smoke.js 的分工：
//   test-smoke.js      —— 业务正确性 + 「顺序」重复（await 两次）
//   test-concurrency.js —— 「同时」并发（50 路非浏览 / 1000 路摊位浏览）
//
// 运行：
//   1) cp database.db database.test.db          # 用副本库，别污染开发库
//   2) DATABASE_PATH=database.test.db PORT=3001 node --env-file=.env src/server.js &
//   3) node test-concurrency.js                # 默认打 http://127.0.0.1:3001
//   4) kill 临时后端；rm database.test.db
//
// 环境变量：
//   BASE_URL        后端地址，默认 http://127.0.0.1:3001
//   DATABASE_PATH   副本库路径，默认 backend 根目录/database.test.db
//   STAFF_CODE      工作人员识别码，默认 staff2026
//   STAFF_NAME      白名单内的姓名，默认 王怡雪
//   CONC_NON_BROWSE 非浏览接口并发数，默认 50
//   CONC_BROWSE     摊位浏览并发总数，默认 1000
//   KEEPALIVE_SOCKETS 客户端 keep-alive 连接数，默认 50；设 0 改用 fetch（复现连接风暴用）
//   TIMEOUT_MS      单请求超时，默认 30000
//
// 说明：
//   - 全部测试设备用 dev_1770002xxx_ 前缀，与真实/冒烟数据隔离；跑完自动清理。
//   - 判定口径：① 接口返回码、② 直连查库行数（行数是幂等的铁证）。
//   - 耗时仅记录、不作为通过标准。
// ---------------------------------------------------------------------------
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(BACKEND_ROOT, process.env.DATABASE_PATH)
  : path.join(BACKEND_ROOT, 'database.test.db');
const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const STAFF_CODE = process.env.STAFF_CODE || 'staff2026';
const STAFF_NAME = process.env.STAFF_NAME || '王怡雪';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 30000;

const CONC_NON_BROWSE = Number(process.env.CONC_NON_BROWSE) || 50;
const CONC_BROWSE = Number(process.env.CONC_BROWSE) || 1000;
const BROWSE_DEVICES = 100;
const BOOTHS_PER_DEVICE = Math.floor(CONC_BROWSE / BROWSE_DEVICES);

// ---- 测试设备（格式必须匹配 /^dev_\d+_[A-Za-z0-9]{8}$/）---------------------
// 后缀固定 8 位：1 位标记 + 7 位序号
const devId = (tag, i) => `dev_1770002000_${tag}${String(i).padStart(7, '0')}`;

const LOGIN_IDS = Array.from({ length: CONC_NON_BROWSE }, (_, i) => devId('L', i));
const CLAIM_ID = devId('C', 0);        // 组 2：并发领码
const REDEEM_ID = devId('R', 0);       // 组 3：并发核销
const BROWSE_IDS = Array.from({ length: BROWSE_DEVICES }, (_, i) => devId('B', i));
const ALL_TEST_IDS = [...LOGIN_IDS, CLAIM_ID, REDEEM_ID, ...BROWSE_IDS];

const BOOTH_POOL = Array.from({ length: 20 }, (_, i) => `conc-booth-${String(i + 1).padStart(2, '0')}`);

// ---- 结果统计 ---------------------------------------------------------------
const results = [];
function record(title, pass, detail) {
  results.push({ title, pass, detail });
  const flag = pass ? '✅' : '❌';
  console.log(`${flag} ${title}${detail ? ' — ' + detail : ''}`);
}
async function step(title, run) {
  try {
    const r = await run();
    record(title, !(r && r.pass === false), r?.detail ?? '');
  } catch (e) {
    record(title, false, String((e && e.message) || e));
  }
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---- HTTP 助手 --------------------------------------------------------------
// 两种客户端，用 KEEPALIVE_SOCKETS 切换：
//   0        —— 内置 fetch（每请求一条新连接）。1000 并发时会打爆服务端
//               listen backlog（Node 默认 511），大量 ECONNREFUSED —— 属测试假象。
//   >0（默认 50）—— node:http + keep-alive 连接池，复用 N 条连接。这才是生产形态：
//               用户 → Cloudflare → nginx →（keep-alive 连接池）→ Node，
//               Node 只会看到少量复用连接，不会遭遇连接风暴。
//   0        —— 内置 fetch（每请求一条新连接）。**仅用于复现连接风暴**：
//               本机 Windows 单进程无法同时开上千条 TCP 连接，会大量 ECONNREFUSED。
//               注意这与后端无关 —— 连一个不含数据库的极简服务器也会同样被拒
//               （见 test-probe-limit.js）。
const KEEPALIVE_SOCKETS = process.env.KEEPALIVE_SOCKETS === undefined
  ? 50
  : Number(process.env.KEEPALIVE_SOCKETS);
const keepAliveAgent = KEEPALIVE_SOCKETS > 0
  ? new http.Agent({ keepAlive: true, maxSockets: KEEPALIVE_SOCKETS })
  : null;

async function apiViaFetch(pathname, { method = 'GET', token, body, timeout = TIMEOUT_MS } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  let res;
  try {
    res = await fetch(BASE_URL + pathname, {
      method, headers, body: payload, signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    const cause = e?.cause?.code || e?.cause?.message || e?.code || e?.name || 'unknown';
    return { status: 0, code: 'NETWORK_ERROR', data: null, raw: `${cause}: ${e.message}` };
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, code: data?.error?.code ?? null, data };
}

function apiViaHttp(pathname, { method = 'GET', token, body } = {}) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const u = new URL(BASE_URL + pathname);
    const req = http.request(
      {
        host: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method,
        headers,
        agent: keepAliveAgent,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let data = null;
          try { data = JSON.parse(raw); } catch { data = null; }
          resolve({ status: res.statusCode, code: data?.error?.code ?? null, data });
        });
      }
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('ETIMEDOUT')));
    req.on('error', (e) => {
      resolve({ status: 0, code: 'NETWORK_ERROR', data: null, raw: `${e.code || e.name}: ${e.message}` });
    });
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const api = KEEPALIVE_SOCKETS > 0 ? apiViaHttp : apiViaFetch;

// ---- DB 直连（查库判定 / 清理）---------------------------------------------
function withDb(fn) {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    return fn(db);
  } finally {
    db.close();
  }
}
const ph = (arr) => arr.map(() => '?').join(', ');

function countRows(table, where, params) {
  return withDb((db) => Number(db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${where}`).get(...params).c));
}

function cleanup() {
  withDb((db) => {
    const ids = ALL_TEST_IDS;
    db.prepare(`DELETE FROM redemptions WHERE student_device_id IN (${ph(ids)})`).run(...ids);
    db.prepare(`DELETE FROM claim_tokens WHERE device_id IN (${ph(ids)})`).run(...ids);
    db.prepare(`DELETE FROM user_badges WHERE device_id IN (${ph(ids)})`).run(...ids);
    db.prepare(`DELETE FROM booth_view_records WHERE device_id IN (${ph(ids)})`).run(...ids);
  });
}

// ---- 启动 ----------------------------------------------------------------
console.log('==============================');
console.log('后端并发测试启动');
console.log(`  BASE_URL:        ${BASE_URL}`);
console.log(`  DB:              ${DB_PATH}`);
console.log(`  非浏览并发:      ${CONC_NON_BROWSE}`);
console.log(`  摊位浏览并发:    ${CONC_BROWSE}（${BROWSE_DEVICES} 设备 × ${BOOTHS_PER_DEVICE} 摊位）`);
console.log(`  客户端连接:      ${KEEPALIVE_SOCKETS > 0 ? `keep-alive 连接池 ${KEEPALIVE_SOCKETS} 条（模拟 nginx→Node）` : 'fetch，每请求一条新连接'}`);
console.log('==============================');

// 连通性预检：连不上就直接报错退出，避免后面一堆 NETWORK_ERROR 看不出根因
{
  const ping = await api('/api/auth/me');
  if (ping.status === 0) {
    console.error(`\n❌ 无法连接后端 ${BASE_URL}：${ping.raw}`);
    console.error('   请先启动：DATABASE_PATH=database.test.db PORT=3001 node --env-file=.env src/server.js');
    process.exit(1);
  }
  console.log(`[预检] 后端可达（/api/auth/me → ${ping.status} ${ping.code ?? ''}）\n`);
}

let EVENT_ID;
try {
  withDb((db) => {
    const ev = db.prepare("SELECT id FROM events WHERE status='active' ORDER BY id DESC LIMIT 1").get();
    ok(ev, '数据库中不存在 active 活动');
    EVENT_ID = ev.id;
  });
} catch (e) {
  console.error(`❌ 读取活动失败：${e.message}`);
  process.exit(1);
}

cleanup();
console.log(`[准备] 已清理 ${ALL_TEST_IDS.length} 个测试设备的历史数据。\n`);

// ============================ 组 1：登录 50 并发 ============================
await step(`组1 学生登录 ${CONC_NON_BROWSE} 并发`, async () => {
  const t0 = Date.now();
  const out = await Promise.all(
    LOGIN_IDS.map((id) => api('/api/auth/student', { method: 'POST', body: { deviceId: id } }))
  );
  const ms = Date.now() - t0;

  const okCount = out.filter((r) => r.status === 200).length;
  const errCount = out.filter((r) => r.status >= 500).length;
  const netCount = out.filter((r) => r.status === 0).length;
  const tokenCount = out.filter((r) => typeof r.data?.token === 'string' && r.data.token.length > 0).length;

  ok(okCount === CONC_NON_BROWSE, `200 数=${okCount}（应 ${CONC_NON_BROWSE}）`);
  ok(errCount === 0, `出现 ${errCount} 个 5xx`);
  ok(netCount === 0, `出现 ${netCount} 个网络错误`);
  ok(tokenCount === CONC_NON_BROWSE, `拿到 token 数=${tokenCount}`);
  return { detail: `全部 200 且各带 token，耗时 ${ms}ms` };
});

// ============================ 组 2：领码 50 并发 ============================
let claimTokenOfConc = null;
await step(`组2 同一设备领码 ${CONC_NON_BROWSE} 并发（幂等）`, async () => {
  // 前置：登录 + 浏览 20 摊解锁 knowitall
  const login = await api('/api/auth/student', { method: 'POST', body: { deviceId: CLAIM_ID } });
  ok(login.status === 200, `前置登录失败 status=${login.status}`);
  const token = login.data.token;
  for (const b of BOOTH_POOL) {
    const v = await api(`/api/events/${EVENT_ID}/booths/${b}/view`, { method: 'POST', token });
    ok(v.status === 200, `前置浏览 ${b} 失败 status=${v.status}`);
  }

  // 并发领码
  const t0 = Date.now();
  const out = await Promise.all(
    Array.from({ length: CONC_NON_BROWSE }, () => api('/api/me/claim-token', { method: 'POST', token }))
  );
  const ms = Date.now() - t0;

  const okCount = out.filter((r) => r.status === 200).length;
  const codes = new Set(out.map((r) => r.data?.claimToken).filter(Boolean));
  const rows = countRows('claim_tokens', 'device_id = ?', [CLAIM_ID]);
  claimTokenOfConc = [...codes][0] ?? null;

  ok(okCount === CONC_NON_BROWSE, `200 数=${okCount}（应 ${CONC_NON_BROWSE}）`);
  ok(codes.size === 1, `返回了 ${codes.size} 个不同的码（应恰为 1）`);
  ok(rows === 1, `claim_tokens 行数=${rows}（应恰为 1）`);
  return { detail: `全部 200、码唯一=${claimTokenOfConc}、查库 ${rows} 行，耗时 ${ms}ms` };
});

// ============================ 组 3：核销 50 并发 ============================
await step(`组3 同一码核销 ${CONC_NON_BROWSE} 并发（幂等）`, async () => {
  // 前置：另一设备领码
  const login = await api('/api/auth/student', { method: 'POST', body: { deviceId: REDEEM_ID } });
  ok(login.status === 200, `前置登录失败 status=${login.status}`);
  const stuToken = login.data.token;
  for (const b of BOOTH_POOL) {
    const v = await api(`/api/events/${EVENT_ID}/booths/${b}/view`, { method: 'POST', token: stuToken });
    ok(v.status === 200, `前置浏览 ${b} 失败 status=${v.status}`);
  }
  const claim = await api('/api/me/claim-token', { method: 'POST', token: stuToken });
  ok(claim.status === 200, `前置领码失败 status=${claim.status}`);
  const code = claim.data.claimToken;

  // 前置：staff 登录
  const staff = await api('/api/auth/staff', { method: 'POST', body: { code: STAFF_CODE, name: STAFF_NAME } });
  ok(staff.status === 200, `staff 登录失败 status=${staff.status} code=${staff.code}（姓名需在白名单）`);
  const staffToken = staff.data.token;

  const tokenRow = withDb((db) => db.prepare('SELECT id FROM claim_tokens WHERE device_id = ?').get(REDEEM_ID));

  // 并发核销
  const t0 = Date.now();
  const out = await Promise.all(
    Array.from({ length: CONC_NON_BROWSE }, () =>
      api('/api/staff/claim-tokens/redeem', { method: 'POST', token: staffToken, body: { claimToken: code } })
    )
  );
  const ms = Date.now() - t0;

  const successCount = out.filter((r) => r.status === 200 && r.data?.success === true).length;
  const deniedCount = out.filter((r) => r.status === 409 && r.code === 'CLAIM_TOKEN_REDEEMED').length;
  const otherCount = out.length - successCount - deniedCount;
  const redemptions = countRows('redemptions', 'claim_token_id = ?', [tokenRow.id]);

  ok(successCount === 1, `成功数=${successCount}（应恰为 1）`);
  ok(deniedCount === CONC_NON_BROWSE - 1, `被拒数=${deniedCount}（应 ${CONC_NON_BROWSE - 1}）`);
  ok(otherCount === 0, `出现 ${otherCount} 个预期外结果`);
  ok(redemptions === 1, `redemptions 行数=${redemptions}（应恰为 1）`);
  return { detail: `1 成功 / ${deniedCount} 已核销、redemptions ${redemptions} 行，耗时 ${ms}ms` };
});

// ========================= 组 4：摊位浏览 1000 并发 =========================
await step(`组4 摊位浏览 ${CONC_BROWSE} 并发（压力 + 去重）`, async () => {
  // 前置：100 设备并发登录
  const logins = await Promise.all(
    BROWSE_IDS.map((id) => api('/api/auth/student', { method: 'POST', body: { deviceId: id } }))
  );
  const tokens = logins.map((r) => r.data?.token);
  const loginOk = logins.filter((r) => r.status === 200).length;
  ok(loginOk === BROWSE_DEVICES, `前置登录成功数=${loginOk}（应 ${BROWSE_DEVICES}）`);

  // 组装 1000 个请求：每设备 10 个不同摊位
  const reqs = [];
  for (let d = 0; d < BROWSE_DEVICES; d++) {
    for (let b = 0; b < BOOTHS_PER_DEVICE; b++) {
      reqs.push(api(`/api/events/${EVENT_ID}/booths/${BOOTH_POOL[b]}/view`, { method: 'POST', token: tokens[d] }));
    }
  }

  const t0 = Date.now();
  const out = await Promise.all(reqs);
  const ms = Date.now() - t0;

  const okCount = out.filter((r) => r.status === 200).length;
  const err5xx = out.filter((r) => r.status >= 500).length;
  const netCount = out.filter((r) => r.status === 0).length;
  const lockedCount = out.filter((r) => (r.raw || '').includes('locked') || r.code === 'DATABASE_LOCKED').length;

  // 客户端侧失败分类：只统计数量不够，要看清「请求有没有真的发出去」
  const otherStatus = out.filter((r) => r.status !== 200 && r.status > 0 && r.status < 500)
    .reduce((m, r) => { const k = `${r.status}/${r.code ?? '-'}`; m[k] = (m[k] || 0) + 1; return m; }, {});
  const netByReason = out.filter((r) => r.status === 0)
    .reduce((m, r) => {
      const msg = String(r.raw || 'unknown').split(':')[0].slice(0, 40);
      m[msg] = (m[msg] || 0) + 1; return m;
    }, {});

  const rows = countRows('booth_view_records',
    `device_id IN (${ph(BROWSE_IDS)})`, BROWSE_IDS);
  const expectedRows = BROWSE_DEVICES * BOOTHS_PER_DEVICE;

  // 抽查前 3 个设备的去重计数
  const sample = [];
  for (let d = 0; d < Math.min(3, BROWSE_DEVICES); d++) {
    const c = withDb((db) => Number(db.prepare(
      'SELECT COUNT(DISTINCT booth_id) c FROM booth_view_records WHERE event_id = ? AND device_id = ?'
    ).get(EVENT_ID, BROWSE_IDS[d]).c));
    sample.push(`${BROWSE_IDS[d].slice(-8)}=${c}`);
  }
  const sampleOk = sample.every((s) => s.endsWith(`=${BOOTHS_PER_DEVICE}`));

  const breakdown = [
    `200=${okCount}`,
    `5xx=${err5xx}`,
    `网络失败=${netCount}`,
    `锁=${lockedCount}`,
    Object.keys(otherStatus).length ? `其它=${JSON.stringify(otherStatus)}` : null,
    Object.keys(netByReason).length ? `网络原因=${JSON.stringify(netByReason)}` : null,
  ].filter(Boolean).join(' ');

  ok(okCount === CONC_BROWSE, `200 数=${okCount}（应 ${CONC_BROWSE}）｜${breakdown}`);
  ok(err5xx === 0, `出现 ${err5xx} 个 5xx｜${breakdown}`);
  ok(netCount === 0, `出现 ${netCount} 个网络错误/超时｜${breakdown}`);
  ok(lockedCount === 0, `出现 ${lockedCount} 个 database is locked｜${breakdown}`);
  ok(rows === expectedRows, `booth_view_records 行数=${rows}（应 ${expectedRows}）｜${breakdown}`);
  ok(sampleOk, `抽查去重计数不符：${sample.join(' ')}｜${breakdown}`);
  return {
    detail: `${breakdown}；查库 ${rows} 行、抽查去重 ${sample.join(' ')}，耗时 ${ms}ms`,
  };
});

// ============================ 清理与总结 ====================================
cleanup();
console.log(`\n[清理] 已删除测试设备的全部数据。`);

const passCount = results.filter((r) => r.pass).length;
const total = results.length;
console.log('==============================');
console.log(`总结：通过 ${passCount}/${total} 组`);
const failed = results.filter((r) => !r.pass);
if (failed.length) {
  console.log('\n未通过的组：');
  for (const f of failed) console.log(`  ❌ ${f.title} — ${f.detail}`);
}
console.log('==============================');
process.exit(passCount === total ? 0 : 1);
