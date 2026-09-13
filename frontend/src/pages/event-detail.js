/**
 * pages/event-detail.js — 活动详情（web 版，只读）
 */
import './event-detail.css';
import { wx } from '../adapter/wx.js';
import { state } from '../state.js';
import * as eventSvc from '../services/event.js';
import { formatDateTime } from '../utils/format.js';
import { localizeEvent, t } from '../i18n.js';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

class EventDetailPage {
  mount(container, query) {
    this.el = container;
    this.eventId = query.id;
    container.innerHTML = `<div class="page event-detail-page"><div class="empty">${t('loading')}<span class="px-spin"></span></div></div>`;
    this.load();
  }

  async load() {
    const sourceEvent = await eventSvc.getEventDetail(this.eventId);
    if (!sourceEvent) {
      this.el.innerHTML = `<div class="page event-detail-page"><div class="empty">${t('eventMissing')}</div></div>`;
      return;
    }
    const evt = localizeEvent(sourceEvent);
    const typeText = evt.type === 'stage_show' ? t('stageShow') : evt.type === 'npc' ? t('hiddenQuest') : evt.type === 'reward' ? t('prizePoint') : evt.type === 'club_event' ? t('clubEvent') : t('event');
    this.el.innerHTML = `
      <div class="page event-detail-page">
        <div class="head ${escapeHtml(evt.type)}">
          <div class="type">${escapeHtml(typeText)}</div>
          <div class="title">${escapeHtml(evt.title)}</div>
          <div class="time">${escapeHtml(evt.startTime)} ～ ${escapeHtml(evt.endTime)}</div>
        </div>
        <div class="card">
          <div class="row"><span class="label">${t('location')}</span><span class="value">${escapeHtml(evt.location)}</span></div>
          <div class="row"><span class="label">${t('time')}</span><span class="value">${escapeHtml(formatDateTime(evt.startTime))} ${t('starts')}</span></div>
        </div>
        <div class="card">
          <div class="section-title">${t('eventIntro')}</div>
          <div class="desc">${escapeHtml(evt.desc)}</div>
        </div>
        <button class="btn-primary go-btn">${t('goThere')}</button>
      </div>`;

    this.el.querySelector('.go-btn').addEventListener('click', () => this.onGoScene(evt));
  }

  onGoScene(evt) {
    if (evt.lat && evt.lng) {
      state.highlightCenter = { latitude: evt.lat, longitude: evt.lng, name: evt.title };
    } else if (evt.type === 'npc') {
      state.highlightCenter = { resetView: true };
    } else if (evt.type === 'reward') {
      state.highlightCenter = { thanks: true };
    } else {
      state.highlightCenter = { mapX: Number(evt.mapX) || 10, mapY: Number(evt.mapY) || 8, plaza: true };
    }
    wx.switchTab({ url: '#/map' });
  }

  destroy() {
    this.el.innerHTML = '';
  }
}

export default { title: () => t('eventDetails'), mount: (c, q) => new EventDetailPage().mount(c, q) };
