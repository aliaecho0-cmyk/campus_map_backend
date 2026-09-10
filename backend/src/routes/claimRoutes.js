import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getClaimToken, getClaimTokenStatus } from '../services/claimTokenService.js';

const { Router } = express;

// 挂载点：/api/me（由 server 决定 app.use('/api/me', claimRouter)，与 rewardRouter 同前缀）
export const claimRouter = Router();
claimRouter.use(express.json());

/**
 * 获取 / 出示领取码（首签或复用）：POST /api/me/claim-token（API 契约 §4.2）。
 * 需登录。成功 200：{ claimToken, claimStatus, eventEndAt }
 * 错误：INVALID_REQUEST→400、BADGE_NOT_UNLOCKED→403、EVENT_NOT_ACTIVE→409、CLAIM_TOKEN_REDEEMED→409
 */
claimRouter.post('/claim-token', requireAuth, (req, res, next) => {
  try {
    const deviceId = req.user.id;
    res.json(getClaimToken(deviceId));
  } catch (err) {
    next(err);
  }
});

/**
 * 查询领取码状态（只读，绝不首签）：GET /api/me/claim-token（API 契约 §4.3）。
 * 需登录。成功 200：{ claimStatus, claimToken, eventEndAt, redeemedAt }
 * 错误：INVALID_REQUEST→400、EVENT_NOT_FOUND→404
 */
claimRouter.get('/claim-token', requireAuth, (req, res, next) => {
  try {
    const deviceId = req.user.id;
    res.json(getClaimTokenStatus(deviceId));
  } catch (err) {
    next(err);
  }
});

export default claimRouter;
