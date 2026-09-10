/**
 * pages/events.js — 活动列表（web 版，只读）
 */
import './events.css';
import { wx } from '../adapter/wx.js';
import { state } from '../state.js';
import * as eventSvc from '../services/event.js';
import { formatTime } from '../utils/format.js';

const FILTERS = [
  { code: '', name: '全部' },
  { code: 'stage_show', name: '舞台' },
  { code: 'npc', name: '隐藏任务' },
  { code: 'reward', name: '兑奖点' },
];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

class EventsPage {
  mount(container) {
    this.el = container;
    this.activeFilter = '';
    container.innerHTML = `
      <div class="page events-page">
        <div class="filter-bar"></div>
        <div class="timeline stagger"></div>
      </div>`;
    this.filterBar = container.querySelector('.filter-bar');
    this.timeline = container.querySelector('.timeline');
    this.renderFilters();
    this.loadEvents();
  }

  renderFilters() {
    this.filterBar.innerHTML = '';
    FILTERS.forEach((f) => {
      const item = document.createElement('span');
      item.className = 'filter-item' + (f.code === this.activeFilter ? ' active' : '');
      item.textContent = f.name;
      item.addEventListener('click', () => {
        if (f.code === this.activeFilter) return;
        this.activeFilter = f.code;
        this.renderFilters();
        this.loadEvents();
      });
      this.filterBar.appendChild(item);
    });
  }

  async loadEvents() {
    const { list } = await eventSvc.getEvents({ type: this.activeFilter });
    this.render(list);
  }

  render(events) {
    this.timeline.innerHTML = '';
    events.forEach((evt, index) => {
      const isStage = evt.type === 'stage_show';
      const typeLabel = isStage ? '舞台' : evt.type === 'npc' ? 'NPC' : '兑奖';
      const card = document.createElement('div');
      card.className = 'event-card card';
      card.style.setProperty('--i', Math.min(index, 8));
      card.innerHTML = `
        <div class="time-col">
          <div class="time">${isStage ? escapeHtml(formatTime(evt.startTime)) : '全天'}</div>
          <div class="type-tag type-${escapeHtml(evt.type)}">${typeLabel}</div>
        </div>
        <div class="content">
          <div class="title">${escapeHtml(evt.title)}</div>
          <div class="meta">${escapeHtml(evt.location)} ｜ ${escapeHtml(evt.startTime)}</div>
          <div class="desc">${escapeHtml(evt.desc)}</div>
          ${isStage ? '<div class="action">去现场</div>' : ''}
        </div>`;
      card.addEventListener('click', () => {
        wx.navigateTo({ url: `#/event-detail?id=${evt.id}` });
      });
      const action = card.querySelector('.action');
      if (action) {
        action.addEventListener('click', (e) => {
          e.stopPropagation();
          state.highlightCenter = { mapX: Number(evt.mapX) || 10, mapY: Number(evt.mapY) || 8, plaza: true };
          wx.switchTab({ url: '#/map' });
        });
      }
      this.timeline.appendChild(card);
    });
    if (!events.length) {
      this.timeline.innerHTML = '<div class="empty">暂无活动</div>';
    }
  }

  destroy() {
    this.el.innerHTML = '';
  }
}

export default { title: '活动', mount: (c) => new EventsPage().mount(c) };
