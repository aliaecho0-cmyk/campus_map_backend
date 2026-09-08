/** pages/map/tutorial-steps.js — 新手指引步骤配置（web 版） */
const TUTORIAL_KEY = 'campus_map_tutorial_v1_completed';
const EXAMPLE_BOOTH_ID = '20';
const SOCIAL_UNION = { mapX: 12, mapY: 20 };

const STEPS = [
  { key: 'union_location', target: 'socialUnion', message: '参加活动前，请先到社联处领取活动手册和小扇子～', button: '下一步' },
  { key: 'club_marker', target: 'clubMarker', message: '点击地图上的浅绿色摊位格，可以查看该社团的具体活动信息。', button: '下一步' },
  { key: 'club_popup', target: 'clubPopup', message: '活动时间、地点和活动介绍都会显示在这里。', button: '下一步' },
  { key: 'tab_map', target: 'tabMap', message: '在“地图”中查看社团摊位的位置和分布。', button: '下一步' },
  { key: 'tab_club', target: 'tabClub', message: '在“社团”中浏览所有参展社团。', button: '下一步' },
  { key: 'tab_activity', target: 'tabActivity', message: '在“活动”中查看百团大战期间的精彩活动。', button: '完成' },
];

const STATE = {
  INACTIVE: 'inactive',
  UNION_LOCATION: 'union_location',
  CLUB_MARKER: 'club_marker',
  CLUB_POPUP: 'club_popup',
  TAB_MAP: 'tab_map',
  TAB_CLUB: 'tab_club',
  TAB_ACTIVITY: 'tab_activity',
  COMPLETED: 'completed',
};

export { TUTORIAL_KEY, EXAMPLE_BOOTH_ID, SOCIAL_UNION, STEPS, STATE };
