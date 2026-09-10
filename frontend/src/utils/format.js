/** utils/format.js — 展示格式化（web 版，去徽章进度文案） */

const formatTime = (t) => {
  if (!t) return '';
  const d = t instanceof Date ? t : new Date(t.replace(/-/g, '/'));
  const p = (n) => (n < 10 ? `0${n}` : n);
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

const formatDateTime = (t) => {
  if (!t) return '';
  const d = t instanceof Date ? t : new Date(t.replace(/-/g, '/'));
  const p = (n) => (n < 10 ? `0${n}` : n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export { formatTime, formatDateTime };
