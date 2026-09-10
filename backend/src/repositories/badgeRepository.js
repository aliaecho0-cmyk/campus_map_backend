import { withDb } from '../db.js';

/**
 * @typedef {object} BadgeRecord
 * @property {number} id
 * @property {number} event_id
 * @property {string} code 徽章代码，如 knowitall
 * @property {string} name
 * @property {string | null} description
 * @property {number} required_unique_booths 解锁所需的去重摊位数
 * @property {string} created_at
 */

/**
 * 按活动 ID + 徽章代码查询徽章定义（例如取 knowitall）。
 * @param {number} eventId 活动 ID
 * @param {string} code 徽章代码
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {BadgeRecord | null} 徽章定义或 null
 */
export function findByEventIdAndCode(eventId, code, connection) {
  return withDb(connection, (db) => {
    const row = db
      .prepare('SELECT * FROM badges WHERE event_id = ? AND code = ?')
      .get(eventId, code);
    return row ?? null;
  });
}

/**
 * 按 ID 查询徽章定义。
 * @param {number} id 徽章 ID
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {BadgeRecord | null}
 */
export function findById(id, connection) {
  return withDb(connection, (db) => {
    const row = db.prepare('SELECT * FROM badges WHERE id = ?').get(id);
    return row ?? null;
  });
}

/**
 * 列出某活动的全部徽章定义（按 id 升序）。
 * @param {number} eventId 活动 ID
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {BadgeRecord[]}
 */
export function listByEventId(eventId, connection) {
  return withDb(connection, (db) => {
    return db
      .prepare('SELECT * FROM badges WHERE event_id = ? ORDER BY id ASC')
      .all(eventId);
  });
}
