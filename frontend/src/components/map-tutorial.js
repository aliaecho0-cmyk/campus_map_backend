/**
 * components/map-tutorial.js — 首页 Spotlight + 像素 NPC 新手指引。
 * 高亮位置完全由目标元素的实时视口尺寸计算，不改变原页面布局。
 */
import { t } from '../i18n.js';

const EXIT_MS = 260;

export class MapTutorial {
  constructor(overlayEl) {
    this.overlay = overlayEl;
    this.onNext = () => {};
    this.onPrevious = () => {};
    this.onSkip = () => {};
    this._state = null;
    this._hideTimer = 0;

    this.root = document.createElement('div');
    this.root.className = 'tut-root';
    this.root.style.display = 'none';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', t('tutorialHint'));
    this.overlay.appendChild(this.root);

    this.maskLayer = document.createElement('div');
    this.maskLayer.className = 'tut-mask-layer';
    this.maskFull = document.createElement('div');
    this.maskFull.className = 'tut-mask-full';
    this.spot = document.createElement('div');
    this.spot.className = 'tut-spot';
    this.maskLayer.append(this.maskFull, this.spot);
    this.root.appendChild(this.maskLayer);

    this.content = document.createElement('section');
    this.content.className = 'tut-content';
    this.content.innerHTML = `
      <div class="tut-arrow"></div>
      <div class="tut-kicker"></div>
      <div class="tut-title"></div>
      <div class="tut-text"></div>
      <div class="tut-footer">
        <div class="tut-secondary-actions">
          <button class="tut-prev" type="button"></button>
          <button class="tut-skip" type="button"></button>
        </div>
        <div class="tut-progress" aria-live="polite"></div>
        <button class="tut-next" type="button"></button>
      </div>`;
    this.root.appendChild(this.content);

    this.prevButton = this.content.querySelector('.tut-prev');
    this.skipButton = this.content.querySelector('.tut-skip');
    this.nextButton = this.content.querySelector('.tut-next');
    this.prevButton.addEventListener('click', () => this.onPrevious());
    this.skipButton.addEventListener('click', () => this.onSkip());
    this.nextButton.addEventListener('click', () => this.onNext());
    this._onKeyDown = (event) => {
      if (this.root.style.display === 'none') return;
      if (event.key === 'Escape') this.onSkip();
      else if (event.key === 'ArrowLeft' && !this.prevButton.hidden) this.onPrevious();
      else if (event.key === 'ArrowRight') this.onNext();
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  setOnNext(fn) {
    this.onNext = fn;
  }

  setOnPrevious(fn) {
    this.onPrevious = fn;
  }

  setOnSkip(fn) {
    this.onSkip = fn;
  }

  setLanguage() {
    this.root.setAttribute('aria-label', t('tutorialHint'));
  }

  _bbox(rects) {
    let minL = Infinity;
    let minT = Infinity;
    let maxR = -Infinity;
    let maxB = -Infinity;
    rects.forEach((rect) => {
      minL = Math.min(minL, rect.left);
      minT = Math.min(minT, rect.top);
      maxR = Math.max(maxR, rect.left + rect.width);
      maxB = Math.max(maxB, rect.top + rect.height);
    });
    return { left: minL, top: minT, width: maxR - minL, height: maxB - minT };
  }

  _setVisible() {
    clearTimeout(this._hideTimer);
    this.root.classList.remove('is-leaving');
    if (this.root.style.display === 'none') {
      this.root.style.display = 'block';
      requestAnimationFrame(() => this.root.classList.add('is-visible'));
    }
  }

  _updateContent(state) {
    const isLast = state.stepNumber === state.totalSteps;
    this.content.querySelector('.tut-kicker').textContent = t('tutorialHint');
    this.content.querySelector('.tut-title').textContent = state.title;
    this.content.querySelector('.tut-text').textContent = state.message;
    this.content.querySelector('.tut-progress').textContent = `${state.stepNumber} / ${state.totalSteps}`;
    this.prevButton.textContent = t('tutorialPrevious');
    this.prevButton.hidden = state.stepNumber === 1;
    this.skipButton.textContent = t('skip');
    this.skipButton.hidden = isLast;
    this.nextButton.textContent = isLast ? t('startExploring') : t('tutorialNext');
    this.content.classList.remove('is-switching');
    void this.content.offsetWidth;
    this.content.classList.add('is-switching');
  }

  _updateSpot(rects) {
    const arr = rects || [];
    if (!arr.length) {
      this.maskFull.classList.remove('is-hidden');
      this.spot.classList.remove('is-active');
      return;
    }
    const target = this._bbox(arr);
    const pad = 7;
    const radius = arr[0]?.shape === 'circle'
      ? Math.min(target.width, target.height) / 2 + pad
      : Math.max(0, arr[0]?.rx || 0);
    this.spot.style.left = `${target.left - pad}px`;
    this.spot.style.top = `${target.top - pad}px`;
    this.spot.style.width = `${target.width + pad * 2}px`;
    this.spot.style.height = `${target.height + pad * 2}px`;
    this.spot.style.borderRadius = `${radius}px`;
    this.maskFull.classList.add('is-hidden');
    this.spot.classList.add('is-active');
  }

  _positionContent(rects) {
    if (!rects?.length) return;
    const target = this._bbox(rects);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const gap = 18;
    const width = Math.min(318, viewportWidth - margin * 2);
    this.content.style.width = `${width}px`;
    const height = this.content.offsetHeight || 190;
    const centerX = target.left + target.width / 2;
    const belowSpace = viewportHeight - (target.top + target.height);
    const aboveSpace = target.top;
    const placeBelow = belowSpace >= height + gap || belowSpace >= aboveSpace;
    let top = placeBelow ? target.top + target.height + gap : target.top - height - gap;
    let left = centerX - width / 2;
    left = Math.max(margin, Math.min(left, viewportWidth - width - margin));
    top = Math.max(margin, Math.min(top, viewportHeight - height - margin));
    const arrowX = Math.max(20, Math.min(centerX - left, width - 20));
    this.content.style.left = `${left}px`;
    this.content.style.top = `${top}px`;
    this.content.style.setProperty('--tut-arrow-x', `${arrowX}px`);
    const arrow = this.content.querySelector('.tut-arrow');
    arrow.className = `tut-arrow ${placeBelow ? 'up' : 'down'}`;
  }

  showMask() {
    this._setVisible();
    this.content.classList.remove('is-visible');
    this.maskFull.classList.remove('is-hidden');
    this.spot.classList.remove('is-active');
  }

  show(state) {
    this._state = { ...state, highlightRects: state.highlightRects || [] };
    this._setVisible();
    this._updateContent(this._state);
    this._updateSpot(this._state.highlightRects);
    this.content.classList.add('is-visible');
    this._positionContent(this._state.highlightRects);
    this.nextButton.focus({ preventScroll: true });
  }

  updateRects(rects) {
    if (!this._state) return;
    this._state.highlightRects = rects || [];
    this._updateSpot(this._state.highlightRects);
    this._positionContent(this._state.highlightRects);
  }

  updateContent(state) {
    if (!this._state) return;
    Object.assign(this._state, state);
    this._updateContent(this._state);
    this._positionContent(this._state.highlightRects || []);
  }

  hide({ animated = true } = {}) {
    clearTimeout(this._hideTimer);
    if (this.root.style.display === 'none') return Promise.resolve();
    const finish = () => {
      this.root.classList.remove('is-visible', 'is-leaving');
      this.root.style.display = 'none';
      this.content.classList.remove('is-visible');
      this.spot.classList.remove('is-active');
      this.maskFull.classList.remove('is-hidden');
      this._state = null;
    };
    if (!animated) {
      finish();
      return Promise.resolve();
    }
    this.root.classList.add('is-leaving');
    return new Promise((resolve) => {
      this._hideTimer = setTimeout(() => {
        finish();
        resolve();
      }, EXIT_MS);
    });
  }
}
