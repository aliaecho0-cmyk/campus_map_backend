import { withTransaction } from '../db.js';
import { getCurrentEvent } from '../repositories/eventRepository.js';
import * as claimToken from '../repositories/claimTokenRepository.js';
import * as redemption from '../repositories/redemptionRepository.js';
import { hashToken } from './claimTokenService.js';

const REWARD_CODE = 'free-drink';

function assertParams(claimTokenPlain, staffName) {
  if (typeof claimTokenPlain !== 'string' || claimTokenPlain.trim() === '') {
    throw new Error('INVALID_REQUEST');
  }
  if (typeof staffName !== 'string' || staffName.trim() === '') {
    throw new Error('INVALID_REQUEST');
  }
}

/**
 * @typedef {object} RedemptionResult
 * @property {boolean} success
 * @property {'redeemed'} claimTokenStatus
 * @property {string} redeemedAt 本次核销时间（ISO）
 * @property {{ name: string, role: 'staff' }} redeemedBy
 * @property {{ code: string }} reward
 */

/**
 * 工作人员核验并立即核销领取码（POST /api/staff/claim-tokens/redeem，§5.1 / §10 / §11）。
 * claim_tokens 置 redeemed 与 redemptions 写入在同一 BEGIN IMMEDIATE 事务内原子完成。
 * @param {string} claimTokenPlain 工作人员提交的领取码明文
 * @param {string} staffName 核销工作人员姓名（白名单，中间件已实时校验）
 * @returns {RedemptionResult}
 * @throws {Error} 参数非法 → INVALID_REQUEST；码不存在 → CLAIM_TOKEN_NOT_FOUND；活动不可用 → EVENT_NOT_ACTIVE；
 *                 码非 active（已核销）→ CLAIM_TOKEN_REDEEMED；已过截止时间 → CLAIM_TOKEN_EXPIRED
 */
export function redeem(claimTokenPlain, staffName) {
  assertParams(claimTokenPlain, staffName);

  const record = claimToken.findByTokenHash(hashToken(claimTokenPlain));
  if (!record) throw new Error('CLAIM_TOKEN_NOT_FOUND');

  const event = getCurrentEvent();
  if (!event) throw new Error('EVENT_NOT_ACTIVE');
  if (record.status !== 'active') throw new Error('CLAIM_TOKEN_REDEEMED');
  if (Date.now() / 1000 >= event.end_at) throw new Error('CLAIM_TOKEN_EXPIRED');

  const outcome = withTransaction(
    (db) => {
      // WHERE status='active' 的带条件更新：false 说明已被并发请求抢先核销
      const changed = claimToken.markRedeemed(record.id, staffName, db);
      if (!changed) throw new Error('CLAIM_TOKEN_REDEEMED');

      const fresh = claimToken.findById(record.id, db);
      redemption.insert(record.id, staffName, fresh.device_id, db);
      return { redeemedAt: fresh.redeemed_at };
    },
    { immediate: true }
  );

  return {
    success: true,
    claimTokenStatus: 'redeemed',
    redeemedAt: outcome.redeemedAt,
    redeemedBy: { name: staffName, role: 'staff' },
    reward: { code: REWARD_CODE },
  };
}
