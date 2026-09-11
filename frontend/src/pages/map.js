/**
 * pages/map.js — 艺术化导览图（首页，web 版）
 * 纯浏览：仅地图展示 + 搜索/公告/气泡/新手指引（无定位/收藏）。
 */
import './map.css';
import { wx } from '../adapter/wx.js';
import { state } from '../state.js';
import * as boothSvc from '../services/booth.js';
import * as annSvc from '../services/announcement.js';
import * as canvasMap from '../utils/canvas-map.js';
import { buildMatch } from '../utils/search.js';
import { CustomMap } from '../components/custom-map.js';
import { startViewSession } from '../services/boothView.js';
import * as tut from './map/tutorial-steps.js';

const CAT_KEY_MAP = {
  学术: 'academic',
  艺术: 'art',
  体育: 'sport',
  科技: 'tech',
  志愿: 'volunteer',
};

const STATUS_TEXT = { open: '营业中', break: '休息中', closed: '已收摊' };

/** 聚焦某个摊位时的缩放：约 6 格可见 */
const FOCUS_SCALE = 1.9;

function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

class MapPage {
  mount(container) {
    this.el = container;
    container.innerHTML = `
      <div class="page map-page">
        <div class="search-bar">
          <div class="search-field">
            <span class="search-icon">⌕</span>
            <input class="search-input" placeholder="搜索社团" />
            <span class="search-clear" style="display:none">×</span>
          </div>
        </div>
        <div class="search-overlay" style="display:none">
          <div class="search-mask"></div>
          <div class="search-panel"></div>
        </div>
        <div class="ann-list"></div>
        <div class="map-wrap">
          <div class="custom-map"><canvas class="map-canvas"></canvas></div>
          <div class="map-legend">
            <div class="legend-item"><span class="dot booth"></span>社团摊位</div>
            <div class="legend-item"><span class="dot landscape"></span>草坪 / 广场</div>
            <div class="legend-item"><span class="dot activity"></span>石板路</div>
          </div>
          <div class="club-callout" id="clubCallout" style="display:none">
            <div class="cc-close">×</div>
            <div class="cc-head"><span class="cc-name"></span><span class="cc-badge"></span></div>
            <div class="cc-sub"></div>
            <div class="cc-section"><span class="cc-label">社团介绍</span><span class="cc-text cc-intro"></span></div>
            <div class="cc-section"><span class="cc-label">游戏规则</span><span class="cc-text cc-rules"></span></div>
            <div class="cc-actions"><div class="cc-btn primary">查看详情</div></div>
          </div>
        </div>
      </div>`;

    this.searchInput = container.querySelector('.search-input');
    this.searchClear = container.querySelector('.search-clear');
    this.searchOverlay = container.querySelector('.search-overlay');
    this.searchMask = container.querySelector('.search-mask');
    this.searchPanel = container.querySelector('.search-panel');
    this.annList = container.querySelector('.ann-list');
    this.mapWrap = container.querySelector('.map-wrap');
    this.callout = container.querySelector('#clubCallout');

    // 自定义地图
    this.map = new CustomMap(container.querySelector('.custom-map'), {
      onBoothTap: (d) => this.onBoothTap(d),
      onBoothCancel: () => this.onBoothCancel(),
    });

    // 事件绑定
    this.searchInput.addEventListener('input', (e) => this.onKeywordInput(e.target.value));
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onSearchConfirm();
    });
    this.searchClear.addEventListener('click', () => this.onClearKeyword());
    this.searchMask.addEventListener('click', () => this.onSearchMaskTap());
    container.querySelector('.cc-close').addEventListener('click', () => this.onCalloutClose());
    container.querySelector('.cc-btn.primary').addEventListener('click', () => this.onCalloutDetail());

    this._pageVisible = false;
    this._destroyed = false;
    this._handoffReady = false;
    this._handoffSession = null;
    this._viewSession = null;
    // 教程运行时
    this._tutorialActive = false;
    this._exampleBoothId = tut.EXAMPLE_BOOTH_ID;
    this._exampleBooth = null;
    this._mapReadyTimer = null;
    this._plazaHlTimer = null;
    this._lastAdvance = 0;
    this._tutStepShown = false;
    this.allBooths = [];
    if (state.tutorial) {
      state.tutorial.setOnNext(() => this.onTutorialNext());
      state.tutorial.setOnSkip(() => this.onSkipTutorial());
    }

    // 占位符打字机（聚焦时暂停，减少动态时跳过）
    this._typeTimer = null;
    this._startPlaceholderTyping();

    this.loadData();
  }

  /* ---------- 占位符打字机 ---------- */
  _startPlaceholderTyping() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const PH = '搜索社团';
    let i = 0;
    let phase = 0; // 0 打字 / 1 停顿 / 2 退格
    const tick = () => {
      if (document.activeElement === this.searchInput) {
        // 聚焦时暂停，失焦后恢复
        this._typeTimer = setTimeout(tick, 400);
        return;
      }
      if (phase === 0) {
        i += 1;
        this.searchInput.placeholder = PH.slice(0, i);
        if (i >= PH.length) {
          phase = 1;
          this._typeTimer = setTimeout(tick, 1400);
        } else {
          this._typeTimer = setTimeout(tick, 90);
        }
      } else if (phase === 1) {
        phase = 2;
        this._typeTimer = setTimeout(tick, 200);
      } else {
        i -= 1;
        this.searchInput.placeholder = PH.slice(0, i);
        if (i <= 0) {
          phase = 0;
          this._typeTimer = setTimeout(tick, 700);
        } else {
          this._typeTimer = setTimeout(tick, 60);
        }
      }
    };
    this._typeTimer = setTimeout(tick, 600);
  }

  async loadData() {
    this.refreshBooths();
    this.loadAnnouncement();
    this.applyHighlight();
    this.maybeStartTutorial();
  }

  async refreshBooths() {
    try {
      const { list } = await boothSvc.getBooths({ area: 'ALL' });
      this.allBooths = list;
      this._exampleBooth = list.find((b) => b.id === this._exampleBoothId) || null;
      this.map.setBooths(list);
      this.highlightBoothId = state.highlightBoothId || '';
      state.highlightBoothId = '';
      const handoff = state.boothViewHandoff;
      const startViewBoothId = state.startBoothViewAfterMapFocus;
      state.startBoothViewAfterMapFocus = '';
      if (this.highlightBoothId) {
        const b = this.allBooths.find((x) => String(x.id) === String(this.highlightBoothId));
        if (handoff && (!b || String(b.id) !== String(handoff.boothId))) {
          handoff.session.cancel();
          state.boothViewHandoff = null;
        }
        if (b) {
          if (handoff && String(b.id) === String(handoff.boothId)) {
            this._handoffSession = handoff.session;
            state.boothViewHandoff = null;
            this.focusBooth(b, () => {
              this._handoffReady = true;
              this._resumeHandoffIfVisible();
            });
          } else if (String(b.id) === String(startViewBoothId)) {
            this.focusBooth(b, () => this._startViewSession(b.id));
          } else {
            this.focusBooth(b);
          }
        }
      } else if (handoff) {
        handoff.session.cancel();
        state.boothViewHandoff = null;
      }
    } catch (e) {
      if (state.boothViewHandoff) {
        state.boothViewHandoff.session.cancel();
        state.boothViewHandoff = null;
      }
      console.warn('refreshBooths', e);
    }
  }

  async loadAnnouncement() {
    try {
      const { list } = await annSvc.getAnnouncements();
      this.renderAnnouncements(list);
    } catch (e) {}
  }

  renderAnnouncements(list) {
    this.annList.innerHTML = '';
    list.forEach((a) => {
      const title = escapeHtml(a.title);
      const bar = h('div', 'ann-bar', `
        <span class="ann-tag">公告</span>
        <span class="ann-scroll"><span class="ann-track">
          <span class="ann-title">${title}</span>
          <span class="ann-title" aria-hidden="true">${title}</span>
        </span></span>
        <span class="ann-arrow">›</span>`);
      bar.addEventListener('click', () => {
        wx.showModal({ title: a.title, content: a.content, showCancel: false, confirmText: '知道了' });
      });
      this.annList.appendChild(bar);
      // 长标题跑马灯：自然宽超出可视区才开启，按溢出比映射 4-12s 时长
      const titleEl = bar.querySelector('.ann-title');
      const boxW = bar.querySelector('.ann-scroll').clientWidth;
      if (titleEl && boxW > 0 && titleEl.scrollWidth > boxW + 1) {
        bar.classList.add('marquee');
        bar.style.setProperty('--dur', Math.min(12, Math.max(4, (titleEl.scrollWidth / boxW) * 2.5)).toFixed(1) + 's');
      }
    });
  }

  moveToMapPos(mapX, mapY) {
    const c = this.map;
    if (!c || !Number.isFinite(mapX) || !Number.isFinite(mapY)) return;
    const rect = c.getRect();
    const center = { x: rect.width / 2, y: rect.height / 2 };
    const scale = Math.max(c._viewport.scale, 1);
    c.moveTo(center.x - mapX * canvasMap.CELL_PX * scale, center.y - mapY * canvasMap.CELL_PX * scale, scale);
  }

  /* ---------- 摊位气泡 ---------- */
  onBoothTap(d) {
    const booth = this.allBooths.find((b) => b.id === d.id);
    if (!booth) return;
    this.map.setHighlightedId(d.id);
    this.showCallout(booth, d.x, d.y);
    this._startViewSession(d.id);
  }

  showCallout(booth, x, y) {
    this.callout.querySelector('.cc-name').textContent = booth.clubName;
    const badge = this.callout.querySelector('.cc-badge');
    badge.textContent = booth.category;
    badge.className = 'cc-badge cat-' + (CAT_KEY_MAP[booth.category] || 'default');
    this.callout.querySelector('.cc-sub').textContent =
      `摊位 ${booth.id} · ${STATUS_TEXT[booth.status] || '营业中'}`;
    this.callout.querySelector('.cc-intro').textContent = booth.intro || '';
    this.callout.querySelector('.cc-rules').textContent = booth.gameRules || '';
    this.callout.style.display = '';

    const rect = this.map.getRect();
    const W = rect.width;
    const H = rect.height;
    const margin = 10;
    let left = x + 22;
    let top = y - this.callout.offsetHeight / 2;
    let tailSide = 'left';
    const w = this.callout.offsetWidth;
    const hgt = this.callout.offsetHeight;
    if (left + w > W - margin) {
      left = x - w - 22;
      tailSide = 'right';
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    if (top + hgt > H - margin) top = Math.max(margin, H - hgt - margin);
    this.callout.className = 'club-callout tail-' + tailSide + ' placed';
    this.callout.style.left = left + 'px';
    this.callout.style.top = top + 'px';
    this._currentBooth = booth;
    // 重触发弹出动画：摘下 pop 类强制重排再挂回（连续点击不同摊位也能重播）
    this.callout.classList.remove('pop');
    void this.callout.offsetWidth;
    this.callout.classList.add('pop');
  }

  onCalloutClose() {
    this._cancelViewSession();
    this.callout.style.display = 'none';
    this.map.setHighlightedId('');
  }

  onBoothCancel() {
    if (this.callout.style.display !== 'none') {
      this.callout.style.display = 'none';
      this.map.setHighlightedId('');
    }
    this._cancelViewSession();
  }

  onCalloutDetail() {
    this._cancelViewSession();
    this.callout.style.display = 'none';
    if (this._currentBooth) {
      wx.navigateTo({ url: `#/club-detail?clubId=${this._currentBooth.clubId}` });
    }
  }

  /* ---------- 搜索 ---------- */
  onKeywordInput(value) {
    this.searchClear.style.display = value ? '' : 'none';
    this._runSearch(value);
  }

  _runSearch(value) {
    const kw = (value || '').trim();
    if (!kw) {
      this.searchOverlay.style.display = 'none';
      this.searchPanel.innerHTML = '';
      return;
    }
    const results = [];
    for (const b of this.allBooths) {
      const m = buildMatch(kw, b.clubName);
      if (m.matched) results.push({ id: b.id, clubName: b.clubName, segs: m.segs, _score: m.score });
    }
    results.sort((a, b) => b._score - a._score);
    this._searchResults = results;
    this.searchOverlay.style.display = '';
    this.searchPanel.innerHTML = '';
    if (!results.length) {
      this.searchPanel.appendChild(h('div', 'sr-empty', '未找到匹配的社团'));
      return;
    }
    results.forEach((r) => {
      const nameHtml = r.segs.map((s) => (s.hl ? `<span class="sr-hl">${escapeHtml(s.text)}</span>` : escapeHtml(s.text))).join('');
      const item = h('div', 'sr-item', `<span class="sr-name">${nameHtml}</span><span class="sr-booth">摊位 ${r.id}</span>`);
      item.addEventListener('click', () => this.onSearchPick(r.id));
      this.searchPanel.appendChild(item);
    });
  }

  onSearchPick(id) {
    const booth = this.allBooths.find((b) => b.id === id);
    if (!booth) return;
    this.searchInput.value = '';
    this.searchClear.style.display = 'none';
    this.searchOverlay.style.display = 'none';
    this.searchPanel.innerHTML = '';
    this.map.setHighlightedId(id);
    const c = this.map;
    const point = c.getBoothMapPoint(id) || { x: booth.mapX, y: booth.mapY };
    c.focusMapPoint(point.x, point.y, FOCUS_SCALE).then(() => {
      const rect = c.getBoothLocalCenter(id);
      if (rect) this.showCallout(booth, rect.x, rect.y);
    });
    setTimeout(() => this.map.setHighlightedId(''), 4000);
  }

  onSearchMaskTap() {
    this.searchInput.value = '';
    this.searchClear.style.display = 'none';
    this.searchOverlay.style.display = 'none';
    this.searchPanel.innerHTML = '';
  }

  onSearchConfirm() {
    if (this.searchOverlay.style.display !== 'none' && this._searchResults && this._searchResults.length) {
      this.onSearchPick(this._searchResults[0].id);
    }
  }

  onClearKeyword() {
    this.searchInput.value = '';
    this.searchClear.style.display = 'none';
    this._runSearch('');
  }

  /* ---------- 跨页高亮 ---------- */
  applyHighlight() {
    const c = state.highlightCenter;
    if (c) {
      state.highlightCenter = null;
      if (c.resetView) {
        this.map.setHighlightRegion(null);
        this.map.fitView();
      } else {
        const region = c.plaza ? canvasMap.PLAZA_REGION : c.thanks ? canvasMap.THANKS_REGION : null;
        if (region) {
          this.map.setHighlightRegion(region);
          this.moveToMapPos(c.mapX != null ? c.mapX : region.x + region.w / 2, c.mapY != null ? c.mapY : region.y + region.h / 2);
          clearTimeout(this._plazaHlTimer);
          this._plazaHlTimer = setTimeout(() => this.map.setHighlightRegion(null), 6000);
        } else {
          const pos = canvasMap.latLngToMap(c.latitude, c.longitude);
          if (pos) this.moveToMapPos(pos.x, pos.y);
        }
      }
    }
  }

  focusBooth(b, onCalloutShown) {
    this.map.setHighlightedId(b.id);
    const c = this.map;
    const point = c.getBoothMapPoint(b.id) || { x: b.mapX, y: b.mapY };
    c.focusMapPoint(point.x, point.y, FOCUS_SCALE).then(() => {
      if (this._destroyed) return;
      const rect = c.getBoothLocalCenter(b.id);
      if (rect) this.showCallout(b, rect.x, rect.y);
      if (onCalloutShown) onCalloutShown();
    });
    setTimeout(() => this.map.setHighlightedId(''), 3000);
  }

  onPageVisible() {
    this._pageVisible = true;
    this._resumeHandoffIfVisible();
  }

  _resumeHandoffIfVisible() {
    if (this._handoffSession && this._handoffReady && this._pageVisible) {
      this._handoffSession.resume();
    }
  }

  /* ---------- 浏览埋点计时 ---------- */
  _startViewSession(boothId) {
    this._cancelViewSession();
    if (state.boothViewHandoff) {
      state.boothViewHandoff.session.cancel();
      state.boothViewHandoff = null;
    }
    this._viewSession = startViewSession(boothId);
    this._viewSession.resume();
  }

  _cancelViewSession() {
    if (this._viewSession) {
      this._viewSession.cancel();
      this._viewSession = null;
    }
    if (this._handoffSession) {
      this._handoffSession.cancel();
      this._handoffSession = null;
    }
  }

  /* ---------- 新手指引 ---------- */
  maybeStartTutorial() {
    if (state.tutorialLaunched) return;
    if (wx.getStorageSync(tut.TUTORIAL_KEY)) {
      state.tutorialLaunched = true;
      return;
    }
    if (!this.allBooths || !this.allBooths.length) {
      this._mapReadyTimer = setTimeout(() => this.maybeStartTutorial(), 200);
      return;
    }
    if (!this.map || !this.map.getRect() || !this.map._viewport) {
      this._mapReadyTimer = setTimeout(() => this.maybeStartTutorial(), 150);
      return;
    }
    state.tutorialLaunched = true;
    this._startTutorial();
  }

  _startTutorial() {
    this._tutorialActive = true;
    this._applyStep(0);
  }

  _applyStep(index) {
    if (!this._tutorialActive) return;
    const step = tut.STEPS[index];
    if (!step) {
      this._completeTutorial();
      return;
    }
    this._curStepIndex = index;
    this._curStep = step;
    const content = {
      stepNumber: index + 1,
      totalSteps: tut.STEPS.length,
      message: step.message,
      buttonText: step.button,
    };
    // 第一步：只显示暗色蒙层，等高亮算好再显示解释框（直接落在正确位置，一步到位）；
    // 后续步：只更新文案、解释框停在上一位置
    if (!this._tutStepShown) {
      state.tutorial.showMask();
    } else {
      state.tutorial.updateContent(content);
    }
    // 异步计算高亮区域（过期结果丢弃）
    this._computeHighlight(step)
      .then((rects) => {
        if (!this._tutorialActive || this._curStepIndex !== index) return;
        if (!this._tutStepShown) {
          // 第一步：高亮算好后一次性显示框 + 高亮，框直接出现在正确位置
          state.tutorial.show({ ...content, highlightRects: rects || [] });
          this._tutStepShown = true;
        } else {
          state.tutorial.updateRects(rects || []);
        }
      })
      .catch(() => {});
  }

  _computeHighlight(step) {
    const c = this.map;
    const tabIdx = { tabMap: 0, tabClub: 1, tabActivity: 2 }[step.target];
    if (tabIdx !== undefined) {
      const rects = state.tabbar ? state.tabbar.getButtonRects() : [];
      const r = rects[tabIdx];
      if (r) return Promise.resolve([{ left: r.left, top: r.top, width: r.width, height: r.height, shape: 'round', rx: 12 }]);
      return Promise.resolve([]);
    }
    switch (step.target) {
      case 'socialUnion': {
        if (!c) return Promise.resolve([]);
        return c.focusMapPoint(tut.SOCIAL_UNION.mapX, tut.SOCIAL_UNION.mapY, 1.15).then(
          () =>
            new Promise((res) => {
              setTimeout(() => {
                const r = c.getPointScreenRect(tut.SOCIAL_UNION.mapX, tut.SOCIAL_UNION.mapY, 1.0);
                r.left -= r.width / 2;
                r.width *= 2; // 社联是一座完整的 4×2 格展台。
                res(this._pack([this._toRect(r, 'round')]));
              }, 500);
            })
        );
      }
      case 'clubMarker': {
        if (!c) return Promise.resolve([]);
        return this._focusExampleBooth().then(
          () =>
            new Promise((res) => {
              setTimeout(() => {
                const r = c.getBoothScreenRect(this._exampleBoothId);
                res(this._pack([this._toRect(r, 'round')]));
              }, 500);
            })
        );
      }
      case 'clubPopup': {
        if (!c) return Promise.resolve([]);
        const booth = this._resolveExampleBooth();
        const local = c.getBoothLocalCenter(this._exampleBoothId);
        if (booth && local) this.showCallout(booth, local.x, local.y);
        return new Promise((resolve) => {
          setTimeout(() => {
            const rects = [];
            const marker = c.getBoothScreenRect(this._exampleBoothId);
            if (marker) rects.push(this._toRect(marker, 'round'));
            const rc = this.el.querySelector('#clubCallout').getBoundingClientRect();
            if (rc && this.callout.style.display !== 'none') {
              rects.push({ left: rc.left, top: rc.top, width: rc.width, height: rc.height, shape: 'round', rx: 16 });
            }
            resolve(this._pack(rects));
          }, 70);
        });
      }
      default:
        return Promise.resolve([]);
    }
  }

  _toRect(r, shape) {
    if (!r) return null;
    const rx = shape === 'circle' ? Math.min(r.width, r.height) / 2 : 14;
    return { left: r.left, top: r.top, width: r.width, height: r.height, shape, rx };
  }

  _pack(arr) {
    return (arr || []).filter(Boolean);
  }

  _resolveExampleBooth() {
    const list = this.allBooths || [];
    let b = list.find((x) => x.id === this._exampleBoothId);
    if (!b && list.length) b = list[0];
    if (b) this._exampleBoothId = b.id;
    this._exampleBooth = b || null;
    return b || null;
  }

  _focusExampleBooth() {
    const c = this.map;
    const b = this._resolveExampleBooth();
    if (!c || !b) return Promise.resolve();
    const point = c.getBoothMapPoint(b.id) || { x: b.mapX, y: b.mapY };
    return c.focusMapPoint(point.x, point.y, 1.15);
  }

  onTutorialNext() {
    if (!this._tutorialActive) return;
    const now = Date.now();
    if (now - (this._lastAdvance || 0) < 300) return; // 防连点跳步
    this._lastAdvance = now;
    const idx = this._curStepIndex;
    const step = tut.STEPS[idx];
    if (!step) return;
    if (step.key === tut.STATE.CLUB_POPUP) {
      this.onCalloutClose();
      this._applyStep(idx + 1);
      return;
    }
    if (idx >= tut.STEPS.length - 1) {
      this._completeTutorial();
      return;
    }
    this._applyStep(idx + 1);
  }

  onSkipTutorial() {
    this._completeTutorial();
  }

  _completeTutorial() {
    this._tutorialActive = false;
    if (state.tutorial) state.tutorial.hide();
    this.onCalloutClose();
    this.map.fitView();
    wx.setStorageSync(tut.TUTORIAL_KEY, '1');
  }

  _resetTutorialState() {
    this._tutorialActive = false;
    clearTimeout(this._mapReadyTimer);
    if (state.tutorial) state.tutorial.hide();
  }

  destroy() {
    this._destroyed = true;
    this._cancelViewSession();
    if (state.boothViewHandoff) {
      state.boothViewHandoff.session.cancel();
      state.boothViewHandoff = null;
    }
    clearTimeout(this._mapReadyTimer);
    clearTimeout(this._plazaHlTimer);
    clearTimeout(this._typeTimer);
    this._resetTutorialState();
    if (this.map) this.map.destroy();
    this.el.innerHTML = '';
  }
}

export default {
  title: '活动导览',
  mount(container) {
    const p = new MapPage();
    p.mount(container);
    return p;
  },
};
