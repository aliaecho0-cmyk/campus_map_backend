// 统一错误处理：把 Route/中间件通过 next(err) 抛来的错误码转成 API 契约格式的 HTTP 响应
// 错误码与状态映射见 docs/api.md §1.4 / BACKEND_PLAN §12

export const HTTP_STATUS_BY_CODE = {
  INVALID_REQUEST: 400,
  AUTH_REQUIRED: 401,
  INVALID_TOKEN: 401,
  STAFF_REQUIRED: 403,
  BADGE_NOT_UNLOCKED: 403,
  EVENT_NOT_FOUND: 404,
  CLAIM_TOKEN_NOT_FOUND: 404,
  EVENT_NOT_ACTIVE: 409,
  CLAIM_TOKEN_EXPIRED: 409,
  CLAIM_TOKEN_REDEEMED: 409,
};

export const CODE_MESSAGE = {
  INVALID_REQUEST: '请求参数错误',
  AUTH_REQUIRED: '未登录，请携带 JWT',
  INVALID_TOKEN: 'JWT 无效或已过期',
  STAFF_REQUIRED: '需要工作人员权限',
  BADGE_NOT_UNLOCKED: '未解锁 knowitall，无法操作',
  EVENT_NOT_FOUND: '活动不存在',
  CLAIM_TOKEN_NOT_FOUND: '领取码不存在',
  EVENT_NOT_ACTIVE: '活动当前不可用',
  CLAIM_TOKEN_EXPIRED: '已超过活动截止时间',
  CLAIM_TOKEN_REDEEMED: '领取码已经核销',
};

/**
 * 取错误码对应的 HTTP 状态码。
 * @param {string} code
 * @returns {number | undefined} 未注册的错误码返回 undefined
 */
export function statusForCode(code) {
  return HTTP_STATUS_BY_CODE[code];
}

/**
 * Express 错误处理中间件（四个参数，缺一不可）。
 * err.message 视为错误码：命中映射则返回对应状态与统一格式；否则按内部错误返回 500。
 * 开发环境（NODE_ENV=development）额外返回 err.stack。
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV === 'development';
  const code = err && typeof err.message === 'string' ? err.message : null;
  const status = code ? statusForCode(code) : undefined;

  if (status) {
    console.error(`${new Date().toISOString()} [${code}]`, err.stack || err);
    const body = { error: { code, message: CODE_MESSAGE[code] ?? code } };
    if (isDev) body.error.stack = err.stack;
    res.status(status).json(body);
    return;
  }

  console.error(`${new Date().toISOString()} [INTERNAL_SERVER_ERROR]`, err?.stack || err);
  const body = { error: { code: 'INTERNAL_SERVER_ERROR', message: '服务器内部错误' } };
  if (isDev && err) body.error.stack = err.stack;
  res.status(500).json(body);
}

export default errorHandler;
