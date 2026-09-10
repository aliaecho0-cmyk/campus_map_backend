import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { recordView } from '../services/boothViewService.js';

const { Router } = express;

// 挂载点：/api/events（由 server 决定 app.use('/api/events', boothRouter)）
export const boothRouter = Router();
// 本路由相对路径为 /:eventId/booths/:boothId/view
boothRouter.use(express.json());

/**
 * 学生浏览摊位并推进/解锁徽章：POST /api/events/:eventId/booths/:boothId/view（API 契约 §3.1）。
 * 需登录（requireAuth，req.user.id 即 deviceId）。
 * 成功 200：{ eventId, boothId, uniqueBoothCount, badges }
 * 错误：INVALID_REQUEST→400、EVENT_NOT_FOUND→404、EVENT_NOT_ACTIVE→409（401 由 requireAuth 处理）
 */
boothRouter.post('/:eventId/booths/:boothId/view', requireAuth, (req, res, next) => {
  try {
    const eventId = Number(req.params.eventId);
    const boothId = req.params.boothId;
    const deviceId = req.user.id;
    res.json(recordView(eventId, boothId, deviceId));
  } catch (err) {
    next(err);
  }
});

export default boothRouter;
