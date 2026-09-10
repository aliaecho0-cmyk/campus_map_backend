import jwt from 'jsonwebtoken';
import { getCurrentEvent, isActive } from '../repositories/eventRepository.js';
import { findByName } from '../repositories/staffWhitelistRepository.js';

const DEVICE_ID_RE = /^dev_\d+_[A-Za-z0-9]{8}$/;

/**
 * @typedef {object} LoginResult
 * @property {string} token JWT
 * @property {{ id: string, role: 'student' | 'staff' }} user
 * @property {string} eventEndAt 活动截止时间（ISO 8601），用于前端倒计时
 */

function requireSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return secret;
}

function currentEventOrThrow() {
  const event = getCurrentEvent();
  if (!event) throw new Error('EVENT_NOT_FOUND');
  if (!isActive(event)) throw new Error('EVENT_NOT_ACTIVE');
  return event;
}

function toIso(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString();
}

/**
 * 学生无感登录：校验 device_id 格式后签发 student JWT。
 * 错误信息为 API 契约错误码（BACKEND_PLAN §5.3 / docs/api.md §2.1）。
 * @param {string} deviceId 设备标识，格式 dev_<秒级时间戳>_<8位随机字符>
 * @returns {LoginResult}
 * @throws {Error} deviceId 非法 → INVALID_REQUEST；无当前活动 → EVENT_NOT_FOUND；活动已结束 → EVENT_NOT_ACTIVE
 */
export function studentLogin(deviceId) {
  if (typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new Error('INVALID_REQUEST');
  }
  const event = currentEventOrThrow();
  const secret = requireSecret();
  const token = jwt.sign(
    { sub: deviceId, role: 'student', exp: Math.floor(event.end_at) },
    secret,
    { algorithm: 'HS256' }
  );
  return {
    token,
    user: { id: deviceId, role: 'student' },
    eventEndAt: toIso(event.end_at),
  };
}

/**
 * 工作人员登录：识别码须等于 STAFF_CODE 且姓名须在白名单，两者缺一即 401 且不区分原因。
 * @param {string} code 工作人员识别码
 * @param {string} name 工作人员姓名
 * @returns {LoginResult}
 * @throws {Error} 识别码错误或姓名不在白名单 → AUTH_REQUIRED；无当前活动 → EVENT_NOT_FOUND；活动已结束 → EVENT_NOT_ACTIVE
 */
export function staffLogin(code, name) {
  if (code !== process.env.STAFF_CODE) {
    throw new Error('AUTH_REQUIRED');
  }
  const member = findByName(name);
  if (!member) {
    throw new Error('AUTH_REQUIRED');
  }
  const event = currentEventOrThrow();
  const secret = requireSecret();
  const token = jwt.sign(
    { sub: name, role: 'staff', name, exp: Math.floor(event.end_at) },
    secret,
    { algorithm: 'HS256' }
  );
  return {
    token,
    user: { id: name, role: 'staff' },
    eventEndAt: toIso(event.end_at),
  };
}

/**
 * 校验 JWT 有效性（签名 + 过期时间）。
 * @param {string | null | undefined} token
 * @returns {object | null} 校验通过返回 decoded payload（含 sub/role/iat/exp），否则返回 null
 */
export function verifyToken(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const secret = requireSecret();
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

/**
 * 从已校验的 JWT payload 还原当前用户身份。
 * staff 会实时复查白名单以支持即时撤销：姓名已被移出白名单则返回 null（旧令牌随即失效）。
 * @param {object | null | undefined} decoded verifyToken 的返回结果
 * @returns {{ id: string, role: 'student' | 'staff' } | null}
 */
export function getCurrentUser(decoded) {
  if (!decoded || typeof decoded !== 'object') return null;
  if (decoded.role === 'student' && typeof decoded.sub === 'string') {
    return { id: decoded.sub, role: 'student' };
  }
  if (decoded.role === 'staff' && typeof decoded.sub === 'string') {
    const member = findByName(decoded.name ?? decoded.sub);
    if (!member) return null;
    return { id: decoded.sub, role: 'staff' };
  }
  return null;
}
