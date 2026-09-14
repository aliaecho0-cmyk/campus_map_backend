/**
 * pages/club-detail.js — 社团详情（web 版，只读）
 */
import './club-detail.css';
import { wx } from '../adapter/wx.js';
import { state } from '../state.js';
import * as clubSvc from '../services/club.js';
import { startViewSession } from '../services/boothView.js';
import { isEnglish, localizeBooth, localizeClub, statusText, t } from '../i18n.js';

const CAT_KEY_MAP = {
  实践体验类: 'tech', 学术科技类: 'academic', 体育运动类: 'sport', 文化艺术类: 'art', 学生组织: 'volunteer',
  'Practical Experience Clubs': 'tech', 'Academic & Science-Technology Clubs': 'academic',
  'Sports Clubs': 'sport', 'Culture & Art Clubs': 'art', 'Student Organizations': 'volunteer',
};

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

class ClubDetailPage {
  mount(container, query) {
    this.el = container;
    this.clubId = query.clubId;
    this._destroyed = false;
    this._pageVisible = false;
    container.innerHTML = `<div class="page club-detail-page"><div class="empty">${t('loading')}<span class="px-spin"></span></div></div>`;
    this.load();
  }

  async load() {
    const sourceClub = await clubSvc.getClubDetail(this.clubId);
    if (this._destroyed) return;
    if (!sourceClub) {
      this.el.innerHTML = `<div class="page club-detail-page"><div class="empty">${t('clubMissing')}</div></div>`;
      return;
    }
    const isStudentOrganization = sourceClub.category === '学生组织';
    wx.setNavigationBarTitle({
      title: t(isStudentOrganization ? 'studentOrganizationDetails' : 'clubDetails'),
    });
    const club = { ...localizeClub(sourceClub), booth: sourceClub.booth ? localizeBooth(sourceClub.booth) : null };
    const boothId = club.boothId || (club.booth && club.booth.id) || '';
    this._boothId = String(boothId);
    const catKey = CAT_KEY_MAP[club.category] || 'default';
    const booth = club.booth || {};
    const intro = booth.intro || club.intro || club.slogan || t('noDescription');
    const rules = booth.gameRules || '';
    const email = booth.email || club.email || '';

    this.el.innerHTML = `
      <div class="page club-detail-page">
        <div class="hero">
          <div class="logo cat-${catKey}">${club.logo
            ? `<img class="logo-img" src="${escapeHtml(club.logo)}" alt="${escapeHtml(club.name)}" />`
            : escapeHtml(club.name ? club.name[0] : (isEnglish() ? 'C' : '社'))}</div>
          <div class="hero-main">
            <div class="name">${escapeHtml(club.name)}</div>
            <div class="tags">
              <span class="tag cat-${catKey}">${escapeHtml(club.category)}</span>
              ${club.boothId ? `<span class="tag tag-blue">${t('booth', { id: escapeHtml(club.boothId) })}</span>` : ''}
              ${club.status ? `<span class="status-line"><span class="status-dot ${escapeHtml(club.status)}"></span><span class="status-text">${statusText(club.status)}</span></span>` : ''}
            </div>
          </div>
        </div>

        <div class="card">
            <div class="section-title">${t(isStudentOrganization ? 'studentOrganizationProfile' : 'clubProfile')}</div>
          <div class="intro-text">${escapeHtml(intro)}</div>
          ${isStudentOrganization ? '' : `<div class="email-block">
            <div class="section-title rules-title">${t('clubEmail')}</div>
            ${email
              ? `<a class="email-text" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
              : `<div class="email-text is-missing">${t('notProvided')}</div>`}
          </div>`}
          <div class="rules-block"><div class="section-title rules-title">${t('gameRules')}</div><div class="intro-text">${escapeHtml(rules || t('notProvided'))}</div></div>
        </div>

        ${booth.id ? `
        <div class="card">
          <div class="section-title">${t('boothLocation')}</div>
          <div class="booth-row">
            <div class="booth-id">${t('boothNumber', { id: escapeHtml(booth.id) })}</div>
            <button class="btn-primary map-btn">${t('mapView')}</button>
          </div>
        </div>` : ''}
      </div>`;

    if (this._pageVisible && this._boothId) this._startViewSession();

    const mapBtn = this.el.querySelector('.map-btn');
    if (mapBtn) {
      mapBtn.addEventListener('click', () => {
        if (this._viewSession) {
          this._viewSession.pause();
          state.boothViewHandoff = { boothId: this._boothId, session: this._viewSession };
        }
        state.highlightBoothId = this._boothId;
        wx.switchTab({ url: '#/map' });
      });
    }
  }

  onPageVisible() {
    this._pageVisible = true;
    if (this._boothId) this._startViewSession();
  }

  _startViewSession() {
    if (this._destroyed || this._viewSession) return;
    this._viewSession = startViewSession(this._boothId);
    this._viewSession.resume();
  }

  destroy() {
    this._destroyed = true;
    if (this._viewSession && state.boothViewHandoff?.session !== this._viewSession) {
      this._viewSession.cancel();
    }
    this.el.innerHTML = '';
  }
}

export default {
  title: () => t('clubDetails'),
  mount(c, q) {
    const page = new ClubDetailPage();
    page.mount(c, q);
    return page;
  },
};
