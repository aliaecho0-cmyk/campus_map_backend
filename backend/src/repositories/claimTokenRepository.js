import { withDb } from '../db.js';

/**
 * @typedef {object} ClaimTokenRow
 * @property {number} id
 * @property {string} device_id
 * @property {string} token_hash 领取码 SHA-256
 * @property {string} token_ciphertext 服务端可解密密文
 * @property {'active' | 'redeemed'} status
 * @property {string} issued_at
 * @property {string | null} redeemed_at
 * @property {string | null} redeemed_by
 * @property {string} updated_at
 */

/**
 * 首次签发领取码（幂等）。
 * 每个 device_id 至多一条；已存在时忽略新值、保留原记录，供服务层“复用”而非重签。
 * 并发首签由 UNIQUE(device_id) + ON CONFLICT DO NOTHING 兜底（BACKEND_PLAN §7.7）。
 * @param {string} deviceId 学生设备标识
 * @param {string} tokenHash 领取码明文 SHA-256 哈希
 * @param {string} tokenCiphertext 服务端可解密的领取码密文
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {boolean} true=本次新插入，false=该设备已有领取码（应改走 findByDeviceId 复用）
 */
export function insertIgnore(deviceId, tokenHash, tokenCiphertext, connection) {
  return withDb(connection, (db) => {
    const { changes } = db
      .prepare(
        `INSERT INTO claim_tokens (device_id, token_hash, token_ciphertext)
         VALUES (?, ?, ?)
         ON CONFLICT (device_id) DO NOTHING`
      )
      .run(deviceId, tokenHash, tokenCiphertext);
    return changes > 0;
  });
}

/**
 * 按设备查询领取码（复用 / 回显二维码用）。
 * @param {string} deviceId 学生设备标识
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {ClaimTokenRow | null}
 */
export function findByDeviceId(deviceId, connection) {
  return withDb(connection, (db) => {
    const row = db
      .prepare('SELECT * FROM claim_tokens WHERE device_id = ?')
      .get(deviceId);
    return row ?? null;
  });
}

/**
 * 按领取码哈希查询领取码（工作人员核销时用）。
 * @param {string} tokenHash 领取码明文 SHA-256 哈希
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {ClaimTokenRow | null}
 */
export function findByTokenHash(tokenHash, connection) {
  return withDb(connection, (db) => {
    const row = db
      .prepare('SELECT * FROM claim_tokens WHERE token_hash = ?')
      .get(tokenHash);
    return row ?? null;
  });
}

/**
 * 按记录 ID 查询领取码（核销事务内读回更新后的状态/device_id 用）。
 * @param {number} id 领取码记录 ID
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {ClaimTokenRow | null}
 */
export function findById(id, connection) {
  return withDb(connection, (db) => {
    const row = db.prepare('SELECT * FROM claim_tokens WHERE id = ?').get(id);
    return row ?? null;
  });
}

/**
 * 将领取码置为已核销（带条件更新，权威状态切换）。
 * WHERE status='active' 保证两个并发核销请求只有一个能成功，
 * 第二次调用返回 false 表示已被核销（BACKEND_PLAN §11.3）。
 * @param {number} tokenId 领取码记录 ID
 * @param {string} staffName 核销工作人员姓名（写入 redeemed_by）
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {boolean} true=本次由 active 成功置为 redeemed；false=已是 redeemed（或不存在）
 */
export function markRedeemed(tokenId, staffName, connection) {
  return withDb(connection, (db) => {
    const { changes } = db
      .prepare(
        `UPDATE claim_tokens
         SET status = 'redeemed',
             redeemed_at = CURRENT_TIMESTAMP,
             redeemed_by = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'active'`
      )
      .run(staffName, tokenId);
    return changes > 0;
  });
}
