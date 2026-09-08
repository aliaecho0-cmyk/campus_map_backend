/**
 * pages/event-detail.js — 活动详情（web 版，只读）
 */
import './event-detail.css';
import { wx } from '../adapter/wx.js';
import { state } from '../state.js';
import * as eventSvc from '../services/event.js';
import { formatDateTime } from '../utils/format.js';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

class EventDetailPage {
  mount(container, query) {
    this.el = container;
    this.eventId = query.id;
    container.innerHTML = '<div class="page event-detail-page"><div class="empty">加载中…</div></div>';
    this.load();
  }

  async load() {
    const evt = await eventSvc.getEventDetail(this.eventId);
    if (!evt) {
      this.el.innerHTML = '<div class="page event-detail-page"><div class="empty">活动不存在</div></div>';
      return;
    }
    const typeText = eventSvc.TYPE_TEXT[evt.type] || '活动';
    this.el.innerHTML = `
      <div class="page event-detail-page">
        <div class="head ${escapeHtml(evt.type)}">
          <div class="type">${escapeHtml(typeText)}</div>
          <div class="title">${escapeHtml(evt.title)}</div>
          <div class="time">${escapeHtml(evt.startTime)} ～ ${escapeHtml(evt.endTime)}</div>
        </div>
        <div class="card">
          <div class="row"><span class="label">地点</span><span class="value">${escapeHtml(evt.location)}</span></div>
          <div class="row"><span class="label">时间</span><span class="value">${escapeHtml(formatDateTime(evt.startTime))} 开始</span></div>
        </div>
        <div class="card">
          <div class="section-title">活动介绍</div>
          <div class="desc">${escapeHtml(evt.desc)}</div>
        </div>
        <button class="btn-primary go-btn">去现场（地图导航）</button>
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

export default { title: '活动详情', mount: (c, q) => new EventDetailPage().mount(c, q) };
