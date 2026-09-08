/**
 * components/custom-map.js — 30×30 格栅化校园地图（web 版，由小程序 Component 重写为 class）
 *
 * 与原组件保持一致的坐标/手势/绘制逻辑：
 * - 整张地图用 <canvas> 绘制命令生成，底图来自 historical-map-svg.js 的 SVG 字符串，
 *   经 svg-canvas-renderer 直接渲染进 canvas（不加载图片）。
 * - 缩放/平移只通过 canvas 元素的 CSS transform 实现，位图整体缩放。
 * - 手势：Pointer 事件（触摸/鼠标统一）+ 鼠标滚轮缩放。
 */
import * as canvasMap from '../utils/canvas-map.js';
import SVG_BASE_FALLBACK from './historical-map-svg.js';
import renderSVG from './svg-canvas-renderer.js';

const MAP_WIDTH = canvasMap.GRID_COLS * canvasMap.CELL_PX;
const MAP_HEIGHT = canvasMap.GRID_ROWS * canvasMap.CELL_PX;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
const INITIAL_ZOOM = 1;
const CLAMP_MARGIN = 80;

const DEFAULT_VIEW_CELLS_X = 17;
const DEFAULT_FOCUS_CENTER = { x: 11, y: 14 };

function getDefaultFocus(width, height) {
  const cellsY = DEFAULT_VIEW_CELLS_X * (height / width);
  return {
    x0: DEFAULT_FOCUS_CENTER.x - DEFAULT_VIEW_CELLS_X / 2,
    y0: DEFAULT_FOCUS_CENTER.y - cellsY / 2,
    x1: DEFAULT_FOCUS_CENTER.x + DEFAULT_VIEW_CELLS_X / 2,
    y1: DEFAULT_FOCUS_CENTER.y + cellsY / 2,
  };
}

function parseSvgViewBox(svg) {
  const head = (svg || '').slice(0, 500);
  const match = /<svg[^>]*\bviewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/i.exec(head);
  if (match) return { width: parseFloat(match[1]), height: parseFloat(match[2]) };
  return null;
}

export class CustomMap {
  constructor(root, { onBoothTap, onBoothCancel } = {}) {
    this.root = root;
    this.canvas = root.querySelector('.map-canvas');
    this._onBoothTap = onBoothTap || (() => {});
    this._onBoothCancel = onBoothCancel || (() => {});

    this._booths = [];
    this._highlightedId = '';
    this._highlightRegion = null;
    this._viewport = { scale: 1, x: 0, y: 0 };
    this._rect = null;
    this._dpr = 1;
    this._ctx = null;
    this._baseCanvas = null;
    this._baseCtx = null;
    this._svgString = SVG_BASE_FALLBACK;

    // 手势运行时
    this._pointers = new Map();
    this._gesture = null;
    this._touchStartTime = 0;
    this._touchMoved = 0;
    this._lastPoint = null;

    this._onResize = () => {
      this._rect = this.root.getBoundingClientRect();
    };
    window.addEventListener('resize', this._onResize);

    this._initCanvas();
    this._bindGestures();
  }

  /** 更新摊位列表（数据变化时重绘，缩放/平移不重绘） */
  setBooths(list) {
    this._booths = list || [];
    this._drawAll();
  }

  setHighlightedId(id) {
    this._highlightedId = id || '';
    this._drawAll();
  }

  setHighlightRegion(r) {
    this._highlightRegion = r || null;
    this._drawAll();
  }

  _dprOf() {
    return window.devicePixelRatio || 1;
  }

  async _initCanvas() {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = this._dprOf();
    canvas.style.width = MAP_WIDTH + 'px';
    canvas.style.height = MAP_HEIGHT + 'px';
    canvas.width = MAP_WIDTH * dpr;
    canvas.height = MAP_HEIGHT * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    this._canvas = canvas;
    this._ctx = ctx;
    this._dpr = dpr;

    // 离屏 canvas 一次性渲染底图
    try {
      const off = document.createElement('canvas');
      off.width = MAP_WIDTH * dpr;
      off.height = MAP_HEIGHT * dpr;
      const offCtx = off.getContext('2d');
      offCtx.scale(dpr, dpr);
      this._baseCanvas = off;
      this._baseCtx = offCtx;
    } catch (err) {
      this._baseCanvas = null;
      this._baseCtx = null;
    }

    // 包内模式：直接用 historical-map-svg.js
    this._svgString = SVG_BASE_FALLBACK;
    this._renderBaseToOffscreen();
    this._drawAll();

    this._rect = this.root.getBoundingClientRect();
    this._fitInitial(this._rect);
  }

  _bindGestures() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    el.addEventListener('pointermove', (e) => this._onPointerMove(e));
    el.addEventListener('pointerup', (e) => this._onPointerUp(e));
    el.addEventListener('pointercancel', (e) => this._onPointerUp(e));
    el.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
  }

  /* ---------- 手势 ---------- */
  _toLocal(clientX, clientY) {
    const r = this._rect || { left: 0, top: 0 };
    return { x: clientX - r.left, y: clientY - r.top };
  }

  _onPointerDown(e) {
    this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.canvas.classList.remove('with-transition');
    this._touchStartTime = Date.now();
    this._touchMoved = 0;
    this._lastPoint = { x: e.clientX, y: e.clientY };
    this._initGesture();
  }

  _onPointerMove(e) {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 移动判定：一旦判定为平移/缩放手势，通知父页面关闭气泡
    if (this._lastPoint) {
      const dx = e.clientX - this._lastPoint.x;
      const dy = e.clientY - this._lastPoint.y;
      this._touchMoved += Math.hypot(dx, dy);
    }
    this._lastPoint = { x: e.clientX, y: e.clientY };
    if (this._touchMoved > 6) {
      this._onBoothCancel();
    }

    const pts = [...this._pointers.values()];
    const g = this._gesture;
    if (!g || (g.mode === 'scale' && pts.length < 2) || (g.mode === 'pan' && pts.length >= 2)) {
      this._initGesture();
      return;
    }
    const vp = this._viewport || { scale: 1, x: 0, y: 0 };
    if (g.mode === 'pan') {
      const p = pts[0];
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;
      this._apply({ scale: vp.scale, x: g.startVX + dx, y: g.startVY + dy });
    } else {
      const p1 = pts[0];
      const p2 = pts[1];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      let scale = g.startScale * (dist / g.startDist);
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
      this._apply({ scale, x: g.midX - g.mapX * scale, y: g.midY - g.mapY * scale });
    }
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId);

    const isTap =
      this._touchStartTime &&
      Date.now() - this._touchStartTime < 250 &&
      this._touchMoved < 8 &&
      this._pointers.size === 0;
    if (isTap && this._lastPoint && this._rect) {
      const local = this._toLocal(this._lastPoint.x, this._lastPoint.y);
      const vp = this._viewport || { scale: 1, x: 0, y: 0 };
      const mapPxX = (local.x - vp.x) / vp.scale;
      const mapPxY = (local.y - vp.y) / vp.scale;
      const mapX = mapPxX / canvasMap.CELL_PX;
      const mapY = mapPxY / canvasMap.CELL_PX;
      const hitId = this._hitTest(mapX, mapY);
      if (hitId) {
        const booth = this._booths.find((b) => b.id === hitId);
        const mx = booth ? booth.mapX : mapX;
        const my = booth ? booth.mapY : mapY;
        const sx = mx * canvasMap.CELL_PX * vp.scale + vp.x;
        const sy = my * canvasMap.CELL_PX * vp.scale + vp.y;
        this._onBoothTap({ id: hitId, x: sx, y: sy });
      } else {
        this._onBoothCancel();
      }
    }
    this._gesture = null;
  }

  _onWheel(e) {
    e.preventDefault();
    if (!this._rect) return;
    const local = this._toLocal(e.clientX, e.clientY);
    const vp = this._viewport || { scale: 1, x: 0, y: 0 };
    const mapX = (local.x - vp.x) / vp.scale;
    const mapY = (local.y - vp.y) / vp.scale;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    let scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, vp.scale * factor));
    this._apply({ scale, x: local.x - mapX * scale, y: local.y - mapY * scale });
  }

  _initGesture() {
    const pts = [...this._pointers.values()];
    const vp = this._viewport || { scale: 1, x: 0, y: 0 };
    if (pts.length >= 2) {
      const p1 = pts[0];
      const p2 = pts[1];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const mid = this._toLocal((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      this._gesture = {
        mode: 'scale',
        startDist: dist,
        startScale: vp.scale,
        midX: mid.x,
        midY: mid.y,
        mapX: (mid.x - vp.x) / vp.scale,
        mapY: (mid.y - vp.y) / vp.scale,
      };
    } else if (pts.length === 1) {
      const p = pts[0];
      this._gesture = { mode: 'pan', startX: p.x, startY: p.y, startVX: vp.x, startVY: vp.y };
    } else {
      this._gesture = null;
    }
  }

  _hitTest(mapX, mapY) {
    const cx = Math.floor(mapX);
    const cy = Math.floor(mapY);
    const booth = this._booths.find((item) => Math.floor(item.mapX) === cx && Math.floor(item.mapY) === cy);
    return booth ? booth.id : null;
  }

  /* ---------- 视口 ---------- */
  _apply(v) {
    const r = this._rect;
    if (r) {
      const w = MAP_WIDTH * v.scale;
      const h = MAP_HEIGHT * v.scale;
      v.x = Math.min(CLAMP_MARGIN, Math.max(r.width - w - CLAMP_MARGIN, v.x));
      v.y = Math.min(CLAMP_MARGIN, Math.max(r.height - h - CLAMP_MARGIN, v.y));
    }
    this._viewport = v;
    this.canvas.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
  }

  _fitInitial(rect) {
    if (!rect || !rect.width) return;
    const FOCUS = getDefaultFocus(rect.width, rect.height);
    const fw = (FOCUS.x1 - FOCUS.x0) * canvasMap.CELL_PX;
    const fh = (FOCUS.y1 - FOCUS.y0) * canvasMap.CELL_PX;
    const scale = Math.max(MIN_SCALE, Math.min(rect.width / fw, rect.height / fh) * INITIAL_ZOOM);
    const x = (rect.width - fw * scale) / 2 - FOCUS.x0 * canvasMap.CELL_PX * scale;
    const y = (rect.height - fh * scale) / 2 - FOCUS.y0 * canvasMap.CELL_PX * scale;
    this._apply({ scale, x, y });
  }

  moveTo(x, y, scale) {
    return new Promise((resolve) => {
      const v = this._viewport || { scale: 1, x: 0, y: 0 };
      const s = scale != null ? scale : v.scale;
      this._viewport = { scale: s, x, y };
      this.canvas.classList.add('with-transition');
      this._apply({ scale: s, x, y });
      setTimeout(() => {
        this.canvas.classList.remove('with-transition');
        resolve();
      }, 360);
    });
  }

  focusMapPoint(mapX, mapY, scale) {
    const rect = this._rect || { width: MAP_WIDTH, height: MAP_HEIGHT };
    const center = { x: rect.width / 2, y: rect.height / 2 };
    const s = scale != null ? scale : Math.max((this._viewport || { scale: 1 }).scale, 1);
    return this.moveTo(
      center.x - mapX * canvasMap.CELL_PX * s,
      center.y - mapY * canvasMap.CELL_PX * s,
      s
    );
  }

  fitView() {
    if (this._rect) this._fitInitial(this._rect);
  }

  /* ---------- 绘制 ---------- */
  _drawAll() {
    const ctx = this._ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this._drawBaseMap(ctx);
    this._drawBooths(ctx);
    this._drawRegionHighlight(ctx);
  }

  _renderSvg(ctx, svg) {
    const dim = parseSvgViewBox(svg) || { width: MAP_WIDTH, height: MAP_HEIGHT };
    const scale = Math.min(MAP_WIDTH / dim.width, MAP_HEIGHT / dim.height);
    const tx = (MAP_WIDTH - dim.width * scale) / 2;
    const ty = (MAP_HEIGHT - dim.height * scale) / 2;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
    renderSVG(ctx, svg);
    ctx.restore();
  }

  _renderBaseToOffscreen() {
    const ctx = this._baseCtx;
    if (!ctx) return;
    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    const svg = this._svgString;
    if (typeof svg === 'string' && svg.length) {
      try {
        this._renderSvg(ctx, svg);
        return;
      } catch (err) {
        console.warn('[custom-map] SVG 底图渲染失败', err);
      }
    }
    ctx.fillStyle = '#f0f2ec';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  }

  _drawBaseMap(ctx) {
    if (this._baseCanvas) {
      ctx.drawImage(this._baseCanvas, 0, 0, MAP_WIDTH, MAP_HEIGHT);
      return;
    }
    const svg = this._svgString;
    if (typeof svg === 'string' && svg.length) {
      try {
        this._renderSvg(ctx, svg);
        return;
      } catch (err) {
        console.warn('[custom-map] SVG 底图渲染失败', err);
      }
    }
    ctx.fillStyle = '#f0f2ec';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  }

  _drawBooths(ctx) {
    const hl = this._highlightedId;
    if (!hl) return;
    const cellPx = canvasMap.CELL_PX;
    const booth = this._booths.find((item) => item.id === hl);
    if (!booth) return;
    const x = Math.floor(booth.mapX) * cellPx;
    const y = Math.floor(booth.mapY) * cellPx;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(x + 2, y + 2, cellPx - 4, cellPx - 4);
    ctx.strokeStyle = '#e8703a';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, cellPx - 4, cellPx - 4);
    ctx.restore();
  }

  _drawRegionHighlight(ctx) {
    const r = this._highlightRegion;
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return;
    const cellPx = canvasMap.CELL_PX;
    const x = r.x * cellPx;
    const y = r.y * cellPx;
    const w = (r.w || 1) * cellPx;
    const h = (r.h || 1) * cellPx;
    ctx.save();
    ctx.fillStyle = 'rgba(232, 112, 58, 0.16)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#e8703a';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  /* ---------- 供页面 / 教程测量定位 ---------- */
  getRect() {
    this._rect = this.root.getBoundingClientRect();
    return this._rect;
  }

  getPointScreenRect(mapX, mapY, radius) {
    const vp = this._viewport || { scale: 1, x: 0, y: 0 };
    const rect = this._rect || { left: 0, top: 0 };
    const lx = mapX * canvasMap.CELL_PX * vp.scale + vp.x;
    const ly = mapY * canvasMap.CELL_PX * vp.scale + vp.y;
    const sx = lx + rect.left;
    const sy = ly + rect.top;
    const R = (radius != null ? radius : 0.5) * canvasMap.CELL_PX * vp.scale;
    return {
      left: sx - R,
      top: sy - R,
      right: sx + R,
      bottom: sy + R,
      cx: sx,
      cy: sy,
      width: 2 * R,
      height: 2 * R,
    };
  }

  getBoothScreenRect(id) {
    const b = this._booths.find((x) => x.id === id);
    if (!b) return null;
    return this.getPointScreenRect(b.mapX, b.mapY, 0.55);
  }

  getBoothLocalCenter(id) {
    const b = this._booths.find((x) => x.id === id);
    if (!b) return null;
    const vp = this._viewport || { scale: 1, x: 0, y: 0 };
    return {
      x: b.mapX * canvasMap.CELL_PX * vp.scale + vp.x,
      y: b.mapY * canvasMap.CELL_PX * vp.scale + vp.y,
    };
  }

  getCenterMapPos() {
    const v = this._viewport || { scale: 1, x: 0, y: 0 };
    const rect = this._rect || { width: 0, height: 0 };
    const mapX = (rect.width / 2 - v.x) / v.scale / canvasMap.CELL_PX;
    const mapY = (rect.height / 2 - v.y) / v.scale / canvasMap.CELL_PX;
    return { mapX: Math.floor(mapX), mapY: Math.floor(mapY) };
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this._pointers.clear();
    this._gesture = null;
  }
}
