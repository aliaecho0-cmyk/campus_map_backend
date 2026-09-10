/**
 * pages/staff-redeem.js — 扫码核销页（web 版，仅工作人员）
 *
 * - 路由：#/staff/redeem
 * - 只有 localStorage.user_role === 'staff' 可访问；否则提示无权并跳回主页
 * - 用 html5-qrcode 扫码，扫到 claimToken 自动调 redeemClaimToken
 * - 核销成功后 3 秒自动恢复扫码状态；页面销毁时停止摄像头
 */
import './staff.css';
import { Html5Qrcode } from 'html5-qrcode';
import { redeemClaimToken } from '../services/api.js';

const USER_ROLE_KEY = 'user_role';
const USER_KEY = 'auth_user';
const RESTART_MS = 3000;

function lsGet(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function isStaffRole() {
  return lsGet(USER_ROLE_KEY) === 'staff';
}

function staffName() {
  try {
    const u = JSON.parse(lsGet(USER_KEY));
    return u ? (u.name || u.id || '') : '';
  } catch {
    return '';
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

class StaffRedeemPage {
  mount(container) {
    this.el = container;
    this.destroyed = false;
    this.scanner = null;
    this.busy = false;
    this.timer = null;

    if (!isStaffRole()) {
      container.innerHTML = '<div class="page staff-page"><div class="staff-msg">无权访问，即将返回主页</div></div>';
      this.timer = setTimeout(() => {
        if (!this.destroyed) location.hash = '#/map';
      }, 1200);
      return;
    }

    container.innerHTML = `
      <div class="page staff-redeem">
        <div class="redeem-staff">工作人员：${escapeHtml(staffName() || '—')}</div>
        <div class="redeem-scan"><div id="qr-reader"></div></div>
        <div class="redeem-result"></div>
      </div>`;

    this.result = container.querySelector('.redeem-result');
    this.startScanner();
  }

  async startScanner() {
    if (this.destroyed) return;
    if (!this.scanner) {
      if (!this.el.querySelector('#qr-reader')) return;
      this.scanner = new Html5Qrcode('qr-reader');
    }
    try {
      await this.scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => this.onScan(text),
        () => {}
      );
    } catch (e) {
      if (this.destroyed) return;
      this.showResult('无法启动摄像头，请检查权限或使用 HTTPS/localhost', false);
    }
  }

  /** 扫到 claimToken → 停止解码 → 核销 → 3 秒后恢复 */
  async onScan(token) {
    if (this.destroyed || this.busy) return;
    this.busy = true;
    try {
      if (this.scanner) this.scanner.pause();
    } catch {}
    this.showResult('核销中…');
    try {
      await redeemClaimToken(String(token).trim());
      if (this.destroyed) return;
      this.showResult('核销成功', true);
    } catch (e) {
      if (this.destroyed) return;
      this.showResult((e && e.message) || '核销失败，请重试', false);
    }
    this.busy = false;
    this.timer = setTimeout(() => {
      if (this.destroyed) return;
      this.showResult('');
      try {
        if (this.scanner) this.scanner.resume();
        else this.startScanner();
      } catch {
        this.startScanner();
      }
    }, RESTART_MS);
  }

  showResult(text, ok) {
    if (this.destroyed || !this.result) return;
    this.result.textContent = text;
    this.result.classList.toggle('ok', ok === true);
    this.result.classList.toggle('err', ok === false);
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.scanner) {
      const sc = this.scanner;
      this.scanner = null;
      Promise.resolve(sc.stop())
        .then(() => {
          try {
            sc.clear();
          } catch {}
        })
        .catch(() => {});
    }
    this.el.innerHTML = '';
  }
}

export default { title: '扫码核销', mount: (c) => new StaffRedeemPage().mount(c) };