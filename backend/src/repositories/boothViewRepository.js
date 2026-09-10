import { withDb } from '../db.js';

/**
 * 记录一次摊位浏览（UPSERT）。
 * 同一设备在同一活动里浏览同一摊位时，不新增行，仅刷新 last_viewed_at 并累加 view_count。
 * (event_id, device_id, booth_id) 唯一，因此去重计数以记录行数为准。
 * @param {number} eventId 活动 ID
 * @param {string} deviceId 设备标识（JWT sub）
 * @param {string} boothId 摊位标识（前端约定，后端仅做不透明字符串）
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {void}
 */
export function upsert(eventId, deviceId, boothId, connection) {
  withDb(connection, (db) => {
    db.prepare(
      `INSERT INTO booth_view_records (event_id, device_id, booth_id)
       VALUES (?, ?, ?)
       ON CONFLICT (event_id, device_id, booth_id)
       DO UPDATE SET
         last_viewed_at = CURRENT_TIMESTAMP,
         view_count = view_count + 1`
    ).run(eventId, deviceId, boothId);
  });
}

/**
 * 统计某设备在当前活动中浏览过的不同摊位数量。
 * 徽章进度按去重后的记录数计算（BACKEND_PLAN §7.4）。
 * @param {number} eventId 活动 ID
 * @param {string} deviceId 设备标识
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {number} 不同摊位数（0 表示尚未浏览任何摊位）
 */
export function countDistinctBooths(eventId, deviceId, connection) {
  return withDb(connection, (db) => {
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT booth_id) AS count
         FROM booth_view_records
         WHERE event_id = ? AND device_id = ?`
      )
      .get(eventId, deviceId);
    return Number(row.count);
  });
}
