import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getRewardStatus } from '../services/claimTokenService.js';

const { Router } = express;

// 挂载点：/api/me（由 server 决定 app.use('/api/me', rewardRouter)）
export const rewardRouter = Router();

/**
 * 查看我的奖励状态：GET /api/me/reward（API 契约 §4.1）。
 * 需登录（requireAuth，req.user.id 即 deviceId）。只读，永不创建领取码。
 * 成功 200：{ badge, reward, eventEndAt }
 * 错误：INVALID_REQUEST→400、EVENT_NOT_FOUND→404（401 由 requireAuth 处理）
 */
rewardRouter.get('/reward', requireAuth, (req, res, next) => {
  try {
    const deviceId = req.user.id;
    res.json(getRewardStatus(deviceId));
  } catch (err) {
    next(err);
  }
});

export default rewardRouter;
