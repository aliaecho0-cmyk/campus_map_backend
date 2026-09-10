import { verifyToken, getCurrentUser } from '../services/authService.js';

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
 * 认证核心（供 requireAuth / requireStaff 复用，Express 中间件不能相互嵌套）。
 * 校验 JWT 并把当前用户挂到 req.user；任一环节失败以 throw 形式抛出错误码。
 * @param {import('express').Request} req
 * @returns {{ id: string, role: 'student' | 'staff' }}
 * @throws {Error} token 缺失/无效/已过期 → AUTH_REQUIRED；用户被撤销 → INVALID_TOKEN
 */
function attachUser(req) {
  const token = bearerToken(req);
  if (!token) throw new Error('AUTH_REQUIRED');
  const decoded = verifyToken(token);
  if (!decoded) throw new Error('AUTH_REQUIRED');
  const user = getCurrentUser(decoded);
  if (!user) throw new Error('INVALID_TOKEN');
  req.user = user;
  return user;
}

/**
 * 认证中间件：任何已登录角色可过（学生/工作人员）。见 BACKEND_PLAN §4.2。
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireAuth(req, res, next) {
  try {
    attachUser(req);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * 工作人员权限中间件：先认证（复用 requireAuth 逻辑），再校验 role='staff'。见 BACKEND_PLAN §4.2。
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireStaff(req, res, next) {
  try {
    const user = attachUser(req);
    if (user.role !== 'staff') throw new Error('STAFF_REQUIRED');
    next();
  } catch (err) {
    next(err);
  }
}

export default requireAuth;
