import { withDb } from '../db.js';

/**
 * 追加一条核销记录（append-only，审计/运营统计的权威来源，BACKEND_PLAN §7.8）。
 * UNIQUE(claim_token_id) 保证同一领取码至多一条核销记录；
 * 应与 claimTokenRepository.markRedeemed 在同一个事务内提交（§11.2）。
 * @param {number} claimTokenId 被核销的领取码记录 ID
 * @param {string} staffName 核销工作人员姓名（白名单）
 * @param {string} studentDeviceId 被核销学生设备标识（取自 claim_tokens.device_id）
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {number} 新核销记录的 id
 */
export function insert(claimTokenId, staffName, studentDeviceId, connection) {
  return withDb(connection, (db) => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO redemptions (claim_token_id, staff_name, student_device_id)
         VALUES (?, ?, ?)`
      )
      .run(claimTokenId, staffName, studentDeviceId);
    return Number(lastInsertRowid);
  });
}
