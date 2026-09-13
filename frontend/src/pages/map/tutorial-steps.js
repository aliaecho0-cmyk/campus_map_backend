/** pages/map/tutorial-steps.js — 首页五步游戏化新手指引。 */
import { isEnglish } from '../../i18n.js';

const TUTORIAL_KEY = 'onboardingCompleted';
const EXAMPLE_BOOTH_ID = '69';

const STEPS_ZH = [
  {
    key: 'club_marker',
    target: 'clubMarker',
    title: '发现社团',
    message: '点击地图上的社团摊位，就可以快速查看这个社团的信息！',
  },
  {
    key: 'music_player',
    target: 'musicPlayer',
    title: '背景音乐',
    message: '音乐默认会自动播放。点击右下角音乐盒，可以暂停或继续播放音乐。',
  },
  {
    key: 'club_search',
    target: 'searchField',
    title: '寻找社团',
    message: '有想找的社团？在这里搜索你感兴趣的社团吧！',
  },
  {
    key: 'tab_club',
    target: 'tabClub',
    title: '社团详情',
    message: '点击「社团」，可以浏览社团列表并查看更详细的社团信息。',
  },
  {
    key: 'tab_activity',
    target: 'tabActivity',
    title: '今日活动',
    message: '点击「活动」，就能看看今天有哪些活动正在开展！',
  },
];

const STEPS_EN = [
  {
    key: 'club_marker',
    target: 'clubMarker',
    title: 'Discover Clubs',
    message: 'Tap a club booth on the map to quickly view information about that club.',
  },
  {
    key: 'music_player',
    target: 'musicPlayer',
    title: 'Background Music',
    message: 'Music plays automatically. Tap the player at the bottom right to pause or resume it.',
  },
  {
    key: 'club_search',
    target: 'searchField',
    title: 'Find a Club',
    message: 'Looking for a club? Search for one you are interested in here.',
  },
  {
    key: 'tab_club',
    target: 'tabClub',
    title: 'Club Details',
    message: 'Tap Clubs to browse the full list and view more information.',
  },
  {
    key: 'tab_activity',
    target: 'tabActivity',
    title: 'Today’s Events',
    message: 'Tap Events to see what is happening today.',
  },
];

function getSteps() {
  return (isEnglish() ? STEPS_EN : STEPS_ZH).map((step) => ({ ...step }));
}

export { TUTORIAL_KEY, EXAMPLE_BOOTH_ID, getSteps };
