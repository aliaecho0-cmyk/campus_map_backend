import express from 'express';
import * as authService from '../services/authService.js';

const { Router } = express;
export const authRouter = Router();
// 让本路由自包含地解析 JSON 请求体
authRouter.use(express.json());

/**
 * 从 Authorization 头提取 Bearer token。
 * @param {import('express').Request} req
 * @returns {string | null}
 */
function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * 学生无感登录：POST /api/auth/student（API 契约 §2.1）。
 * 入参 { deviceId }，成功 200；INVALID_REQUEST→400、EVENT_NOT_FOUND→404、EVENT_NOT_ACTIVE→409。
 */
authRouter.post('/student', (req, res, next) => {
  try {
    const { deviceId } = req.body ?? {};
    res.json(authService.studentLogin(deviceId));
  } catch (err) {
    next(err);
  }
});

/**
 * 工作人员登录：POST /api/auth/staff（API 契约 §2.2）。
 * 入参 { code, name }，成功 200；AUTH_REQUIRED→401；其余映射到 400/404/409。
 */
authRouter.post('/staff', (req, res, next) => {
  try {
    const { code, name } = req.body ?? {};
    res.json(authService.staffLogin(code, name));
  } catch (err) {
    next(err);
  }
});

/**
 * 获取当前用户：GET /api/auth/me（API 契约 §2.3）。
 * 需 Authorization: Bearer <token>；缺失→AUTH_REQUIRED、无效/被撤销→INVALID_TOKEN（均 401）。
 */
authRouter.get('/me', (req, res, next) => {
  try {
    const token = bearerToken(req);
    if (!token) return next(new Error('AUTH_REQUIRED'));
    const decoded = authService.verifyToken(token);
    if (!decoded) return next(new Error('INVALID_TOKEN'));
    const user = authService.getCurrentUser(decoded);
    if (!user) return next(new Error('INVALID_TOKEN'));
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default authRouter;
