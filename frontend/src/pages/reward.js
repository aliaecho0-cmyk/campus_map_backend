/**
 * pages/reward.js — 奖励页（web 版，只读 + 首签领取）
 *
 * 徽章进度：GET /api/me/reward
 * 活动倒计时：getEventEndAt()
 * 实时进度：订阅 boothView.setOnProgressChanged
 */
import './reward.css';
import { getRewardStatus, getClaimToken } from '../services/api.js';
import { getEventEndAt } from '../services/auth.js';
import { setOnProgressChanged } from '../services/boothView.js';
import QRCode from 'qrcode';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatCountdown(endAtIso) {
  const end = Date.parse(endAtIso);
  if (!Number.isFinite(end)) return '';

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  let ms = end - SIX_HOURS - Date.now();

  if (ms <= 0) return '活动已结束';
  const days = Math.floor(ms / 86400000);
  ms -= days * 86400000;
  const hours = Math.floor(ms / 3600000);
  ms -= hours * 3600000;
  const mins = Math.floor(ms / 60000);
  return `距离活动结束还有 ${days} 天 ${hours} 小时 ${mins} 分`;
}

/** claimStatus → 文案 */
const CLAIM_LABEL = { none: '可领取', active: '已首签', redeemed: '已核销', expired: '活动已结束' };

class RewardPage {
  mount(container) {
    this.el = container;
    this.destroyed = false;
    this.badge = null;
    this.reward = null;
    this.eventEndAt = getEventEndAt();
    container.innerHTML = `
      <div class="page reward-page">
        <div class="countdown-box"></div>
        <section class="card reward-card">
          <div class="card-title">徽章进度</div>
          <div class="badge-body"></div>
        </section>
        <section class="card reward-card">
          <div class="card-title">奖励领取</div>
          <div class="claim-body"></div>
        </section>
      </div>`;

    setOnProgressChanged(() => this.refresh());
    this.updateCountdown();
    if (this.eventEndAt) this.timer = setInterval(() => this.updateCountdown(), 30000);
    this.refresh();
  }

  updateCountdown() {
    if (this.destroyed) return;
    const box = this.el.querySelector('.countdown-box');
    if (!box) return;
    box.textContent = formatCountdown(this.eventEndAt) || '活动时间待定';
  }

  async refresh() {
    let err = null;
    let data = null;
    try {
      data = await getRewardStatus();
    } catch (e) {
      err = e;
    }
    if (this.destroyed) return;
    if (data) {
      this.badge = data.badge || null;
      this.reward = data.reward || null;
      this.eventEndAt = data.eventEndAt || this.eventEndAt;
    } else {
      this.badge = null;
      this.reward = null;
    }
    this.renderBadge(err);
    this.renderClaim(err);
    this.updateCountdown();
  }

  renderBadge(err) {
    if (this.destroyed) return;
    const body = this.el.querySelector('.badge-body');
    if (!body) return;
    const b = this.badge;
    if (err || !b) {
      const msg = err ? (err && err.message) || '网络异常，请稍后重试' : '加载中…';
      body.innerHTML = `<div class="reward-empty">${escapeHtml(msg)}</div>`;
      return;
    }
    const required = b.requiredUniqueBooths || 0;
    const count = b.uniqueBoothCount || 0;
    const pct = required > 0 ? Math.min(100, Math.round((count / required) * 100)) : 0;
    const status = b.unlocked
      ? '<span class="badge-status ok">已解锁</span>'
      : `<span class="badge-status">${escapeHtml(b.name || '徽章')}</span>`;
    body.innerHTML = `
      <div class="badge-name">${escapeHtml(b.name || '徽章')} ${status}</div>
      <div class="badge-count">已浏览 ${count} / ${required} 个摊位</div>
      <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>`;
  }

  renderClaim(err) {
    if (this.destroyed) return;
    const body = this.el.querySelector('.claim-body');
    if (!body) return;
    if (err) {
      body.innerHTML = `<div class="reward-empty">${escapeHtml((err && err.message) || '网络异常，请稍后重试')}</div>`;
      return;
    }
    const b = this.badge;
    if (!b) {
      body.innerHTML = '<div class="reward-empty">加载中…</div>';
      return;
    }
    if (!b.unlocked) {
      body.innerHTML = '<div class="reward-empty">继续浏览摊位，集满进度后可领取奖励</div>';
      return;
    }
    const r = this.reward;
    const status = r ? r.claimStatus : 'none';
    if (status === 'none') {
      body.innerHTML = `
        <button class="btn-primary claim-btn" type="button">可领取</button>
        <div class="claim-hint">已解锁，点击领取你的奖励券</div>`;
      body.querySelector('.claim-btn').addEventListener('click', () => this.onClaim());
    } else if (status === 'active') {
      const token = (r && r.claimToken) || '';
      body.innerHTML = `
        <div class="voucher">
          <div class="voucher-label">奖励券</div>
          <div class="voucher-qr"><img class="qr-img" alt="领取码二维码" /></div>
          <div class="voucher-code">${escapeHtml(token)}</div>
          <div class="voucher-note">出示本券由工作人员核销</div>
        </div>`;
      this.renderQr(body.querySelector('.qr-img'), token);
    } else {
      body.innerHTML = `<div class="claim-state">${CLAIM_LABEL[status] || status}</div>`;
    }
  }

  async onClaim() {
    const btn = this.el.querySelector('.claim-btn');
    if (btn) btn.disabled = true;
    let err = null;
    let data = null;
    try {
      data = await getClaimToken();
    } catch (e) {
      err = e;
    }
    if (this.destroyed) return;
    if (data) {
      this.reward = {
        ...(this.reward || {}),
        claimStatus: data.claimStatus,
        claimToken: data.claimToken,
      };
      this.badge = { ...(this.badge || {}), unlocked: true };
    }
    this.renderClaim(err);
  }

  async renderQr(imgEl, token) {
    if (!imgEl || !token) return;
    try {
      const url = await QRCode.toDataURL(token, { width: 200, margin: 2 });
      if (!this.destroyed && imgEl.isConnected) imgEl.src = url;
    } catch (e) {
      console.warn('[reward] 二维码生成失败', e);
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) clearInterval(this.timer);
    setOnProgressChanged(null);
    this.el.innerHTML = '';
  }
}

export default { title: '奖励', mount: (c) => new RewardPage().mount(c) };