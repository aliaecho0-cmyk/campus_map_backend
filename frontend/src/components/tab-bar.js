/**
 * components/tab-bar.js — 底部导航栏（web 版，普通 DOM 实现）
 */
export class TabBar {
  constructor(el) {
    this.el = el;
    this.selected = 0;
    this.list = [
      { path: '#/map', text: '地图' },
      { path: '#/clubs', text: '社团' },
      { path: '#/events', text: '活动' },
      { path: '#/reward', text: '奖励' },
    ];
    this.render();
  }

  render() {
    this.el.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'tab-bar';
    this.list.forEach((item, index) => {
      const it = document.createElement('div');
      it.className = 'tab-item';
      it.dataset.index = String(index);
      it.innerHTML = `<div class="tab-text">${item.text}</div><div class="tab-bar-ind"></div>`;
      it.addEventListener('click', () => {
        location.hash = item.path;
      });
      bar.appendChild(it);
    });
    this.el.appendChild(bar);
    this.setSelected(this.selected);
  }

  setSelected(idx) {
    this.selected = idx;
    const items = this.el.querySelectorAll('.tab-item');
    items.forEach((it, i) => it.classList.toggle('active', i === idx));
  }

  /** 测量四个按钮在视口中的坐标（供教程镂空高亮使用） */
  getButtonRects() {
    const items = this.el.querySelectorAll('.tab-item');
    return [...items].map((r) => {
      const b = r.getBoundingClientRect();
      return {
        left: b.left,
        top: b.top,
        right: b.right,
        bottom: b.bottom,
        width: b.width,
        height: b.height,
        cx: b.left + b.width / 2,
        cy: b.top + b.height / 2,
      };
    });
  }
}
