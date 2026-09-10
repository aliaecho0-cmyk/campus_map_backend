/**
 * pages/club-detail.js — 社团详情（web 版，只读）
 */
import './club-detail.css';
import { wx } from '../adapter/wx.js';
import { state } from '../state.js';
import * as clubSvc from '../services/club.js';
import { recordViewAfterDelay } from '../services/boothView.js';

const CAT_KEY_MAP = { 学术: 'academic', 艺术: 'art', 体育: 'sport', 科技: 'tech', 志愿: 'volunteer' };
const STATUS_TEXT = { open: '营业中', break: '休息中', closed: '已收摊' };

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

class ClubDetailPage {
  mount(container, query) {
    this.el = container;
    this.clubId = query.clubId;
    container.innerHTML = '<div class="page club-detail-page"><div class="empty">加载中<span class="px-spin"></span></div></div>';
    this.load();
  }

  async load() {
    const club = await clubSvc.getClubDetail(this.clubId);
    if (!club) {
      this.el.innerHTML = '<div class="page club-detail-page"><div class="empty">社团不存在</div></div>';
      return;
    }
    const boothId = club.boothId || (club.booth && club.booth.id) || '';
    if (boothId) {
      this._cancelView = recordViewAfterDelay(boothId);
    }
    const catKey = CAT_KEY_MAP[club.category] || 'default';
    const booth = club.booth || {};
    const intro = booth.intro || club.intro || club.slogan || '暂无简介';
    const rules = booth.gameRules || '';

    this.el.innerHTML = `
      <div class="page club-detail-page">
        <div class="hero">
          <div class="logo cat-${catKey}">${club.logo
            ? `<img class="logo-img" src="${escapeHtml(club.logo)}" alt="${escapeHtml(club.name)}" />`
            : escapeHtml(club.name ? club.name[0] : '社')}</div>
          <div class="hero-main">
            <div class="name">${escapeHtml(club.name)}</div>
            <div class="tags">
              <span class="tag cat-${catKey}">${escapeHtml(club.category)}</span>
              ${club.boothId ? `<span class="tag tag-blue">摊位 ${escapeHtml(club.boothId)}</span>` : ''}
              ${club.status ? `<span class="status-line"><span class="status-dot ${escapeHtml(club.status)}"></span><span class="status-text">${STATUS_TEXT[club.status] || ''}</span></span>` : ''}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="section-title">社团简介</div>
          <div class="intro-text">${escapeHtml(intro)}</div>
          ${rules ? `<div class="rules-block"><div class="section-title rules-title">游戏规则</div><div class="intro-text">${escapeHtml(rules)}</div></div>` : ''}
        </div>

        ${booth.id ? `
        <div class="card">
          <div class="section-title">摊位位置</div>
          <div class="booth-row">
            <div class="booth-id">摊位号 ${escapeHtml(booth.id)}</div>
            <button class="btn-primary map-btn">地图查看</button>
          </div>
        </div>` : ''}
      </div>`;

    const mapBtn = this.el.querySelector('.map-btn');
    if (mapBtn) {
      mapBtn.addEventListener('click', () => {
        state.highlightBoothId = club.boothId;
        wx.switchTab({ url: '#/map' });
      });
    }
  }

  destroy() {
    if (this._cancelView) {
      this._cancelView();
      this._cancelView = null;
    }
    this.el.innerHTML = '';
  }
}

export default {
  title: '社团详情',
  mount(c, q) {
    const page = new ClubDetailPage();
    page.mount(c, q);
    return page;
  },
};
