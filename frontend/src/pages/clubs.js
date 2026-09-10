/**
 * pages/clubs.js — 社团列表（web 版，只读）
 */
import './clubs.css';
import { wx } from '../adapter/wx.js';
import { state } from '../state.js';
import * as clubSvc from '../services/club.js';
import { buildMatch } from '../utils/search.js';

const CAT_KEY_MAP = { 学术: 'academic', 艺术: 'art', 体育: 'sport', 科技: 'tech', 志愿: 'volunteer' };
const STATUS_TEXT = { open: '营业中', break: '休息中', closed: '已收摊' };

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function nameHtml(name, segs) {
  if (segs) return segs.map((s) => (s.hl ? `<span class="hl">${escapeHtml(s.text)}</span>` : escapeHtml(s.text))).join('');
  return escapeHtml(name);
}

class ClubsPage {
  mount(container) {
    this.el = container;
    this.activeCategory = '全部';
    this.keyword = '';
    this.allClubs = [];
    container.innerHTML = `
      <div class="page clubs-page">
        <div class="search-bar">
          <div class="search-field">
            <input class="search-input" placeholder="搜索社团名称" />
            <span class="search-clear" style="display:none">×</span>
          </div>
          <span class="search-btn">搜索</span>
        </div>
        <div class="cat-bar"></div>
        <div class="count"></div>
        <div class="list stagger"></div>
      </div>`;

    this.searchInput = container.querySelector('.search-input');
    this.searchClear = container.querySelector('.search-clear');
    this.catBar = container.querySelector('.cat-bar');
    this.count = container.querySelector('.count');
    this.list = container.querySelector('.list');

    this.renderCategories();
    this.searchInput.addEventListener('input', () => {
      this.keyword = this.searchInput.value;
      this.searchClear.style.display = this.keyword ? '' : 'none';
      this.applyFilter();
    });
    this.searchClear.addEventListener('click', () => {
      this.keyword = '';
      this.searchInput.value = '';
      this.searchClear.style.display = 'none';
      this.applyFilter();
    });
    container.querySelector('.search-btn').addEventListener('click', () => this.applyFilter());

    this.loadClubs();
  }

  renderCategories() {
    this.catBar.innerHTML = '';
    clubSvc.CATEGORIES.forEach((cat) => {
      const item = document.createElement('span');
      item.className = 'cat-item' + (cat === this.activeCategory ? ' active' : '');
      item.textContent = cat;
      item.addEventListener('click', () => {
        if (cat === this.activeCategory) return;
        this.activeCategory = cat;
        this.renderCategories();
        this.loadClubs();
      });
      this.catBar.appendChild(item);
    });
  }

  async loadClubs() {
    const { list } = await clubSvc.getClubs({
      category: this.activeCategory === '全部' ? '' : this.activeCategory,
      keyword: '',
      page: 1,
      pageSize: 999,
    });
    this.allClubs = list;
    this.applyFilter();
  }

  applyFilter() {
    const kw = this.keyword.trim();
    let results;
    if (!kw) {
      results = this.allClubs;
    } else {
      results = [];
      for (const c of this.allClubs) {
        const m = buildMatch(kw, c.name);
        if (m.matched) results.push({ ...c, nameSegments: m.segs, _score: m.score });
      }
      results.sort((a, b) => b._score - a._score);
    }
    this.count.textContent = `共 ${results.length} 个社团`;
    this.renderList(results);
  }

  renderList(clubs) {
    this.list.innerHTML = '';
    clubs.forEach((club, index) => {
      const catKey = CAT_KEY_MAP[club.category] || 'default';
      const card = document.createElement('div');
      card.className = 'club-card';
      card.style.setProperty('--i', Math.min(index, 12));
      card.innerHTML = `
        <div class="logo cat-${catKey}">${club.logo
          ? `<img class="logo-img" src="${escapeHtml(club.logo)}" alt="${escapeHtml(club.name)}" loading="lazy" />`
          : escapeHtml(club.name ? club.name[0] : '社')}</div>
        <div class="main">
          <div class="row1">
            <span class="name">${nameHtml(club.name, club.nameSegments)}</span>
            <span class="tag cat-${catKey}">${escapeHtml(club.category)}</span>
          </div>
          <div class="row2">${escapeHtml(club.slogan || club.intro || '暂无简介')}</div>
          <div class="row3">
            ${club.boothId ? `<span class="booth">摊位 ${escapeHtml(club.boothId)}</span>` : ''}
            ${club.status ? `<span class="status-line"><span class="status-dot ${escapeHtml(club.status)}"></span><span class="status-text">${STATUS_TEXT[club.status] || ''}</span></span>` : ''}
            <span class="map-link">在地图查看</span>
          </div>
        </div>`;
      card.addEventListener('click', () => {
        wx.navigateTo({ url: `#/club-detail?clubId=${club.id}` });
      });
      card.querySelector('.map-link').addEventListener('click', (e) => {
        e.stopPropagation();
        state.highlightBoothId = club.boothId;
        wx.switchTab({ url: '#/map' });
      });
      this.list.appendChild(card);
    });
    if (!clubs.length) {
      this.list.innerHTML = '<div class="empty">暂无社团，换个分类或关键词试试</div>';
    }
  }

  destroy() {
    this.el.innerHTML = '';
  }
}

export default { title: '社团', mount: (c) => new ClubsPage().mount(c) };
