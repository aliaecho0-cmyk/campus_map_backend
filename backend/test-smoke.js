// test-smoke.js
// ---------------------------------------------------------------------------
// 后端冒烟测试：聚焦【业务逻辑正确性】与【幂等性 / 权限 / 并发 / 过期】。
// 安全性要求不高（内网活动、无密码登录），故不覆盖暴力破解、速率限制、
// XSS/CSRF 等安全项。
//
// 运行：node test-smoke.js
// 环境变量：
//   BASE_URL    后端地址，默认 http://localhost:3000
//   STAFF_CODE  工作人员识别码，默认 staff2026
//   DATABASE_PATH  数据库文件路径，默认 <脚本目录>/database.db
//
// 说明：
//   - 每一步打印 ✅/❌ 并显示关键数据；某步失败不会中断后续步骤。
//   - 结束打印总结：通过 X/19 步。
//   - 启动时自动清理本脚本用到的 4 个测试设备的历史数据，保证可重复运行；
//     若 staff_whitelist 中没有「张三」，自动插入一条。
//   - 需临时把 events.end_at 改成过去时间以验证活动过期，测完立即恢复。
// ---------------------------------------------------------------------------
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(__dirname, process.env.DATABASE_PATH)
  : path.join(__dirname, 'database.db');
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const STAFF_CODE = process.env.STAFF_CODE || 'staff2026';
const STAFF_NAME = '张三';
const REDEEM_PATH = '/api/staff/claim-tokens/redeem';

// ---- 测试设备标识（满足 dev_<秒级时间戳>_<8位字母数字> 格式）---------------
const MAIN = 'dev_1726735999_a8f3k2XY'; // 需求指定
const AUX1 = 'dev_1770000001_smokeTSA'; // 并发核销中的学生 A
const AUX2 = 'dev_1770000002_smokeTSB'; // 并发核销中的学生 B（其码留着测过期）
const EXPP = 'dev_1770000003_smokeTSC'; // 活动过期时用于尝试取码的学生
const ALL_IDS = [MAIN, AUX1, AUX2, EXPP];

const BOOTHS = ['booth-001', 'booth-002', 'booth-003', 'booth-004', 'booth-005'];

// ---- 结果统计 ---------------------------------------------------------------
const results = []; // { num, title, pass, detail }

function record(num, title, pass, detail) {
  results.push({ num, title, pass, detail });
  const flag = pass ? '✅' : '❌';
  console.log(`${flag} [${String(num).padStart(2)}] ${title}${detail ? ' — ' + detail : ''}`);
  if (!pass) console.log(`      ↳ 失败详情：${detail}`);
}

async function step(num, title, run) {
  try {
    const r = await run(); // 断言失败直接 throw；返回 { detail? }，默认视为通过
    const pass = !(r && r.pass === false);
    record(num, title, pass, r?.detail ?? '');
  } catch (e) {
    record(num, title, false, String((e && e.message) || e));
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---- HTTP 助手（Node 内置 fetch）--------------------------------------------
async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  let res;
  try {
    res = await fetch(BASE_URL + pathname, { method, headers, body: payload });
  } catch (e) {
    throw new Error(`网络请求失败 (${BASE_URL + pathname}): ${e.message}`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, code: data?.error?.code ?? null, data };
}

// ---- DB 直连（仅用于：清理测试数据 / 确保张三存在 / 临时改 end_at）---------
function withDb(fn) {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    return fn(db);
  } finally {
    db.close();
  }
}

function placeholders(arr) {
  return arr.map(() => '?').join(', ');
}

// 学生登录并浏览 5 个不同摊位（返回 token），用于为辅账/过期测试准备已达解锁状态的学生。
async function loginAndBrowse(deviceId) {
  const login = await api('/api/auth/student', { method: 'POST', body: { deviceId } });
  ok(login.status === 200, `登录失败 ${deviceId} status=${login.status}`);
  const token = login.data.token;
  let last = 0;
  for (let i = 0; i < BOOTHS.length; i++) {
    const v = await api(`/api/events/${EVENT_ID}/booths/${BOOTHS[i]}/view`, {
      method: 'POST',
      token,
    });
    ok(v.status === 200, `浏览 ${BOOTHS[i]} 失败 status=${v.status} code=${v.code}`);
    last = v.data.uniqueBoothCount;
  }
  ok(last === BOOTHS.length, `浏览后达到摊位数不对：${last} vs ${BOOTHS.length}`);
  return token;
}

// ---- 启动准备（不算入 19 步，失败则整体终止）--------------------------------
console.log(`==============================`);
console.log(`后端冒烟测试启动`);
console.log(`  BASE_URL: ${BASE_URL}`);
console.log(`  DB:       ${DB_PATH}`);
console.log(`==============================`);

let EVENT_ID;
let ORIGINAL_END_AT;

try {
  withDb((db) => {
    // 1) 确保「张三」在白名单
    const member = db.prepare('SELECT id FROM staff_whitelist WHERE name = ?').get(STAFF_NAME);
    if (!member) {
      db.prepare('INSERT INTO staff_whitelist (name) VALUES (?)').run(STAFF_NAME);
      console.log(`[准备] 已自动插入工作人员「${STAFF_NAME}」到白名单。`);
    } else {
      console.log(`[准备] 白名单已存在「${STAFF_NAME}」。`);
    }

    // 2) 清理本脚本用到的测试设备历史数据（保证可重复运行）
    const ids = ALL_IDS;
    db.prepare(
      `DELETE FROM redemptions WHERE student_device_id IN (${placeholders(ids)})`
    ).run(...ids);
    db.prepare(
      `DELETE FROM claim_tokens WHERE device_id IN (${placeholders(ids)})`
    ).run(...ids);
    db.prepare(
      `DELETE FROM user_badges WHERE device_id IN (${placeholders(ids)})`
    ).run(...ids);
    db.prepare(
      `DELETE FROM booth_view_records WHERE device_id IN (${placeholders(ids)})`
    ).run(...ids);
    console.log(`[准备] 已清理测试设备历史数据（${ids.length} 个设备）。`);

    // 3) 读取当前活动（id 与 end_at）
    const ev = db
      .prepare("SELECT id, end_at FROM events WHERE status = 'active' ORDER BY id DESC LIMIT 1")
      .get();
    ok(ev, '数据库中不存在 active 的活动');
    EVENT_ID = ev.id;
    ORIGINAL_END_AT = ev.end_at;
  });
} catch (e) {
  console.error(`❌ 启动准备失败：${e.message}`);
  process.exit(1);
}

// 其余活动而过期前需达解锁状态的测试学生：提前登录 + 浏览 5 摊
const setupTokens = {};
for (const id of [AUX1, AUX2, EXPP]) {
  setupTokens[id] = await loginAndBrowse(id);
}
console.log(`[准备] 已为 AUX1/AUX2/EXPP 登录并浏览 ${BOOTHS.length} 个摊位（解锁 knowitall）。\n`);

// ============================ 可执行步骤 =====================================
// 执行顺序按逻辑依赖调整：第 9 步（重复取码）必须发生在第 6 步（核销）之前，
// 报告仍按 1..19 编号输出。

let mainToken, staffToken, mainClaimCode;
const auxCodes = {};
const boothCountAfterBrowse = BOOTHS.length;

// —— 第 1 步：学生登录 ——
await step(1, '学生登录 main', async () => {
  const r = await api('/api/auth/student', { method: 'POST', body: { deviceId: MAIN } });
  ok(r.status === 200, `status=${r.status} code=${r.code}`);
  ok(r.data.user?.role === 'student', 'role 应为 student');
  mainToken = r.data.token;
  return { detail: `deviceId=${MAIN} role=${r.data.user?.role} eventEndAt=${r.data.eventEndAt ?? ''}` };
});

// —— 第 2 步：依次浏览 5 个不同摊位 ——
await step(2, '依次浏览 5 个摊位并解锁', async () => {
  const seen = [];
  for (let i = 0; i < BOOTHS.length; i++) {
    const v = await api(`/api/events/${EVENT_ID}/booths/${BOOTHS[i]}/view`, {
      method: 'POST',
      token: mainToken,
    });
    ok(v.status === 200, `浏览 ${BOOTHS[i]} 失败 status=${v.status} code=${v.code}`);
    seen.push(`${BOOTHS[i]}:${v.data.uniqueBoothCount}`);
  }
  const lastCount =
    (await api(`/api/events/${EVENT_ID}/booths/${BOOTHS[BOOTHS.length - 1]}/view`, {
      method: 'POST',
      token: mainToken,
    })).data.uniqueBoothCount;
  ok(lastCount === boothCountAfterBrowse, `uniqueBoothCount 应为 ${boothCountAfterBrowse}，实得 ${lastCount}`);
  return { detail: `逐摊计数 ${seen.join(' ')} → final uniqueBoothCount=${lastCount}` };
});

// —— 第 3 步：查询奖励状态，确认已解锁 knowitall ——
await step(3, '奖励状态已解锁 knowitall', async () => {
  const r = await api('/api/me/reward', { token: mainToken });
  ok(r.status === 200, `status=${r.status} code=${r.code}`);
  ok(r.data.badge?.code === 'knowitall', `badge.code=${r.data.badge?.code}`);
  ok(r.data.badge?.unlocked === true, `unlocked=${r.data.badge?.unlocked}`);
  ok(r.data.badge?.uniqueBoothCount === 5, `uniqueBoothCount=${r.data.badge?.uniqueBoothCount}`);
  return {
    detail: `badge=${r.data.badge?.name} unlocked=${r.data.badge?.unlocked} ` +
      `unique=${r.data.badge?.uniqueBoothCount} claimStatus=${r.data.reward?.claimStatus ?? '-'}`,
  };
});

// —— 第 4 步：获取领取码 ——
await step(4, '获取领取码', async () => {
  const r = await api('/api/me/claim-token', { method: 'POST', token: mainToken });
  ok(r.status === 200, `status=${r.status} code=${r.code}`);
  ok(typeof r.data.claimToken === 'string' && r.data.claimToken.length > 0, '未返回 claimToken');
  mainClaimCode = r.data.claimToken;
  return { detail: `claimToken=${mainClaimCode} status=${r.data.claimStatus}` };
});

// —— 第 9 步：重复获取领取码（幂等，必须在前置步骤 6 核销前测）——
await step(9, '重复获取领取码返回同一个码', async () => {
  const r = await api('/api/me/claim-token', { method: 'POST', token: mainToken });
  ok(r.status === 200, `status=${r.status} code=${r.code}`);
  ok(r.data.claimToken === mainClaimCode, `不一致：${r.data.claimToken} vs ${mainClaimCode}`);
  return { detail: `claimToken=${r.data.claimToken} 与首次一致` };
});

// —— 第 5 步：工作人员登录 ——
await step(5, '工作人员登录', async () => {
  const r = await api('/api/auth/staff', { method: 'POST', body: { code: STAFF_CODE, name: STAFF_NAME } });
  ok(r.status === 200, `status=${r.status} code=${r.code}`);
  ok(r.data.user?.role === 'staff', `role=${r.data.user?.role}`);
  staffToken = r.data.token;
  return { detail: `name=${r.data.user?.id} role=${r.data.user?.role} eventEndAt=${r.data.eventEndAt ?? ''}` };
});

// —— 第 6 步：工作人员核销领取码 ——
await step(6, '核销领取码', async () => {
  const r = await api(REDEEM_PATH, { method: 'POST', token: staffToken, body: { claimToken: mainClaimCode } });
  ok(r.status === 200, `status=${r.status} code=${r.code}`);
  ok(r.data.success === true, `success=${r.data.success}`);
  ok(r.data.redeemedBy?.name === STAFF_NAME, `redeemedBy=${r.data.redeemedBy?.name}`);
  return { detail: `redeemedBy=${r.data.redeemedBy?.name} at=${r.data.redeemedAt ?? ''}` };
});

// —— 第 7 步：再次查询奖励状态，确认已核销 ——
await step(7, '奖励状态已核销', async () => {
  const r = await api('/api/me/reward', { token: mainToken });
  ok(r.status === 200, `status=${r.status} code=${r.code}`);
  ok(r.data.reward?.claimStatus === 'redeemed', `claimStatus=${r.data.reward?.claimStatus}`);
  ok(r.data.reward?.redeemedAt, 'redeemedAt 应为空');
  ok(r.data.badge?.unlocked === true, `unlocked=${r.data.badge?.unlocked}`);
  return {
    detail: `claimStatus=${r.data.reward?.claimStatus} redeemedAt=${r.data.reward?.redeemedAt ?? ''}`,
  };
});

// —— 第 8 步：重复浏览同一摊位，uniqueBoothCount 不变 ——
await step(8, '重复浏览 uniqueBoothCount 不变', async () => {
  const before = (
    await api(`/api/events/${EVENT_ID}/booths/booth-001/view`, { method: 'POST', token: mainToken })
  ).data.uniqueBoothCount;
  const again = (
    await api(`/api/events/${EVENT_ID}/booths/booth-001/view`, { method: 'POST', token: mainToken })
  ).data.uniqueBoothCount;
  ok(again === before, `重复浏览后 ${before} → ${again}`);
  ok(again === boothCountAfterBrowse, `应为 ${boothCountAfterBrowse}，实得 ${again}`);
  return { detail: `两次浏览 booth-001 → uniqueBoothCount 均=${again}` };
});

// —— 第 10 步：重复核销同一个码 ——
await step(10, '重复核销返回 CLAIM_TOKEN_REDEEMED', async () => {
  const r = await api(REDEEM_PATH, { method: 'POST', token: staffToken, body: { claimToken: mainClaimCode } });
  ok(r.status === 409 && r.code === 'CLAIM_TOKEN_REDEEMED', `status=${r.status} code=${r.code}`);
  return { detail: `status=${r.status} code=${r.code}` };
});

// —— 第 11 步：用学生 token 调工作人员核销 ——
await step(11, '学生 token 调 staff 核销应 403', async () => {
  const r = await api(REDEEM_PATH, { method: 'POST', token: mainToken, body: { claimToken: mainClaimCode } });
  ok(r.status === 403 && r.code === 'STAFF_REQUIRED', `status=${r.status} code=${r.code}`);
  return { detail: `status=${r.status} code=${r.code}` };
});

// —— 第 12 步：不带 token 调 /api/me/reward ——
await step(12, '无 token 调 reward 应 401', async () => {
  const r = await api('/api/me/reward');
  ok(r.status === 401 && (r.code === 'AUTH_REQUIRED' || r.code === 'INVALID_TOKEN'), `status=${r.status} code=${r.code}`);
  return { detail: `status=${r.status} code=${r.code}` };
});

// —— 第 13 步：两个不同学生各领取一个码 ——
await step(13, '两个学生各领取一个码', async () => {
  for (const id of [AUX1, AUX2]) {
    const r = await api('/api/me/claim-token', { method: 'POST', token: setupTokens[id] });
    ok(r.status === 200, `${id} 取码失败 status=${r.status} code=${r.code}`);
    auxCodes[id] = r.data.claimToken;
  }
  ok(auxCodes[AUX1] !== auxCodes[AUX2], '两个学生的码不应相同');
  return { detail: `AUX1=${auxCodes[AUX1]} AUX2=${auxCodes[AUX2]}` };
});

// —— 第 14 步：并发核销同一个码，只有一个成功 ——
await step(14, '并发核销同一码仅一成功', async () => {
  const reqs = [0, 1].map(() =>
    api(REDEEM_PATH, { method: 'POST', token: staffToken, body: { claimToken: auxCodes[AUX1] } })
  );
  const out = await Promise.all(reqs);
  const codes = out.map((r) => r.code ?? '');
  const statuses = out.map((r) => r.status);
  const successCount = out.filter((r) => r.status === 200 && r.data?.success === true).length;
  const deniedCount = out.filter((r) => r.status === 409 && r.code === 'CLAIM_TOKEN_REDEEMED').length;
  ok(successCount === 1, `成功核销数=${successCount}（应恰为 1）`);
  ok(deniedCount === 1, `被拒数=${deniedCount}（应恰为 1）`);
  return { detail: `status=${statuses.join('/')} code=${codes.join('/')} → 一成功一拒绝` };
});

// —— 第 15~17 步：活动过期 ——
await step(15, '临时将 end_at 改为过去时间', async () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  const changed = withDb((db) =>
    db.prepare('UPDATE events SET end_at = ? WHERE id = ?').run(past, EVENT_ID).changes
  );
  ok(changed === 1, `UPDATE 影响行数=${changed}`);
  return { detail: `end_at ${ORIGINAL_END_AT} → ${past}` };
});

await step(16, '过期后取码/核销返回过期错误', async () => {
  // 过期后取码 → EVENT_NOT_ACTIVE
  const tok = await api('/api/me/claim-token', { method: 'POST', token: setupTokens[EXPP] });
  // 过期后核销（用一个未核销的码 AUX2）→ CLAIM_TOKEN_EXPIRED / EVENT_NOT_ACTIVE
  const red = await api(REDEEM_PATH, { method: 'POST', token: staffToken, body: { claimToken: auxCodes[AUX2] } });
  const tokOk = tok.status === 409 && tok.code === 'EVENT_NOT_ACTIVE';
  const redOk =
    red.status === 409 && ['CLAIM_TOKEN_EXPIRED', 'EVENT_NOT_ACTIVE'].includes(red.code ?? '');
  ok(tokOk, `取码：status=${tok.status} code=${tok.code}（应 EVENT_NOT_ACTIVE）`);
  ok(redOk, `核销：status=${red.status} code=${red.code}（应 CLAIM_TOKEN_EXPIRED 或 EVENT_NOT_ACTIVE）`);
  return {
    detail: `取码→${tok.status}/${tok.code ?? '-'}  核销→${red.status}/${red.code ?? '-'}`,
  };
});

await step(17, '恢复 end_at', async () => {
  const changed = withDb((db) =>
    db.prepare('UPDATE events SET end_at = ? WHERE id = ?').run(ORIGINAL_END_AT, EVENT_ID).changes
  );
  ok(changed === 1, `UPDATE 影响行数=${changed}`);
  return { detail: `end_at 恢复为 ${ORIGINAL_END_AT}` };
});

// —— 第 18~19 步：参数边界 ——
await step(18, 'deviceId 格式错误应 400', async () => {
  const r = await api('/api/auth/student', { method: 'POST', body: { deviceId: 'bad-id' } });
  ok(r.status === 400 && r.code === 'INVALID_REQUEST', `status=${r.status} code=${r.code}`);
  return { detail: `deviceId=bad-id → status=${r.status} code=${r.code}` };
});

await step(19, 'eventId 为负应 400', async () => {
  const r = await api(`/api/events/-5/booths/booth-001/view`, { method: 'POST', token: mainToken });
  ok(r.status === 400 && r.code === 'INVALID_REQUEST', `status=${r.status} code=${r.code}`);
  return { detail: `eventId=-5 → status=${r.status} code=${r.code}` };
});

// ==== 总结 ===================================================================
const passCount = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n==============================`);
console.log(`总结：通过 ${passCount}/${total} 步`);
const failed = results.filter((r) => !r.pass);
if (failed.length) {
  console.log('\n未通过的步骤：');
  for (const f of failed) console.log(`  ❌ [${String(f.num).padStart(2)}] ${f.title} — ${f.detail}`);
}
console.log(`==============================`);
process.exit(passCount === total ? 0 : 1);