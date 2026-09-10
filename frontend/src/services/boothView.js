/**
 * services/boothView.js — 浏览摊位埋点（web 版）
 *
 * 规则：用户点开摊位气泡 / 进入社团详情页 → 停留 3 秒视为浏览。
 * - 关闭 / 切换取消除上报
 * - 已上报过的摊位跳过（不发请求、不弹窗），localStorage 持久化去重
 * - 后端 UNIQUE(event_id, device_id, booth_id) 作为兜底去重
 */
import { recordBoothView } from './api.js';
import { showToast } from '../utils/toast.js';

/** 活动 ID 固定为 1 */
const EVENT_ID = 1;

/** localStorage key */
const REPORTED_KEY = 'reported_booths';

/** 页面加载时读一次，缓存在内存 */
let reportedBooths = loadReported();

/** 进行中的计时：{ boothId -> cancel } */
const pendingTimers = {};

/** 上报成功后的进度变更回调（可选，当前无进度 UI，预留） */
let onProgressChanged = null;

function loadReported() {
  try {
    const raw = localStorage.getItem(REPORTED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function persistReported() {
  try {
    localStorage.setItem(REPORTED_KEY, JSON.stringify(reportedBooths));
  } catch {}
}

/* ---------- 已上报集合 ---------- */

/**
 * 读取已上报摊位集合（副本，避免外部误改）。
 * @returns {string[]} boothId 数组，如 ["1","5","12"]
 */
export function getReportedBooths() {
  return reportedBooths.slice();
}

/**
 * 某摊位是否已上报过。
 * @param {string|number} boothId
 * @returns {boolean}
 */
export function hasReported(boothId) {
  return reportedBooths.indexOf(String(boothId)) !== -1;
}

/**
 * 记录一个已上报摊位并写回 localStorage（幂等，重复添加不重复）。
 * @param {string|number} boothId
 */
export function addReportedBooth(boothId) {
  const id = String(boothId);
  if (reportedBooths.indexOf(id) === -1) reportedBooths.push(id);
  persistReported();
}

/**
 * 订阅上报成功后的进度变更（回调收到后端返回的 uniqueBoothCount 等）。
 * 当前没有进度 UI，预留接口供后续页面接入。
 * @param {(data: object) => void} fn
 */
export function setOnProgressChanged(fn) {
  onProgressChanged = typeof fn === 'function' ? fn : null;
}

/* ---------- 埋点 ---------- */

/**
 * 针对某摊位启动「停留 delayMs 视为浏览」的计时。
 * 到期时若该摊位未上报过，则调 recordBoothView 上报。
 *
 * @param {string|number} boothId 摊位 ID（如 "1"）
 * @param {number} [delayMs=3000] 停留阈值（毫秒）
 * @returns {() => void} cancel 函数：在关闭/切换摊位时调用以取消计时
 */
export function recordViewAfterDelay(boothId, delayMs = 3000) {
  const id = String(boothId);

  // 同一摊位若已有未完成计时，先取消旧的
  if (pendingTimers[id]) {
    pendingTimers[id]();
    delete pendingTimers[id];
  }

  let cancelled = false;
  let timer = setTimeout(async () => {
    delete pendingTimers[id];
    if (cancelled) return;

    // 已上报过 → 跳过，不发请求、不弹窗
    if (hasReported(id)) return;

    try {
      const data = await recordBoothView(EVENT_ID, id);
      if (cancelled) return; // 请求期间被取消

      addReportedBooth(id);
      showToast('摊位收集 +1');
      if (onProgressChanged) onProgressChanged(data);
    } catch (e) {
      console.warn('[boothView] 上报失败', id, e);
    }
  }, delayMs);

  function cancel() {
    cancelled = true;
    clearTimeout(timer);
    if (pendingTimers[id]) delete pendingTimers[id];
  }

  pendingTimers[id] = cancel;
  return cancel;
}