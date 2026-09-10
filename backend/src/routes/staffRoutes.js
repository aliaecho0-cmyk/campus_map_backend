import express from 'express';
import { requireStaff } from '../middleware/requireAuth.js';
import { redeem } from '../services/staffRedemptionService.js';

const { Router } = express;

// 挂载点：/api/staff（由 server 决定 app.use('/api/staff', staffRouter)）
export const staffRouter = Router();
staffRouter.use(express.json());

/**
 * 工作人员核验并立即核销领取码：POST /api/staff/claim-tokens/redeem（API 契约 §5.1）。
 * 需 staff 权限（requireStaff：先认证再校验 role），req.user.id 即工作人员姓名。
 * 入参 { claimToken }，成功 200：{ success, claimTokenStatus, redeemedAt, redeemedBy, reward }
 * 错误：INVALID_REQUEST→400、CLAIM_TOKEN_NOT_FOUND→404、EVENT_NOT_ACTIVE→409、
 *       CLAIM_TOKEN_REDEEMED→409、CLAIM_TOKEN_EXPIRED→409（401/403 由 requireStaff 处理）
 */
staffRouter.post('/claim-tokens/redeem', requireStaff, (req, res, next) => {
  try {
    const staffName = req.user.id;
    const { claimToken } = req.body ?? {};
    res.json(redeem(claimToken, staffName));
  } catch (err) {
    next(err);
  }
});

export default staffRouter;
