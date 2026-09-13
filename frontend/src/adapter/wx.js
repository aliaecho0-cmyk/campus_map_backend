/**
 * adapter/wx.js — 微信小程序 API 的浏览器垫片（仅覆盖本 web 版用到的子集）
 * 页面通过 `import { wx } from '../adapter/wx.js'` 使用，语义与原 wx.* 对齐。
 */
import { t } from '../i18n.js';

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, String(val));
    } catch {}
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

function getWindowInfo() {
  return {
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    safeArea: {
      top: 0,
      left: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    },
  };
}

/* ---------- Toast ---------- */
let toastEl = null;
let toastTimer = null;
function ensureToast() {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'wx-toast';
    document.body.appendChild(toastEl);
  }
  return toastEl;
}
function showToast({ title = '', icon = 'none', duration = 1800 } = {}) {
  const el = ensureToast();
  el.textContent = title;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

/* ---------- Modal ---------- */
function showModal({
  title = '',
  content = '',
  showCancel = true,
  confirmText = t('confirm'),
  cancelText = t('cancel'),
  maskClosable = true,
  success,
} = {}) {
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'wx-modal-mask';
    const btnsWrap = document.createElement('div');
    btnsWrap.className = showCancel ? 'wx-modal-btns' : 'wx-modal-btns single';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'wx-modal-confirm';
    confirmBtn.textContent = confirmText;
    btnsWrap.appendChild(confirmBtn);
    let cancelBtn = null;
    if (showCancel) {
      cancelBtn = document.createElement('button');
      cancelBtn.className = 'wx-modal-cancel';
      cancelBtn.textContent = cancelText;
      btnsWrap.appendChild(cancelBtn);
    }

    const modal = document.createElement('div');
    modal.className = 'wx-modal';
    modal.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'wx-modal-title';
    t.textContent = title;
    const c = document.createElement('div');
    c.className = 'wx-modal-content';
    c.textContent = content;
    modal.appendChild(t);
    modal.appendChild(c);
    modal.appendChild(btnsWrap);
    mask.appendChild(modal);

    const finish = (res) => {
      mask.remove();
      if (typeof success === 'function') success(res);
      resolve(res);
    };
    confirmBtn.addEventListener('click', () => finish({ confirm: true, cancel: false }));
    if (cancelBtn) cancelBtn.addEventListener('click', () => finish({ confirm: false, cancel: true }));
    mask.addEventListener('click', (e) => {
      if (maskClosable && e.target === mask) finish({ confirm: false, cancel: true });
    });

    document.body.appendChild(mask);
  });
}

/* ---------- 导航 ---------- */
function navigateTo({ url }) {
  location.hash = url;
}
function redirectTo({ url }) {
  location.replace('#' + url);
}
function switchTab({ url }) {
  location.hash = url;
}
function navigateBack() {
  history.back();
}
function setNavigationBarTitle({ title }) {
  document.title = title;
}

/* ---------- 剪贴板 ---------- */
function setClipboardData({ data, success, fail }) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(data)
      .then(() => success && success())
      .catch(() => fail && fail());
  } else {
    const ta = document.createElement('textarea');
    ta.value = data;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      success && success();
    } catch {
      fail && fail();
    }
    ta.remove();
  }
}

function getLaunchOptionsSync() {
  return { query: {} };
}

const wx = {
  getWindowInfo,
  getSystemInfoSync: getWindowInfo,
  setStorageSync: storage.set,
  getStorageSync: storage.get,
  removeStorageSync: storage.remove,
  showToast,
  showModal,
  showLoading: ({ title = '' } = {}) => showToast({ title: title || t('loadingEllipsis'), duration: 60000 }),
  hideLoading: () => {
    if (toastEl) toastEl.classList.remove('show');
  },
  navigateTo,
  redirectTo,
  switchTab,
  navigateBack,
  setNavigationBarTitle,
  setClipboardData,
  getLaunchOptionsSync,
};

export { wx };
