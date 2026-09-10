/**
 * router.js — 极简 hash 路由（web 版）
 * tab 4 页 + 详情页；页面模块约定：{ title, mount(container, query) -> handle{ destroy() } }
 */
import { state } from './state.js';
import { TabBar } from './components/tab-bar.js';
import { MapTutorial } from './components/map-tutorial.js';
import mapPage from './pages/map.js';
import clubsPage from './pages/clubs.js';
import eventsPage from './pages/events.js';
import clubDetailPage from './pages/club-detail.js';
import eventDetailPage from './pages/event-detail.js';

const headerEl = document.getElementById('header');
const pageEl = document.getElementById('page');
const tabbarEl = document.getElementById('tabbar');
const overlayEl = document.getElementById('overlay');

const TABS = [
  { path: '/map', mod: mapPage, index: 0 },
  { path: '/clubs', mod: clubsPage, index: 1 },
  { path: '/events', mod: eventsPage, index: 2 },
];
const DETAILS = {
  '/club-detail': clubDetailPage,
  '/event-detail': eventDetailPage,
};

let tabbar = null;
let current = null;

function parseHash() {
  let h = location.hash || '#/map';
  if (h[0] === '#') h = h.slice(1);
  const [pathPart, queryPart] = h.split('?');
  const query = {};
  if (queryPart) {
    queryPart.split('&').forEach((kv) => {
      const i = kv.indexOf('=');
      if (i >= 0) query[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
      else query[decodeURIComponent(kv)] = '';
    });
  }
  return { path: pathPart || '/map', query };
}

function render() {
  const { path, query } = parseHash();
  const tab = TABS.find((t) => t.path === path);
  const mod = tab ? tab.mod : DETAILS[path] || TABS[0].mod;
  const isTab = !!tab;

  if (current) {
    try {
      current.destroy();
    } catch (e) {}
    current = null;
  }
  pageEl.innerHTML = '';

  let page = null;
  let revealPage = null;
  // 像素擦除过渡：mount 在遮条下方同步完成，随后遮条 8 步离散右移揭示新页面
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const bar = document.createElement('div');
    bar.className = 'px-wipe';
    document.body.appendChild(bar);
    let revealed = false;
    revealPage = () => {
      if (revealed) return;
      revealed = true;
      bar.remove();
      if (current === page) current.onPageVisible?.();
    };
    bar.addEventListener('animationend', revealPage);
    setTimeout(revealPage, 450);
  }

  if (isTab) {
    headerEl.style.display = 'none';
    tabbarEl.style.display = '';
    tabbar.setSelected(tab.index);
  } else {
    headerEl.style.display = '';
    headerEl.querySelector('.header-title').textContent = mod.title || '';
    tabbarEl.style.display = 'none';
  }

  page = mod.mount(pageEl, query);
  current = page;
  if (!revealPage) page.onPageVisible?.();
  window.scrollTo(0, 0);
}

export function start() {
  headerEl.innerHTML =
    '<div class="header-inner"><button class="header-back">‹</button><div class="header-title"></div></div>';
  headerEl.querySelector('.header-back').addEventListener('click', () => history.back());

  tabbar = new TabBar(tabbarEl);
  state.tabbar = tabbar;
  state.tutorial = new MapTutorial(overlayEl);

  window.addEventListener('hashchange', render);
  render();
}
