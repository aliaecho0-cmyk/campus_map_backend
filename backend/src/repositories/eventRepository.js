import { withDb } from '../db.js';

/**
 * @typedef {object} EventRecord
 * @property {number} id
 * @property {string} slug
 * @property {string} name
 * @property {'draft' | 'active' | 'closed'} status
 * @property {number} end_at 结束时间戳（秒）
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * 按 ID 查询活动。
 * @param {number} id 活动 ID
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {EventRecord | null} 完整活动记录或 null
 */
export function findById(id, connection) {
  return withDb(connection, (db) => {
    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    return row ?? null;
  });
}

/**
 * 按 slug 查询活动。
 * @param {string} slug 活动唯一标识
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {EventRecord | null} 完整活动记录或 null
 */
export function findBySlug(slug, connection) {
  return withDb(connection, (db) => {
    const row = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
    return row ?? null;
  });
}

/**
 * 获取当前活动。
 * 本阶段只有一个活动，但保留多活动可能：取最新一条 active 状态的活动。
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {EventRecord | null} 当前 active 活动，无则 null
 */
export function getCurrentEvent(connection) {
  return withDb(connection, (db) => {
    const row = db
      .prepare(
        "SELECT * FROM events WHERE status = 'active' ORDER BY id DESC LIMIT 1"
      )
      .get();
    return row ?? null;
  });
}

/**
 * 判断活动当前是否可用（纯函数，不访问数据库）。
 * 规则：处于 active 状态且未到截止时间。
 * @param {EventRecord | null | undefined} event
 * @returns {boolean}
 */
export function isActive(event) {
  if (!event) return false;
  return event.status === 'active' && Date.now() / 1000 < event.end_at;
}

/**
 * 按 ID 查询活动并判断是否可用（便捷组合）。
 * @param {number} id 活动 ID
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {boolean}
 */
export function isActiveById(id, connection) {
  const event = findById(id, connection);
  return isActive(event);
}
