import { withDb } from '../db.js';

/**
 * @typedef {object} UserBadgeRow
 * @property {number} badge_id
 * @property {string} code
 * @property {string} name
 * @property {string} unlocked_at
 */

/**
 * 幂等解锁徽章：为某设备插入一条解锁记录。
 * (device_id, badge_id) 唯一，重复解锁会被 ON CONFLICT DO NOTHING 忽略，
 * 不重复插入、不报错（BACKEND_PLAN §7.5 / §8.2）。
 * @param {string} deviceId 设备标识
 * @param {number} badgeId 徽章 ID
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {boolean} 本次是否真正新增了解锁记录（true=首次解锁，false=此前已解锁）
 */
export function unlock(deviceId, badgeId, connection) {
  return withDb(connection, (db) => {
    const { changes } = db
      .prepare(
        `INSERT INTO user_badges (device_id, badge_id)
         VALUES (?, ?)
         ON CONFLICT (device_id, badge_id) DO NOTHING`
      )
      .run(deviceId, badgeId);
    return changes > 0;
  });
}

/**
 * 查询某设备是否已解锁某徽章。
 * @param {string} deviceId 设备标识
 * @param {number} badgeId 徽章 ID
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {boolean}
 */
export function isUnlocked(deviceId, badgeId, connection) {
  return withDb(connection, (db) => {
    const row = db
      .prepare(
        'SELECT 1 FROM user_badges WHERE device_id = ? AND badge_id = ?'
      )
      .get(deviceId, badgeId);
    return row !== undefined;
  });
}

/**
 * 列出某设备在指定活动中已解锁的徽章（按解锁时间升序）。
 * user_badges 无 event_id，需经 badges 关联出活动范围。
 * @param {string} deviceId 设备标识
 * @param {number} eventId 活动 ID
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {UserBadgeRow[]}
 */
export function listByDeviceAndEvent(deviceId, eventId, connection) {
  return withDb(connection, (db) => {
    return db
      .prepare(
        `SELECT b.id AS badge_id, b.code, b.name, ub.unlocked_at
         FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.device_id = ? AND b.event_id = ?
         ORDER BY ub.unlocked_at ASC`
      )
      .all(deviceId, eventId);
  });
}
