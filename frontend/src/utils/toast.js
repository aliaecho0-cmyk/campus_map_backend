/**
 * utils/toast.js — 轻量 toast（web 版）
 *
 * 居中显示，1.5s 自动消失，不阻塞用户操作。
 * 内联样式，不修改任何 CSS 文件。
 */
let el = null;
let timer = null;

/**
 * 显示一条居中 toast。
 * @param {string} text 文案
 * @param {number} [duration=1500] 显示时长（毫秒）
 */
export function showToast(text, duration = 1500) {
  if (!el) {
    el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:50%;bottom:26%;transform:translateX(-50%) translateY(10px);' +
      'z-index:10000;max-width:70%;padding:10px 18px;' +
      'background:rgba(42,28,61,0.92);color:#f4e9ff;' +
      'font-size:14px;line-height:1.4;border-radius:20px;text-align:center;' +
      'pointer-events:none;opacity:0;transition:opacity .2s ease, transform .2s ease;';
    document.body.appendChild(el);
  }
  el.textContent = text;
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(timer);
  timer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(10px)';
  }, duration);
}