/**
 * pages/staff.js — 工作人员登录页（web 版）
 *
 * 入口：`#/staff?code=staff2026`
 * - 前端只判断 code 是否为空，正确性由后端 staffLogin 校验
 * - 登录成功：token 由 api.js 自动写入 localStorage，本页补写
 *   user_role='staff' 与 auth_user，然后进入完整 App（#/map）
 */
import './staff.css';
import { staffLogin } from '../services/api.js';
import { wx } from '../adapter/wx.js';

const USER_ROLE_KEY = 'user_role';
const USER_KEY = 'auth_user';

function lsSet(key, val) {
  try {
    localStorage.setItem(key, String(val));
  } catch {}
}

class StaffPage {
  mount(container, query) {
    this.el = container;
    this.destroyed = false;
    this.code = (query && query.code) || '';

    if (!this.code) {
      container.innerHTML = '<div class="page staff-page"><div class="staff-msg">链接无效，请联系管理员</div></div>';
      return;
    }

    container.innerHTML = `
      <div class="page staff-page">
        <div class="card staff-login">
          <div class="staff-title">工作人员登录</div>
          <input class="staff-input" type="text" placeholder="请输入姓名" autocomplete="name" />
          <button class="btn-primary staff-submit" type="button">登录</button>
          <div class="staff-error"></div>
        </div>
      </div>`;

    this.input = container.querySelector('.staff-input');
    this.submit = container.querySelector('.staff-submit');
    this.error = container.querySelector('.staff-error');
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.doLogin();
    });
    this.submit.addEventListener('click', () => this.doLogin());
    this.input.focus();
  }

  async doLogin() {
    const name = (this.input.value || '').trim();
    this.error.textContent = '';
    if (!name) {
      this.error.textContent = '请输入姓名';
      return;
    }
    this.submit.disabled = true;
    try {
      const data = await staffLogin(this.code, name);
      if (this.destroyed) return;
      lsSet(USER_ROLE_KEY, 'staff');
      if (data && data.user) lsSet(USER_KEY, JSON.stringify(data.user));
      wx.switchTab({ url: '#/map' });
    } catch (e) {
      if (this.destroyed) return;
      this.submit.disabled = false;
      if (e && e.code === 'AUTH_REQUIRED') this.error.textContent = '识别码或姓名错误，请确认后重试';
      else this.error.textContent = (e && e.message) || '网络异常，请稍后重试';
    }
  }

  destroy() {
    this.destroyed = true;
    this.el.innerHTML = '';
  }
}

export default { title: '工作人员登录', mount: (c, q) => new StaffPage().mount(c, q) };