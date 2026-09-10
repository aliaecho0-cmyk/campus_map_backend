/**
 * components/map-tutorial.js — 聚光灯式新手指引（web 版，普通 DOM 覆盖层）
 *
 * 与原小程序 map-tutorial 组件逻辑一致：4 块半透明 view 围出高亮洞 + 圆角白框 + 说明框。
 * 渲染拆成两层：
 *   - 蒙层/高亮框（随 highlightRects 变化，可单独 updateRects）
 *   - 内容区（步骤数字/文案/下一步按钮，每步 show 时重建）
 * 顶部常驻「跳过」按钮，保证教程永远可退出。
 */
export class MapTutorial {
  constructor(overlayEl) {
    this.overlay = overlayEl;
    this.root = document.createElement('div');
    this.root.className = 'tut-root';
    this.root.style.display = 'none';
    this.overlay.appendChild(this.root);

    this.onNext = () => {};
    this.onSkip = () => {};
    this._state = null;

    this._maskLayer = document.createElement('div');
    this._maskLayer.className = 'tut-mask-layer';
    this.root.appendChild(this._maskLayer);

    this._contentBox = null;

    this._skipBtn = document.createElement('button');
    this._skipBtn.className = 'tut-skip';
    this._skipBtn.textContent = '跳过';
    this._skipBtn.addEventListener('click', () => this.onSkip());
    this.root.appendChild(this._skipBtn);
  }

  setOnNext(fn) {
    this.onNext = fn;
  }

  setOnSkip(fn) {
    this.onSkip = fn;
  }

  _bbox(rects) {
    let minL = Infinity,
      minT = Infinity,
      maxR = -Infinity,
      maxB = -Infinity;
    rects.forEach((r) => {
      minL = Math.min(minL, r.left);
      minT = Math.min(minT, r.top);
      maxR = Math.max(maxR, r.left + r.width);
      maxB = Math.max(maxB, r.top + r.height);
    });
    return { left: minL, top: minT, width: maxR - minL, height: maxB - minT };
  }

  _computeBox(rects, b, W, H) {
    const safeTop = 12;
    const safeBottom = 16;
    let cx, cy, bTop, bH;
    if (rects.length && b) {
      cx = b.left + b.width / 2;
      cy = b.top + b.height / 2;
      bTop = b.top;
      bH = b.height;
    } else {
      cx = W / 2;
      cy = H * 0.34;
      bTop = H * 0.34;
      bH = 0;
    }
    const cw = Math.min(W - 32, 300);
    const ch = 200;
    const btnH = 52;
    const below = cy < H / 2;
    let top = below ? bTop + bH + 18 : bTop - ch - 18;
    let left = cx - cw / 2;
    left = Math.max(16, Math.min(left, W - cw - 16));
    const maxTop = H - safeBottom - ch - btnH - 12;
    top = Math.max(safeTop, Math.min(top, maxTop));
    const arrowDir =
      this._state.arrowDirection && this._state.arrowDirection !== 'auto'
        ? this._state.arrowDirection
        : below
          ? 'up'
          : 'down';
    return { style: `left:${left}px;top:${top}px;width:${cw}px;`, arrowDir };
  }

  _el(tag, cls, style) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (style) e.setAttribute('style', style);
    return e;
  }

  /** 重建蒙层 + 高亮框（只依赖 highlightRects） */
  _renderMask(rects) {
    this._maskLayer.innerHTML = '';
    const W = window.innerWidth;
    const H = window.innerHeight;
    const arr = rects || [];

    let mask = null;
    let spot = '';
    let b = null;
    if (arr.length) {
      b = this._bbox(arr);
      const pad = 6;
      mask = {
        top: `left:0;top:0;width:${W}px;height:${b.top}px;`,
        bottom: `left:0;top:${b.top + b.height}px;width:${W}px;height:${Math.max(0, H - (b.top + b.height))}px;`,
        left: `left:0;top:${b.top}px;width:${b.left}px;height:${b.height}px;`,
        right: `left:${b.left + b.width}px;top:${b.top}px;width:${Math.max(0, W - (b.left + b.width))}px;height:${b.height}px;`,
      };
      const shape = arr[0] && arr[0].shape;
      const rx = shape === 'circle' ? Math.min(b.width, b.height) / 2 + pad : 4; /* 像素风方角聚光灯 */
      spot = `left:${b.left - pad}px;top:${b.top - pad}px;width:${b.width + 2 * pad}px;height:${b.height + 2 * pad}px;border-radius:${rx}px;`;
    }

    if (mask) {
      ['top', 'bottom', 'left', 'right'].forEach((k) => this._maskLayer.appendChild(this._el('div', 'tut-mask', mask[k])));
    } else {
      this._maskLayer.appendChild(this._el('div', 'tut-mask tut-mask-full'));
    }
    if (spot) this._maskLayer.appendChild(this._el('div', 'tut-spot', spot));
  }

  /** 重建内容区（步骤数字/文案/下一步按钮），每步一次 */
  _buildContent(state) {
    if (this._contentBox) this._contentBox.remove();
    const box = this._el('div', 'tut-content');
    const arrow = this._el('div', 'tut-arrow');
    const badge = this._el('div', 'tut-badge');
    badge.textContent = String(state.stepNumber);
    const badgeSub = document.createElement('span');
    badgeSub.className = 'tut-badge-sub';
    badgeSub.textContent = '/' + state.totalSteps;
    badge.appendChild(badgeSub);
    const text = this._el('div', 'tut-text');
    text.textContent = state.message;
    const btn = this._el('button', 'tut-btn');
    btn.textContent = state.buttonText;
    btn.addEventListener('click', () => this.onNext());
    box.appendChild(arrow);
    box.appendChild(badge);
    box.appendChild(text);
    box.appendChild(btn);
    this._contentBox = box;
    this.root.appendChild(box);
  }

  /** 依 highlightRects 定位内容区 + 调整箭头方向（不重建内容） */
  _positionContent(rects) {
    if (!this._contentBox) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const arr = rects || [];
    const b = arr.length ? this._bbox(arr) : null;
    const box = this._computeBox(arr, b, W, H);
    this._contentBox.setAttribute('style', box.style);
    const arrow = this._contentBox.querySelector('.tut-arrow');
    if (arrow) arrow.className = 'tut-arrow ' + box.arrowDir;
  }

  /** 只显示暗色蒙层（不含解释框），供第一步等高亮算好再显示框 */
  showMask() {
    if (this._contentBox) {
      this._contentBox.remove();
      this._contentBox = null;
    }
    this._renderMask([]);
    this.root.style.display = 'block';
  }

  show(state) {
    this._state = state;
    const rects = state.highlightRects || [];
    this._renderMask(rects);
    this._buildContent(state);
    this._positionContent(rects);
    this.root.style.display = 'block';
  }

  /** 只更新高亮区域（蒙层 + 内容定位），不动内容与按钮 */
  updateRects(rects) {
    if (!this._state) return;
    this._state.highlightRects = rects || [];
    this._renderMask(rects);
    this._positionContent(rects);
  }

  /** 只更新文案（步骤数字/文案/按钮），保留当前蒙层与高亮位置 */
  updateContent(state) {
    if (!this._state) return;
    this._state.stepNumber = state.stepNumber;
    this._state.totalSteps = state.totalSteps;
    this._state.message = state.message;
    this._state.buttonText = state.buttonText;
    this._buildContent(this._state);
    this._positionContent(this._state.highlightRects || []);
  }

  hide() {
    this.root.style.display = 'none';
    this._maskLayer.innerHTML = '';
    if (this._contentBox) {
      this._contentBox.remove();
      this._contentBox = null;
    }
  }
}
